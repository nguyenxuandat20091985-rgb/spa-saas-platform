import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant } from '../../../shared/middleware/auth';
import { validate, validateBody, validateQuery } from '../../../shared/middleware/validation';
import { rateLimiter } from '../../../shared/middleware/rate-limiter';
import { OrderService } from '../services/order.service';
import { logger } from '../../../shared/utils/logger';

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const createOrderSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  staffId: z.string().uuid('Invalid staff ID'),
  items: z.array(z.object({
    itemType: z.enum(['service', 'product']),
    itemId: z.string().uuid('Invalid item ID'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    unitPrice: z.number().min(0).optional(),
    discount: z.number().min(0).max(100, 'Discount cannot exceed 100%').optional(),
    notes: z.string().max(500).optional(),
  })).min(1, 'Order must have at least one item'),
  paymentMethod: z.enum(['cash', 'card', 'qr', 'transfer', 'installment']).optional(),
  voucherId: z.string().uuid('Invalid voucher ID').optional(),
  loyaltyPointsUsed: z.number().min(0).optional(),
  notes: z.string().max(1000).optional(),
  shippingAddress: z.string().optional(),
});

const updateOrderSchema = createOrderSchema.partial();

const processPaymentSchema = z.object({
  paymentMethod: z.enum(['cash', 'card', 'qr', 'transfer', 'installment']),
  paymentReference: z.string().optional(),
  amount: z.number().min(0, 'Amount must be positive'),
  cashAmount: z.number().min(0).optional(), // For cash payments
  changeAmount: z.number().min(0).optional(),
});

const listOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  branchId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
  status: z.enum(['pending', 'processing', 'completed', 'cancelled', 'refunded']).optional(),
  paymentStatus: z.enum(['pending', 'paid', 'partially_paid', 'refunded']).optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['createdAt', 'totalAmount', 'status']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const refundSchema = z.object({
  reason: z.string().min(1, 'Refund reason is required').max(500),
  amount: z.number().min(0, 'Amount must be positive').optional(),
  refundToCustomer: z.boolean().default(false),
});

// ==========================================
// ROUTES
// ==========================================

export function createPosRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const orderService = new OrderService(deps.eventBus);

  // ==========================================
  // LOGGING MIDDLEWARE
  // ==========================================
  router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('POS route accessed', {
      path: req.path,
      method: req.method,
      tenantId: (req as any).tenantId,
    });
    next();
  });

  // ==========================================
  // ORDERS
  // ==========================================

  // 1. Danh sách đơn hàng (có phân trang và lọc)
  router.get(
    '/orders',
    authMiddleware,
    requireTenant,
    validateQuery(listOrdersQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = {
          page: 1,
          limit: 20,
          ...req.query,
        };
        const result = await orderService.listOrders(req.tenantId!, params as any);
        logger.info('Orders listed', {
          tenantId: req.tenantId,
          count: result.data?.length || 0,
          page: params.page,
        });
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 2. Chi tiết đơn hàng
  router.get(
    '/orders/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid order ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.getOrder(req.tenantId!, req.params.id);
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 3. Tạo đơn hàng mới
  router.post(
    '/orders',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 20),
    validateBody(createOrderSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.createOrder(req.tenantId!, req.body);
        logger.info('Order created', {
          tenantId: req.tenantId,
          orderId: result.id,
          customerId: req.body.customerId,
          totalAmount: result.totalAmount,
          itemCount: req.body.items.length,
        });
        res.status(201).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 4. Cập nhật đơn hàng
  router.put(
    '/orders/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid order ID') }), 'params'),
    validateBody(updateOrderSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.updateOrder(
          req.tenantId!,
          req.params.id,
          req.body,
        );
        logger.info('Order updated', {
          tenantId: req.tenantId,
          orderId: req.params.id,
          fields: Object.keys(req.body),
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 5. Thanh toán đơn hàng
  router.post(
    '/orders/:id/payment',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid order ID') }), 'params'),
    validateBody(processPaymentSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.processPayment(
          req.tenantId!,
          req.params.id,
          req.body,
        );
        logger.info('Payment processed', {
          tenantId: req.tenantId,
          orderId: req.params.id,
          paymentMethod: req.body.paymentMethod,
          amount: req.body.amount,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 6. Hủy đơn hàng
  router.patch(
    '/orders/:id/cancel',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid order ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.cancelOrder(
          req.tenantId!,
          req.params.id,
          req.body.reason,
        );
        logger.info('Order cancelled', {
          tenantId: req.tenantId,
          orderId: req.params.id,
          reason: req.body.reason,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 7. Hoàn tiền
  router.post(
    '/orders/:id/refund',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid order ID') }), 'params'),
    validateBody(refundSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.processRefund(
          req.tenantId!,
          req.params.id,
          req.body,
        );
        logger.info('Refund processed', {
          tenantId: req.tenantId,
          orderId: req.params.id,
          amount: req.body.amount,
          reason: req.body.reason,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // INVOICES (HÓA ĐƠN)
  // ==========================================

  // 8. Danh sách hóa đơn
  router.get(
    '/invoices',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { page = 1, limit = 20, ...filters } = req.query;
        const result = await orderService.listInvoices(
          req.tenantId!,
          { page: Number(page), limit: Number(limit), ...filters },
        );
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 9. Chi tiết hóa đơn
  router.get(
    '/invoices/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid invoice ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.getInvoice(req.tenantId!, req.params.id);
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 10. Xuất hóa đơn (PDF)
  router.get(
    '/invoices/:id/pdf',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid invoice ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const pdfBuffer = await orderService.generateInvoicePDF(
          req.tenantId!,
          req.params.id,
        );
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=invoice-${req.params.id}.pdf`,
        );
        res.send(pdfBuffer);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // STATISTICS (THỐNG KÊ NHANH CHO POS)
  // ==========================================

  router.get(
    '/stats/daily',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const stats = await orderService.getDailyStats(req.tenantId!);
        res.json({ success: true, data: stats });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // CART (GIỎ HÀNG TẠM) - CHO POS
  // ==========================================

  // Lưu giỏ hàng tạm (chưa tạo order)
  router.post(
    '/cart',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await orderService.saveCart(req.tenantId!, req.user!.userId, req.body);
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  router.get(
    '/cart',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const cart = await orderService.getCart(req.tenantId!, req.user!.userId);
        res.json({ success: true, data: cart });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    '/cart',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await orderService.clearCart(req.tenantId!, req.user!.userId);
        res.json({ success: true, data: { message: 'Cart cleared' } });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createPosRouter;