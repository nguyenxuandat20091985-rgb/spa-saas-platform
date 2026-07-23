import { query } from '../../../shared/database/connection';
import {
  AiSalesConsultRequest,
  AiSalesConsultResponse,
  AiMarketingRequest,
  AiMarketingResponse,
  AiClosingRequest,
  AiClosingResponse,
  AiPersonalizeRequest,
  AiPersonalizeResponse,
} from '../../../shared/types/ai';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiProviderService } from './ai-provider.service';
import { NotFoundError } from '../../../shared/utils/errors';
import { v4 as uuidv4 } from 'uuid';

const logger = createServiceLogger('ai-sales');

// ==========================================
// INTERFACE
// ==========================================
interface CustomerInsights {
  segment: string;
  temperature: 'hot' | 'warm' | 'cold';
  churnRisk: number;
  lifetimeValue: number;
  nextBestAction: string;
  recommendedProducts: string[];
  recommendedServices: string[];
}

// ==========================================
// AI SALES SERVICE
// ==========================================
export class AiSalesService {
  constructor(private aiProvider: AiProviderService) {}

  // ==========================================
  // 1. TƯ VẤN BÁN HÀNG
  // ==========================================
  async consultSales(tenantId: string, request: AiSalesConsultRequest): Promise<AiSalesConsultResponse> {
    // Get customer data
    const customerResult = await query(
      `SELECT c.*,
              json_agg(DISTINCT s.name) FILTER (WHERE s.name IS NOT NULL) as recent_services,
              json_agg(DISTINCT s.category_id) FILTER (WHERE s.category_id IS NOT NULL) as service_categories
       FROM customers c
       LEFT JOIN appointments a ON a.customer_id = c.id AND a.status = 'completed'
       LEFT JOIN services s ON s.id = a.service_id
       WHERE c.id = $1 AND c.tenant_id = $2
       GROUP BY c.id`,
      [request.customerId, tenantId],
    );

    if (customerResult.rows.length === 0) {
      throw new NotFoundError('Customer', request.customerId);
    }

    const customer = customerResult.rows[0];

    // Get available services
    const servicesResult = await query(
      `SELECT id, name, price, discount_price, description, duration_minutes, category_id
       FROM services
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY booking_count DESC`,
      [tenantId],
    );

    // Get products
    const productsResult = await query(
      `SELECT id, name, price, description, brand
       FROM products
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY name`,
      [tenantId],
    );

    // Get membership tiers
    const membershipResult = await query(
      `SELECT name, level, min_points, discount_percentage, benefits
       FROM membership_tiers
       WHERE tenant_id = $1
       ORDER BY level`,
      [tenantId],
    );

    // Get recent promotions
    const promotionsResult = await query(
      `SELECT name, description, discount_type, discount_value, valid_until
       FROM promotions
       WHERE tenant_id = $1 AND is_active = true AND valid_until > NOW()
       ORDER BY created_at DESC
       LIMIT 5`,
      [tenantId],
    );

    // Build system prompt
    const systemPrompt = this.buildSalesSystemPrompt();

    // Build user prompt
    const userPrompt = this.buildSalesUserPrompt(
      customer,
      servicesResult.rows,
      productsResult.rows,
      membershipResult.rows,
      promotionsResult.rows,
      request,
    );

    const aiResponse = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 4096,
    });

    let result: AiSalesConsultResponse;
    try {
      const jsonStr = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      result = JSON.parse(jsonStr) as AiSalesConsultResponse;
    } catch (error) {
      logger.warn('Failed to parse AI sales response, using fallback', { error });
      result = this.getDefaultSalesResponse(customer, servicesResult.rows);
    }

    // Log recommendation
    logger.info('Sales consultation completed', {
      tenantId,
      customerId: request.customerId,
      recommendations: result.recommendations?.length || 0,
    });

    return result;
  }

  // ==========================================
  // 2. CLOSING (CHỐT SALE)
  // ==========================================
  async closingConsult(
    tenantId: string,
    customerId: string,
    context?: string,
    productOrService?: string,
  ): Promise<AiClosingResponse> {
    // Get customer data
    const customerResult = await query(
      `SELECT c.*,
              COUNT(DISTINCT a.id) as total_appointments,
              AVG(a.total_price) as avg_spend
       FROM customers c
       LEFT JOIN appointments a ON a.customer_id = c.id AND a.status = 'completed'
       WHERE c.id = $1 AND c.tenant_id = $2
       GROUP BY c.id`,
      [customerId, tenantId],
    );

    if (customerResult.rows.length === 0) {
      throw new NotFoundError('Customer', customerId);
    }

    const customer = customerResult.rows[0];

    const systemPrompt = `Bạn là AI Closing Agent chuyên nghiệp cho Spa/Beauty.
Nhiệm vụ chốt sale hiệu quả, thuyết phục nhưng không gây áp lực.

**PHÂN TÍCH TRẠNG THÁI KHÁCH:**
- Nóng (hot): đã thể hiện ý định mua, cần động viên chốt nhanh
- Ấm (warm): có quan tâm, cần thêm động lực
- Lạnh (cold): chưa có nhu cầu rõ ràng, cần tạo hứng thú

**KỊCH BẢN CHỐT SALE:**
1. Mở đầu: Khẳng định lợi ích khách hàng sẽ nhận được
2. Xử lý phản đối: 3-5 phản đối phổ biến và cách xử lý
3. Tạo urgency: Ưu đãi có thời hạn, số lượng có hạn
4. CTA cuối cùng: Rõ ràng, dễ làm theo

Trả về JSON:
{
  "customerInsights": {
    "temperature": "hot|warm|cold",
    "buyingSignals": ["tín hiệu 1", "tín hiệu 2"],
    "objections": ["phản đối có thể có"],
    "preferredChannel": "phone|chat|in_person"
  },
  "closingScripts": [
    {
      "name": "tên kịch bản",
      "whenToUse": "khi nào sử dụng",
      "script": "kịch bản chi tiết",
      "expectedResult": "kết quả kỳ vọng"
    }
  ],
  "bestOffer": {
    "item": "dịch vụ/sản phẩm",
    "price": 0,
    "discount": 0,
    "urgency": "lý do khách nên mua ngay"
  },
  "followUpPlan": {
    "steps": ["bước 1", "bước 2"],
    "timing": "thời gian tốt nhất"
  }
}`;

    const userPrompt = `Khách hàng: ${customer.full_name}
Tổng chi tiêu: ${customer.total_spent} VND
Số lần đến: ${customer.total_appointments || 0}
Trung bình chi tiêu: ${customer.avg_spend || 0} VND
Hạng thành viên: ${customer.membership_tier || 'Chưa có'}
${context ? `Bối cảnh thêm: ${context}` : ''}
${productOrService ? `Sản phẩm/Dịch vụ muốn chốt: ${productOrService}` : ''}

Hãy tạo kịch bản chốt sale hiệu quả.`;

    const aiResponse = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      maxTokens: 4096,
    });

    try {
      const jsonStr = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(jsonStr) as AiClosingResponse;
    } catch {
      return this.getDefaultClosingResponse(customer);
    }
  }

  // ==========================================
  // 3. MARKETING
  // ==========================================
  async generateMarketing(tenantId: string, request: AiMarketingRequest): Promise<AiMarketingResponse> {
    // Get popular services
    const servicesResult = await query(
      `SELECT name, price, description, duration_minutes
       FROM services
       WHERE tenant_id = $1 AND is_active = true
       ORDER BY booking_count DESC
       LIMIT 5`,
      [tenantId],
    );

    // Get promotions
    const promotionsResult = await query(
      `SELECT name, description, discount_type, discount_value, valid_until
       FROM promotions
       WHERE tenant_id = $1 AND is_active = true AND valid_until > NOW()
       LIMIT 3`,
      [tenantId],
    );

    // Get customer testimonials
    const testimonialsResult = await query(
      `SELECT content, customer_name
       FROM reviews
       WHERE tenant_id = $1 AND rating >= 4
       ORDER BY created_at DESC
       LIMIT 3`,
      [tenantId],
    );

    const channelGuide: Record<string, string> = {
      facebook: `Viết bài Facebook hấp dẫn, có emoji, hashtag, CTA rõ ràng. Tối đa 300 từ.
Phong cách: sang trọng, gần gũi, truyền cảm hứng.
Hashtag: #spa #beauty #skincare #chamsocda #lamdep`,

      tiktok: `Viết script TikTok ngắn gọn, trend, viral. Tối đa 150 từ.
Có hashtag trending: #spatiktok #beautytips #skincarehack #lamdepmoingay
Có mô tả video và hướng dẫn quay.`,

      zalo: `Viết tin nhắn Zalo OA ngắn gọn, có nút CTA. Tối đa 100 từ.
Phong cách: thân thiện, riêng tư, có ưu đãi đặc biệt.`,

      sms: `Viết SMS marketing ngắn gọn. Tối đa 160 ký tự.
Có tên Spa, ưu đãi, số điện thoại hoặc link đặt lịch.`,

      email: `Viết email marketing chuyên nghiệp với subject line hấp dẫn.
Cấu trúc: Subject, Opening, Body, CTA, Closing.
Phong cách: sang trọng, chuyên nghiệp, có personalization.`,

      website: `Viết nội dung cho website/blog.
SEO friendly, có từ khóa, hấp dẫn, đầy đủ thông tin.
Tối đa 500 từ.`,
    };

    const systemPrompt = `Bạn là AI Marketing Expert cho ngành Spa/Beauty.
${channelGuide[request.channel] || ''}

Trả về JSON:
{
  "campaignName": "tên chiến dịch (hấp dẫn)",
  "headline": "tiêu đề chính",
  "subheadline": "tiêu đề phụ (nếu có)",
  "body": "nội dung chính",
  "callToAction": "CTA rõ ràng (Đặt lịch ngay, Nhận ưu đãi, ...)",
  "ctaLink": "link đề xuất (đặt lịch, xem chi tiết)",
  "hashtags": ["hashtag1", "hashtag2"],
  "targetAudience": "mô tả đối tượng mục tiêu",
  "suggestedSchedule": "thời gian đăng tốt nhất",
  "keyMessage": "thông điệp chính",
  "visualIdea": "gợi ý hình ảnh/video",
  "estimatedReach": "ước lượng phạm vi tiếp cận"
}
Chỉ trả về JSON. Viết bằng tiếng Việt.`;

    const userPrompt = `Kênh: ${request.channel}
Mục tiêu: ${request.objective}
${request.theme ? `Chủ đề: ${request.theme}` : ''}
${request.targetSegment ? `Đối tượng: ${request.targetSegment}` : ''}
${request.tone ? `Tone: ${request.tone}` : ''}
Độ dài tối đa: ${request.maxLength || 500} từ
${request.includeCta ? 'Yêu cầu có CTA rõ ràng' : 'Không cần CTA mạnh'}

Dịch vụ nổi bật:
${servicesResult.rows.map((s) => `- ${s.name}: ${s.price} VND - ${s.duration_minutes} phút`).join('\n')}

${promotionsResult.rows.length > 0 ? `Ưu đãi đang có:\n${promotionsResult.rows.map((p) => `- ${p.name}: ${p.description}`).join('\n')}` : ''}

${testimonialsResult.rows.length > 0 ? `Đánh giá khách hàng:\n${testimonialsResult.rows.map((t) => `- "${t.content}" - ${t.customer_name}`).join('\n')}` : ''}`;

    const aiResponse = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
      maxTokens: 4096,
    });

    try {
      const jsonStr = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(jsonStr) as AiMarketingResponse;
    } catch (error) {
      logger.warn('Failed to parse AI marketing response', { error });
      return {
        campaignName: `Chiến dịch ${request.channel} - ${request.objective}`,
        headline: 'Ưu đãi đặc biệt tại Spa',
        body: aiResponse.content.substring(0, 500),
        callToAction: 'Đặt lịch ngay',
        targetAudience: request.targetSegment || 'Phụ nữ 25-45 tuổi',
        suggestedSchedule: '10:00 sáng thứ 2-6',
        hashtags: ['#spa', '#beauty', '#skincare'],
      };
    }
  }

  // ==========================================
  // 4. PERSONALIZED CONTENT
  // ==========================================
  async personalizeContent(
    tenantId: string,
    customerId: string,
    type: string,
    context?: string,
  ): Promise<AiPersonalizeResponse> {
    const customerResult = await query(
      `SELECT c.*,
              json_agg(DISTINCT s.name) as recent_services
       FROM customers c
       LEFT JOIN appointments a ON a.customer_id = c.id AND a.status = 'completed'
       LEFT JOIN services s ON s.id = a.service_id
       WHERE c.id = $1 AND c.tenant_id = $2
       GROUP BY c.id`,
      [customerId, tenantId],
    );

    if (customerResult.rows.length === 0) {
      throw new NotFoundError('Customer', customerId);
    }

    const customer = customerResult.rows[0];

    const systemPrompt = `Bạn là AI Personalization Expert.
Tạo nội dung cá nhân hóa cho khách hàng dựa trên lịch sử và sở thích.

Trả về JSON:
{
  "personalizedMessage": "lời nhắn cá nhân hóa",
  "recommendedAction": "hành động đề xuất",
  "suggestedOffer": "ưu đãi phù hợp",
  "bestTime": "thời gian liên hệ tốt nhất",
  "personalizationScore": 0-100
}`;

    const userPrompt = `Khách hàng: ${customer.full_name}
Loại da: ${customer.skin_type || 'Chưa xác định'}
Hạng: ${customer.membership_tier || 'Chưa có'}
Tổng chi tiêu: ${customer.total_spent} VND
Dịch vụ gần đây: ${Array.isArray(customer.recent_services) ? customer.recent_services.filter(Boolean).join(', ') : 'Chưa có'}
Loại nội dung: ${type}
${context ? `Bối cảnh: ${context}` : ''}`;

    const aiResponse = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    });

    try {
      const jsonStr = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      return JSON.parse(jsonStr) as AiPersonalizeResponse;
    } catch {
      return {
        personalizedMessage: `Chào ${customer.full_name}, chúng tôi có những dịch vụ mới phù hợp với bạn.`,
        recommendedAction: 'Đặt lịch tư vấn',
        suggestedOffer: 'Ưu đãi 10% cho khách hàng thân thiết',
        bestTime: 'Chiều tối thứ 7',
        personalizationScore: 70,
      };
    }
  }

  // ==========================================
  // 5. PRIVATE METHODS
  // ==========================================

  private buildSalesSystemPrompt(): string {
    return `Bạn là AI Sales Consultant chuyên nghiệp cho Spa & Beauty.

**PHÂN TÍCH KHÁCH HÀNG:**
- Segment: Regular, VIP, Frequent, Occasional, Dormant
- Temperature: Hot (sẵn sàng mua), Warm (có quan tâm), Cold (chưa có nhu cầu)
- Churn Risk: 0-1 (0 là an toàn, 1 là rời bỏ)

**CHIẾN LƯỢC DEAL:**
- Upsell: Đề xuất dịch vụ cao cấp hơn
- Cross-sell: Đề xuất dịch vụ/sản phẩm bổ sung
- Combo: Gói dịch vụ giá trị
- Membership: Thẻ thành viên
- Seasonal: Ưu đãi theo mùa
- Loyalty: Ưu đãi cho khách hàng trung thành

**KỊCH BẢN TƯ VẤN:**
Phải có:
1. Lợi ích cho khách hàng
2. Lý do phù hợp
3. Kêu gọi hành động

Trả về JSON:
{
  "recommendations": [
    {
      "type": "upsell|cross_sell|combo|membership|seasonal|loyalty",
      "itemName": "tên",
      "reason": "lý do đề xuất",
      "suggestedScript": "kịch bản tư vấn",
      "estimatedValue": 0,
      "priority": "high|medium|low"
    }
  ],
  "customerInsights": {
    "segment": "phân khúc",
    "temperature": "hot|warm|cold",
    "churnRisk": 0-1,
    "lifetimeValue": 0,
    "nextBestAction": "hành động tốt nhất",
    "recommendedProducts": ["sản phẩm 1", "sản phẩm 2"],
    "recommendedServices": ["dịch vụ 1", "dịch vụ 2"]
  },
  "dealStrategy": {
    "primaryApproach": "tiếp cận chính",
    "secondaryApproach": "tiếp cận dự phòng",
    "urgencyAngle": "tạo urgency bằng cách nào"
  }
}`;
  }

  private buildSalesUserPrompt(
    customer: any,
    services: any[],
    products: any[],
    memberships: any[],
    promotions: any[],
    request: AiSalesConsultRequest,
  ): string {
    let prompt = `**THÔNG TIN KHÁCH HÀNG**\n`;
    prompt += `Tên: ${customer.full_name}\n`;
    prompt += `Email: ${customer.email || 'Chưa có'}\n`;
    prompt += `SĐT: ${customer.phone || 'Chưa có'}\n`;
    prompt += `Tổng chi tiêu: ${customer.total_spent.toLocaleString('vi-VN')} VND\n`;
    prompt += `Số lần đến: ${customer.visit_count || 0}\n`;
    prompt += `Hạng thành viên: ${customer.membership_tier || 'Chưa có'}\n`;
    prompt += `Điểm thưởng: ${customer.loyalty_points || 0}\n`;
    prompt += `Loại da: ${customer.skin_type || 'Chưa xác định'}\n`;
    prompt += `Vấn đề da: ${Array.isArray(customer.skin_concerns) ? customer.skin_concerns.join(', ') : 'Chưa xác định'}\n`;
    prompt += `Lần đến gần nhất: ${customer.last_visit_at ? new Date(customer.last_visit_at).toLocaleDateString('vi-VN') : 'Chưa có'}\n`;
    prompt += `Tags: ${Array.isArray(customer.tags) ? customer.tags.join(', ') : 'Chưa có'}\n`;

    if (customer.recent_services && Array.isArray(customer.recent_services)) {
      const filtered = customer.recent_services.filter(Boolean);
      if (filtered.length > 0) {
        prompt += `Dịch vụ gần đây: ${filtered.join(', ')}\n`;
      }
    }

    if (request.context) {
      prompt += `\nContext thêm: ${request.context}\n`;
    }

    if (request.serviceIds && request.serviceIds.length > 0) {
      prompt += `\nQuan tâm đến dịch vụ: ${request.serviceIds.join(', ')}\n`;
    }

    if (request.budgetRange) {
      prompt += `\nNgân sách: ${request.budgetRange.min || 0} - ${request.budgetRange.max || 'không giới hạn'} VND\n`;
    }

    if (request.preferredStaff) {
      prompt += `\nNhân viên ưa thích: ${request.preferredStaff}\n`;
    }

    // Services
    prompt += `\n**DỊCH VỤ CÓ SẴN (${services.length})**\n`;
    for (const s of services) {
      prompt += `- ${s.name}: ${s.price.toLocaleString('vi-VN')} VND`;
      if (s.duration_minutes) prompt += ` (${s.duration_minutes} phút)`;
      if (s.discount_price) prompt += ` (Giá KM: ${s.discount_price.toLocaleString('vi-VN')} VND)`;
      if (s.description) prompt += ` - ${s.description.substring(0, 100)}`;
      prompt += '\n';
    }

    // Products
    if (products.length > 0) {
      prompt += `\n**SẢN PHẨM (${products.length})**\n`;
      for (const p of products) {
        prompt += `- ${p.name}`;
        if (p.brand) prompt += ` (${p.brand})`;
        prompt += `: ${p.price.toLocaleString('vi-VN')} VND`;
        if (p.description) prompt += ` - ${p.description.substring(0, 80)}`;
        prompt += '\n';
      }
    }

    // Memberships
    if (memberships.length > 0) {
      prompt += `\n**THẺ THÀNH VIÊN**\n`;
      for (const m of memberships) {
        prompt += `- ${m.name}: Level ${m.level}, Giảm ${m.discount_percentage}%`;
        if (m.benefits) prompt += `, ${m.benefits}`;
        prompt += '\n';
      }
    }

    // Promotions
    if (promotions.length > 0) {
      prompt += `\n**KHUYẾN MÃI ĐANG CÓ**\n`;
      for (const p of promotions) {
        prompt += `- ${p.name}`;
        if (p.discount_type === 'percentage') {
          prompt += `: Giảm ${p.discount_value}%`;
        } else if (p.discount_type === 'fixed') {
          prompt += `: Giảm ${p.discount_value.toLocaleString('vi-VN')} VND`;
        }
        if (p.valid_until) {
          prompt += ` (đến ${new Date(p.valid_until).toLocaleDateString('vi-VN')})`;
        }
        prompt += '\n';
      }
    }

    prompt += `\nTạo tối đa 5 đề xuất, ưu tiên phù hợp nhất.`;

    return prompt;
  }

  private getDefaultSalesResponse(customer: any, services: any[]): AiSalesConsultResponse {
    const topService = services.length > 0 ? services[0] : null;

    return {
      recommendations: [
        {
          type: 'membership',
          itemName: 'Membership Gold',
          reason: 'Tối ưu chi phí cho khách hàng thường xuyên',
          suggestedScript: `Chào ${customer.full_name}, em thấy chị đã sử dụng dịch vụ bên em ${customer.visit_count || 0} lần. Nếu chị đăng ký thẻ Gold, chị sẽ được giảm 10% tất cả dịch vụ và tích điểm x2 ạ.`,
          estimatedValue: 5000000,
          priority: 'high',
        },
      ],
      customerInsights: {
        segment: customer.visit_count > 5 ? 'VIP' : 'Regular',
        temperature: customer.visit_count > 3 ? 'warm' : 'cold',
        churnRisk: customer.visit_count > 0 ? 0.3 : 0.8,
        lifetimeValue: parseFloat(customer.total_spent || 0),
        nextBestAction: 'Gửi ưu đãi đặc biệt qua email',
        recommendedProducts: [],
        recommendedServices: topService ? [topService.name] : [],
      },
      dealStrategy: {
        primaryApproach: 'Tư vấn lợi ích thành viên',
        secondaryApproach: 'Đề xuất gói combo',
        urgencyAngle: 'Ưu đãi có thời hạn',
      },
    };
  }

  private getDefaultClosingResponse(customer: any): AiClosingResponse {
    return {
      customerInsights: {
        temperature: 'warm',
        buyingSignals: ['Khách hàng đã sử dụng dịch vụ trước đó'],
        objections: ['Giá cao', 'Chưa có thời gian'],
        preferredChannel: 'in_person',
      },
      closingScripts: [
        {
          name: 'Kịch bản lợi ích',
          whenToUse: 'Khi khách hàng quan tâm nhưng còn phân vân',
          script: `Chào ${customer.full_name}, em thấy chị đã sử dụng dịch vụ bên em nhiều lần. Em muốn giới thiệu gói ưu đãi đặc biệt dành riêng cho khách hàng thân thiết như chị. Nếu chị đăng ký hôm nay, chị sẽ nhận được thêm 1 buổi trị liệu miễn phí. Chị có muốn em tư vấn thêm không ạ?`,
          expectedResult: 'Tăng tỷ lệ chốt sale 30%',
        },
      ],
      bestOffer: {
        item: 'Gói ưu đãi thành viên',
        price: 5000000,
        discount: 15,
        urgency: 'Ưu đãi chỉ áp dụng đến cuối tháng này',
      },
      followUpPlan: {
        steps: ['Gửi email nhắc nhở sau 3 ngày', 'Gọi điện tư vấn lại sau 5 ngày'],
        timing: 'Sau 3 ngày',
      },
    };
  }
}