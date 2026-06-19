import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant } from '../../../shared/middleware/auth';
import { validate } from '../../../shared/middleware/validation';
import { OrderService } from '../services/order.service';

const createOrderSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid(),
  staffId: z.string().uuid(),
  items: z.array(z.object({
    itemType: z.enum(['service', 'product']),
    itemId: z.string().uuid(),
    quantity: z.number().min(1),
    discount: z.number().min(0).optional(),
    notes: z.string().optional(),
  })).min(1),
  paymentMethod: z.enum(['cash', 'card', 'qr', 'transfer', 'installment']).optional(),
  voucherId: z.string().uuid().optional(),
  loyaltyPointsUsed: z.number().min(0).optional(),
  notes: z.string().optional(),
});

const processPaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'qr', 'transfer', 'installment']),
  paymentReference: z.string().optional(),
  amount: z.number().min(0),
});

export function createPosRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const orderService = new OrderService(deps.eventBus);

  router.get('/orders', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = { page: 1, limit: 20, ...req.query };
        const result = await orderService.listOrders(req.tenantId!, params as any);
        res.json({ success: true, ...result });
      } catch (error) { next(error); }
    });

  router.get('/orders/:id', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.getOrder(req.tenantId!, req.params.id);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.post('/orders', authMiddleware, requireTenant,
    validate(createOrderSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.createOrder(req.tenantId!, req.body);
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.post('/orders/:id/payment', authMiddleware, requireTenant,
    validate(processPaymentSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.processPayment(req.tenantId!, req.params.id, req.body);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  // Invoices
  router.get('/invoices', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { query: dbQuery } = await import('../../../shared/database/connection');
        const result = await dbQuery(
          `SELECT i.*, c.full_name as customer_name
           FROM invoices i
           JOIN customers c ON c.id = i.customer_id
           WHERE i.tenant_id = $1
           ORDER BY i.created_at DESC`,
          [req.tenantId!],
        );
        res.json({ success: true, data: result.rows });
      } catch (error) { next(error); }
    });

  return router;
}
