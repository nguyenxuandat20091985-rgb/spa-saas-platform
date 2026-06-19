import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, authorize, requireTenant } from '../../../shared/middleware/auth';
import { validate } from '../../../shared/middleware/validation';
import { CustomerService } from '../services/customer.service';

const createCustomerSchema = z.object({
  fullName: z.string().min(2).max(255),
  phone: z.string().min(10).max(15),
  email: z.string().email().optional(),
  gender: z.enum(['male', 'female', 'other']).optional(),
  dateOfBirth: z.string().optional(),
  skinType: z.enum(['oily', 'dry', 'combination', 'sensitive', 'normal']).optional(),
  skinConcerns: z.array(z.string()).optional(),
  allergyNotes: z.string().optional(),
  acquisitionSource: z.enum(['walk_in', 'referral', 'social_media', 'website', 'advertising', 'other']).optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

const updateCustomerSchema = createCustomerSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  membershipTier: z.string().optional(),
  status: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export function createCrmRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const customerService = new CustomerService(deps.eventBus);

  // === CUSTOMER ENDPOINTS ===

  // GET /api/v1/customers
  router.get(
    '/customers',
    authMiddleware,
    requireTenant,
    validate(listQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await customerService.list(req.tenantId!, req.query as any);
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/v1/customers/segments
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
    },
  );

  // GET /api/v1/customers/:id
  router.get(
    '/customers/:id',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customer = await customerService.getById(req.tenantId!, req.params.id);
        res.json({ success: true, data: customer });
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/v1/customers/:id/history
  router.get(
    '/customers/:id/history',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const history = await customerService.getHistory(req.tenantId!, req.params.id);
        res.json({ success: true, data: history });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/v1/customers
  router.post(
    '/customers',
    authMiddleware,
    requireTenant,
    validate(createCustomerSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customer = await customerService.create(req.tenantId!, req.body, req.user?.userId);
        res.status(201).json({ success: true, data: customer });
      } catch (error) {
        next(error);
      }
    },
  );

  // PUT /api/v1/customers/:id
  router.put(
    '/customers/:id',
    authMiddleware,
    requireTenant,
    validate(updateCustomerSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const customer = await customerService.update(req.tenantId!, req.params.id, req.body);
        res.json({ success: true, data: customer });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/v1/customers/:id/interactions
  router.post(
    '/customers/:id/interactions',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await customerService.addInteraction(
          req.tenantId!,
          req.params.id,
          req.body.type,
          req.body.channel,
          req.body.content,
          req.user?.userId,
        );
        res.status(201).json({ success: true, data: { message: 'Interaction recorded' } });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/v1/customers/:id/skin-records
  router.post(
    '/customers/:id/skin-records',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await customerService.addSkinRecord(
          req.tenantId!,
          req.params.id,
          req.body.imageUrl,
          req.body.analysisResult,
          req.body.notes,
          req.user?.userId || null,
        );
        res.status(201).json({ success: true, data: { message: 'Skin record added' } });
      } catch (error) {
        next(error);
      }
    },
  );

  // === ME (Customer Self-Service) ===

  // GET /api/v1/me
  router.get(
    '/me',
    authMiddleware,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Find customer profile for logged-in user
        const { rows } = await (await import('../../../shared/database/connection')).query(
          'SELECT * FROM customers WHERE user_id = $1',
          [req.user!.userId],
        );

        if (rows.length === 0) {
          res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Customer profile not found' } });
          return;
        }

        res.json({ success: true, data: rows[0] });
      } catch (error) {
        next(error);
      }
    },
  );

  return router;
}
