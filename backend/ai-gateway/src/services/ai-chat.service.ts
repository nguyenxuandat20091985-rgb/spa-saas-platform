import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { query } from '../../../shared/database/connection';
import {
  ChatRequest,
  ChatResponse,
  ConversationContextType,
  AiConversation,
  AiMessage,
} from '../../../shared/types/ai';
import { rowToCamelCase, rowsToCamelCase, truncate } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { NotFoundError, ValidationError, RateLimitError } from '../../../shared/utils/errors';
import { AiProviderService, AiCompletionRequest } from './ai-provider.service';

const logger = createServiceLogger('ai-chat');

// ==========================================
// SYSTEM PROMPTS (CÓ THỂ CẤU HÌNH THEO TENANT)
// ==========================================
const SYSTEM_PROMPTS: Record<ConversationContextType, string> = {
  customer_chat: `Bạn là Beauty AI Assistant - chuyên gia tư vấn làm đẹp AI cao cấp.
Bạn có kiến thức sâu rộng về:
- Chăm sóc da: các loại da, quy trình skincare, thành phần mỹ phẩm
- Điều trị thẩm mỹ: laser, chemical peel, mesotherapy, botox, filler
- Sản phẩm làm đẹp: serum, collagen, retinol, vitamin C, niacinamide
- Liệu trình spa: massage, body treatment, facial treatment

Hướng dẫn:
- Trả lời bằng tiếng Việt, thân thiện, chuyên nghiệp
- Luôn đề xuất dịch vụ và sản phẩm phù hợp từ Spa
- Không đưa ra lời khuyên y tế
- Khuyên khách đến Spa để được tư vấn trực tiếp khi cần thiết`,

  sales_consult: `Bạn là AI Sales Consultant - chuyên gia tư vấn bán hàng cho Spa.
Nhiệm vụ:
- Phân tích nhu cầu khách hàng dựa trên lịch sử
- Đề xuất upsell, cross-sell phù hợp
- Tạo combo dịch vụ hấp dẫn
- Đề xuất membership phù hợp
- Tính toán giá trị khách hàng

Hướng dẫn:
- Trả lời bằng tiếng Việt
- Tập trung vào lợi ích cho khách hàng
- Đưa ra ít nhất 3 đề xuất cụ thể`,

  skin_analysis: `Bạn là AI Skin Analysis Expert - chuyên gia phân tích da.
Khi nhận hình ảnh da, phân tích:
- Mụn: vị trí, mức độ, loại (trứng cá, viêm, nang)
- Nám/thâm: vị trí, mức độ, loại
- Nếp nhăn: vị trí, mức độ
- Dầu/nhờn: mức độ, vùng T
- Độ ẩm: mức độ
- Lỗ chân lông: kích thước, vùng

Đưa ra:
- Đánh giá tổng quan (0-100)
- Khuyến nghị điều trị
- Sản phẩm phù hợp
- Lịch trình chăm sóc đề xuất`,

  marketing: `Bạn là AI Marketing Expert cho ngành Spa/Beauty.
Nhiệm vụ:
- Tạo nội dung marketing hấp dẫn cho Facebook, TikTok, Zalo, SMS, Email
- Viết caption, hashtag, CTA phù hợp từng kênh
- Đề xuất chiến dịch marketing
- Tạo nội dung khuyến mãi, ưu đãi

Hướng dẫn:
- Sử dụng ngôn ngữ tiếng Việt
- Tone sang trọng và chuyên nghiệp
- Có tính thuyết phục cao`,

  closing: `Bạn là AI Closing Agent - chuyên gia chốt sale cho Spa.
Nhiệm vụ:
- Phân tích trạng thái khách hàng (nóng/ấm/lạnh)
- Đề xuất kịch bản chốt sale
- Đề xuất ưu đãi/voucher phù hợp
- Xử lý phản đối
- Tạo cảm giác urgency hợp lý

Hướng dẫn:
- Trả lời bằng tiếng Việt
- Tự tin và thuyết phục nhưng không gây áp lực
- Đưa ra ít nhất 2 kịch bản thay thế`,

  customer_success: `Bạn là AI Customer Success Manager cho Spa.
Nhiệm vụ:
- Chăm sóc sau dịch vụ
- Hỏi thăm trải nghiệm
- Đề xuất lịch tái khám/bảo dưỡng
- Gửi voucher cảm ơn
- Khảo sát hài lòng
- Phát hiện sớm khách sắp rời bỏ

Hướng dẫn:
- Trả lời bằng tiếng Việt
- Ân cần và chu đáo
- Thể hiện sự quan tâm chân thành`,

  general: `Bạn là AI Assistant thông minh cho Spa.
Trả lời lịch sự, chuyên nghiệp và hữu ích.`,
};

// ==========================================
// AI CHAT SERVICE
// ==========================================
export class AiChatService {
  constructor(private aiProvider: AiProviderService) {}

  // ==========================================
  // 1. CHAT (NON-STREAMING)
  // ==========================================
  async chat(tenantId: string, userId: string, request: ChatRequest): Promise<ChatResponse> {
    const contextType = request.contextType || 'general';

    // Rate limit check
    await this.checkRateLimit(tenantId, userId);

    // Get or create conversation
    let conversationId = request.conversationId;
    if (!conversationId) {
      conversationId = await this.createConversation(
        tenantId,
        userId,
        request.customerId,
        contextType,
        request.branchId,
        request.staffId,
      );
    }

    // Get conversation history
    const history = await this.getConversationHistory(conversationId);

    // Get relevant knowledge
    const knowledgeContext = await this.getRelevantKnowledge(tenantId, request.message, contextType);

    // Get customer context
    let customerContext = '';
    if (request.customerId) {
      customerContext = await this.getCustomerContext(tenantId, request.customerId);
    }

    // Get business context (branch info, staff availability)
    const businessContext = await this.getBusinessContext(tenantId, request.branchId);

    // Build system prompt
    const systemPrompt = this.buildSystemPrompt(
      contextType,
      knowledgeContext,
      customerContext,
      businessContext,
    );

    // Build messages
    const messages: AiCompletionRequest['messages'] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: request.message },
    ];

    // Limit message length
    const trimmedMessages = this.trimMessages(messages);

    // Call AI provider
    const aiResponse = await this.aiProvider.complete(
      { messages: trimmedMessages },
      undefined,
      tenantId,
    );

    // Save messages
    await this.saveMessages(
      conversationId,
      request.message,
      aiResponse.content,
      aiResponse.tokensUsed,
      aiResponse.model,
    );

    // Update conversation stats
    await this.updateConversationStats(conversationId, aiResponse.tokensUsed);

    // Track usage
    await this.trackUsage(tenantId, aiResponse.tokensUsed, aiResponse.model, contextType);

    // Check for sensitive content
    const isSensitive = this.checkSensitiveContent(request.message, aiResponse.content);

    logger.info('AI chat completed', {
      tenantId,
      conversationId,
      tokensUsed: aiResponse.tokensUsed,
      model: aiResponse.model,
      contextType,
      isSensitive,
    });

    return {
      conversationId,
      messageId: aiResponse.messageId || '',
      content: aiResponse.content,
      tokensUsed: aiResponse.tokensUsed,
      modelUsed: aiResponse.model,
      isSensitive,
    };
  }

  // ==========================================
  // 2. CHAT (STREAMING)
  // ==========================================
  async *chatStream(
    tenantId: string,
    userId: string,
    request: ChatRequest,
  ): AsyncGenerator<{ chunk: string; done: boolean; conversationId?: string; messageId?: string }> {
    const contextType = request.contextType || 'general';

    await this.checkRateLimit(tenantId, userId);

    let conversationId = request.conversationId;
    if (!conversationId) {
      conversationId = await this.createConversation(
        tenantId,
        userId,
        request.customerId,
        contextType,
        request.branchId,
        request.staffId,
      );
      yield { chunk: '', done: false, conversationId };
    }

    const history = await this.getConversationHistory(conversationId);
    const knowledgeContext = await this.getRelevantKnowledge(tenantId, request.message, contextType);
    const customerContext = request.customerId
      ? await this.getCustomerContext(tenantId, request.customerId)
      : '';
    const businessContext = await this.getBusinessContext(tenantId, request.branchId);

    const systemPrompt = this.buildSystemPrompt(contextType, knowledgeContext, customerContext, businessContext);

    const messages: AiCompletionRequest['messages'] = [
      { role: 'system', content: systemPrompt },
      ...history.map((m) => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: request.message },
    ];

    const trimmedMessages = this.trimMessages(messages);

    let fullContent = '';
    let tokensUsed = 0;
    let modelUsed = '';

    for await (const chunk of this.aiProvider.completeStream(
      { messages: trimmedMessages },
      undefined,
      tenantId,
    )) {
      if (chunk.done) {
        tokensUsed = chunk.tokensUsed || 0;
        break;
      }
      fullContent += chunk.chunk;
      yield { chunk: chunk.chunk, done: false };
    }

    // Save messages
    const messageId = await this.saveMessages(
      conversationId,
      request.message,
      fullContent,
      tokensUsed,
      modelUsed,
    );

    await this.updateConversationStats(conversationId, tokensUsed);
    await this.trackUsage(tenantId, tokensUsed, modelUsed, contextType);

    logger.info('AI chat stream completed', {
      tenantId,
      conversationId,
      tokensUsed,
      modelUsed,
      contextType,
    });

    yield { chunk: '', done: true, conversationId, messageId };
  }

  // ==========================================
  // 3. CONVERSATION MANAGEMENT
  // ==========================================

  async getConversations(
    tenantId: string,
    params: {
      customerId?: string;
      contextType?: ConversationContextType;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{
    data: AiConversation[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
  }> {
    const page = params.page || 1;
    const limit = params.limit || 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ['tenant_id = $1'];
    const values: unknown[] = [tenantId];
    let paramIndex = 2;

    if (params.customerId) {
      conditions.push(`customer_id = $${paramIndex++}`);
      values.push(params.customerId);
    }
    if (params.contextType) {
      conditions.push(`context_type = $${paramIndex++}`);
      values.push(params.contextType);
    }
    if (params.startDate) {
      conditions.push(`started_at >= $${paramIndex++}`);
      values.push(params.startDate);
    }
    if (params.endDate) {
      conditions.push(`started_at <= $${paramIndex++}`);
      values.push(params.endDate);
    }

    const where = conditions.join(' AND ');

    const countResult = await query(
      `SELECT COUNT(*) FROM ai_conversations WHERE ${where}`,
      values,
    );
    const total = parseInt(countResult.rows[0].count, 10);

    const result = await query(
      `SELECT * FROM ai_conversations
       WHERE ${where}
       ORDER BY started_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...values, limit, offset],
    );

    return {
      data: rowsToCamelCase<AiConversation>(result.rows),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async getConversation(tenantId: string, conversationId: string): Promise<{
    conversation: AiConversation;
    messages: AiMessage[];
  }> {
    const convResult = await query(
      'SELECT * FROM ai_conversations WHERE id = $1 AND tenant_id = $2',
      [conversationId, tenantId],
    );
    if (convResult.rows.length === 0) {
      throw new NotFoundError('Conversation', conversationId);
    }

    const msgResult = await query(
      'SELECT * FROM ai_messages WHERE conversation_id = $1 ORDER BY created_at ASC',
      [conversationId],
    );

    return {
      conversation: rowToCamelCase<AiConversation>(convResult.rows[0]),
      messages: rowsToCamelCase<AiMessage>(msgResult.rows),
    };
  }

  async deleteConversation(tenantId: string, conversationId: string): Promise<void> {
    await query(
      'DELETE FROM ai_conversations WHERE id = $1 AND tenant_id = $2',
      [conversationId, tenantId],
    );
    // Messages will be deleted by cascade
  }

  // ==========================================
  // 4. PRIVATE METHODS
  // ==========================================

  private buildSystemPrompt(
    contextType: ConversationContextType,
    knowledge: string,
    customerInfo: string,
    businessInfo: string,
  ): string {
    let prompt = SYSTEM_PROMPTS[contextType] || SYSTEM_PROMPTS.general;

    if (knowledge) {
      prompt += `\n\n=== THÔNG TIN TỪ CƠ SỞ DỮ LIỆU SPA ===\n${knowledge}`;
    }

    if (customerInfo) {
      prompt += `\n\n=== THÔNG TIN KHÁCH HÀNG ===\n${customerInfo}`;
    }

    if (businessInfo) {
      prompt += `\n\n=== THÔNG TIN SPA ===\n${businessInfo}`;
    }

    return prompt;
  }

  private async getRelevantKnowledge(tenantId: string, queryText: string, contextType: string): Promise<string> {
    try {
      // Get products
      const products = await query(
        `SELECT p.name, p.description, p.price, p.unit, p.brand,
                apk.enhanced_description, apk.benefits_summary, apk.keywords
         FROM products p
         LEFT JOIN ai_product_knowledge apk ON apk.product_id = p.id
         WHERE p.tenant_id = $1 AND p.is_active = true
         ORDER BY p.name LIMIT 20`,
        [tenantId],
      );

      // Get services
      const services = await query(
        `SELECT s.name, s.description, s.price, s.duration_minutes,
                s.category_id, sc.name as category_name,
                ask.enhanced_description
         FROM services s
         LEFT JOIN ai_service_knowledge ask ON ask.service_id = s.id
         LEFT JOIN service_categories sc ON sc.id = s.category_id
         WHERE s.tenant_id = $1 AND s.is_active = true
         ORDER BY s.booking_count DESC LIMIT 20`,
        [tenantId],
      );

      let context = '';

      if (services.rows.length > 0) {
        context += '📋 DỊCH VỤ CỦA SPA:\n';
        for (const s of services.rows) {
          context += `- **${s.name}**`;
          if (s.category_name) context += ` (${s.category_name})`;
          context += `\n  • Thời gian: ${s.duration_minutes} phút`;
          context += `\n  • Giá: ${s.price.toLocaleString('vi-VN')} VND`;
          if (s.description) context += `\n  • Mô tả: ${s.description}`;
          if (s.enhanced_description) context += `\n  • ${s.enhanced_description}`;
          context += '\n';
        }
      }

      if (products.rows.length > 0) {
        context += '\n🛍️ SẢN PHẨM:\n';
        for (const p of products.rows) {
          context += `- **${p.name}**`;
          if (p.brand) context += ` (${p.brand})`;
          context += `\n  • Giá: ${p.price.toLocaleString('vi-VN')} VND`;
          if (p.description) context += `\n  • Mô tả: ${p.description}`;
          if (p.benefits_summary) context += `\n  • Lợi ích: ${p.benefits_summary}`;
          context += '\n';
        }
      }

      return context;
    } catch (error) {
      logger.warn('Failed to get knowledge context', { error });
      return '';
    }
  }

  private async getCustomerContext(tenantId: string, customerId: string): Promise<string> {
    try {
      const result = await query(
        `SELECT full_name, phone, email, gender,
                skin_type, skin_concerns, allergy_notes,
                membership_tier, loyalty_points, total_spent,
                visit_count, last_visit_at, tags, ai_profile,
                created_at
         FROM customers
         WHERE id = $1 AND tenant_id = $2`,
        [customerId, tenantId],
      );

      if (result.rows.length === 0) return '';
      const c = result.rows[0];

      let context = `👤 Khách hàng: ${c.full_name}`;
      if (c.email) context += `\n  • Email: ${c.email}`;
      if (c.phone) context += `\n  • SĐT: ${c.phone}`;
      if (c.gender) context += `\n  • Giới tính: ${c.gender}`;
      if (c.skin_type) context += `\n  • Loại da: ${c.skin_type}`;
      if (Array.isArray(c.skin_concerns) && c.skin_concerns.length > 0) {
        context += `\n  • Vấn đề da: ${c.skin_concerns.join(', ')}`;
      }
      if (c.allergy_notes) context += `\n  • Dị ứng: ${c.allergy_notes}`;
      if (c.membership_tier) context += `\n  • Hạng thành viên: ${c.membership_tier}`;
      if (c.loyalty_points) context += `\n  • Điểm thưởng: ${c.loyalty_points}`;
      context += `\n  • Tổng chi tiêu: ${Number(c.total_spent).toLocaleString('vi-VN')} VND`;
      context += `\n  • Số lần đến: ${c.visit_count}`;
      if (c.last_visit_at) {
        context += `\n  • Lần đến gần nhất: ${new Date(String(c.last_visit_at)).toLocaleDateString('vi-VN')}`;
      }
      if (c.tags && Array.isArray(c.tags) && c.tags.length > 0) {
        context += `\n  • Tags: ${c.tags.join(', ')}`;
      }

      // Recent services
      const recentServices = await query(
        `SELECT s.name, a.start_time, a.total_price
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         WHERE a.customer_id = $1 AND a.tenant_id = $2 AND a.status = 'completed'
         ORDER BY a.start_time DESC LIMIT 5`,
        [customerId, tenantId],
      );

      if (recentServices.rows.length > 0) {
        context += '\n\n📅 Dịch vụ gần đây:';
        for (const s of recentServices.rows) {
          const date = new Date(String(s.start_time)).toLocaleDateString('vi-VN');
          context += `\n  • ${s.name} - ${date} - ${Number(s.total_price).toLocaleString('vi-VN')} VND`;
        }
      }

      // AI profile if exists
      if (c.ai_profile) {
        try {
          const profile = JSON.parse(c.ai_profile);
          if (profile.summary) {
            context += `\n\n🧠 Hồ sơ AI: ${profile.summary}`;
          }
        } catch {
          // Ignore
        }
      }

      return context;
    } catch (error) {
      logger.warn('Failed to get customer context', { error });
      return '';
    }
  }

  private async getBusinessContext(tenantId: string, branchId?: string): Promise<string> {
    try {
      let context = '';

      // Branch info
      const branchResult = await query(
        `SELECT name, address, phone, working_hours
         FROM branches
         WHERE tenant_id = $1 ${branchId ? 'AND id = $2' : ''}
         ORDER BY name LIMIT 1`,
        branchId ? [tenantId, branchId] : [tenantId],
      );

      if (branchResult.rows.length > 0) {
        const b = branchResult.rows[0];
        context += `🏢 Chi nhánh: ${b.name}\n`;
        if (b.address) context += `  • Địa chỉ: ${b.address}\n`;
        if (b.phone) context += `  • SĐT: ${b.phone}\n`;
        if (b.working_hours) {
          try {
            const wh = JSON.parse(b.working_hours);
            const days = ['thứ 2', 'thứ 3', 'thứ 4', 'thứ 5', 'thứ 6', 'thứ 7', 'chủ nhật'];
            const today = new Date().getDay();
            const todayName = days[today === 0 ? 6 : today - 1];
            if (wh[todayName]) {
              context += `  • Hôm nay (${todayName}): ${wh[todayName].open} - ${wh[todayName].close}`;
              if (!wh[todayName].isOpen) context += ' (Nghỉ)';
              context += '\n';
            }
          } catch {
            // Ignore
          }
        }
      }

      return context;
    } catch {
      return '';
    }
  }

  private async checkRateLimit(tenantId: string, userId: string): Promise<void> {
    // Check daily limit
    const result = await query(
      `SELECT COUNT(*) as count, COALESCE(SUM(tokens_used), 0) as tokens
       FROM ai_usage
       WHERE tenant_id = $1 AND date = CURRENT_DATE`,
      [tenantId],
    );

    const count = parseInt(result.rows[0].count, 10);
    const tokens = parseInt(result.rows[0].tokens, 10);

    // Get tenant plan
    const planResult = await query(
      `SELECT sp.ai_features->>'monthlyAiTokens' as monthly_tokens
       FROM tenants t
       JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
       JOIN subscription_plans sp ON sp.id = ts.plan_id
       WHERE t.id = $1 AND ts.status = 'active'`,
      [tenantId],
    );

    const monthlyLimit = planResult.rows.length > 0
      ? parseInt(planResult.rows[0].monthly_tokens, 10) || 1000
      : 1000;

    if (tokens >= monthlyLimit) {
      throw new RateLimitError('Monthly AI token limit exceeded for this tenant');
    }

    // Per-user limit (100 messages/day)
    if (count >= 100) {
      throw new RateLimitError('Daily message limit exceeded for this user');
    }
  }

  private trimMessages(messages: AiCompletionRequest['messages']): AiCompletionRequest['messages'] {
    // Keep system message, then limit to last 20 messages
    const system = messages.filter((m) => m.role === 'system');
    const rest = messages.filter((m) => m.role !== 'system');

    // Limit to last 20 messages (10 exchanges)
    const trimmedRest = rest.slice(-20);

    return [...system, ...trimmedRest];
  }

  private checkSensitiveContent(userMessage: string, aiResponse: string): boolean {
    const sensitiveTerms = [
      'tự tử', 'tự sát', 'chết', 'c.hết', 'ảo giác',
      'mất trí', 'hoang tưởng', 'ảo tưởng',
    ];

    const lowerUser = userMessage.toLowerCase();
    const lowerAi = aiResponse.toLowerCase();

    for (const term of sensitiveTerms) {
      if (lowerUser.includes(term) || lowerAi.includes(term)) {
        return true;
      }
    }
    return false;
  }

  private async createConversation(
    tenantId: string,
    userId: string,
    customerId?: string,
    contextType: ConversationContextType = 'general',
    branchId?: string,
    staffId?: string,
  ): Promise<string> {
    const id = uuidv4();
    const sessionId = uuidv4();
    await query(
      `INSERT INTO ai_conversations (
        id, tenant_id, customer_id, user_id, branch_id, staff_id,
        session_id, context_type, started_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW())`,
      [id, tenantId, customerId, userId, branchId, staffId, sessionId, contextType],
    );
    return id;
  }

  private async getConversationHistory(conversationId: string): Promise<AiMessage[]> {
    const result = await query(
      `SELECT * FROM ai_messages
       WHERE conversation_id = $1
       ORDER BY created_at ASC
       LIMIT 50`,
      [conversationId],
    );
    return rowsToCamelCase<AiMessage>(result.rows);
  }

  private async saveMessages(
    conversationId: string,
    userMessage: string,
    assistantMessage: string,
    tokensUsed: number,
    modelUsed: string,
  ): Promise<string> {
    const userMsgId = uuidv4();
    const assistantMsgId = uuidv4();

    await query(
      `INSERT INTO ai_messages (id, conversation_id, role, content, tokens_used, model_used, created_at)
       VALUES ($1, $2, 'user', $3, 0, '', NOW()),
              ($4, $2, 'assistant', $5, $6, $7, NOW())`,
      [userMsgId, conversationId, truncate(userMessage, 5000), assistantMsgId, conversationId, truncate(assistantMessage, 5000), tokensUsed, modelUsed],
    );

    return assistantMsgId;
  }

  private async updateConversationStats(conversationId: string, tokensUsed: number): Promise<void> {
    await query(
      `UPDATE ai_conversations
       SET message_count = message_count + 2,
           tokens_used = tokens_used + $1,
           updated_at = NOW()
       WHERE id = $2`,
      [tokensUsed, conversationId],
    );
  }

  private async trackUsage(
    tenantId: string,
    tokensUsed: number,
    model: string,
    feature: string,
  ): Promise<void> {
    try {
      await query(
        `INSERT INTO ai_usage (
          tenant_id, date, tokens_used, messages,
          tokens_by_model, tokens_by_feature, conversations, created_at, updated_at
        ) VALUES ($1, CURRENT_DATE, $2, 1, $3, $4, 0, NOW(), NOW())
        ON CONFLICT (tenant_id, date)
        DO UPDATE SET
          tokens_used = ai_usage.tokens_used + $2,
          messages = ai_usage.messages + 1,
          tokens_by_model = ai_usage.tokens_by_model || $3,
          tokens_by_feature = ai_usage.tokens_by_feature || $4,
          updated_at = NOW()`,
        [
          tenantId,
          tokensUsed,
          JSON.stringify({ [model]: tokensUsed }),
          JSON.stringify({ [feature]: tokensUsed }),
        ],
      );
    } catch (error) {
      logger.warn('Failed to track AI usage', { error });
    }
  }
}