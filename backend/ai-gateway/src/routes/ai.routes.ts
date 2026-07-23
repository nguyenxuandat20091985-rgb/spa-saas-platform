import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant } from '../../../shared/middleware/auth';
import { validate, validateBody, validateQuery } from '../../../shared/middleware/validation';
import { rateLimiter } from '../../../shared/middleware/rate-limiter';
import { AiProviderService } from '../services/ai-provider.service';
import { AiChatService } from '../services/ai-chat.service';
import { AiSkinAnalysisService } from '../services/ai-skin-analysis.service';
import { AiSalesService } from '../services/ai-sales.service';
import { AiKnowledgeService } from '../services/ai-knowledge.service';
import { logger } from '../../../shared/utils/logger';

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const chatSchema = z.object({
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
  conversationId: z.string().uuid('Invalid conversation ID').optional(),
  contextType: z.enum([
    'customer_chat',
    'sales_consult',
    'skin_analysis',
    'marketing',
    'closing',
    'customer_success',
    'general',
  ]).default('general'),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  staffId: z.string().uuid('Invalid staff ID').optional(),
  branchId: z.string().uuid('Invalid branch ID').optional(),
  metadata: z.record(z.any()).optional(),
});

const chatStreamSchema = chatSchema.extend({
  stream: z.boolean().default(true),
});

const skinAnalysisSchema = z.object({
  imageUrl: z.string().url('Invalid image URL'),
  customerId: z.string().uuid('Invalid customer ID').optional(),
  notes: z.string().max(500, 'Notes too long').optional(),
  imageType: z.enum(['face_front', 'face_left', 'face_right', 'close_up']).default('face_front'),
  temperature: z.number().min(-20).max(50).optional(),
  humidity: z.number().min(0).max(100).optional(),
});

const salesConsultSchema = z.object({
  customerId: z.string().uuid('Invalid customer ID'),
  context: z.string().max(2000, 'Context too long').optional(),
  serviceIds: z.array(z.string().uuid('Invalid service ID')).optional(),
  budgetRange: z.object({
    min: z.number().min(0).optional(),
    max: z.number().min(0).optional(),
  }).optional(),
  preferredStaff: z.string().uuid('Invalid staff ID').optional(),
});

const marketingSchema = z.object({
  channel: z.enum(['facebook', 'tiktok', 'zalo', 'sms', 'email', 'website']),
  objective: z.enum(['awareness', 'engagement', 'conversion', 'retention', 'recovery']),
  targetSegment: z.string().optional(),
  theme: z.string().optional(),
  tone: z.enum(['professional', 'friendly', 'luxury', 'youthful', 'warm']).default('professional'),
  maxLength: z.number().min(50).max(5000).default(500),
  includeCta: z.boolean().default(true),
});

const knowledgeUploadSchema = z.object({
  title: z.string().min(1, 'Title is required').max(255, 'Title too long'),
  type: z.enum(['pdf', 'docx', 'xlsx', 'text', 'image', 'url', 'faq']),
  content: z.string().min(1, 'Content is required'),
  fileUrl: z.string().url('Invalid URL').optional(),
  tags: z.array(z.string()).optional(),
  category: z.string().optional(),
});

const knowledgeQuerySchema = z.object({
  query: z.string().min(1, 'Query is required').max(1000, 'Query too long'),
  documentIds: z.array(z.string().uuid('Invalid document ID')).optional(),
  limit: z.coerce.number().int().min(1).max(20).default(5),
});

const conversationQuerySchema = z.object({
  customerId: z.string().uuid('Invalid customer ID').optional(),
  contextType: z.enum([
    'customer_chat',
    'sales_consult',
    'skin_analysis',
    'marketing',
    'closing',
    'customer_success',
    'general',
  ]).optional(),
  startDate: z.string().date('Invalid date format').optional(),
  endDate: z.string().date('Invalid date format').optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(50).default(20),
});

// ==========================================
// ROUTES
// ==========================================

export function createAiRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);

  const aiProvider = new AiProviderService(deps.config.ai);
  const chatService = new AiChatService(aiProvider);
  const skinAnalysis = new AiSkinAnalysisService(aiProvider);
  const salesService = new AiSalesService(aiProvider);
  const knowledgeService = new AiKnowledgeService(aiProvider);

  // ==========================================
  // LOGGING MIDDLEWARE
  // ==========================================
  router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('AI route accessed', {
      path: req.path,
      method: req.method,
      tenantId: (req as any).tenantId,
    });
    next();
  });

  // ==========================================
  // AI CHAT
  // ==========================================

  // 1. Chat (có stream)
  router.post(
    '/ai/chat',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 30), // 30 requests/minute
    validateBody(chatStreamSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { stream, ...chatData } = req.body;

        if (stream) {
          // Streaming response
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');

          const stream = await chatService.chatStream(
            req.tenantId!,
            req.user!.userId,
            chatData,
          );

          for await (const chunk of stream) {
            res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          }
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          const result = await chatService.chat(
            req.tenantId!,
            req.user!.userId,
            chatData,
          );
          logger.info('AI chat completed', {
            tenantId: req.tenantId,
            userId: req.user!.userId,
            contextType: chatData.contextType,
          });
          res.json({ success: true, data: result });
        }
      } catch (error) {
        next(error);
      }
    }
  );

  // 2. Danh sách conversation
  router.get(
    '/ai/conversations',
    authMiddleware,
    requireTenant,
    validateQuery(conversationQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await chatService.getConversations(
          req.tenantId!,
          req.query as any,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 3. Chi tiết conversation
  router.get(
    '/ai/conversations/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid conversation ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await chatService.getConversation(
          req.tenantId!,
          req.params.id,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 4. Xóa conversation
  router.delete(
    '/ai/conversations/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid conversation ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await chatService.deleteConversation(req.tenantId!, req.params.id);
        logger.info('Conversation deleted', {
          tenantId: req.tenantId,
          conversationId: req.params.id,
        });
        res.json({ success: true, data: { message: 'Conversation deleted' } });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // AI SKIN ANALYSIS
  // ==========================================

  // 5. Phân tích da
  router.post(
    '/ai/skin-analysis',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 10), // 10 requests/minute
    validateBody(skinAnalysisSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await skinAnalysis.analyzeSkin(
          req.tenantId!,
          req.body,
        );
        logger.info('Skin analysis completed', {
          tenantId: req.tenantId,
          customerId: req.body.customerId,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 6. Lấy lịch sử phân tích da
  router.get(
    '/ai/skin-analysis/history',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { customerId, limit = 10 } = req.query;
        const result = await skinAnalysis.getAnalysisHistory(
          req.tenantId!,
          customerId as string,
          Number(limit),
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // AI SALES
  // ==========================================

  // 7. Tư vấn bán hàng
  router.post(
    '/ai/sales/consult',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 15),
    validateBody(salesConsultSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await salesService.consultSales(
          req.tenantId!,
          req.body,
        );
        logger.info('Sales consultation completed', {
          tenantId: req.tenantId,
          customerId: req.body.customerId,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 8. Tư vấn closing (chốt sale)
  router.post(
    '/ai/sales/closing',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 10),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await salesService.closingConsult(
          req.tenantId!,
          req.body.customerId,
          req.body.context,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // AI MARKETING
  // ==========================================

  // 9. Tạo chiến dịch marketing
  router.post(
    '/ai/marketing/generate-campaign',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 5),
    validateBody(marketingSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await salesService.generateMarketing(
          req.tenantId!,
          req.body,
        );
        logger.info('Marketing campaign generated', {
          tenantId: req.tenantId,
          channel: req.body.channel,
          objective: req.body.objective,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 10. Đề xuất nội dung cho từng khách hàng (personalization)
  router.post(
    '/ai/marketing/personalize',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { customerId, type, context } = req.body;
        const result = await salesService.personalizeContent(
          req.tenantId!,
          customerId,
          type,
          context,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // AI KNOWLEDGE (RAG)
  // ==========================================

  // 11. Upload document
  router.post(
    '/ai/knowledge/upload',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 10),
    validateBody(knowledgeUploadSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await knowledgeService.uploadDocument(
          req.tenantId!,
          req.body.title,
          req.body.type,
          req.body.content,
          req.body.fileUrl || null,
          req.user!.userId,
          req.body.tags || [],
          req.body.category || null,
        );
        logger.info('Document uploaded', {
          tenantId: req.tenantId,
          documentId: result.id,
          title: req.body.title,
        });
        res.status(201).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 12. Danh sách documents
  router.get(
    '/ai/knowledge/documents',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { category, search } = req.query;
        const result = await knowledgeService.listDocuments(
          req.tenantId!,
          category as string,
          search as string,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 13. Xóa document
  router.delete(
    '/ai/knowledge/documents/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid document ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await knowledgeService.deleteDocument(req.tenantId!, req.params.id);
        logger.info('Document deleted', {
          tenantId: req.tenantId,
          documentId: req.params.id,
        });
        res.json({ success: true, data: { message: 'Document deleted' } });
      } catch (error) {
        next(error);
      }
    }
  );

  // 14. Query knowledge (RAG)
  router.post(
    '/ai/knowledge/query',
    authMiddleware,
    requireTenant,
    validateBody(knowledgeQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await knowledgeService.queryKnowledge(
          req.tenantId!,
          req.body.query,
          req.body.documentIds,
          req.body.limit,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 15. Train knowledge
  router.post(
    '/ai/knowledge/train',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 3),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { productId, serviceId, documentIds } = req.body;
        const results: string[] = [];

        if (productId) {
          await knowledgeService.trainProductKnowledge(req.tenantId!, productId);
          results.push(`Product ${productId} trained`);
        }
        if (serviceId) {
          await knowledgeService.trainServiceKnowledge(req.tenantId!, serviceId);
          results.push(`Service ${serviceId} trained`);
        }
        if (documentIds && documentIds.length > 0) {
          await knowledgeService.trainDocuments(req.tenantId!, documentIds);
          results.push(`${documentIds.length} documents trained`);
        }

        logger.info('Knowledge training completed', {
          tenantId: req.tenantId,
          results,
        });

        res.json({
          success: true,
          data: {
            message: 'Training initiated',
            results,
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // AI USAGE STATS
  // ==========================================

  // 16. Usage statistics
  router.get(
    '/ai/usage',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { startDate, endDate } = req.query;
        const result = await aiProvider.getUsageStats(
          req.tenantId!,
          startDate as string,
          endDate as string,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // AI PROVIDER SWITCH
  // ==========================================

  // 17. Switch AI provider (admin)
  router.post(
    '/ai/provider/switch',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { provider, apiKey } = req.body;
        await aiProvider.switchProvider(provider, apiKey);
        logger.info('AI provider switched', {
          tenantId: req.tenantId,
          provider,
        });
        res.json({
          success: true,
          data: { message: `Switched to ${provider}` },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createAiRouter;