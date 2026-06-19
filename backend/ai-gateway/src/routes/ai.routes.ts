import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant } from '../../../shared/middleware/auth';
import { validate } from '../../../shared/middleware/validation';
import { AiProviderService } from '../services/ai-provider.service';
import { AiChatService } from '../services/ai-chat.service';
import { AiSkinAnalysisService } from '../services/ai-skin-analysis.service';
import { AiSalesService } from '../services/ai-sales.service';
import { AiKnowledgeService } from '../services/ai-knowledge.service';

const chatSchema = z.object({
  message: z.string().min(1).max(10000),
  conversationId: z.string().uuid().optional(),
  contextType: z.enum(['customer_chat', 'sales_consult', 'skin_analysis', 'marketing', 'closing', 'customer_success']).optional(),
  customerId: z.string().uuid().optional(),
});

const skinAnalysisSchema = z.object({
  imageUrl: z.string().url(),
  customerId: z.string().uuid().optional(),
  notes: z.string().optional(),
});

const salesConsultSchema = z.object({
  customerId: z.string().uuid(),
  context: z.string().optional(),
});

const marketingSchema = z.object({
  channel: z.enum(['facebook', 'tiktok', 'zalo', 'sms', 'email']),
  objective: z.enum(['awareness', 'engagement', 'conversion', 'retention']),
  targetSegment: z.string().optional(),
  theme: z.string().optional(),
});

const knowledgeUploadSchema = z.object({
  title: z.string().min(1).max(255),
  type: z.enum(['pdf', 'docx', 'xlsx', 'text', 'image', 'url']),
  content: z.string().min(1),
  fileUrl: z.string().url().optional(),
});

export function createAiRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);

  const aiProvider = new AiProviderService(deps.config.ai);
  const chatService = new AiChatService(aiProvider);
  const skinAnalysis = new AiSkinAnalysisService(aiProvider);
  const salesService = new AiSalesService(aiProvider);
  const knowledgeService = new AiKnowledgeService(aiProvider);

  // === AI CHAT ===

  router.post('/ai/chat', authMiddleware, requireTenant,
    validate(chatSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await chatService.chat(req.tenantId!, req.user!.userId, req.body);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/ai/conversations', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await chatService.getConversations(req.tenantId!, req.query.customerId as string);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/ai/conversations/:id', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await chatService.getConversation(req.params.id);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  // === AI SKIN ANALYSIS ===

  router.post('/ai/skin-analysis', authMiddleware, requireTenant,
    validate(skinAnalysisSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await skinAnalysis.analyzeSkin(req.tenantId!, req.body);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  // === AI SALES ===

  router.post('/ai/sales/consult', authMiddleware, requireTenant,
    validate(salesConsultSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await salesService.consultSales(req.tenantId!, req.body);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  // === AI MARKETING ===

  router.post('/ai/marketing/generate-campaign', authMiddleware, requireTenant,
    validate(marketingSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await salesService.generateMarketing(req.tenantId!, req.body);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  // === AI KNOWLEDGE ===

  router.post('/ai/knowledge/upload', authMiddleware, requireTenant,
    validate(knowledgeUploadSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await knowledgeService.uploadDocument(
          req.tenantId!, req.body.title, req.body.type, req.body.content,
          req.body.fileUrl || null, req.user!.userId,
        );
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/ai/knowledge/documents', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await knowledgeService.listDocuments(req.tenantId!);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.delete('/ai/knowledge/documents/:id', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await knowledgeService.deleteDocument(req.tenantId!, req.params.id);
        res.json({ success: true, data: { message: 'Document deleted' } });
      } catch (error) { next(error); }
    });

  router.post('/ai/knowledge/train', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { productId, serviceId } = req.body;
        if (productId) await knowledgeService.trainProductKnowledge(req.tenantId!, productId);
        if (serviceId) await knowledgeService.trainServiceKnowledge(req.tenantId!, serviceId);
        res.json({ success: true, data: { message: 'Training initiated' } });
      } catch (error) { next(error); }
    });

  return router;
}
