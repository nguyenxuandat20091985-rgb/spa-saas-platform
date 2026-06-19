import { query } from '../../../shared/database/connection';
import { AiSalesConsultRequest, AiSalesConsultResponse, AiMarketingRequest, AiMarketingResponse } from '../../../shared/types/ai';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiProviderService } from './ai-provider.service';

const logger = createServiceLogger('ai-sales');

export class AiSalesService {
  constructor(private aiProvider: AiProviderService) {}

  async consultSales(tenantId: string, request: AiSalesConsultRequest): Promise<AiSalesConsultResponse> {
    // Get customer data
    const customerResult = await query(
      `SELECT c.*, json_agg(DISTINCT s.name) as recent_services
       FROM customers c
       LEFT JOIN appointments a ON a.customer_id = c.id AND a.status = 'completed'
       LEFT JOIN services s ON s.id = a.service_id
       WHERE c.id = $1 AND c.tenant_id = $2
       GROUP BY c.id`,
      [request.customerId, tenantId],
    );

    if (customerResult.rows.length === 0) {
      return this.getDefaultResponse();
    }

    const customer = customerResult.rows[0];

    // Get available services and products
    const servicesResult = await query(
      `SELECT id, name, price, discount_price, description
       FROM services WHERE tenant_id = $1 AND status = 'active'
       ORDER BY booking_count DESC`,
      [tenantId],
    );

    const productsResult = await query(
      `SELECT id, name, price, description
       FROM products WHERE tenant_id = $1 AND status = 'active'
       ORDER BY name`,
      [tenantId],
    );

    const systemPrompt = `Bạn là AI Sales Consultant chuyên nghiệp cho Spa.
Phân tích thông tin khách hàng và đề xuất chiến lược bán hàng.
Trả về kết quả dưới dạng JSON:
{
  "recommendations": [
    {
      "type": "upsell|cross_sell|combo|membership",
      "itemName": "tên dịch vụ/sản phẩm",
      "reason": "lý do đề xuất",
      "suggestedScript": "kịch bản tư vấn",
      "estimatedValue": số_tiền
    }
  ],
  "customerInsights": {
    "segment": "phân khúc khách hàng",
    "temperature": "hot|warm|cold",
    "churnRisk": 0-1,
    "lifetimeValue": số_tiền
  }
}
Chỉ trả về JSON.`;

    const userPrompt = `Khách hàng: ${customer.full_name}
Tổng chi tiêu: ${customer.total_spent} VND
Số lần đến: ${customer.visit_count}
Hạng: ${customer.membership_tier || 'Chưa có'}
Loại da: ${customer.skin_type || 'Chưa xác định'}
Dịch vụ gần đây: ${Array.isArray(customer.recent_services) ? customer.recent_services.filter(Boolean).join(', ') : 'Chưa có'}
${request.context ? `Context thêm: ${request.context}` : ''}

Dịch vụ có sẵn:
${servicesResult.rows.map((s) => `- ${s.name}: ${s.price} VND`).join('\n')}

Sản phẩm:
${productsResult.rows.map((p) => `- ${p.name}: ${p.price} VND`).join('\n')}`;

    const aiResponse = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
    });

    try {
      const jsonStr = aiResponse.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(jsonStr) as AiSalesConsultResponse;
    } catch {
      logger.warn('Failed to parse AI sales response');
      return this.getDefaultResponse();
    }
  }

  async generateMarketing(tenantId: string, request: AiMarketingRequest): Promise<AiMarketingResponse> {
    const servicesResult = await query(
      'SELECT name, price, description FROM services WHERE tenant_id = $1 AND status = $2 AND is_popular = true LIMIT 5',
      [tenantId, 'active'],
    );

    const channelGuide: Record<string, string> = {
      facebook: 'Viết bài Facebook hấp dẫn, có emoji, hashtag, CTA rõ ràng. Tối đa 300 từ.',
      tiktok: 'Viết script TikTok ngắn gọn, trend, viral. Tối đa 150 từ. Có hashtag trending.',
      zalo: 'Viết tin nhắn Zalo OA ngắn gọn, có nút CTA. Tối đa 100 từ.',
      sms: 'Viết SMS marketing ngắn gọn. Tối đa 160 ký tự. Có số điện thoại hoặc link.',
      email: 'Viết email marketing chuyên nghiệp với subject line hấp dẫn. HTML friendly.',
    };

    const systemPrompt = `Bạn là AI Marketing Expert cho ngành Spa/Beauty.
${channelGuide[request.channel] || ''}
Trả về JSON:
{
  "campaignName": "tên chiến dịch",
  "headline": "tiêu đề",
  "body": "nội dung chính",
  "callToAction": "CTA",
  "hashtags": ["hashtag1", "hashtag2"],
  "targetAudience": "mô tả đối tượng",
  "suggestedSchedule": "thời gian đăng tốt nhất"
}
Chỉ trả về JSON. Viết bằng tiếng Việt.`;

    const userPrompt = `Kênh: ${request.channel}
Mục tiêu: ${request.objective}
${request.theme ? `Chủ đề: ${request.theme}` : ''}
${request.targetSegment ? `Đối tượng: ${request.targetSegment}` : ''}

Dịch vụ nổi bật:
${servicesResult.rows.map((s) => `- ${s.name}: ${s.price} VND - ${s.description || ''}`).join('\n')}`;

    const aiResponse = await this.aiProvider.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.8,
    });

    try {
      const jsonStr = aiResponse.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      return JSON.parse(jsonStr) as AiMarketingResponse;
    } catch {
      return {
        campaignName: 'Chiến dịch Marketing',
        headline: 'Ưu đãi đặc biệt tại Spa',
        body: aiResponse.content,
        callToAction: 'Đặt lịch ngay',
        targetAudience: 'Phụ nữ 25-45 tuổi',
        suggestedSchedule: '10:00 sáng thứ 2-6',
      };
    }
  }

  private getDefaultResponse(): AiSalesConsultResponse {
    return {
      recommendations: [
        {
          type: 'membership',
          itemName: 'Membership Gold',
          reason: 'Tối ưu chi phí dịch vụ',
          suggestedScript: 'Chị ơi, em thấy chị hay sử dụng dịch vụ bên em. Nếu chị đăng ký thẻ Gold, chị sẽ được giảm 10% tất cả dịch vụ và tích điểm x2 ạ.',
          estimatedValue: 5000000,
        },
      ],
      customerInsights: {
        segment: 'Regular',
        temperature: 'warm',
        churnRisk: 0.3,
        lifetimeValue: 10000000,
      },
    };
  }
}
