import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { query } from '../../../shared/database/connection';
import { ChatRequest, ChatResponse, ConversationContextType, AiConversation, AiMessage } from '../../../shared/types/ai';
import { rowToCamelCase, rowsToCamelCase } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiProviderService, AiCompletionRequest } from './ai-provider.service';

const logger = createServiceLogger('ai-chat');

const SYSTEM_PROMPTS: Record<ConversationContextType, string> = {
  customer_chat: `Bạn là Beauty AI Assistant - chuyên gia tư vấn làm đẹp AI cao cấp.
Bạn có kiến thức sâu rộng về:
- Chăm sóc da: các loại da, quy trình skincare, thành phần mỹ phẩm
- Điều trị thẩm mỹ: laser, chemical peel, mesotherapy, botox, filler
- Sản phẩm làm đẹp: serum, collagen, retinol, vitamin C, niacinamide
- Liệu trình spa: massage, body treatment, facial treatment
Trả lời bằng tiếng Việt, thân thiện, chuyên nghiệp. Luôn đề xuất dịch vụ và sản phẩm phù hợp từ Spa.
Không đưa ra lời khuyên y tế. Khuyên khách đến Spa để được tư vấn trực tiếp khi cần.`,

  sales_consult: `Bạn là AI Sales Consultant - chuyên gia tư vấn bán hàng cho Spa.
Nhiệm vụ:
- Phân tích nhu cầu khách hàng dựa trên lịch sử
- Đề xuất upsell, cross-sell phù hợp
- Tạo combo dịch vụ hấp dẫn
- Đề xuất membership phù hợp
- Tính toán giá trị khách hàng
Trả lời bằng tiếng Việt, tập trung vào lợi ích cho khách hàng.`,

  skin_analysis: `Bạn là AI Skin Analysis Expert - chuyên gia phân tích da.
Khi nhận hình ảnh da, phân tích:
- Mụn: vị trí, mức độ, loại (trứng cá, viêm, nang)
- Nám/thâm: vị trí, mức độ, loại
- Nếp nhăn: vị trí, mức độ
- Dầu/nhờn: mức độ, vùng T
- Độ ẩm: mức độ
- Lỗ chân lông: kích thước, vùng
Đưa ra đánh giá tổng quan (0-100) và khuyến nghị điều trị.
Trả lời bằng tiếng Việt.`,

  marketing: `Bạn là AI Marketing Expert cho ngành Spa/Beauty.
Nhiệm vụ:
- Tạo nội dung marketing hấp dẫn cho Facebook, TikTok, Zalo, SMS, Email
- Viết caption, hashtag, CTA phù hợp từng kênh
- Đề xuất chiến dịch marketing
- Tạo nội dung khuyến mãi, ưu đãi
Sử dụng ngôn ngữ tiếng Việt, tone sang trọng và chuyên nghiệp.`,

  closing: `Bạn là AI Closing Agent - chuyên gia chốt sale cho Spa.
Nhiệm vụ:
- Phân tích trạng thái khách hàng (nóng/ấm/lạnh)
- Đề xuất kịch bản chốt sale
- Đề xuất ưu đãi/voucher phù hợp
- Xử lý phản đối
- Tạo cảm giác urgency hợp lý
Trả lời bằng tiếng Việt, tự tin và thuyết phục nhưng không gây áp lực.`,

  customer_success: `Bạn là AI Customer Success Manager cho Spa.
Nhiệm vụ:
- Chăm sóc sau dịch vụ
- Hỏi thăm trải nghiệm
- Đề xuất lịch tái khám/bảo dưỡng
- Gửi voucher cảm ơn
- Khảo sát hài lòng
- Phát hiện sớm khách sắp rời bỏ
Trả lời bằng tiếng Việt, ân cần và chu đáo.`,
};

export class AiChatService {
  constructor(private aiProvider: AiProviderService) {}

  async chat(tenantId: string, userId: string, request: ChatRequest): Promise<ChatResponse> {
    const contextType = request.contextType || 'customer_chat';

    // Get or create conversation
    let conversationId = request.conversationId;
    if (!conversationId) {
      conversationId = await this.createConversation(tenantId, userId, request.customerId, contextType);
    }

    // Get conversation history
    const history = await this.getConversationHistory(conversationId);

    // Get relevant context from knowledge base
    const knowledgeContext = await this.getRelevantKnowledge(tenantId, request.message, contextType);

    // Get customer context if available
    let customerContext = '';
    if (request.customerId) {
      customerContext = await this.getCustomerContext(tenantId, request.customerId);
    }

    // Build prompt
    const systemPrompt = this.buildSystemPrompt(contextType, knowledgeContext, customerContext);

    const messages: AiCompletionRequest['messages'] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: request.message },
    ];

    // Call AI provider
    const aiResponse = await this.aiProvider.complete({ messages });

    // Save user message
    const userMessageId = await this.saveMessage(conversationId, 'user', request.message, 0, '');

    // Save assistant message
    const assistantMessageId = await this.saveMessage(
      conversationId, 'assistant', aiResponse.content, aiResponse.tokensUsed, aiResponse.model,
    );

    // Update conversation stats
    await this.updateConversationStats(conversationId, aiResponse.tokensUsed);

    // Track AI usage
    await this.trackUsage(tenantId, aiResponse.tokensUsed, aiResponse.model, contextType);

    logger.info('AI chat completed', {
      tenantId, conversationId, tokensUsed: aiResponse.tokensUsed, model: aiResponse.model,
    });

    return {
      conversationId,
      messageId: assistantMessageId,
      content: aiResponse.content,
      tokensUsed: aiResponse.tokensUsed,
    };
  }

  private buildSystemPrompt(contextType: ConversationContextType, knowledge: string, customerInfo: string): string {
    let prompt = SYSTEM_PROMPTS[contextType] || SYSTEM_PROMPTS.customer_chat;

    if (knowledge) {
      prompt += `\n\n=== THÔNG TIN TỪ CƠ SỞ DỮ LIỆU SPA ===\n${knowledge}`;
    }

    if (customerInfo) {
      prompt += `\n\n=== THÔNG TIN KHÁCH HÀNG ===\n${customerInfo}`;
    }

    return prompt;
  }

  private async getRelevantKnowledge(tenantId: string, queryText: string, contextType: string): Promise<string> {
    try {
      // Get product knowledge
      const products = await query(
        `SELECT p.name, p.description, p.price, apk.enhanced_description, apk.benefits_summary
         FROM products p
         LEFT JOIN ai_product_knowledge apk ON apk.product_id = p.id
         WHERE p.tenant_id = $1 AND p.status = 'active'
         ORDER BY p.name LIMIT 20`,
        [tenantId],
      );

      // Get service knowledge
      const services = await query(
        `SELECT s.name, s.description, s.price, s.duration_minutes, ask.enhanced_description
         FROM services s
         LEFT JOIN ai_service_knowledge ask ON ask.service_id = s.id
         WHERE s.tenant_id = $1 AND s.status = 'active'
         ORDER BY s.booking_count DESC LIMIT 20`,
        [tenantId],
      );

      let context = '';

      if (services.rows.length > 0) {
        context += 'DỊCH VỤ CỦA SPA:\n';
        for (const s of services.rows) {
          context += `- ${s.name}: ${s.description || ''} | Giá: ${s.price} VND | Thời gian: ${s.duration_minutes} phút\n`;
          if (s.enhanced_description) context += `  ${s.enhanced_description}\n`;
        }
      }

      if (products.rows.length > 0) {
        context += '\nSẢN PHẨM:\n';
        for (const p of products.rows) {
          context += `- ${p.name}: ${p.description || ''} | Giá: ${p.price} VND\n`;
          if (p.benefits_summary) context += `  ${p.benefits_summary}\n`;
        }
      }

      return context;
    } catch {
      return '';
    }
  }

  private async getCustomerContext(tenantId: string, customerId: string): Promise<string> {
    try {
      const result = await query(
        `SELECT full_name, phone, skin_type, skin_concerns, membership_tier,
                loyalty_points, total_spent, visit_count, last_visit_at, tags, ai_profile
         FROM customers WHERE id = $1 AND tenant_id = $2`,
        [customerId, tenantId],
      );

      if (result.rows.length === 0) return '';
      const c = result.rows[0];

      let context = `Tên: ${c.full_name}\n`;
      if (c.skin_type) context += `Loại da: ${c.skin_type}\n`;
      if (Array.isArray(c.skin_concerns) && c.skin_concerns.length > 0) context += `Vấn đề da: ${c.skin_concerns.join(', ')}\n`;
      if (c.membership_tier) context += `Hạng thành viên: ${c.membership_tier}\n`;
      context += `Tổng chi tiêu: ${c.total_spent} VND\n`;
      context += `Số lần đến: ${c.visit_count}\n`;
      if (c.last_visit_at) context += `Lần đến gần nhất: ${new Date(String(c.last_visit_at)).toLocaleDateString('vi-VN')}\n`;

      // Recent services
      const recentServices = await query(
        `SELECT s.name, a.start_time
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         WHERE a.customer_id = $1 AND a.tenant_id = $2 AND a.status = 'completed'
         ORDER BY a.start_time DESC LIMIT 5`,
        [customerId, tenantId],
      );

      if (recentServices.rows.length > 0) {
        context += 'Dịch vụ gần đây:\n';
        for (const s of recentServices.rows) {
          context += `- ${s.name} (${new Date(String(s.start_time)).toLocaleDateString('vi-VN')})\n`;
        }
      }

      return context;
    } catch {
      return '';
    }
  }

  private async createConversation(
    tenantId: string, userId: string, customerId: string | undefined, contextType: ConversationContextType,
  ): Promise<string> {
    const id = uuidv4();
    const sessionId = uuidv4();
    await query(
      `INSERT INTO ai_conversations (id, tenant_id, customer_id, user_id, session_id, context_type)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, tenantId, customerId, userId, sessionId, contextType],
    );
    return id;
  }

  private async getConversationHistory(conversationId: string): Promise<AiMessage[]> {
    const result = await query(
      `SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC LIMIT 50`,
      [conversationId],
    );
    return rowsToCamelCase<AiMessage>(result.rows);
  }

  private async saveMessage(
    conversationId: string, role: string, content: string, tokensUsed: number, modelUsed: string,
  ): Promise<string> {
    const id = uuidv4();
    await query(
      `INSERT INTO ai_messages (id, conversation_id, role, content, tokens_used, model_used)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [id, conversationId, role, content, tokensUsed, modelUsed],
    );
    return id;
  }

  private async updateConversationStats(conversationId: string, tokensUsed: number): Promise<void> {
    await query(
      `UPDATE ai_conversations
       SET message_count = message_count + 2, tokens_used = tokens_used + $1, updated_at = NOW()
       WHERE id = $2`,
      [tokensUsed, conversationId],
    );
  }

  private async trackUsage(tenantId: string, tokensUsed: number, model: string, feature: string): Promise<void> {
    try {
      await query(
        `INSERT INTO ai_usage (tenant_id, date, tokens_used, conversations, messages, tokens_by_model, tokens_by_feature)
         VALUES ($1, CURRENT_DATE, $2, 0, 1, $3, $4)
         ON CONFLICT (tenant_id, date)
         DO UPDATE SET
           tokens_used = ai_usage.tokens_used + $2,
           messages = ai_usage.messages + 1,
           tokens_by_model = ai_usage.tokens_by_model || $3,
           tokens_by_feature = ai_usage.tokens_by_feature || $4,
           updated_at = NOW()`,
        [tenantId, tokensUsed, JSON.stringify({ [model]: tokensUsed }), JSON.stringify({ [feature]: tokensUsed })],
      );
    } catch (error) {
      logger.warn('Failed to track AI usage', { error });
    }
  }

  async getConversations(tenantId: string, customerId?: string): Promise<AiConversation[]> {
    const conditions = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];

    if (customerId) {
      conditions.push('customer_id = $2');
      values.push(customerId);
    }

    const result = await query(
      `SELECT * FROM ai_conversations WHERE ${conditions.join(' AND ')} ORDER BY started_at DESC LIMIT 50`,
      values,
    );

    return rowsToCamelCase<AiConversation>(result.rows);
  }

  async getConversation(conversationId: string): Promise<{ conversation: AiConversation; messages: AiMessage[] }> {
    const convResult = await query('SELECT * FROM ai_conversations WHERE id = $1', [conversationId]);
    const msgResult = await query(
      'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );

    return {
      conversation: rowToCamelCase<AiConversation>(convResult.rows[0]),
      messages: rowsToCamelCase<AiMessage>(msgResult.rows),
    };
  }
}
