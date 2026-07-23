import { v4 as uuidv4 } from 'uuid';
import { query } from '../../../shared/database/connection';
import { withTenantContext } from '../../../shared/database/tenant-context';
import {
  AiKnowledgeDocument,
  AiKnowledgeChunk,
  KnowledgeQueryRequest,
  KnowledgeQueryResponse,
} from '../../../shared/types/ai';
import { NotFoundError, ValidationError } from '../../../shared/utils/errors';
import { rowToCamelCase, rowsToCamelCase, truncate } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiProviderService } from './ai-provider.service';

const logger = createServiceLogger('ai-knowledge');

// ==========================================
// CONSTANTS
// ==========================================
const CHUNK_SIZE = 500; // tokens approx
const CHUNK_OVERLAP = 50;
const MAX_DOCUMENTS_PER_TENANT = 100;
const MAX_CHUNKS_PER_DOCUMENT = 100;

// ==========================================
// AI KNOWLEDGE SERVICE
// ==========================================
export class AiKnowledgeService {
  constructor(private aiProvider: AiProviderService) {}

  // ==========================================
  // 1. UPLOAD DOCUMENT
  // ==========================================
  async uploadDocument(
    tenantId: string,
    title: string,
    type: string,
    content: string,
    fileUrl: string | null,
    uploadedBy: string,
    tags: string[] = [],
    category: string | null = null,
  ): Promise<AiKnowledgeDocument> {
    return withTenantContext(tenantId, async (client) => {
      // Check document limit
      const countResult = await client.query(
        'SELECT COUNT(*) FROM ai_knowledge_documents WHERE tenant_id = $1 AND status != $2',
        [tenantId, 'deleted'],
      );
      if (parseInt(countResult.rows[0].count, 10) >= MAX_DOCUMENTS_PER_TENANT) {
        throw new ValidationError(`Maximum ${MAX_DOCUMENTS_PER_TENANT} documents per tenant`);
      }

      // Validate content length
      if (content.length > 100000) {
        throw new ValidationError('Document content exceeds 100,000 characters');
      }

      const docId = uuidv4();
      const contentHash = this.hashContent(content);

      // Check for duplicate content
      const existing = await client.query(
        'SELECT id FROM ai_knowledge_documents WHERE tenant_id = $1 AND content_hash = $2',
        [tenantId, contentHash],
      );
      if (existing.rows.length > 0) {
        throw new ValidationError('Document with similar content already exists');
      }

      await client.query(
        `INSERT INTO ai_knowledge_documents (
          id, tenant_id, title, type, file_url, content_text, content_hash,
          tags, category, embedding_status, uploaded_by, status, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'processing', $10, 'active', NOW(), NOW())`,
        [docId, tenantId, title, type, fileUrl, content, contentHash, tags, category, uploadedBy],
      );

      // Chunk and embed
      const chunks = this.chunkText(content);
      let embeddingCount = 0;

      for (let i = 0; i < chunks.length && i < MAX_CHUNKS_PER_DOCUMENT; i++) {
        const chunkContent = chunks[i];
        const chunkId = uuidv4();

        try {
          const embeddingResult = await this.aiProvider.embed(chunkContent);
          const embeddingId = `emb_${chunkId}`;

          await client.query(
            `INSERT INTO ai_knowledge_chunks (
              id, tenant_id, document_id, chunk_index, content, embedding_id,
              metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
            [
              chunkId,
              tenantId,
              docId,
              i,
              chunkContent,
              embeddingId,
              JSON.stringify({
                charCount: chunkContent.length,
                tokenCount: Math.ceil(chunkContent.length / 4),
                position: i,
              }),
            ],
          );
          embeddingCount++;
        } catch (error) {
          logger.warn('Failed to create embedding for chunk', {
            docId,
            chunkIndex: i,
            error,
          });
          // Still save chunk without embedding
          await client.query(
            `INSERT INTO ai_knowledge_chunks (
              id, tenant_id, document_id, chunk_index, content,
              metadata, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
            [chunkId, tenantId, docId, i, chunkContent, JSON.stringify({ charCount: chunkContent.length })],
          );
        }
      }

      // Update document status
      const embeddingStatus = embeddingCount > 0 ? 'completed' : 'failed';
      await client.query(
        `UPDATE ai_knowledge_documents
         SET chunk_count = $1,
             embedding_status = $2,
             status = 'active',
             updated_at = NOW()
         WHERE id = $3`,
        [chunks.length, embeddingStatus, docId],
      );

      logger.info('Knowledge document uploaded', {
        tenantId,
        docId,
        chunks: chunks.length,
        embedded: embeddingCount,
        title,
      });

      const result = await client.query(
        'SELECT * FROM ai_knowledge_documents WHERE id = $1',
        [docId],
      );
      return rowToCamelCase<AiKnowledgeDocument>(result.rows[0]);
    });
  }

  // ==========================================
  // 2. QUERY KNOWLEDGE (RAG)
  // ==========================================
  async queryKnowledge(
    tenantId: string,
    queryText: string,
    documentIds?: string[],
    limit: number = 5,
  ): Promise<KnowledgeQueryResponse> {
    return withTenantContext(tenantId, async (client) => {
      // Get relevant chunks via vector similarity or keyword search
      let chunks: any[] = [];

      try {
        // Try semantic search first (using embeddings)
        const queryEmbedding = await this.aiProvider.embed(queryText);

        // In production with vector DB, would use similarity search
        // For now, use keyword search as fallback
        const chunksResult = await this.getRelevantChunks(
          client,
          tenantId,
          queryText,
          documentIds,
          limit * 2,
        );
        chunks = chunksResult;
      } catch (error) {
        logger.warn('Embedding search failed, using keyword search', { error });
        // Fallback to keyword search
        chunks = await this.getRelevantChunks(
          client,
          tenantId,
          queryText,
          documentIds,
          limit * 2,
        );
      }

      if (chunks.length === 0) {
        return {
          query: queryText,
          results: [],
          answer: 'Xin lỗi, tôi không tìm thấy thông tin liên quan trong cơ sở kiến thức.',
          confidence: 0,
        };
      }

      // Build context from chunks
      const context = chunks
        .slice(0, limit)
        .map((c) => `[${c.document_title}] ${c.content}`)
        .join('\n\n');

      // Generate answer using AI
      const systemPrompt = `Bạn là AI Assistant của Spa. Dựa trên thông tin từ cơ sở kiến thức, trả lời câu hỏi của khách hàng/nhân viên.
      
Hướng dẫn:
- Sử dụng thông tin từ context để trả lời
- Nếu không có thông tin đủ, nói rõ
- Trả lời bằng tiếng Việt, thân thiện, chuyên nghiệp
- Trích dẫn nguồn nếu có thể

Context:
${context}`;

      const aiResponse = await this.aiProvider.complete({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: queryText },
        ],
        temperature: 0.3,
        maxTokens: 4096,
      });

      const results = chunks.slice(0, limit).map((c) => ({
        documentId: c.document_id,
        documentTitle: c.document_title,
        content: c.content,
        relevanceScore: c.similarity || 0,
        source: c.document_type,
      }));

      logger.info('Knowledge query completed', {
        tenantId,
        queryLength: queryText.length,
        resultsCount: results.length,
      });

      return {
        query: queryText,
        results,
        answer: aiResponse.content,
        confidence: results.length > 0 ? Math.min(results[0].relevanceScore || 0.5, 0.95) : 0,
      };
    });
  }

  // ==========================================
  // 3. LIST DOCUMENTS
  // ==========================================
  async listDocuments(
    tenantId: string,
    category?: string,
    search?: string,
  ): Promise<AiKnowledgeDocument[]> {
    return withTenantContext(tenantId, async (client) => {
      let queryText = `
        SELECT * FROM ai_knowledge_documents
        WHERE tenant_id = $1 AND status != 'deleted'
      `;
      const values: any[] = [tenantId];
      let paramIndex = 2;

      if (category) {
        queryText += ` AND category = $${paramIndex++}`;
        values.push(category);
      }
      if (search) {
        queryText += ` AND (title ILIKE $${paramIndex} OR content_text ILIKE $${paramIndex})`;
        values.push(`%${search}%`);
        paramIndex++;
      }

      queryText += ` ORDER BY created_at DESC`;

      const result = await client.query(queryText, values);
      return rowsToCamelCase<AiKnowledgeDocument>(result.rows);
    });
  }

  // ==========================================
  // 4. DELETE DOCUMENT
  // ==========================================
  async deleteDocument(tenantId: string, documentId: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `UPDATE ai_knowledge_documents
         SET status = 'deleted', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING id`,
        [documentId, tenantId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Document', documentId);
      }

      // Delete chunks
      await client.query(
        'DELETE FROM ai_knowledge_chunks WHERE document_id = $1',
        [documentId],
      );

      logger.info('Knowledge document deleted', { tenantId, documentId });
    });
  }

  // ==========================================
  // 5. TRAIN PRODUCT KNOWLEDGE
  // ==========================================
  async trainProductKnowledge(tenantId: string, productId: string): Promise<void> {
    const productResult = await query(
      `SELECT p.*, pc.name as category_name
       FROM products p
       LEFT JOIN product_categories pc ON pc.id = p.category_id
       WHERE p.id = $1 AND p.tenant_id = $2 AND p.is_active = true`,
      [productId, tenantId],
    );

    if (productResult.rows.length === 0) {
      throw new NotFoundError('Product', productId);
    }

    const product = productResult.rows[0];

    const systemPrompt = `Bạn là chuyên gia mỹ phẩm và skincare cao cấp.
Dựa trên thông tin sản phẩm, tạo nội dung chất lượng cao:
1. Mô tả chi tiết nâng cao (phân tích thành phần, công dụng)
2. Tóm tắt lợi ích chính (3-5 lợi ích)
3. Hướng dẫn sử dụng chi tiết (từng bước)
4. FAQ (5-7 câu hỏi thường gặp)
5. Lợi ích so với sản phẩm khác
6. Đối tượng phù hợp

Trả về JSON:
{
  "enhancedDescription": "",
  "benefitsSummary": "",
  "usageGuide": "",
  "faq": [{"question": "", "answer": ""}],
  "comparisonBenefits": "",
  "targetAudience": ""
}
Viết bằng tiếng Việt, chuyên nghiệp.`;

    const userPrompt = `Sản phẩm: ${product.name}
Mô tả: ${product.description || 'Chưa có'}
Giá: ${product.price} VND
Thành phần: ${Array.isArray(product.ingredients) ? product.ingredients.join(', ') : 'Chưa có'}
Hướng dẫn: ${product.usage_instructions || 'Chưa có'}
Dung tích: ${product.volume || 'Chưa có'} ${product.unit || ''}
Thương hiệu: ${product.brand || 'Chưa có'}
Loại: ${product.category_name || 'Chưa phân loại'}`;

    const aiResponse = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 4096,
    });

    try {
      const jsonStr = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const data = JSON.parse(jsonStr);

      // Create embedding
      let embeddingId: string | null = null;
      try {
        const embedding = await this.aiProvider.embed(
          `${product.name} ${data.enhancedDescription} ${data.benefitsSummary}`,
        );
        embeddingId = `prod_emb_${productId}`;
      } catch (error) {
        logger.warn('Failed to create embedding for product', { productId, error });
      }

      await query(
        `INSERT INTO ai_product_knowledge (
          tenant_id, product_id, enhanced_description, benefits_summary,
          usage_guide, faq, comparison_benefits, target_audience, embedding_id,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (tenant_id, product_id) DO UPDATE SET
          enhanced_description = $3,
          benefits_summary = $4,
          usage_guide = $5,
          faq = $6,
          comparison_benefits = $7,
          target_audience = $8,
          embedding_id = $9,
          updated_at = NOW()`,
        [
          tenantId,
          productId,
          data.enhancedDescription,
          data.benefitsSummary,
          data.usageGuide,
          JSON.stringify(data.faq),
          data.comparisonBenefits || '',
          data.targetAudience || '',
          embeddingId,
        ],
      );

      logger.info('Product knowledge trained', { tenantId, productId });
    } catch (error) {
      logger.error('Failed to train product knowledge', { error });
      throw new Error('Failed to train product knowledge');
    }
  }

  // ==========================================
  // 6. TRAIN SERVICE KNOWLEDGE
  // ==========================================
  async trainServiceKnowledge(tenantId: string, serviceId: string): Promise<void> {
    const serviceResult = await query(
      `SELECT s.*, sc.name as category_name
       FROM services s
       LEFT JOIN service_categories sc ON sc.id = s.category_id
       WHERE s.id = $1 AND s.tenant_id = $2 AND s.is_active = true`,
      [serviceId, tenantId],
    );

    if (serviceResult.rows.length === 0) {
      throw new NotFoundError('Service', serviceId);
    }

    const service = serviceResult.rows[0];

    const systemPrompt = `Bạn là chuyên gia thẩm mỹ spa cao cấp.
Dựa trên thông tin dịch vụ, tạo nội dung chất lượng cao:
1. Mô tả chi tiết nâng cao
2. Quy trình thực hiện chi tiết (từng bước)
3. Hướng dẫn chăm sóc sau dịch vụ
4. FAQ (5-7 câu hỏi thường gặp)
5. Lợi ích và kết quả mong đợi
6. Chống chỉ định và lưu ý

Trả về JSON:
{
  "enhancedDescription": "",
  "procedureDetail": "",
  "aftercareGuide": "",
  "faq": [{"question": "", "answer": ""}],
  "expectedResults": "",
  "contraindicationsDetail": ""
}
Viết bằng tiếng Việt, chuyên nghiệp.`;

    const userPrompt = `Dịch vụ: ${service.name}
Mô tả: ${service.description || 'Chưa có'}
Thời gian: ${service.duration_minutes} phút
Giá: ${service.price} VND
Loại: ${service.category_name || 'Chưa phân loại'}
Quy trình: ${JSON.stringify(service.procedure_steps || [])}
Chống chỉ định: ${Array.isArray(service.contraindications) ? service.contraindications.join(', ') : 'Không có'}
Mô tả nâng cao (có sẵn): ${service.enhanced_description || 'Chưa có'}`;

    const aiResponse = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.5,
      maxTokens: 4096,
    });

    try {
      const jsonStr = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      const data = JSON.parse(jsonStr);

      let embeddingId: string | null = null;
      try {
        const embedding = await this.aiProvider.embed(
          `${service.name} ${data.enhancedDescription} ${data.procedureDetail}`,
        );
        embeddingId = `svc_emb_${serviceId}`;
      } catch (error) {
        logger.warn('Failed to create embedding for service', { serviceId, error });
      }

      await query(
        `INSERT INTO ai_service_knowledge (
          tenant_id, service_id, enhanced_description, procedure_detail,
          aftercare_guide, faq, expected_results, contraindications_detail,
          embedding_id, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
        ON CONFLICT (tenant_id, service_id) DO UPDATE SET
          enhanced_description = $3,
          procedure_detail = $4,
          aftercare_guide = $5,
          faq = $6,
          expected_results = $7,
          contraindications_detail = $8,
          embedding_id = $9,
          updated_at = NOW()`,
        [
          tenantId,
          serviceId,
          data.enhancedDescription,
          data.procedureDetail,
          data.aftercareGuide,
          JSON.stringify(data.faq),
          data.expectedResults || '',
          data.contraindicationsDetail || '',
          embeddingId,
        ],
      );

      logger.info('Service knowledge trained', { tenantId, serviceId });
    } catch (error) {
      logger.error('Failed to train service knowledge', { error });
      throw new Error('Failed to train service knowledge');
    }
  }

  // ==========================================
  // 7. TRAIN MULTIPLE DOCUMENTS
  // ==========================================
  async trainDocuments(tenantId: string, documentIds: string[]): Promise<void> {
    for (const docId of documentIds) {
      try {
        const docResult = await query(
          'SELECT content_text FROM ai_knowledge_documents WHERE id = $1 AND tenant_id = $2',
          [docId, tenantId],
        );
        if (docResult.rows.length > 0) {
          // Re-chunk and embed the document
          const content = docResult.rows[0].content_text;
          const chunks = this.chunkText(content);

          await query(
            'DELETE FROM ai_knowledge_chunks WHERE document_id = $1',
            [docId],
          );

          for (let i = 0; i < chunks.length && i < MAX_CHUNKS_PER_DOCUMENT; i++) {
            const chunkId = uuidv4();
            try {
              const embedding = await this.aiProvider.embed(chunks[i]);
              await query(
                `INSERT INTO ai_knowledge_chunks (
                  id, tenant_id, document_id, chunk_index, content, embedding_id, metadata, created_at
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
                [chunkId, tenantId, docId, i, chunks[i], `emb_${chunkId}`, JSON.stringify({ charCount: chunks[i].length })],
              );
            } catch (error) {
              logger.warn('Failed to embed chunk', { docId, i, error });
            }
          }

          await query(
            `UPDATE ai_knowledge_documents SET chunk_count = $1, embedding_status = 'completed', updated_at = NOW()
             WHERE id = $2`,
            [chunks.length, docId],
          );
        }
      } catch (error) {
        logger.warn('Failed to train document', { docId, error });
      }
    }

    logger.info('Documents trained', { tenantId, count: documentIds.length });
  }

  // ==========================================
  // 8. PRIVATE METHODS
  // ==========================================

  private async getRelevantChunks(
    client: any,
    tenantId: string,
    queryText: string,
    documentIds?: string[],
    limit: number = 10,
  ): Promise<any[]> {
    // Use keyword-based search with ranking
    const terms = queryText
      .toLowerCase()
      .replace(/[^a-zA-Z0-9\sàáãạảăắằẳẵặâấầẩẫậèéẹẻẽêềếểễệđìíĩỉịòóõọỏôốồổỗộơớờởỡợùúũụủưứừửữựỳỵỷỹý]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length > 1);

    if (terms.length === 0) {
      return [];
    }

    let queryTextSQL = `
      SELECT c.*,
             d.title as document_title,
             d.type as document_type,
             ts_rank(
               to_tsvector('vietnamese', c.content),
               to_tsquery('vietnamese', $2)
             ) as similarity
      FROM ai_knowledge_chunks c
      JOIN ai_knowledge_documents d ON d.id = c.document_id
      WHERE c.tenant_id = $1
        AND d.status = 'active'
        AND d.embedding_status = 'completed'
    `;

    const values: any[] = [tenantId, terms.join(' & ')];
    let paramIndex = 3;

    if (documentIds && documentIds.length > 0) {
      const placeholders = documentIds.map((_, i) => `$${paramIndex++}`).join(',');
      queryTextSQL += ` AND c.document_id IN (${placeholders})`;
      values.push(...documentIds);
    }

    queryTextSQL += `
      ORDER BY similarity DESC
      LIMIT $${paramIndex}
    `;
    values.push(limit);

    const result = await client.query(queryTextSQL, values);
    return result.rows;
  }

  private chunkText(text: string): string[] {
    // Clean text
    const cleaned = text.replace(/\s+/g, ' ').trim();

    // Split by sentences first
    const sentences = cleaned.split(/[.!?]+/).filter((s) => s.trim().length > 0);

    const chunks: string[] = [];
    let currentChunk = '';
    let currentLength = 0;

    for (const sentence of sentences) {
      const sentenceLength = sentence.length;

      if (currentLength + sentenceLength > CHUNK_SIZE * 4) {
        // Approximate 4 chars per token
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        // Start new chunk with overlap
        const overlap = currentChunk
          .split(/\s+/)
          .slice(-Math.floor(CHUNK_OVERLAP))
          .join(' ');
        currentChunk = overlap + ' ' + sentence;
        currentLength = currentChunk.length;
      } else {
        if (currentChunk) {
          currentChunk += '. ' + sentence;
        } else {
          currentChunk = sentence;
        }
        currentLength = currentChunk.length;
      }
    }

    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  private hashContent(content: string): string {
    // Simple hash function for deduplication
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return `hash_${Math.abs(hash).toString(16)}`;
  }
}