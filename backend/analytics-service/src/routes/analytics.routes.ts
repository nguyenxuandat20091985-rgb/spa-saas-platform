import { Router, Request, Response, NextFunction } from 'express';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant } from '../../../shared/middleware/auth';
import { DashboardService } from '../services/dashboard.service';

export function createAnalyticsRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const dashboardService = new DashboardService();

  // Dashboard
  router.get('/dashboard/overview', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await dashboardService.getOverview(req.tenantId!, req.query.branchId as string);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/dashboard/revenue', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const period = (req.query.period as string) || 'month';
        const result = await dashboardService.getRevenueReport(req.tenantId!, period, req.query.branchId as string);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/dashboard/staff-performance', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await dashboardService.getStaffPerformance(req.tenantId!, req.query.branchId as string);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  // Analytics
  router.get('/analytics/revenue', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await dashboardService.getRevenueReport(
          req.tenantId!, (req.query.period as string) || 'month', req.query.branchId as string,
        );
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/analytics/customers', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await dashboardService.getCustomerAnalytics(req.tenantId!);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/analytics/staff', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await dashboardService.getStaffPerformance(req.tenantId!, req.query.branchId as string);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  return router;
}
