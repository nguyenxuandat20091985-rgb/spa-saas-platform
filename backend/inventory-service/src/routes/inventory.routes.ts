import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant, authorize } from '../../../shared/middleware/auth';
import { validate, validateBody, validateQuery } from '../../../shared/middleware/validation';
import { rateLimiter } from '../../../shared/middleware/rate-limiter';
import { InventoryService } from '../services/inventory.service';
import { logger } from '../../../shared/utils/logger';

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const receiveSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    costPrice: z.number().min(0).optional(),
    expiryDate: z.string().date('Invalid expiry date').optional(),
    notes: z.string().max(500).optional(),
  })).min(1, 'At least one item required'),
  referenceId: z.string().optional(),
  referenceType: z.enum(['purchase_order', 'return', 'initial_stock']).default('purchase_order'),
  notes: z.string().max(1000).optional(),
});

const dispatchSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
    notes: z.string().max(500).optional(),
  })).min(1, 'At least one item required'),
  referenceId: z.string().optional(),
  referenceType: z.enum(['sale', 'damage', 'waste', 'sample']).default('sale'),
  notes: z.string().max(1000).optional(),
});

const transferSchema = z.object({
  fromBranchId: z.string().uuid('Invalid source branch ID'),
  toBranchId: z.string().uuid('Invalid destination branch ID'),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
  })).min(1, 'At least one item required'),
  notes: z.string().max(1000).optional(),
});

const adjustmentSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    quantity: z.number().int().min(-999999).max(999999),
    reason: z.string().min(1, 'Reason is required').max(500),
  })).min(1, 'At least one item required'),
  notes: z.string().max(1000).optional(),
});

const countSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  items: z.array(z.object({
    productId: z.string().uuid('Invalid product ID'),
    countedQuantity: z.number().int().min(0),
    systemQuantity: z.number().int().min(0).optional(),
    notes: z.string().max(500).optional(),
  })).min(1, 'At least one item required'),
  countDate: z.string().date('Invalid date format').optional(),
  notes: z.string().max(1000).optional(),
});

const createProductSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255, 'Name too long'),
  description: z.string().max(2000).optional(),
  sku: z.string().min(1, 'SKU is required').max(100),
  barcode: z.string().max(50).optional(),
  price: z.number().min(0, 'Price cannot be negative'),
  costPrice: z.number().min(0).optional(),
  ingredients: z.array(z.string()).optional(),
  usageInstructions: z.string().max(2000).optional(),
  volume: z.string().max(50).optional(),
  unit: z.string().max(50).optional(),
  brand: z.string().max(100).optional(),
  minStockLevel: z.number().int().min(0).default(0),
  maxStockLevel: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

const updateProductSchema = createProductSchema.partial();

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  branchId: z.string().uuid().optional(),
  categoryId: z.string().uuid().optional(),
  search: z.string().max(100).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  lowStock: z.enum(['true', 'false']).optional(),
  expired: z.enum(['true', 'false']).optional(),
  sortBy: z.enum(['name', 'sku', 'price', 'quantity', 'minStockLevel']).default('name'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
});

const inventoryQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  includeInactive: z.enum(['true', 'false']).default('false'),
});

// ==========================================
// ROUTES
// ==========================================

export function createInventoryRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const inventoryService = new InventoryService(deps.eventBus);

  // ==========================================
  // LOGGING MIDDLEWARE
  // ==========================================
  router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('Inventory route accessed', {
      path: req.path,
      method: req.method,
      tenantId: (req as any).tenantId,
    });
    next();
  });

  // ==========================================
  // INVENTORY (TỒN KHO)
  // ==========================================

  // 1. Xem tồn kho (theo branch)
  router.get(
    '/inventory',
    authMiddleware,
    requireTenant,
    validateQuery(inventoryQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, includeInactive } = req.query;
        const result = await inventoryService.getInventory(
          req.tenantId!,
          branchId as string,
          includeInactive === 'true',
        );
        logger.info('Inventory retrieved', {
          tenantId: req.tenantId,
          branchId,
          count: result.length,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 2. Chi tiết tồn kho của một sản phẩm
  router.get(
    '/inventory/product/:productId',
    authMiddleware,
    requireTenant,
    validate(z.object({ productId: z.string().uuid('Invalid product ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.getProductInventory(
          req.tenantId!,
          req.params.productId,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 3. Cảnh báo tồn kho thấp
  router.get(
    '/inventory/alerts',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.getAlerts(req.tenantId!);
        logger.info('Inventory alerts retrieved', {
          tenantId: req.tenantId,
          count: result.length,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 4. Nhập kho
  router.post(
    '/inventory/receive',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager', 'staff'),
    rateLimiter(60 * 1000, 20),
    validateBody(receiveSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.receiveInventory(
          req.tenantId!,
          req.body,
          req.user!.userId,
        );
        logger.info('Inventory received', {
          tenantId: req.tenantId,
          branchId: req.body.branchId,
          itemCount: req.body.items.length,
          referenceId: req.body.referenceId,
        });
        res.status(201).json({
          success: true,
          data: result,
          message: 'Inventory received successfully',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 5. Xuất kho
  router.post(
    '/inventory/dispatch',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager', 'staff'),
    rateLimiter(60 * 1000, 20),
    validateBody(dispatchSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.dispatchInventory(
          req.tenantId!,
          req.body,
          req.user!.userId,
        );
        logger.info('Inventory dispatched', {
          tenantId: req.tenantId,
          branchId: req.body.branchId,
          itemCount: req.body.items.length,
          referenceType: req.body.referenceType,
        });
        res.json({
          success: true,
          data: result,
          message: 'Inventory dispatched successfully',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 6. Chuyển kho giữa các chi nhánh
  router.post(
    '/inventory/transfer',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    rateLimiter(60 * 1000, 10),
    validateBody(transferSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.transferInventory(
          req.tenantId!,
          req.body,
          req.user!.userId,
        );
        logger.info('Inventory transferred', {
          tenantId: req.tenantId,
          fromBranch: req.body.fromBranchId,
          toBranch: req.body.toBranchId,
          itemCount: req.body.items.length,
        });
        res.json({
          success: true,
          data: result,
          message: 'Transfer completed successfully',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 7. Điều chỉnh tồn kho (thủ công)
  router.post(
    '/inventory/adjust',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    rateLimiter(60 * 1000, 10),
    validateBody(adjustmentSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.adjustInventory(
          req.tenantId!,
          req.body,
          req.user!.userId,
        );
        logger.info('Inventory adjusted', {
          tenantId: req.tenantId,
          branchId: req.body.branchId,
          itemCount: req.body.items.length,
        });
        res.json({
          success: true,
          data: result,
          message: 'Inventory adjusted successfully',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 8. Kiểm kê kho (count)
  router.post(
    '/inventory/count',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    rateLimiter(60 * 1000, 5),
    validateBody(countSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.countInventory(
          req.tenantId!,
          req.body,
          req.user!.userId,
        );
        logger.info('Inventory count completed', {
          tenantId: req.tenantId,
          branchId: req.body.branchId,
          itemCount: req.body.items.length,
        });
        res.json({
          success: true,
          data: result,
          message: 'Inventory count completed successfully',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 9. Lấy lịch sử nhập/xuất kho
  router.get(
    '/inventory/transactions',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, productId, startDate, endDate, page = 1, limit = 50 } = req.query;
        const result = await inventoryService.getTransactions(
          req.tenantId!,
          {
            branchId: branchId as string,
            productId: productId as string,
            startDate: startDate as string,
            endDate: endDate as string,
            page: Number(page),
            limit: Number(limit),
          },
        );
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // PRODUCTS (SẢN PHẨM)
  // ==========================================

  // 10. Danh sách sản phẩm
  router.get(
    '/products',
    authMiddleware,
    requireTenant,
    validateQuery(listQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = { page: 1, limit: 50, ...req.query };
        const result = await inventoryService.listProducts(
          req.tenantId!,
          params as any,
        );
        logger.info('Products listed', {
          tenantId: req.tenantId,
          count: result.data?.length || 0,
        });
        res.json({ success: true, ...result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 11. Chi tiết sản phẩm
  router.get(
    '/products/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid product ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.getProduct(
          req.tenantId!,
          req.params.id,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 12. Tạo sản phẩm mới
  router.post(
    '/products',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    rateLimiter(60 * 1000, 20),
    validateBody(createProductSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.createProduct(
          req.tenantId!,
          req.body,
        );
        logger.info('Product created', {
          tenantId: req.tenantId,
          productId: result.id,
          name: req.body.name,
          sku: req.body.sku,
        });
        res.status(201).json({
          success: true,
          data: result,
          message: 'Product created successfully',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 13. Cập nhật sản phẩm
  router.put(
    '/products/:id',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    validate(z.object({ id: z.string().uuid('Invalid product ID') }), 'params'),
    validateBody(updateProductSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.updateProduct(
          req.tenantId!,
          req.params.id,
          req.body,
        );
        logger.info('Product updated', {
          tenantId: req.tenantId,
          productId: req.params.id,
          updatedFields: Object.keys(req.body),
        });
        res.json({
          success: true,
          data: result,
          message: 'Product updated successfully',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 14. Xóa (vô hiệu hóa) sản phẩm
  router.delete(
    '/products/:id',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner'),
    validate(z.object({ id: z.string().uuid('Invalid product ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await inventoryService.deleteProduct(req.tenantId!, req.params.id);
        logger.info('Product deleted', {
          tenantId: req.tenantId,
          productId: req.params.id,
        });
        res.json({
          success: true,
          data: { message: 'Product deleted successfully' },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 15. Cập nhật số lượng tồn kho tối thiểu (bulk)
  router.patch(
    '/products/bulk/min-stock',
    authMiddleware,
    requireTenant,
    authorize('tenant_owner', 'manager'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.bulkUpdateMinStock(
          req.tenantId!,
          req.body.products,
        );
        logger.info('Bulk min stock updated', {
          tenantId: req.tenantId,
          count: result,
        });
        res.json({
          success: true,
          data: { updated: result },
          message: `Updated ${result} products`,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // BÁO CÁO
  // ==========================================

  // 16. Báo cáo tồn kho
  router.get(
    '/reports/inventory',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, date } = req.query;
        const result = await inventoryService.getInventoryReport(
          req.tenantId!,
          branchId as string,
          date as string,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 17. Báo cáo nhập/xuất
  router.get(
    '/reports/transactions',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, startDate, endDate, type } = req.query;
        const result = await inventoryService.getTransactionReport(
          req.tenantId!,
          {
            branchId: branchId as string,
            startDate: startDate as string,
            endDate: endDate as string,
            type: type as string,
          },
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createInventoryRouter;