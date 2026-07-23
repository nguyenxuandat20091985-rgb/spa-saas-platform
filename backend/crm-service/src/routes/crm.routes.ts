import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant, authorize } from '../../../shared/middleware/auth';
import { validate, validateBody, validateQuery } from '../../../shared/middleware/validation';
import { rateLimiter } from '../../../shared/middleware/rate-limiter';
import { CustomerService } from '../services/customer.service';
import { logger } from '../../../shared/utils/logger';

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const createCustomerSchema = z.object({
  fullName: z.string().min(2, 'Name must be at least 2 characters').max(255, 'Name too long'),
  phone: z.string().min(10, 'Phone must be at least 10 characters').max(15, 'Phone too long'),
  email: z.string().email('Invalid email format').optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.string().date('Invalid date format').optional(),
  skinType: z.enum(['oily', 'dry', 'combination', 'sensitive', 'normal']).optional(),
  skinConcerns: z.array(z.string()).optional(),
  allergyNotes: z.string().max(500, 'Allergy notes too long').optional(),
  acquisitionSource: z.enum(['walk_in', 'referral', 'social_media', 'website', 'advertising', 'other']).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  address: z.string().max(255).optional(),
  city: z.string().max(100).optional(),
  district: z.string().max(100).optional(),
  preferredStaffId: z.string().uuid('Invalid staff ID').optional(),
  preferredTimeSlot: z.string().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

const interactionSchema = z.object({
  type: z.enum(['call', 'chat', 'email', 'visit', 'consultation', 'feedback', 'complaint', 'reminder']),
  channel: z.enum(['phone', 'facebook', 'zalo', 'email', 'whatsapp', 'sms', 'in_person']),
  content: z.string().min(1, 'Content is required').max(2000, 'Content too long'),
  tags: z.array(z.string()).optional(),
  rating: z.number().min(1).max(5).optional(),
});

const skinRecordSchema = z.object({
  imageUrl: z.string().url('Invalid image URL').optional(),
  analysisResult: z.object({
    skinType: z.enum(['oily', 'dry', 'combination', 'sensitive', 'normal']).optional(),
    concerns: z.array(z.string()).optional(),
    recommendations: z.array(z.string()).optional(),
    score: z.number().min(0).max(100).optional(),
  }).optional(),
  notes: z.string().max(1000, 'Notes too long').optional(),
  temperature: z.number().optional(),
  humidity: z.number().optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().max(100).optional(),
  membershipTier: z.enum(['silver', 'gold', 'platinum', 'diamond']).optional(),
  status: z.enum(['active', 'inactive', 'blocked']).optional(),
  skinType: z.enum(['oily', 'dry', 'combination', 'sensitive', 'normal']).optional(),
  acquisitionSource: z.enum(['walk_in', 'referral', 'social_media', 'website', 'advertising', 'other']).optional(),
  hasMembership: z.enum(['true', 'false']).optional(),
  minSpent: z.coerce.number().min(0).optional(),
  maxSpent: z.coerce.number().min(0).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  sortBy: z.enum(['createdAt', 'fullName', 'totalSpent', 'visitCount', 'lastVisitAt']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const bulkActionSchema = z.object({
  action: z.enum(['assign_tag', 'remove_tag', 'block', 'unblock', 'send_notification']),
  customerIds: z.array(z.string().uuid('Invalid customer ID')).min(1, 'At least one customer required'),
  data: z.record(z.any()).optional(),
});

const noteSchema = z.object({
  content: z.string().min(1, 'Note content is required').max(2000, 'Note too long'),
  type: z.enum(['general', 'important', 'task', 'follow_up']).default('general'),
});

// ==========================================
// ROUTES
// ==========================================

export function createCrmRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const customerService = new CustomerService(deps.eventBus);

  // ==========================================
  // LOGGING MIDDLEWARE
  // ==========================================
  router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('CRM route accessed', {
      path: req.path,
      method: req.method,
      tenantId: (req as any).tenantId,
    });
    next();
  });

  // ==========================================
  // CUSTOMER ENDPOINTS
  // ==========================================

  // 1. Danh sách khách hàng (có phân trang và lọc)
  router.get(
    '/customers',
    authMiddleware,
    requireTenant,
    validateQuery(listQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await customerService.list(req.tenantId!, req.query as any);
        logger.info('Customers listed', {
          tenantId: req.tenantId,
          count: result.data?.length || 0,
          page: req.query.page,
        });
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 2. Phân khúc khách hàng
  router.get(
    '/customers/segments',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const segments = await customerService.getSegments(req.tenantId!);
        res.json({ success: true, data: segments });
      } catch (error) {
        next(error);
      }
    }
  );

  // 3. Thống kê nhanh
  router.get(
    '/customers/stats',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const stats = await customerService.getStats(req.tenantId!);
        res.json({ success: true, data: stats });
      } catch (error) {
        next(error);
      }
    }
  );

  // 4. Chi tiết khách hàng
  router.get(
    '/customers/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customer = await customerService.getById(req.tenantId!, req.params.id);
        res.json({ success: true, data: customer });
      } catch (error) {
        next(error);
      }
    }
  );

  // 5. Lịch sử khách hàng (đặt lịch + mua hàng + tương tác)
  router.get(
    '/customers/:id/history',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const history = await customerService.getHistory(req.tenantId!, req.params.id);
        res.json({ success: true, data: history });
      } catch (error) {
        next(error);
      }
    }
  );

  // 6. Tạo khách hàng mới
  router.post(
    '/customers',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 20),
    validateBody(createCustomerSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customer = await customerService.create(
          req.tenantId!,
          req.body,
          req.user?.userId,
        );
        logger.info('Customer created', {
          tenantId: req.tenantId,
          customerId: customer.id,
          fullName: req.body.fullName,
          email: req.body.email,
        });
        res.status(201).json({ success: true, data: customer });
      } catch (error) {
        next(error);
      }
    }
  );

  // 7. Cập nhật khách hàng
  router.put(
    '/customers/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    validateBody(updateCustomerSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customer = await customerService.update(
          req.tenantId!,
          req.params.id,
          req.body,
        );
        logger.info('Customer updated', {
          tenantId: req.tenantId,
          customerId: req.params.id,
          fields: Object.keys(req.body),
        });
        res.json({ success: true, data: customer });
      } catch (error) {
        next(error);
      }
    }
  );

  // 8. Xóa (vô hiệu hóa) khách hàng
  router.delete(
    '/customers/:id',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await customerService.delete(req.tenantId!, req.params.id);
        logger.info('Customer deleted', {
          tenantId: req.tenantId,
          customerId: req.params.id,
        });
        res.json({ success: true, data: { message: 'Customer deleted successfully' } });
      } catch (error) {
        next(error);
      }
    }
  );

  // 9. Ghi nhận tương tác
  router.post(
    '/customers/:id/interactions',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    validateBody(interactionSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const interaction = await customerService.addInteraction(
          req.tenantId!,
          req.params.id,
          req.body.type,
          req.body.channel,
          req.body.content,
          req.user?.userId,
          req.body.tags,
          req.body.rating,
        );
        logger.info('Interaction recorded', {
          tenantId: req.tenantId,
          customerId: req.params.id,
          type: req.body.type,
          channel: req.body.channel,
        });
        res.status(201).json({ success: true, data: interaction });
      } catch (error) {
        next(error);
      }
    }
  );

  // 10. Lấy danh sách tương tác của khách hàng
  router.get(
    '/customers/:id/interactions',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const interactions = await customerService.getInteractions(req.tenantId!, req.params.id);
        res.json({ success: true, data: interactions });
      } catch (error) {
        next(error);
      }
    }
  );

  // 11. Ghi nhận hồ sơ da
  router.post(
    '/customers/:id/skin-records',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    validateBody(skinRecordSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const record = await customerService.addSkinRecord(
          req.tenantId!,
          req.params.id,
          req.body.imageUrl,
          req.body.analysisResult,
          req.body.notes,
          req.user?.userId || null,
          req.body.temperature,
          req.body.humidity,
        );
        logger.info('Skin record added', {
          tenantId: req.tenantId,
          customerId: req.params.id,
          hasImage: !!req.body.imageUrl,
        });
        res.status(201).json({ success: true, data: record });
      } catch (error) {
        next(error);
      }
    }
  );

  // 12. Lấy lịch sử hồ sơ da
  router.get(
    '/customers/:id/skin-records',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const records = await customerService.getSkinRecords(req.tenantId!, req.params.id);
        res.json({ success: true, data: records });
      } catch (error) {
        next(error);
      }
    }
  );

  // 13. Thêm ghi chú cho khách hàng
  router.post(
    '/customers/:id/notes',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    validateBody(noteSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const note = await customerService.addNote(
          req.tenantId!,
          req.params.id,
          req.body.content,
          req.body.type,
          req.user?.userId,
        );
        logger.info('Note added', {
          tenantId: req.tenantId,
          customerId: req.params.id,
          noteType: req.body.type,
        });
        res.status(201).json({ success: true, data: note });
      } catch (error) {
        next(error);
      }
    }
  );

  // 14. Lấy danh sách ghi chú
  router.get(
    '/customers/:id/notes',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const notes = await customerService.getNotes(req.tenantId!, req.params.id);
        res.json({ success: true, data: notes });
      } catch (error) {
        next(error);
      }
    }
  );

  // 15. Hành động hàng loạt
  router.post(
    '/customers/bulk',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    validateBody(bulkActionSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await customerService.bulkAction(
          req.tenantId!,
          req.body.action,
          req.body.customerIds,
          req.body.data,
        );
        logger.info('Bulk action executed', {
          tenantId: req.tenantId,
          action: req.body.action,
          count: req.body.customerIds.length,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // CUSTOMER SELF-SERVICE (ME)
  // ==========================================

  // 16. Lấy profile của chính mình (cho customer)
  router.get(
    '/me',
    authMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customer = await customerService.getByUserId(req.tenantId!, req.user!.userId);
        if (!customer) {
          res.status(404).json({
            success: false,
            error: { code: 'NOT_FOUND', message: 'Customer profile not found' },
          });
          return;
        }
        res.json({ success: true, data: customer });
      } catch (error) {
        next(error);
      }
    }
  );

  // 17. Cập nhật profile của chính mình
  router.put(
    '/me',
    authMiddleware,
    validateBody(updateCustomerSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customer = await customerService.updateByUserId(
          req.tenantId!,
          req.user!.userId,
          req.body,
        );
        logger.info('Self profile updated', {
          userId: req.user!.userId,
          fields: Object.keys(req.body),
        });
        res.json({ success: true, data: customer });
      } catch (error) {
        next(error);
      }
    }
  );

  // 18. Lấy lịch sử đặt lịch của chính mình
  router.get(
    '/me/appointments',
    authMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const appointments = await customerService.getSelfAppointments(
          req.tenantId!,
          req.user!.userId,
        );
        res.json({ success: true, data: appointments });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // LOYALTY & MEMBERSHIP
  // ==========================================

  // 19. Lấy thông tin thành viên
  router.get(
    '/customers/:id/membership',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const membership = await customerService.getMembership(req.tenantId!, req.params.id);
        res.json({ success: true, data: membership });
      } catch (error) {
        next(error);
      }
    }
  );

  // 20. Cập nhật hạng thành viên (manual)
  router.patch(
    '/customers/:id/membership',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    validate(z.object({ id: z.string().uuid('Invalid customer ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await customerService.updateMembership(
          req.tenantId!,
          req.params.id,
          req.body.tier,
          req.body.reason,
        );
        logger.info('Membership updated manually', {
          tenantId: req.tenantId,
          customerId: req.params.id,
          tier: req.body.tier,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createCrmRouter;