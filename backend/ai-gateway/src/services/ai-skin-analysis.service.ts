import { query } from '../../../shared/database/connection';
import { SkinAnalysisRequest, SkinAnalysisResponse } from '../../../shared/types/ai';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiProviderService } from './ai-provider.service';
import { v4 as uuidv4 } from 'uuid';

const logger = createServiceLogger('ai-skin-analysis');

export class AiSkinAnalysisService {
  constructor(private aiProvider: AiProviderService) {}

  async analyzeSkin(tenantId: string, request: SkinAnalysisRequest): Promise<SkinAnalysisResponse> {
    const systemPrompt = `Bạn là chuyên gia phân tích da AI. Phân tích hình ảnh da và trả về kết quả dưới dạng JSON.
Cấu trúc JSON:
{
  "overallScore": 0-100,
  "details": {
    "acne": { "severity": 0-10, "areas": ["trán", "má", ...], "description": "" },
    "pigmentation": { "severity": 0-10, "type": "nám/tàn nhang/thâm", "description": "" },
    "wrinkles": { "severity": 0-10, "areas": ["trán", "mắt", ...], "description": "" },
    "oiliness": { "level": 0-10, "description": "" },
    "hydration": { "level": 0-10, "description": "" },
    "pores": { "severity": 0-10, "areas": ["mũi", "má", ...], "description": "" }
  },
  "recommendations": ["khuyến nghị 1", "khuyến nghị 2", ...],
  "treatmentPlan": "kế hoạch điều trị chi tiết"
}
Chỉ trả về JSON, không thêm text khác.`;

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      {
        role: 'user' as const,
        content: `Phân tích da từ hình ảnh tại URL: ${request.imageUrl}. ${request.notes ? `Ghi chú thêm: ${request.notes}` : ''}`,
      },
    ];

    const aiResponse = await this.aiProvider.complete({ messages, temperature: 0.3 });

    let analysisData: Record<string, unknown>;
    try {
      const jsonStr = aiResponse.content.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      analysisData = JSON.parse(jsonStr);
    } catch {
      logger.warn('Failed to parse AI skin analysis response, using defaults');
      analysisData = this.getDefaultAnalysis();
    }

    // Get recommended services and products
    const suggestedServices = await this.getSuggestedServices(tenantId, analysisData);
    const suggestedProducts = await this.getSuggestedProducts(tenantId, analysisData);

    const analysisId = uuidv4();

    // Save skin record if customerId is provided
    if (request.customerId) {
      await query(
        `INSERT INTO customer_skin_records (tenant_id, customer_id, image_url, analysis_result, notes)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, request.customerId, request.imageUrl, JSON.stringify(analysisData), request.notes],
      );
    }

    const result: SkinAnalysisResponse = {
      analysisId,
      overallScore: (analysisData as any).overallScore || 50,
      details: (analysisData as any).details || this.getDefaultAnalysis().details,
      recommendations: (analysisData as any).recommendations || [],
      suggestedServices,
      suggestedProducts,
      treatmentPlan: (analysisData as any).treatmentPlan,
    };

    logger.info('Skin analysis completed', { tenantId, analysisId });
    return result;
  }

  private async getSuggestedServices(
    tenantId: string,
    analysis: Record<string, unknown>,
  ): Promise<Array<{ id: string; name: string; reason: string }>> {
    try {
      const result = await query(
        `SELECT id, name, description FROM services
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY booking_count DESC LIMIT 5`,
        [tenantId],
      );

      return result.rows.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        reason: `Phù hợp với tình trạng da hiện tại`,
      }));
    } catch {
      return [];
    }
  }

  private async getSuggestedProducts(
    tenantId: string,
    analysis: Record<string, unknown>,
  ): Promise<Array<{ id: string; name: string; reason: string }>> {
    try {
      const result = await query(
        `SELECT id, name, description FROM products
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY name LIMIT 5`,
        [tenantId],
      );

      return result.rows.map((p) => ({
        id: String(p.id),
        name: String(p.name),
        reason: `Giúp cải thiện tình trạng da`,
      }));
    } catch {
      return [];
    }
  }

  private getDefaultAnalysis(): Record<string, unknown> {
    return {
      overallScore: 50,
      details: {
        acne: { severity: 0, areas: [], description: 'Chưa phân tích được' },
        pigmentation: { severity: 0, type: 'unknown', description: 'Chưa phân tích được' },
        wrinkles: { severity: 0, areas: [], description: 'Chưa phân tích được' },
        oiliness: { level: 5, description: 'Trung bình' },
        hydration: { level: 5, description: 'Trung bình' },
        pores: { severity: 0, areas: [], description: 'Chưa phân tích được' },
      },
      recommendations: ['Vui lòng đến Spa để được tư vấn trực tiếp'],
      treatmentPlan: 'Cần tư vấn chuyên gia trực tiếp',
    };
  }
}
