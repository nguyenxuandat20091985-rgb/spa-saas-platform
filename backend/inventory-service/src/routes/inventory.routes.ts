import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant } from '../../../shared/middleware/auth';
import { validate } from '../../../shared/middleware/validation';
import { InventoryService } from '../services/inventory.service';

const receiveSchema = z.object({
  branchId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().min(1), notes: z.string().optional() })).min(1),
  referenceId: z.string().optional(),
  notes: z.string().optional(),
});

const dispatchSchema = z.object({
  branchId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().min(1), notes: z.string().optional() })).min(1),
  referenceId: z.string().optional(),
  referenceType: z.string().optional(),
  notes: z.string().optional(),
});

const transferSchema = z.object({
  fromBranchId: z.string().uuid(),
  toBranchId: z.string().uuid(),
  items: z.array(z.object({ productId: z.string().uuid(), quantity: z.number().min(1) })).min(1),
  notes: z.string().optional(),
});

const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  sku: z.string().min(1).max(100),
  barcode: z.string().optional(),
  price: z.number().min(0),
  costPrice: z.number().min(0).optional(),
  ingredients: z.array(z.string()).optional(),
  usageInstructions: z.string().optional(),
  volume: z.string().optional(),
  unit: z.string().optional(),
  brand: z.string().optional(),
});

export function createInventoryRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const inventoryService = new InventoryService(deps.eventBus);

  // Inventory
  router.get('/inventory', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.getInventory(req.tenantId!, req.query.branchId as string);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/inventory/alerts', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.getAlerts(req.tenantId!);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.post('/inventory/receive', authMiddleware, requireTenant,
    validate(receiveSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await inventoryService.receiveInventory(req.tenantId!, req.body, req.user!.userId);
        res.json({ success: true, data: { message: 'Inventory received' } });
      } catch (error) { next(error); }
    });

  router.post('/inventory/dispatch', authMiddleware, requireTenant,
    validate(dispatchSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await inventoryService.dispatchInventory(req.tenantId!, req.body, req.user!.userId);
        res.json({ success: true, data: { message: 'Inventory dispatched' } });
      } catch (error) { next(error); }
    });

  router.post('/inventory/transfer', authMiddleware, requireTenant,
    validate(transferSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await inventoryService.transferInventory(req.tenantId!, req.body, req.user!.userId);
        res.json({ success: true, data: { message: 'Transfer completed' } });
      } catch (error) { next(error); }
    });

  // Products
  router.get('/products', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = { page: 1, limit: 50, ...req.query };
        const result = await inventoryService.listProducts(req.tenantId!, params as any);
        res.json({ success: true, ...result });
      } catch (error) { next(error); }
    });

  router.post('/products', authMiddleware, requireTenant,
    validate(createProductSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.createProduct(req.tenantId!, req.body);
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.put('/products/:id', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await inventoryService.updateProduct(req.tenantId!, req.params.id, req.body);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  return router;
}
