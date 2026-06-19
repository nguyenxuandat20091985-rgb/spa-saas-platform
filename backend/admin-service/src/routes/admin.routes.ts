import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, authorize } from '../../../shared/middleware/auth';
import { validate } from '../../../shared/middleware/validation';
import { query } from '../../../shared/database/connection';
import { rowsToCamelCase } from '../../../shared/utils/helpers';

const createPlanSchema = z.object({
  name: z.string().min(2).max(100),
  slug: z.string().min(2).max(50),
  tier: z.enum(['free', 'basic', 'pro', 'enterprise', 'ai_vip']),
  monthlyPrice: z.number().min(0),
  yearlyPrice: z.number().min(0),
  maxBranches: z.number().min(1),
  maxStaff: z.number().min(1),
  maxCustomers: z.number().min(1),
  maxProducts: z.number().min(1),
  maxServices: z.number().min(1),
  storageGb: z.number().min(1),
  features: z.object({
    booking: z.boolean(), pos: z.boolean(), inventory: z.boolean(), crm: z.boolean(),
    membership: z.boolean(), loyalty: z.boolean(), marketing: z.boolean(), analytics: z.boolean(),
    multiBranch: z.boolean(), api: z.boolean(), customBranding: z.boolean(), prioritySupport: z.boolean(),
  }),
  aiFeatures: z.object({
    aiChat: z.boolean(), aiSalesConsultant: z.boolean(), aiClosingAgent: z.boolean(),
    aiCustomerSuccess: z.boolean(), aiMarketing: z.boolean(), aiSkinAnalysis: z.boolean(),
    aiPrediction: z.boolean(), aiVoiceReceptionist: z.boolean(), aiCallCenter: z.boolean(),
    monthlyAiTokens: z.number().min(0),
  }),
});

export function createAdminRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const adminOnly = authorize('super_admin');

  // === TENANTS ===

  router.get('/admin/tenants', authMiddleware, adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          `SELECT t.*, ts.plan_id, sp.name as plan_name, sp.tier as plan_tier,
                  ts.status as subscription_status,
                  (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as user_count,
                  (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) as customer_count,
                  (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id) as branch_count
           FROM tenants t
           LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
           LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
           ORDER BY t.created_at DESC`,
        );
        res.json({ success: true, data: rowsToCamelCase(result.rows) });
      } catch (error) { next(error); }
    });

  router.get('/admin/tenants/:id', authMiddleware, adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          `SELECT t.*, ts.plan_id, sp.name as plan_name,
                  ts.status as subscription_status, ts.current_period_end
           FROM tenants t
           LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
           LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
           WHERE t.id = $1`,
          [req.params.id],
        );
        if (result.rows.length === 0) {
          res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Tenant not found' } });
          return;
        }
        res.json({ success: true, data: result.rows[0] });
      } catch (error) { next(error); }
    });

  router.put('/admin/tenants/:id', authMiddleware, adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { status, subscriptionPlan } = req.body;
        if (status) {
          await query('UPDATE tenants SET status = $1, updated_at = NOW() WHERE id = $2', [status, req.params.id]);
        }
        if (subscriptionPlan) {
          await query('UPDATE tenants SET subscription_plan = $1, updated_at = NOW() WHERE id = $2', [subscriptionPlan, req.params.id]);
        }
        res.json({ success: true, data: { message: 'Tenant updated' } });
      } catch (error) { next(error); }
    });

  router.get('/admin/tenants/:id/usage', authMiddleware, adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.params.id;
        const aiUsage = await query(
          `SELECT SUM(tokens_used) as total_tokens, SUM(messages) as total_messages,
                  SUM(estimated_cost) as total_cost
           FROM ai_usage WHERE tenant_id = $1 AND date >= date_trunc('month', NOW())`,
          [tenantId],
        );
        const orders = await query(
          `SELECT COUNT(*) as count, SUM(total_amount) as revenue
           FROM orders WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())`,
          [tenantId],
        );

        res.json({
          success: true,
          data: {
            ai: aiUsage.rows[0],
            orders: orders.rows[0],
          },
        });
      } catch (error) { next(error); }
    });

  // === REVENUE ===

  router.get('/admin/revenue', authMiddleware, adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          `SELECT
             SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END) as total_revenue,
             SUM(CASE WHEN status = 'paid' AND paid_at >= date_trunc('month', NOW()) THEN amount ELSE 0 END) as month_revenue,
             COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
             COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
             COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count
           FROM platform_invoices`,
        );
        res.json({ success: true, data: result.rows[0] });
      } catch (error) { next(error); }
    });

  // === AI USAGE ===

  router.get('/admin/ai-usage', authMiddleware, adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          `SELECT au.tenant_id, t.name as tenant_name,
                  SUM(au.tokens_used) as total_tokens,
                  SUM(au.messages) as total_messages,
                  SUM(au.estimated_cost) as estimated_cost
           FROM ai_usage au
           JOIN tenants t ON t.id = au.tenant_id
           WHERE au.date >= date_trunc('month', NOW())
           GROUP BY au.tenant_id, t.name
           ORDER BY total_tokens DESC`,
        );
        res.json({ success: true, data: rowsToCamelCase(result.rows) });
      } catch (error) { next(error); }
    });

  // === SUBSCRIPTION PLANS ===

  router.get('/admin/plans', authMiddleware, adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query('SELECT * FROM subscription_plans ORDER BY monthly_price');
        res.json({ success: true, data: rowsToCamelCase(result.rows) });
      } catch (error) { next(error); }
    });

  router.post('/admin/plans', authMiddleware, adminOnly,
    validate(createPlanSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dto = req.body;
        await query(
          `INSERT INTO subscription_plans (name, slug, tier, monthly_price, yearly_price,
            max_branches, max_staff, max_customers, max_products, max_services,
            storage_gb, features, ai_features)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
          [dto.name, dto.slug, dto.tier, dto.monthlyPrice, dto.yearlyPrice,
           dto.maxBranches, dto.maxStaff, dto.maxCustomers, dto.maxProducts, dto.maxServices,
           dto.storageGb, JSON.stringify(dto.features), JSON.stringify(dto.aiFeatures)],
        );
        res.status(201).json({ success: true, data: { message: 'Plan created' } });
      } catch (error) { next(error); }
    });

  router.put('/admin/plans/:id', authMiddleware, adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const fields: string[] = [];
        const values: unknown[] = [];
        let pi = 1;

        for (const [key, value] of Object.entries(req.body)) {
          if (value !== undefined) {
            const snakeKey = key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
            const dbValue = typeof value === 'object' ? JSON.stringify(value) : value;
            fields.push(`${snakeKey} = $${pi++}`);
            values.push(dbValue);
          }
        }

        if (fields.length > 0) {
          fields.push('updated_at = NOW()');
          await query(
            `UPDATE subscription_plans SET ${fields.join(', ')} WHERE id = $${pi}`,
            [...values, req.params.id],
          );
        }

        res.json({ success: true, data: { message: 'Plan updated' } });
      } catch (error) { next(error); }
    });

  // === SUBSCRIPTIONS ===

  router.get('/admin/subscriptions', authMiddleware, adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          `SELECT ts.*, t.name as tenant_name, sp.name as plan_name, sp.tier
           FROM tenant_subscriptions ts
           JOIN tenants t ON t.id = ts.tenant_id
           JOIN subscription_plans sp ON sp.id = ts.plan_id
           ORDER BY ts.created_at DESC`,
        );
        res.json({ success: true, data: rowsToCamelCase(result.rows) });
      } catch (error) { next(error); }
    });

  return router;
}
