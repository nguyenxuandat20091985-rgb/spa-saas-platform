import { query } from '../../../shared/database/connection';
import { SkinAnalysisRequest, SkinAnalysisResponse } from '../../../shared/types/ai';
import { createServiceLogger } from '../../../shared/utils/logger';
import { AiProviderService } from './ai-provider.service';
import { v4 as uuidv4 } from 'uuid';
import { NotFoundError } from '../../../shared/utils/errors';

const logger = createServiceLogger('ai-skin-analysis');

// ==========================================
// INTERFACE
// ==========================================
interface AnalysisResult {
  overallScore: number;
  details: {
    acne: { severity: number; areas: string[]; description: string; types?: string[] };
    pigmentation: { severity: number; type: string; description: string; areas?: string[] };
    wrinkles: { severity: number; areas: string[]; description: string; type?: string };
    oiliness: { level: number; description: string; tZone: number; cheeks: number };
    hydration: { level: number; description: string; tZone: number; cheeks: number };
    pores: { severity: number; areas: string[]; description: string };
    redness?: { severity: number; description: string };
    elasticity?: { level: number; description: string };
  };
  recommendations: string[];
  treatmentPlan: string;
  skinType: string;
  concernLevel: 'mild' | 'moderate' | 'severe';
  predictedAge?: number;
}

// ==========================================
// AI SKIN ANALYSIS SERVICE
// ==========================================
export class AiSkinAnalysisService {
  constructor(private aiProvider: AiProviderService) {}

  // ==========================================
  // 1. PHÂN TÍCH DA
  // ==========================================
  async analyzeSkin(tenantId: string, request: SkinAnalysisRequest): Promise<SkinAnalysisResponse> {
    const systemPrompt = this.buildSystemPrompt();

    // Get customer history if available
    let customerHistory = '';
    if (request.customerId) {
      customerHistory = await this.getCustomerSkinHistory(tenantId, request.customerId);
    }

    // Get business context (services, products)
    const businessContext = await this.getBusinessContext(tenantId);

    const userPrompt = this.buildUserPrompt(
      request.imageUrl,
      request.notes,
      customerHistory,
      businessContext,
    );

    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: userPrompt },
    ];

    const aiResponse = await this.aiProvider.complete({
      messages,
      temperature: 0.3,
      maxTokens: 4096,
    });

    let analysisData: AnalysisResult;
    try {
      const jsonStr = aiResponse.content
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();
      analysisData = JSON.parse(jsonStr);

      // Validate structure
      if (!analysisData.overallScore || !analysisData.details) {
        throw new Error('Invalid analysis structure');
      }
    } catch (error) {
      logger.warn('Failed to parse AI skin analysis response, using defaults', { error });
      analysisData = this.getDefaultAnalysis();
    }

    // Get suggested services and products based on analysis
    const suggestedServices = await this.getSuggestedServices(tenantId, analysisData);
    const suggestedProducts = await this.getSuggestedProducts(tenantId, analysisData);

    const analysisId = uuidv4();

    // Save skin record
    if (request.customerId) {
      await query(
        `INSERT INTO customer_skin_records (
          id, tenant_id, customer_id, image_url, analysis_result,
          overall_score, skin_type, concern_level, notes, recorded_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          analysisId,
          tenantId,
          request.customerId,
          request.imageUrl,
          JSON.stringify(analysisData),
          analysisData.overallScore,
          analysisData.skinType || 'unknown',
          analysisData.concernLevel || 'moderate',
          request.notes || null,
          request.recordedBy || null,
        ],
      );

      // Update customer profile with skin info
      await this.updateCustomerProfile(tenantId, request.customerId, analysisData);
    }

    // Generate comprehensive treatment plan
    const treatmentPlan = this.buildTreatmentPlan(analysisData);

    const result: SkinAnalysisResponse = {
      analysisId,
      overallScore: analysisData.overallScore || 50,
      details: analysisData.details || this.getDefaultAnalysis().details,
      recommendations: analysisData.recommendations || [],
      suggestedServices,
      suggestedProducts,
      treatmentPlan: treatmentPlan || analysisData.treatmentPlan,
      skinType: analysisData.skinType,
      concernLevel: analysisData.concernLevel,
      predictedAge: analysisData.predictedAge,
    };

    logger.info('Skin analysis completed', {
      tenantId,
      analysisId,
      customerId: request.customerId,
      overallScore: result.overallScore,
      skinType: result.skinType,
    });

    return result;
  }

  // ==========================================
  // 2. LẤY LỊCH SỬ PHÂN TÍCH DA
  // ==========================================
  async getAnalysisHistory(
    tenantId: string,
    customerId: string,
    limit: number = 10,
  ): Promise<Array<{
    id: string;
    imageUrl: string;
    overallScore: number;
    skinType: string;
    concernLevel: string;
    createdAt: Date;
  }>> {
    const result = await query(
      `SELECT id, image_url, overall_score, skin_type, concern_level, created_at
       FROM customer_skin_records
       WHERE tenant_id = $1 AND customer_id = $2
       ORDER BY created_at DESC
       LIMIT $3`,
      [tenantId, customerId, limit],
    );

    return result.rows.map((row) => ({
      id: row.id,
      imageUrl: row.image_url,
      overallScore: row.overall_score,
      skinType: row.skin_type,
      concernLevel: row.concern_level,
      createdAt: row.created_at,
    }));
  }

  // ==========================================
  // 3. SO SÁNH KẾT QUẢ QUA CÁC LẦN
  // ==========================================
  async compareAnalyses(
    tenantId: string,
    customerId: string,
    baselineId?: string,
  ): Promise<{
    current: any;
    baseline: any | null;
    improvement: {
      score: number;
      changes: Record<string, number>;
    };
  }> {
    const records = await this.getAnalysisHistory(tenantId, customerId, 2);

    if (records.length === 0) {
      throw new NotFoundError('No analysis records for customer', customerId);
    }

    const current = records[0];
    const baseline = baselineId
      ? records.find((r) => r.id === baselineId) || records[records.length - 1]
      : records[records.length - 1];

    // Calculate improvement
    const scoreDiff = current.overallScore - (baseline?.overallScore || current.overallScore);

    return {
      current,
      baseline: baseline || null,
      improvement: {
        score: scoreDiff,
        changes: {
          score: scoreDiff,
          // More detailed comparison would require full analysis data
        },
      },
    };
  }

  // ==========================================
  // 4. PRIVATE METHODS
  // ==========================================

  private buildSystemPrompt(): string {
    return `Bạn là chuyên gia phân tích da AI cấp cao, có kiến thức sâu về da liễu và thẩm mỹ.

**PHÂN TÍCH CHI TIẾT:**
- **Mụn**: Xác định loại (trứng cá, viêm, nang, đầu đen), vị trí, mức độ (0-10)
- **Sắc tố**: Nám, tàn nhang, thâm sau mụn, mức độ (0-10)
- **Nếp nhăn**: Vị trí (trán, mắt, miệng), mức độ (0-10), loại (tĩnh, động)
- **Dầu**: Mức độ (0-10), phân bố vùng T và má
- **Độ ẩm**: Mức độ (0-10), phân bố vùng T và má
- **Lỗ chân lông**: Kích thước, vị trí, mức độ (0-10)
- **Đỏ/viêm**: Mức độ (0-10), mô tả
- **Độ đàn hồi**: Mức độ (0-10), mô tả

**ĐÁNH GIÁ TỔNG QUAN:**
- overallScore: 0-100 (100 là da hoàn hảo)
- skinType: "dry" | "oily" | "combination" | "sensitive" | "normal"
- concernLevel: "mild" | "moderate" | "severe"
- predictedAge: ước lượng tuổi da (optional)

**KHUYẾN NGHỊ:**
- Đưa ra 5-8 khuyến nghị cụ thể, ưu tiên điều trị
- Phân theo mức độ ưu tiên: "khẩn cấp", "quan trọng", "bổ sung"

**KẾ HOẠCH ĐIỀU TRỊ:**
- Kế hoạch 4 tuần chi tiết
- Sản phẩm đề xuất từng tuần
- Lịch tái khám đề xuất

Trả về JSON duy nhất, không thêm text khác.

Ví dụ JSON hợp lệ:
{
  "overallScore": 75,
  "skinType": "combination",
  "concernLevel": "moderate",
  "predictedAge": 28,
  "details": {
    "acne": { "severity": 6, "areas": ["trán", "cằm"], "types": ["viêm"], "description": "Mụn viêm vùng T" },
    "pigmentation": { "severity": 4, "type": "thâm sau mụn", "areas": ["má"], "description": "Thâm nhẹ sau mụn" },
    "wrinkles": { "severity": 2, "areas": ["mắt"], "type": "động", "description": "Nếp nhăn vùng mắt khi cười" },
    "oiliness": { "level": 7, "description": "Dầu nhiều vùng T", "tZone": 8, "cheeks": 5 },
    "hydration": { "level": 5, "description": "Độ ẩm trung bình", "tZone": 4, "cheeks": 6 },
    "pores": { "severity": 6, "areas": ["mũi", "má"], "description": "Lỗ chân lông to vùng mũi" },
    "redness": { "severity": 3, "description": "Đỏ nhẹ vùng mụn" },
    "elasticity": { "level": 6, "description": "Độ đàn hồi tốt" }
  },
  "recommendations": [
    {"priority": "urgent", "text": "Điều trị mụn viêm với sản phẩm chứa Benzoyl Peroxide"},
    {"priority": "important", "text": "Bổ sung retinoid để cải thiện thâm và lỗ chân lông"},
    {"priority": "important", "text": "Tăng cường dưỡng ẩm cho vùng má"},
    {"priority": "supplementary", "text": "Sử dụng kem chống nắng SPF 50 hàng ngày"},
    {"priority": "supplementary", "text": "Bổ sung collagen từ thực phẩm hoặc uống"}
  ],
  "treatmentPlan": "Kế hoạch 4 tuần: Tuần 1-2: Điều trị mụn... Tuần 3-4: Phục hồi da..."
}`;
  }

  private buildUserPrompt(
    imageUrl: string,
    notes?: string,
    customerHistory?: string,
    businessContext?: string,
  ): string {
    let prompt = `PHÂN TÍCH DA\n\n`;

    if (imageUrl) {
      prompt += `🔍 Hình ảnh da: ${imageUrl}\n\n`;
    }

    if (notes) {
      prompt += `📝 Ghi chú từ khách hàng: ${notes}\n\n`;
    }

    if (customerHistory) {
      prompt += `📋 Lịch sử phân tích trước đó:\n${customerHistory}\n\n`;
    }

    if (businessContext) {
      prompt += `🏢 Dịch vụ/Sản phẩm có sẵn:\n${businessContext}\n\n`;
    }

    prompt += `⚠️ Yêu cầu: Phân tích chi tiết và đưa ra khuyến nghị phù hợp với tình trạng da.`;

    return prompt;
  }

  private async getCustomerSkinHistory(tenantId: string, customerId: string): Promise<string> {
    try {
      const result = await query(
        `SELECT overall_score, skin_type, concern_level, analysis_result, created_at
         FROM customer_skin_records
         WHERE tenant_id = $1 AND customer_id = $2
         ORDER BY created_at DESC
         LIMIT 3`,
        [tenantId, customerId],
      );

      if (result.rows.length === 0) return '';

      let history = '';
      for (const row of result.rows) {
        const date = new Date(row.created_at).toLocaleDateString('vi-VN');
        history += `- Ngày ${date}: `;
        if (row.skin_type) history += `Loại da ${row.skin_type}, `;
        history += `Điểm ${row.overall_score}/100, Mức độ ${row.concern_level}\n`;
      }

      return history;
    } catch {
      return '';
    }
  }

  private async getBusinessContext(tenantId: string): Promise<string> {
    try {
      const services = await query(
        `SELECT name, price, duration_minutes
         FROM services
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY booking_count DESC
         LIMIT 10`,
        [tenantId],
      );

      const products = await query(
        `SELECT name, price, brand
         FROM products
         WHERE tenant_id = $1 AND is_active = true
         ORDER BY name
         LIMIT 10`,
        [tenantId],
      );

      let context = '';
      if (services.rows.length > 0) {
        context += 'Dịch vụ:\n';
        for (const s of services.rows) {
          context += `- ${s.name}: ${s.price.toLocaleString('vi-VN')} VND (${s.duration_minutes} phút)\n`;
        }
      }

      if (products.rows.length > 0) {
        context += '\nSản phẩm:\n';
        for (const p of products.rows) {
          context += `- ${p.name}${p.brand ? ` (${p.brand})` : ''}: ${p.price.toLocaleString('vi-VN')} VND\n`;
        }
      }

      return context;
    } catch {
      return '';
    }
  }

  private async getSuggestedServices(
    tenantId: string,
    analysis: AnalysisResult,
  ): Promise<Array<{ id: string; name: string; reason: string; duration: number; price: number }>> {
    try {
      const concerns = this.extractConcerns(analysis);

      let queryText = `
        SELECT id, name, description, duration_minutes, price
        FROM services
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY
          CASE
      `;

      const values: any[] = [tenantId];
      let paramIndex = 2;

      // Prioritize services that match concerns
      const concernConditions: string[] = [];
      for (const concern of concerns) {
        concernConditions.push(`name ILIKE $${paramIndex++}`);
        values.push(`%${concern}%`);
      }

      if (concernConditions.length > 0) {
        queryText += concernConditions.map((_, i) =>
          `WHEN ${concernConditions[i]} THEN 1`
        ).join(' ');
        queryText += ' ELSE 2 END, booking_count DESC LIMIT 5';
      } else {
        queryText += 'booking_count DESC LIMIT 5';
      }

      const result = await query(queryText, values);

      return result.rows.map((s) => ({
        id: String(s.id),
        name: String(s.name),
        reason: this.getServiceReason(s.name, analysis),
        duration: s.duration_minutes || 60,
        price: s.price || 0,
      }));
    } catch {
      return [];
    }
  }

  private async getSuggestedProducts(
    tenantId: string,
    analysis: AnalysisResult,
  ): Promise<Array<{ id: string; name: string; reason: string; price: number }>> {
    try {
      const concerns = this.extractConcerns(analysis);

      let queryText = `
        SELECT id, name, description, price, brand
        FROM products
        WHERE tenant_id = $1 AND is_active = true
        ORDER BY
          CASE
      `;

      const values: any[] = [tenantId];
      let paramIndex = 2;

      const concernConditions: string[] = [];
      for (const concern of concerns) {
        concernConditions.push(`name ILIKE $${paramIndex++}`);
        values.push(`%${concern}%`);
      }

      if (concernConditions.length > 0) {
        queryText += concernConditions.map((_, i) =>
          `WHEN ${concernConditions[i]} THEN 1`
        ).join(' ');
        queryText += ' ELSE 2 END, name LIMIT 5';
      } else {
        queryText += 'name LIMIT 5';
      }

      const result = await query(queryText, values);

      return result.rows.map((p) => ({
        id: String(p.id),
        name: String(p.name),
        reason: this.getProductReason(p.name, analysis),
        price: p.price || 0,
      }));
    } catch {
      return [];
    }
  }

  private extractConcerns(analysis: AnalysisResult): string[] {
    const concerns: string[] = [];

    if (analysis.details.acne.severity > 5) {
      concerns.push('mụn', 'trứng cá', 'mụn viêm');
    }
    if (analysis.details.pigmentation.severity > 5) {
      concerns.push('nám', 'thâm', 'tàn nhang');
    }
    if (analysis.details.wrinkles.severity > 5) {
      concerns.push('nếp nhăn', 'lão hóa');
    }
    if (analysis.details.oiliness.level > 7) {
      concerns.push('dầu', 'nhờn', 'lỗ chân lông to');
    }
    if (analysis.details.hydration.level < 4) {
      concerns.push('khô da', 'mất nước');
    }
    if (analysis.details.pores.severity > 6) {
      concerns.push('lỗ chân lông', 'tổ ong');
    }

    return concerns;
  }

  private getServiceReason(serviceName: string, analysis: AnalysisResult): string {
    const name = serviceName.toLowerCase();
    const reasons: string[] = [];

    if (name.includes('mụn') || name.includes('acne')) {
      reasons.push('Điều trị mụn hiệu quả');
    }
    if (name.includes('nám') || name.includes('thâm') || name.includes('pigment')) {
      reasons.push('Cải thiện sắc tố da');
    }
    if (name.includes('lão') || name.includes('aging') || name.includes('wrinkle')) {
      reasons.push('Chống lão hóa');
    }
    if (name.includes('dưỡng ẩm') || name.includes('hydrate')) {
      reasons.push('Cấp ẩm sâu');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Phù hợp với tình trạng da';
  }

  private getProductReason(productName: string, analysis: AnalysisResult): string {
    const name = productName.toLowerCase();
    const reasons: string[] = [];

    if (name.includes('retinol') || name.includes('vitamin a')) {
      reasons.push('Tăng sinh tế bào, cải thiện lão hóa');
    }
    if (name.includes('vitamin c') || name.includes('ascorbic')) {
      reasons.push('Chống oxy hóa, làm sáng da');
    }
    if (name.includes('hyaluronic') || name.includes('ha')) {
      reasons.push('Cấp ẩm mạnh mẽ');
    }
    if (name.includes('niacinamide')) {
      reasons.push('Giảm viêm, cải thiện lỗ chân lông');
    }
    if (name.includes('salicylic') || name.includes('aha') || name.includes('bha')) {
      reasons.push('Tẩy tế bào chết, thông thoáng lỗ chân lông');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Hỗ trợ cải thiện da';
  }

  private buildTreatmentPlan(analysis: AnalysisResult): string {
    const plan = `🔬 KẾ HOẠCH ĐIỀU TRỊ DA (4 TUẦN)

**Tuần 1-2: Điều trị chuyên sâu**
- ${this.getUrgentRecommendations(analysis)}
- Sử dụng sản phẩm kiểm soát dầu, kháng viêm
- Tránh tiếp xúc trực tiếp với ánh nắng

**Tuần 2-3: Phục hồi và tái tạo**
- ${this.getMaintenanceRecommendations(analysis)}
- Bổ sung dưỡng ẩm, phục hồi hàng rào da
- Bắt đầu sử dụng sản phẩm tái tạo

**Tuần 3-4: Duy trì và bảo vệ**
- ${this.getPreventiveRecommendations(analysis)}
- Duy trì quy trình chăm sóc hàng ngày
- Tái khám để đánh giá kết quả

**📋 Lịch tái khám đề xuất**
- Sau 2 tuần: Đánh giá tiến triển
- Sau 4 tuần: Đánh giá toàn diện
- Sau 8 tuần: Đánh giá kết quả cuối cùng`;

    return plan;
  }

  private getUrgentRecommendations(analysis: AnalysisResult): string {
    const recs: string[] = [];
    if (analysis.details.acne.severity > 5) {
      recs.push('Điều trị mụn viêm với sản phẩm đặc trị');
    }
    if (analysis.details.pigmentation.severity > 5) {
      recs.push('Sử dụng serum ức chế sắc tố');
    }
    if (analysis.details.oiliness.level > 7) {
      recs.push('Kiểm soát bã nhờn với sản phẩm chứa salicylic acid');
    }
    if (analysis.details.hydration.level < 4) {
      recs.push('Cấp ẩm sâu bằng hyaluronic acid');
    }
    return recs.join('\n- ') || 'Điều trị phục hồi da cơ bản';
  }

  private getMaintenanceRecommendations(analysis: AnalysisResult): string {
    return 'Sử dụng sản phẩm phục hồi hàng rào da, bổ sung ceramide, dưỡng ẩm chuyên sâu';
  }

  private getPreventiveRecommendations(analysis: AnalysisResult): string {
    return 'Duy trì kem chống nắng hàng ngày, sử dụng sản phẩm chống oxy hóa, tái khám định kỳ';
  }

  private async updateCustomerProfile(
    tenantId: string,
    customerId: string,
    analysis: AnalysisResult,
  ): Promise<void> {
    try {
      // Update skin type and concerns
      const skinType = analysis.skinType || 'unknown';
      const concerns = this.extractConcerns(analysis);

      await query(
        `UPDATE customers
         SET skin_type = $1,
             skin_concerns = $2,
             ai_profile = ai_profile || $3,
             updated_at = NOW()
         WHERE id = $4 AND tenant_id = $5`,
        [
          skinType,
          concerns,
          JSON.stringify({
            lastAnalysis: {
              date: new Date().toISOString(),
              score: analysis.overallScore,
              type: skinType,
              concerns: concerns,
            },
          }),
          customerId,
          tenantId,
        ],
      );
    } catch (error) {
      logger.warn('Failed to update customer profile', { error });
    }
  }

  private getDefaultAnalysis(): AnalysisResult {
    return {
      overallScore: 50,
      skinType: 'combination',
      concernLevel: 'moderate',
      details: {
        acne: { severity: 0, areas: [], description: 'Chưa phân tích được' },
        pigmentation: { severity: 0, type: 'unknown', description: 'Chưa phân tích được' },
        wrinkles: { severity: 0, areas: [], description: 'Chưa phân tích được' },
        oiliness: { level: 5, description: 'Trung bình', tZone: 5, cheeks: 5 },
        hydration: { level: 5, description: 'Trung bình', tZone: 5, cheeks: 5 },
        pores: { severity: 0, areas: [], description: 'Chưa phân tích được' },
      },
      recommendations: ['Vui lòng đến Spa để được tư vấn trực tiếp'],
      treatmentPlan: 'Cần tư vấn chuyên gia trực tiếp',
    };
  }
}