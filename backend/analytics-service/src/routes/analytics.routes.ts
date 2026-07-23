import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant } from '../../../shared/middleware/auth';
import { validate, validateQuery } from '../../../shared/middleware/validation';
import { rateLimiter } from '../../../shared/middleware/rate-limiter';
import { DashboardService } from '../services/dashboard.service';
import { logger } from '../../../shared/utils/logger';

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const periodSchema = z.object({
  period: z.enum(['today', 'week', 'month', 'quarter', 'year', 'custom']).default('month'),
  branchId: z.string().uuid('Invalid branch ID').optional(),
  startDate: z.string().date('Invalid start date').optional(),
  endDate: z.string().date('Invalid end date').optional(),
  compareWith: z.enum(['previous_period', 'last_year']).optional(),
});

const revenueQuerySchema = periodSchema.extend({
  groupBy: z.enum(['day', 'week', 'month', 'category', 'staff', 'service']).default('day'),
  includeDetails: z.enum(['true', 'false']).default('false'),
});

const staffQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  period: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

const serviceQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  period: z.enum(['week', 'month', 'quarter', 'year']).default('month'),
  limit: z.coerce.number().int().positive().max(50).default(10),
});

const customerQuerySchema = z.object({
  period: z.enum(['week', 'month', 'quarter', 'year', 'all']).default('month'),
  segment: z.enum(['all', 'vip', 'new', 'dormant', 'at_risk']).default('all'),
});

const exportSchema = z.object({
  reportType: z.enum(['revenue', 'staff', 'services', 'customers', 'inventory']),
  format: z.enum(['csv', 'excel', 'pdf']).default('csv'),
  period: z.enum(['today', 'week', 'month', 'quarter', 'year']).default('month'),
  branchId: z.string().uuid('Invalid branch ID').optional(),
});

// ==========================================
// ROUTES
// ==========================================

export function createAnalyticsRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const dashboardService = new DashboardService();

  // ==========================================
  // LOGGING MIDDLEWARE
  // ==========================================
  router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('Analytics route accessed', {
      path: req.path,
      method: req.method,
      tenantId: (req as any).tenantId,
    });
    next();
  });

  // ==========================================
  // DASHBOARD
  // ==========================================

  // 1. Dashboard tổng quan
  router.get(
    '/dashboard/overview',
    authMiddleware,
    requireTenant,
    validateQuery(periodSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, period, startDate, endDate } = req.query;
        const result = await dashboardService.getOverview(
          req.tenantId!,
          branchId as string,
          period as string,
          startDate as string,
          endDate as string,
        );
        logger.info('Dashboard overview retrieved', {
          tenantId: req.tenantId,
          branchId,
          period,
        });
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 2. Báo cáo doanh thu
  router.get(
    '/dashboard/revenue',
    authMiddleware,
    requireTenant,
    validateQuery(revenueQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { period, branchId, groupBy, startDate, endDate, compareWith, includeDetails } = req.query;
        const result = await dashboardService.getRevenueReport(
          req.tenantId!,
          {
            period: period as string,
            branchId: branchId as string,
            groupBy: groupBy as string,
            startDate: startDate as string,
            endDate: endDate as string,
            compareWith: compareWith as string,
            includeDetails: includeDetails === 'true',
          },
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 3. Hiệu suất nhân viên
  router.get(
    '/dashboard/staff-performance',
    authMiddleware,
    requireTenant,
    validateQuery(staffQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, period, limit } = req.query;
        const result = await dashboardService.getStaffPerformance(
          req.tenantId!,
          branchId as string,
          period as string,
          Number(limit),
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 4. Thống kê dịch vụ
  router.get(
    '/dashboard/services',
    authMiddleware,
    requireTenant,
    validateQuery(serviceQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, period, limit } = req.query;
        const result = await dashboardService.getServiceAnalytics(
          req.tenantId!,
          branchId as string,
          period as string,
          Number(limit),
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 5. Thống kê khách hàng
  router.get(
    '/dashboard/customers',
    authMiddleware,
    requireTenant,
    validateQuery(customerQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { period, segment } = req.query;
        const result = await dashboardService.getCustomerAnalytics(
          req.tenantId!,
          period as string,
          segment as string,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // ANALYTICS REPORTS
  // ==========================================

  // 6. Báo cáo doanh thu chi tiết
  router.get(
    '/analytics/revenue',
    authMiddleware,
    requireTenant,
    validateQuery(revenueQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { period, branchId, groupBy, startDate, endDate, compareWith, includeDetails } = req.query;
        const result = await dashboardService.getRevenueReport(
          req.tenantId!,
          {
            period: period as string,
            branchId: branchId as string,
            groupBy: groupBy as string,
            startDate: startDate as string,
            endDate: endDate as string,
            compareWith: compareWith as string,
            includeDetails: includeDetails === 'true',
          },
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 7. Báo cáo khách hàng chi tiết
  router.get(
    '/analytics/customers',
    authMiddleware,
    requireTenant,
    validateQuery(customerQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { period, segment } = req.query;
        const result = await dashboardService.getCustomerAnalytics(
          req.tenantId!,
          period as string,
          segment as string,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 8. Báo cáo nhân viên chi tiết
  router.get(
    '/analytics/staff',
    authMiddleware,
    requireTenant,
    validateQuery(staffQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, period, limit } = req.query;
        const result = await dashboardService.getStaffPerformance(
          req.tenantId!,
          branchId as string,
          period as string,
          Number(limit),
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 9. Báo cáo dịch vụ
  router.get(
    '/analytics/services',
    authMiddleware,
    requireTenant,
    validateQuery(serviceQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, period, limit } = req.query;
        const result = await dashboardService.getServiceAnalytics(
          req.tenantId!,
          branchId as string,
          period as string,
          Number(limit),
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // 10. Báo cáo tồn kho
  router.get(
    '/analytics/inventory',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId } = req.query;
        const result = await dashboardService.getInventoryAnalytics(
          req.tenantId!,
          branchId as string,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // EXPORT REPORTS
  // ==========================================

  // 11. Xuất báo cáo
  router.get(
    '/export',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 5),
    validateQuery(exportSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { reportType, format, period, branchId } = req.query;
        const result = await dashboardService.exportReport(
          req.tenantId!,
          {
            reportType: reportType as string,
            format: format as string,
            period: period as string,
            branchId: branchId as string,
          },
        );

        // Set response headers for download
        res.setHeader('Content-Type', result.mimeType);
        res.setHeader(
          'Content-Disposition',
          `attachment; filename=${result.filename}`,
        );
        res.send(result.content);
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // CHANNEL PERFORMANCE
  // ==========================================

  // 12. Hiệu quả các kênh tiếp thị
  router.get(
    '/analytics/channels',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await dashboardService.getChannelPerformance(
          req.tenantId!,
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // CUSTOM TIME PERIOD
  // ==========================================

  // 13. Báo cáo tùy chỉnh theo khoảng thời gian
  router.post(
    '/analytics/custom',
    authMiddleware,
    requireTenant,
    validateQuery(z.object({
      startDate: z.string().date('Invalid start date'),
      endDate: z.string().date('Invalid end date'),
      metrics: z.array(z.enum(['revenue', 'orders', 'customers', 'services', 'staff'])).optional(),
    })),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { startDate, endDate, metrics } = req.query;
        const result = await dashboardService.getCustomReport(
          req.tenantId!,
          startDate as string,
          endDate as string,
          metrics as string[],
        );
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createAnalyticsRouter;