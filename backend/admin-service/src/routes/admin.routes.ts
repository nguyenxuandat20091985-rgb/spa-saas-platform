import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, authorize } from '../../../shared/middleware/auth';
import { validate, validateBody, validateQuery } from '../../../shared/middleware/validation';
import { rateLimiter } from '../../../shared/middleware/rate-limiter';
import { query, withTransaction } from '../../../shared/database/connection';
import { rowsToCamelCase, rowToCamelCase } from '../../../shared/utils/helpers';
import { logger } from '../../../shared/utils/logger';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../../shared/utils/errors';

// ==========================================
// VALIDATION SCHEMAS
// ==========================================

const createPlanSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  slug: z.string().min(2, 'Slug must be at least 2 characters').max(50, 'Slug too long')
    .regex(/^[a-z0-9-]+$/, 'Slug only allows lowercase letters, numbers, and hyphens'),
  tier: z.enum(['free', 'basic', 'pro', 'enterprise', 'ai_vip']),
  monthlyPrice: z.number().min(0, 'Price must be positive'),
  yearlyPrice: z.number().min(0, 'Price must be positive'),
  maxBranches: z.number().int().min(1, 'At least 1 branch required'),
  maxStaff: z.number().int().min(1, 'At least 1 staff required'),
  maxCustomers: z.number().int().min(1, 'At least 1 customer required'),
  maxProducts: z.number().int().min(0),
  maxServices: z.number().int().min(0),
  storageGb: z.number().int().min(1, 'At least 1 GB storage required'),
  features: z.object({
    booking: z.boolean(),
    pos: z.boolean(),
    inventory: z.boolean(),
    crm: z.boolean(),
    membership: z.boolean(),
    loyalty: z.boolean(),
    marketing: z.boolean(),
    analytics: z.boolean(),
    multiBranch: z.boolean(),
    api: z.boolean(),
    customBranding: z.boolean(),
    prioritySupport: z.boolean(),
  }),
  aiFeatures: z.object({
    aiChat: z.boolean(),
    aiSalesConsultant: z.boolean(),
    aiClosingAgent: z.boolean(),
    aiCustomerSuccess: z.boolean(),
    aiMarketing: z.boolean(),
    aiSkinAnalysis: z.boolean(),
    aiPrediction: z.boolean(),
    aiVoiceReceptionist: z.boolean(),
    aiCallCenter: z.boolean(),
    monthlyAiTokens: z.number().int().min(0),
  }),
  isActive: z.boolean().default(true),
});

const updatePlanSchema = createPlanSchema.partial();

const createTenantSchema = z.object({
  name: z.string().min(2, 'Tenant name must be at least 2 characters').max(100),
  slug: z.string().min(2).max(50).regex(/^[a-z0-9-]+$/),
  ownerEmail: z.string().email('Invalid email format'),
  ownerName: z.string().min(2).max(100),
  ownerPhone: z.string().min(10).max(15),
  planSlug: z.string().optional(),
});

const updateTenantSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  status: z.enum(['active', 'suspended', 'trial', 'cancelled']).optional(),
  subscriptionPlan: z.string().optional(),
});

const listTenantsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(['active', 'suspended', 'trial', 'cancelled']).optional(),
  search: z.string().max(100).optional(),
  sortBy: z.enum(['name', 'createdAt', 'status', 'subscriptionPlan']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

const systemSettingsSchema = z.object({
  maintenanceMode: z.boolean().default(false),
  maintenanceMessage: z.string().max(500).optional(),
  maxTenants: z.number().int().min(1).optional(),
  defaultPlan: z.string().optional(),
  taxRate: z.number().min(0).max(100).optional(),
  currency: z.string().length(3).default('VND'),
  timezone: z.string().default('Asia/Ho_Chi_Minh'),
});

// ==========================================
// ROUTES
// ==========================================

export function createAdminRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const adminOnly = authorize('super_admin');

  // ==========================================
  // LOGGING MIDDLEWARE
  // ==========================================
  router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('Admin route accessed', {
      path: req.path,
      method: req.method,
      user: (req as any).user?.userId,
    });
    next();
  });

  // ==========================================
  // TENANTS
  // ==========================================

  // 1. Danh sách tenants (có phân trang và lọc)
  router.get(
    '/admin/tenants',
    authMiddleware,
    adminOnly,
    validateQuery(listTenantsQuerySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { page, limit, status, search, sortBy, sortOrder } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const conditions: string[] = ['1=1'];
        const values: any[] = [];
        let paramIndex = 1;

        if (status) {
          conditions.push(`t.status = $${paramIndex++}`);
          values.push(status);
        }
        if (search) {
          conditions.push(`(t.name ILIKE $${paramIndex} OR t.slug ILIKE $${paramIndex})`);
          values.push(`%${search}%`);
          paramIndex++;
        }

        const where = conditions.join(' AND ');
        const orderBy = sortBy === 'createdAt' ? 't.created_at' : `t.${sortBy}`;
        const order = sortOrder || 'desc';

        const countResult = await query(
          `SELECT COUNT(*) FROM tenants t WHERE ${where}`,
          values,
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await query(
          `SELECT t.*,
                  ts.plan_id,
                  sp.name as plan_name,
                  sp.tier as plan_tier,
                  ts.status as subscription_status,
                  ts.current_period_end,
                  (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id AND u.status = 'active') as user_count,
                  (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id AND c.status = 'active') as customer_count,
                  (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id AND b.status = 'active') as branch_count,
                  (SELECT COUNT(*) FROM appointments a WHERE a.tenant_id = t.id AND a.created_at >= date_trunc('month', NOW())) as appointments_this_month,
                  (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.tenant_id = t.id AND o.payment_status = 'paid' AND o.created_at >= date_trunc('month', NOW())) as revenue_this_month
           FROM tenants t
           LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.status = 'active'
           LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
           WHERE ${where}
           ORDER BY ${orderBy} ${order}
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...values, Number(limit), offset],
        );

        logger.info('Tenants listed', {
          userId: (req as any).user?.userId,
          total,
          page,
        });

        res.json({
          success: true,
          data: rowsToCamelCase(result.rows),
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 2. Chi tiết tenant
  router.get(
    '/admin/tenants/:id',
    authMiddleware,
    adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          `SELECT t.*,
                  ts.plan_id,
                  sp.name as plan_name,
                  sp.tier as plan_tier,
                  sp.monthly_price,
                  sp.yearly_price,
                  ts.status as subscription_status,
                  ts.current_period_end,
                  ts.started_at,
                  ts.cancelled_at,
                  (SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) as user_count,
                  (SELECT COUNT(*) FROM customers c WHERE c.tenant_id = t.id) as customer_count,
                  (SELECT COUNT(*) FROM branches b WHERE b.tenant_id = t.id) as branch_count,
                  (SELECT COALESCE(SUM(o.total_amount), 0) FROM orders o WHERE o.tenant_id = t.id AND o.payment_status = 'paid') as total_revenue
           FROM tenants t
           LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.status = 'active'
           LEFT JOIN subscription_plans sp ON sp.id = ts.plan_id
           WHERE t.id = $1`,
          [req.params.id],
        );

        if (result.rows.length === 0) {
          throw new NotFoundError('Tenant', req.params.id);
        }

        res.json({ success: true, data: rowToCamelCase(result.rows[0]) });
      } catch (error) {
        next(error);
      }
    }
  );

  // 3. Tạo tenant mới (super admin)
  router.post(
    '/admin/tenants',
    authMiddleware,
    adminOnly,
    rateLimiter(60 * 1000, 5),
    validateBody(createTenantSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dto = req.body;

        await withTransaction(async (client) => {
          // Check duplicate slug
          const existing = await client.query(
            'SELECT id FROM tenants WHERE slug = $1',
            [dto.slug],
          );
          if (existing.rows.length > 0) {
            throw new ConflictError(`Tenant with slug "${dto.slug}" already exists`);
          }

          // Get default plan
          let planId = null;
          if (dto.planSlug) {
            const planResult = await client.query(
              'SELECT id FROM subscription_plans WHERE slug = $1 AND is_active = true',
              [dto.planSlug],
            );
            if (planResult.rows.length > 0) {
              planId = planResult.rows[0].id;
            }
          } else {
            const planResult = await client.query(
              'SELECT id FROM subscription_plans WHERE tier = $1 AND is_active = true',
              ['free'],
            );
            if (planResult.rows.length > 0) {
              planId = planResult.rows[0].id;
            }
          }

          // Create tenant
          const tenantResult = await client.query(
            `INSERT INTO tenants (id, name, slug, subscription_plan, status, settings, branding, created_at, updated_at)
             VALUES (uuid_generate_v4(), $1, $2, $3, 'active', $4, $5, NOW(), NOW())
             RETURNING id, name, slug`,
            [
              dto.name,
              dto.slug,
              'free',
              JSON.stringify({
                timezone: 'Asia/Ho_Chi_Minh',
                currency: 'VND',
                language: 'vi',
                bookingAdvanceDays: 30,
                cancellationPolicyHours: 24,
                autoConfirmBooking: false,
                enableOnlinePayment: true,
                enableMembership: true,
                enableLoyalty: true,
                enableAiFeatures: false,
              }),
              JSON.stringify({
                primaryColor: '#1E3A5F',
                secondaryColor: '#E8B931',
              }),
            ],
          );

          const tenantId = tenantResult.rows[0].id;

          // Create owner user
          const userId = await client.query(
            `INSERT INTO users (id, tenant_id, email, full_name, phone, role, status, created_at, updated_at)
             VALUES (uuid_generate_v4(), $1, $2, $3, $4, 'tenant_owner', 'active', NOW(), NOW())
             RETURNING id`,
            [tenantId, dto.ownerEmail, dto.ownerName, dto.ownerPhone],
          );

          // Create user credentials
          await client.query(
            `INSERT INTO user_credentials (user_id, password_hash, created_at, updated_at)
             VALUES ($1, $2, NOW(), NOW())`,
            [userId.rows[0].id, 'TEMPORARY_PASSWORD_RESET_REQUIRED'],
          );

          // Create subscription if plan exists
          if (planId) {
            await client.query(
              `INSERT INTO tenant_subscriptions (
                tenant_id, plan_id, status, started_at, current_period_start, current_period_end, created_at, updated_at
              ) VALUES ($1, $2, 'active', NOW(), NOW(), NOW() + INTERVAL '30 days', NOW(), NOW())`,
              [tenantId, planId],
            );
          }

          // Create default branch
          await client.query(
            `INSERT INTO branches (id, tenant_id, name, address, phone, working_hours, status, created_at, updated_at)
             VALUES (uuid_generate_v4(), $1, $2, '', $3, $4, 'active', NOW(), NOW())`,
            [
              tenantId,
              `${dto.name} - Chi nhánh chính`,
              dto.ownerPhone,
              JSON.stringify({
                monday: { open: '09:00', close: '21:00', isOpen: true },
                tuesday: { open: '09:00', close: '21:00', isOpen: true },
                wednesday: { open: '09:00', close: '21:00', isOpen: true },
                thursday: { open: '09:00', close: '21:00', isOpen: true },
                friday: { open: '09:00', close: '21:00', isOpen: true },
                saturday: { open: '09:00', close: '21:00', isOpen: true },
                sunday: { open: '09:00', close: '21:00', isOpen: false },
              }),
            ],
          );

          logger.info('Tenant created by admin', {
            adminId: (req as any).user?.userId,
            tenantId,
            tenantName: dto.name,
            ownerEmail: dto.ownerEmail,
          });

          res.status(201).json({
            success: true,
            data: {
              tenantId,
              tenantName: dto.name,
              slug: dto.slug,
              ownerEmail: dto.ownerEmail,
            },
          });
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 4. Cập nhật tenant
  router.put(
    '/admin/tenants/:id',
    authMiddleware,
    adminOnly,
    validateBody(updateTenantSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { id } = req.params;
        const updates: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        if (req.body.name) {
          updates.push(`name = $${paramIndex++}`);
          values.push(req.body.name);
        }
        if (req.body.status) {
          updates.push(`status = $${paramIndex++}`);
          values.push(req.body.status);
        }
        if (req.body.subscriptionPlan) {
          updates.push(`subscription_plan = $${paramIndex++}`);
          values.push(req.body.subscriptionPlan);
        }

        if (updates.length === 0) {
          res.json({ success: true, data: { message: 'No changes made' } });
          return;
        }

        updates.push('updated_at = NOW()');
        values.push(id);

        await query(
          `UPDATE tenants SET ${updates.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );

        logger.info('Tenant updated by admin', {
          adminId: (req as any).user?.userId,
          tenantId: id,
          fields: Object.keys(req.body),
        });

        res.json({
          success: true,
          data: { message: 'Tenant updated successfully' },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 5. Xóa tenant (cần cân nhắc)
  router.delete(
    '/admin/tenants/:id',
    authMiddleware,
    adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Check if tenant has data
        const checkResult = await query(
          `SELECT
             (SELECT COUNT(*) FROM users WHERE tenant_id = $1) as users,
             (SELECT COUNT(*) FROM customers WHERE tenant_id = $1) as customers,
             (SELECT COUNT(*) FROM orders WHERE tenant_id = $1) as orders
           `,
          [req.params.id],
        );

        const counts = checkResult.rows[0];
        if (counts.customers > 0 || counts.orders > 0) {
          throw new ValidationError(
            `Cannot delete tenant with ${counts.customers} customers and ${counts.orders} orders. Please archive instead.`,
          );
        }

        await query(
          `UPDATE tenants SET status = 'cancelled', deleted_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [req.params.id],
        );

        logger.info('Tenant deleted by admin', {
          adminId: (req as any).user?.userId,
          tenantId: req.params.id,
        });

        res.json({
          success: true,
          data: { message: 'Tenant deleted successfully' },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // 6. Usage của tenant
  router.get(
    '/admin/tenants/:id/usage',
    authMiddleware,
    adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const tenantId = req.params.id;

        const aiUsage = await query(
          `SELECT SUM(tokens_used) as total_tokens,
                  SUM(messages) as total_messages,
                  SUM(estimated_cost) as total_cost
           FROM ai_usage WHERE tenant_id = $1 AND date >= date_trunc('month', NOW())`,
          [tenantId],
        );

        const orders = await query(
          `SELECT COUNT(*) as count,
                  COALESCE(SUM(total_amount), 0) as revenue
           FROM orders WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())`,
          [tenantId],
        );

        const customers = await query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) as new
           FROM customers WHERE tenant_id = $1 AND status = 'active'`,
          [tenantId],
        );

        const appointments = await query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE status = 'completed') as completed
           FROM appointments WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW())`,
          [tenantId],
        );

        res.json({
          success: true,
          data: {
            ai: {
              totalTokens: parseInt(aiUsage.rows[0]?.total_tokens || '0', 10),
              totalMessages: parseInt(aiUsage.rows[0]?.total_messages || '0', 10),
              totalCost: parseFloat(aiUsage.rows[0]?.total_cost || '0'),
            },
            orders: {
              count: parseInt(orders.rows[0]?.count || '0', 10),
              revenue: parseFloat(orders.rows[0]?.revenue || '0'),
            },
            customers: {
              total: parseInt(customers.rows[0]?.total || '0', 10),
              new: parseInt(customers.rows[0]?.new || '0', 10),
            },
            appointments: {
              total: parseInt(appointments.rows[0]?.total || '0', 10),
              completed: parseInt(appointments.rows[0]?.completed || '0', 10),
            },
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // REVENUE
  // ==========================================

  router.get(
    '/admin/revenue',
    authMiddleware,
    adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          `SELECT
             COALESCE(SUM(CASE WHEN status = 'paid' THEN amount ELSE 0 END), 0) as total_revenue,
             COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= date_trunc('month', NOW()) THEN amount ELSE 0 END), 0) as month_revenue,
             COALESCE(SUM(CASE WHEN status = 'paid' AND paid_at >= date_trunc('year', NOW()) THEN amount ELSE 0 END), 0) as year_revenue,
             COUNT(*) FILTER (WHERE status = 'paid') as paid_count,
             COUNT(*) FILTER (WHERE status = 'pending') as pending_count,
             COUNT(*) FILTER (WHERE status = 'overdue') as overdue_count,
             COUNT(*) FILTER (WHERE status = 'paid' AND paid_at >= date_trunc('month', NOW())) as month_paid_count
           FROM platform_invoices`,
        );

        res.json({ success: true, data: rowToCamelCase(result.rows[0]) });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // AI USAGE
  // ==========================================

  router.get(
    '/admin/ai-usage',
    authMiddleware,
    adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const period = req.query.period || 'month';
        let dateCondition = "date >= date_trunc('month', NOW())";
        if (period === 'week') {
          dateCondition = "date >= date_trunc('week', NOW())";
        } else if (period === 'quarter') {
          dateCondition = "date >= date_trunc('quarter', NOW())";
        } else if (period === 'year') {
          dateCondition = "date >= date_trunc('year', NOW())";
        }

        const result = await query(
          `SELECT au.tenant_id,
                  t.name as tenant_name,
                  COALESCE(SUM(au.tokens_used), 0) as total_tokens,
                  COALESCE(SUM(au.messages), 0) as total_messages,
                  COALESCE(SUM(au.estimated_cost), 0) as estimated_cost,
                  COUNT(DISTINCT au.provider) as providers_used,
                  MAX(au.date) as last_used
           FROM ai_usage au
           JOIN tenants t ON t.id = au.tenant_id
           WHERE ${dateCondition}
           GROUP BY au.tenant_id, t.name
           ORDER BY total_tokens DESC`,
        );

        res.json({ success: true, data: rowsToCamelCase(result.rows) });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // SUBSCRIPTION PLANS
  // ==========================================

  router.get(
    '/admin/plans',
    authMiddleware,
    adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          'SELECT * FROM subscription_plans ORDER BY monthly_price',
        );
        res.json({ success: true, data: rowsToCamelCase(result.rows) });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/admin/plans',
    authMiddleware,
    adminOnly,
    rateLimiter(60 * 1000, 10),
    validateBody(createPlanSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const dto = req.body;

        // Check duplicate slug
        const existing = await query(
          'SELECT id FROM subscription_plans WHERE slug = $1',
          [dto.slug],
        );
        if (existing.rows.length > 0) {
          throw new ConflictError(`Plan with slug "${dto.slug}" already exists`);
        }

        const result = await query(
          `INSERT INTO subscription_plans (
            name, slug, tier, monthly_price, yearly_price,
            max_branches, max_staff, max_customers, max_products, max_services,
            storage_gb, features, ai_features, is_active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, true, NOW(), NOW())
          RETURNING id`,
          [
            dto.name,
            dto.slug,
            dto.tier,
            dto.monthlyPrice,
            dto.yearlyPrice,
            dto.maxBranches,
            dto.maxStaff,
            dto.maxCustomers,
            dto.maxProducts,
            dto.maxServices,
            dto.storageGb,
            JSON.stringify(dto.features),
            JSON.stringify(dto.aiFeatures),
          ],
        );

        logger.info('Plan created by admin', {
          adminId: (req as any).user?.userId,
          planId: result.rows[0].id,
          name: dto.name,
          slug: dto.slug,
        });

        res.status(201).json({
          success: true,
          data: { id: result.rows[0].id, message: 'Plan created successfully' },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.put(
    '/admin/plans/:id',
    authMiddleware,
    adminOnly,
    validateBody(updatePlanSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const fields: string[] = [];
        const values: any[] = [];
        let paramIndex = 1;

        for (const [key, value] of Object.entries(req.body)) {
          if (value !== undefined) {
            const snakeKey = key.replace(/[A-Z]/g, (l) => `_${l.toLowerCase()}`);
            const dbValue = typeof value === 'object' ? JSON.stringify(value) : value;
            fields.push(`${snakeKey} = $${paramIndex++}`);
            values.push(dbValue);
          }
        }

        if (fields.length === 0) {
          res.json({ success: true, data: { message: 'No changes made' } });
          return;
        }

        fields.push('updated_at = NOW()');
        values.push(req.params.id);

        await query(
          `UPDATE subscription_plans SET ${fields.join(', ')} WHERE id = $${paramIndex}`,
          values,
        );

        logger.info('Plan updated by admin', {
          adminId: (req as any).user?.userId,
          planId: req.params.id,
          fields: Object.keys(req.body),
        });

        res.json({
          success: true,
          data: { message: 'Plan updated successfully' },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    '/admin/plans/:id',
    authMiddleware,
    adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        // Check if plan is in use
        const usageResult = await query(
          'SELECT COUNT(*) FROM tenant_subscriptions WHERE plan_id = $1',
          [req.params.id],
        );
        if (parseInt(usageResult.rows[0].count, 10) > 0) {
          throw new ValidationError('Cannot delete plan that is in use by tenants');
        }

        await query('DELETE FROM subscription_plans WHERE id = $1', [req.params.id]);

        logger.info('Plan deleted by admin', {
          adminId: (req as any).user?.userId,
          planId: req.params.id,
        });

        res.json({
          success: true,
          data: { message: 'Plan deleted successfully' },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // SUBSCRIPTIONS
  // ==========================================

  router.get(
    '/admin/subscriptions',
    authMiddleware,
    adminOnly,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { status, page = 1, limit = 20 } = req.query;
        const offset = (Number(page) - 1) * Number(limit);

        const conditions: string[] = ['1=1'];
        const values: any[] = [];
        let paramIndex = 1;

        if (status) {
          conditions.push(`ts.status = $${paramIndex++}`);
          values.push(status);
        }

        const where = conditions.join(' AND ');

        const countResult = await query(
          `SELECT COUNT(*) FROM tenant_subscriptions ts WHERE ${where}`,
          values,
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await query(
          `SELECT ts.*,
                  t.name as tenant_name,
                  sp.name as plan_name,
                  sp.tier as plan_tier,
                  sp.monthly_price,
                  sp.yearly_price
           FROM tenant_subscriptions ts
           JOIN tenants t ON t.id = ts.tenant_id
           JOIN subscription_plans sp ON sp.id = ts.plan_id
           WHERE ${where}
           ORDER BY ts.created_at DESC
           LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
          [...values, Number(limit), offset],
        );

        res.json({
          success: true,
          data: rowsToCamelCase(result.rows),
          pagination: {
            page: Number(page),
            limit: Number(limit),
            total,
            totalPages: Math.ceil(total / Number(limit)),
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // SYSTEM SETTINGS
  // ==========================================

  router.get(
    '/admin/settings',
    authMiddleware,
    adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await query(
          'SELECT * FROM system_settings WHERE id = 1',
        );
        res.json({
          success: true,
          data: result.rows.length > 0 ? result.rows[0] : null,
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.put(
    '/admin/settings',
    authMiddleware,
    adminOnly,
    validateBody(systemSettingsSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { maintenanceMode, maintenanceMessage, maxTenants, defaultPlan, taxRate, currency, timezone } = req.body;

        await query(
          `INSERT INTO system_settings (id, maintenance_mode, maintenance_message, max_tenants, default_plan, tax_rate, currency, timezone, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, $6, $7, NOW())
           ON CONFLICT (id) DO UPDATE SET
             maintenance_mode = $1,
             maintenance_message = $2,
             max_tenants = $3,
             default_plan = $4,
             tax_rate = $5,
             currency = $6,
             timezone = $7,
             updated_at = NOW()`,
          [maintenanceMode || false, maintenanceMessage || null, maxTenants || null, defaultPlan || null, taxRate || null, currency || 'VND', timezone || 'Asia/Ho_Chi_Minh'],
        );

        logger.info('System settings updated by admin', {
          adminId: (req as any).user?.userId,
          settings: Object.keys(req.body),
        });

        res.json({
          success: true,
          data: { message: 'Settings updated successfully' },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  // ==========================================
  // SYSTEM HEALTH
  // ==========================================

  router.get(
    '/admin/health',
    authMiddleware,
    adminOnly,
    async (_req: Request, res: Response, next: NextFunction) => {
      try {
        const dbResult = await query('SELECT NOW() as timestamp');
        res.json({
          success: true,
          data: {
            status: 'healthy',
            timestamp: dbResult.rows[0].timestamp,
            services: {
              database: 'ok',
              redis: 'ok', // TODO: check redis
              eventBus: 'ok', // TODO: check event bus
            },
          },
        });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}

export default createAdminRouter;