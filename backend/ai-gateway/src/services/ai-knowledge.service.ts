import { v4 as uuidv4 } from 'uuid';
import { query } from '../../../shared/database/connection';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { AiKnowledgeDocument, AiKnowledgeChunk } from '../../../shared/types/ai';
import { NotFoundError } from '../../../shared/utils/errors';
import { rowToCamelCase, rowsToCamelCase } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiProviderService } from './ai-provider.service';

const logger = createServiceLogger('ai-knowledge');

const CHUNK_SIZE = 500; // tokens approx
const CHUNK_OVERLAP = 50;

export class AiKnowledgeService {
  constructor(private aiProvider: AiProviderService) {}

  async uploadDocument(
    tenantId: string,
    title: string,
    type: string,
    content: string,
    fileUrl: string | null,
    uploadedBy: string,
  ): Promise<AiKnowledgeDocument> {
    return withTenantContext(tenantId, async (client) => {
      const docId = uuidv4();

      await client.query(
        `INSERT INTO ai_knowledge_documents (id, tenant_id, title, type, file_url, content_text, embedding_status, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, 'processing', $7)`,
        [docId, tenantId, title, type, fileUrl, content, uploadedBy],
      );

      // Chunk the content
      const chunks = this.chunkText(content);

      // Create embeddings for each chunk
      let chunkIndex = 0;
      for (const chunkContent of chunks) {
        const chunkId = uuidv4();
        let embeddingId: string | null = null;

        try {
          const embeddingResult = await this.aiProvider.embed(chunkContent);
          // In production, store in vector DB (Qdrant)
          embeddingId = `emb_${chunkId}`;
        } catch (error) {
          logger.warn('Failed to create embedding for chunk', { docId, chunkIndex, error });
        }

        await client.query(
          `INSERT INTO ai_knowledge_chunks (id, tenant_id, document_id, chunk_index, content, embedding_id, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [chunkId, tenantId, docId, chunkIndex, chunkContent, embeddingId,
           JSON.stringify({ charCount: chunkContent.length })],
        );

        chunkIndex++;
      }

      // Update document
      await client.query(
        `UPDATE ai_knowledge_documents SET chunk_count = $1, embedding_status = 'completed', updated_at = NOW()
         WHERE id = $2`,
        [chunks.length, docId],
      );

      logger.info('Knowledge document uploaded', { tenantId, docId, chunks: chunks.length });

      const result = await client.query('SELECT * FROM ai_knowledge_documents WHERE id = $1', [docId]);
      return rowToCamelCase<AiKnowledgeDocument>(result.rows[0]);
    });
  }

  async listDocuments(tenantId: string): Promise<AiKnowledgeDocument[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT * FROM ai_knowledge_documents WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenantId],
      );
      return rowsToCamelCase<AiKnowledgeDocument>(result.rows);
    });
  }

  async deleteDocument(tenantId: string, documentId: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'DELETE FROM ai_knowledge_documents WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [documentId, tenantId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Document', documentId);
      }
      logger.info('Knowledge document deleted', { tenantId, documentId });
    });
  }

  async trainProductKnowledge(tenantId: string, productId: string): Promise<void> {
    const productResult = await query(
      `SELECT p.*, pc.name as category_name
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE p.id = $1 AND p.tenant_id = $2`,
      [productId, tenantId],
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundError('Product', productId);
    }

    const product = productResult.rows[0];

    const aiResponse = await this.aiProvider.complete({
      messages: [
        {
          role: 'system',
          content: `Bạn là chuyên gia mỹ phẩm và skincare. Dựa trên thông tin sản phẩm, tạo:
1. Mô tả chi tiết nâng cao
2. Tóm tắt lợi ích
3. Hướng dẫn sử dụng
4. FAQ (3-5 câu hỏi thường gặp)
Trả về JSON: { "enhancedDescription": "", "benefitsSummary": "", "usageGuide": "", "faq": [{"question": "", "answer": ""}] }
Viết bằng tiếng Việt.`,
        },
        {
          role: 'user',
          content: `Sản phẩm: ${product.name}
Mô tả: ${product.description || 'Chưa có'}
Thành phần: ${Array.isArray(product.ingredients) ? product.ingredients.join(', ') : 'Chưa có'}
Hướng dẫn: ${product.usage_instructions || 'Chưa có'}
Loại: ${product.category_name || 'Chưa phân loại'}
Dung tích: ${product.volume || ''} ${product.unit || ''}`,
        },
      ],
      temperature: 0.5,
    });

    try {
      const jsonStr = aiResponse.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const data = JSON.parse(jsonStr);

      // Create embedding for the enhanced description
      let embeddingId: string | null = null;
      try {
        const embedding = await this.aiProvider.embed(
          `${product.name} ${data.enhancedDescription} ${data.benefitsSummary}`,
        );
        embeddingId = `prod_emb_${productId}`;
      } catch {}

      await query(
        `INSERT INTO ai_product_knowledge (tenant_id, product_id, enhanced_description, benefits_summary, usage_guide, faq, embedding_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, product_id) DO UPDATE SET
           enhanced_description = $3, benefits_summary = $4, usage_guide = $5, faq = $6, embedding_id = $7, updated_at = NOW()`,
        [tenantId, productId, data.enhancedDescription, data.benefitsSummary,
         data.usageGuide, JSON.stringify(data.faq), embeddingId],
      );

      logger.info('Product knowledge trained', { tenantId, productId });
    } catch (error) {
      logger.error('Failed to train product knowledge', { error });
    }
  }

  async trainServiceKnowledge(tenantId: string, serviceId: string): Promise<void> {
    const serviceResult = await query(
      `SELECT s.*, sc.name as category_name
       FROM services s
       LEFT JOIN service_categories sc ON sc.id = s.category_id
       WHERE s.id = $1 AND s.tenant_id = $2`,
      [serviceId, tenantId],
    );

    if (serviceResult.rows.length === 0) {
      throw new NotFoundError('Service', serviceId);
    }

    const service = serviceResult.rows[0];

    const aiResponse = await this.aiProvider.complete({
      messages: [
        {
          role: 'system',
          content: `Bạn là chuyên gia thẩm mỹ spa. Dựa trên thông tin dịch vụ, tạo:
1. Mô tả chi tiết nâng cao
2. Quy trình thực hiện chi tiết
3. Hướng dẫn chăm sóc sau dịch vụ
4. FAQ (3-5 câu hỏi thường gặp)
Trả về JSON: { "enhancedDescription": "", "procedureDetail": "", "aftercareGuide": "", "faq": [{"question": "", "answer": ""}] }
Viết bằng tiếng Việt.`,
        },
        {
          role: 'user',
          content: `Dịch vụ: ${service.name}
Mô tả: ${service.description || 'Chưa có'}
Thời gian: ${service.duration_minutes} phút
Giá: ${service.price} VND
Quy trình: ${JSON.stringify(service.procedure_steps)}
Chống chỉ định: ${Array.isArray(service.contraindications) ? service.contraindications.join(', ') : 'Không có'}
Loại: ${service.category_name || 'Chưa phân loại'}`,
        },
      ],
      temperature: 0.5,
    });

    try {
      const jsonStr = aiResponse.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const data = JSON.parse(jsonStr);

      let embeddingId: string | null = null;
      try {
        const embedding = await this.aiProvider.embed(
          `${service.name} ${data.enhancedDescription} ${data.procedureDetail}`,
        );
        embeddingId = `svc_emb_${serviceId}`;
      } catch {}

      await query(
        `INSERT INTO ai_service_knowledge (tenant_id, service_id, enhanced_description, procedure_detail, aftercare_guide, faq, embedding_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, service_id) DO UPDATE SET
           enhanced_description = $3, procedure_detail = $4, aftercare_guide = $5, faq = $6, embedding_id = $7, updated_at = NOW()`,
        [tenantId, serviceId, data.enhancedDescription, data.procedureDetail,
         data.aftercareGuide, JSON.stringify(data.faq), embeddingId],
      );

      logger.info('Service knowledge trained', { tenantId, serviceId });
    } catch (error) {
      logger.error('Failed to train service knowledge', { error });
    }
  }

  private chunkText(text: string): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];
    let currentChunk: string[] = [];
    let currentLength = 0;

    for (const word of words) {
      currentChunk.push(word);
      currentLength += word.length + 1;

      if (currentLength >= CHUNK_SIZE * 4) { // Approximate 4 chars per token
        chunks.push(currentChunk.join(' '));

        // Keep overlap
        const overlapWords = currentChunk.slice(-Math.floor(CHUNK_OVERLAP));
        currentChunk = [...overlapWords];
        currentLength = overlapWords.join(' ').length;
      }
    }

    if (currentChunk.length > 0) {
      chunks.push(currentChunk.join(' '));
    }

    return chunks;
  }
}
