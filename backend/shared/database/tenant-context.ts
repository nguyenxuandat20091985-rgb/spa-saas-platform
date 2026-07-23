import { PoolClient } from 'pg';
import { getClient, transaction, query } from './connection';
import { logger } from '../utils/logger';
import { AuthenticationError, ValidationError } from '../utils/errors';

// ==========================================
// CONSTANTS
// ==========================================
const TENANT_CONTEXT_KEY = 'app.current_tenant';
const TENANT_CONTEXT_TIMEOUT_MS = 30000;

// ==========================================
// INTERFACE
// ==========================================
interface TenantContext {
  tenantId: string;
  userId?: string;
  branchId?: string;
  role?: string;
  setAt: Date;
}

// ==========================================
// CONTEXT STORAGE (AsyncLocalStorage)
// ==========================================
import { AsyncLocalStorage } from 'async_hooks';

const contextStorage = new AsyncLocalStorage<{ tenantId: string; userId?: string }>();

export function getCurrentTenantContext(): { tenantId?: string; userId?: string } {
  return contextStorage.getStore() || {};
}

export function runWithTenantContext<T>(
  tenantId: string,
  userId: string | undefined,
  fn: () => T,
): T {
  return contextStorage.run({ tenantId, userId }, fn);
}

// ==========================================
// SET TENANT CONTEXT
// ==========================================

export async function setTenantContext(
  client: PoolClient,
  tenantId: string,
  userId?: string,
  branchId?: string,
): Promise<void> {
  if (!tenantId) {
    throw new ValidationError('Tenant ID is required');
  }

  // Validate tenant exists
  const result = await client.query(
    'SELECT id, status FROM tenants WHERE id = $1',
    [tenantId],
  );

  if (result.rows.length === 0) {
    throw new ValidationError(`Tenant with ID ${tenantId} not found`);
  }

  if (result.rows[0].status !== 'active' && result.rows[0].status !== 'trial') {
    throw new AuthenticationError(`Tenant ${tenantId} is ${result.rows[0].status}`);
  }

  await client.query(`SET ${TENANT_CONTEXT_KEY} = $1`, [tenantId]);

  // Set additional context if provided
  if (userId) {
    await client.query('SET app.current_user = $1', [userId]);
  }
  if (branchId) {
    await client.query('SET app.current_branch = $1', [branchId]);
  }

  logger.debug('Set tenant context', {
    tenantId,
    userId,
    branchId,
  });
}

// ==========================================
// GET TENANT CLIENT
// ==========================================

export async function getTenantClient(
  tenantId: string,
  userId?: string,
  branchId?: string,
): Promise<PoolClient> {
  const client = await getClient();
  await setTenantContext(client, tenantId, userId, branchId);
  return client;
}

// ==========================================
// WITH TENANT CONTEXT (TRANSACTION)
// ==========================================

export async function withTenantContext<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
  options: {
    userId?: string;
    branchId?: string;
    isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';
    timeout?: number;
  } = {},
): Promise<T> {
  const { userId, branchId, isolationLevel = 'READ COMMITTED', timeout = TENANT_CONTEXT_TIMEOUT_MS } = options;

  if (!tenantId) {
    throw new ValidationError('Tenant ID is required');
  }

  const client = await getTenantClient(tenantId, userId, branchId);

  try {
    // Start transaction
    await client.query('BEGIN');

    if (isolationLevel) {
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${isolationLevel}`);
    }

    // Set statement timeout
    if (timeout) {
      await client.query(`SET LOCAL statement_timeout = ${timeout}`);
    }

    // Execute the function with context
    const result = await runWithTenantContext(tenantId, userId, async () => {
      return await fn(client);
    });

    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Tenant context transaction failed', {
      tenantId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    // Reset context and release client
    await resetTenantContext(client);
    client.release();
  }
}

// ==========================================
// WITH TENANT CONTEXT (NO TRANSACTION)
// ==========================================

export async function withTenantContextNoTx<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
  options: {
    userId?: string;
    branchId?: string;
  } = {},
): Promise<T> {
  const { userId, branchId } = options;

  if (!tenantId) {
    throw new ValidationError('Tenant ID is required');
  }

  const client = await getTenantClient(tenantId, userId, branchId);

  try {
    return await runWithTenantContext(tenantId, userId, async () => {
      return await fn(client);
    });
  } finally {
    await resetTenantContext(client);
    client.release();
  }
}

// ==========================================
// RESET TENANT CONTEXT
// ==========================================

export async function resetTenantContext(client: PoolClient): Promise<void> {
  try {
    await client.query('RESET app.current_tenant');
    await client.query('RESET app.current_user');
    await client.query('RESET app.current_branch');
    await client.query('RESET statement_timeout');
  } catch (resetError) {
    logger.error('Failed to reset tenant context', { error: resetError });
    // Continue anyway - don't block the release
  }
}

// ==========================================
// GET TENANT FROM CONTEXT (ROW-LEVEL SECURITY)
// ==========================================

export function getTenantFromContext(): string | null {
  // This would be used in RLS policies
  // PostgreSQL function: current_setting('app.current_tenant')
  return null; // Implementation depends on how we access session variables
}

// ==========================================
// VALIDATE TENANT ACCESS
// ==========================================

export async function validateTenantAccess(
  tenantId: string,
  resourceId: string,
  resourceTable: string,
  resourceColumn: string = 'tenant_id',
): Promise<boolean> {
  const result = await query(
    `SELECT 1 FROM ${resourceTable} WHERE ${resourceColumn} = $1 AND id = $2`,
    [tenantId, resourceId],
  );

  return result.rows.length > 0;
}

// ==========================================
// BULK VALIDATE TENANT ACCESS
// ==========================================

export async function validateTenantAccessBulk(
  tenantId: string,
  resourceIds: string[],
  resourceTable: string,
  resourceColumn: string = 'tenant_id',
): Promise<{ valid: string[]; invalid: string[] }> {
  if (resourceIds.length === 0) {
    return { valid: [], invalid: [] };
  }

  const placeholders = resourceIds.map((_, i) => `$${i + 2}`).join(', ');
  const result = await query(
    `SELECT id FROM ${resourceTable} WHERE ${resourceColumn} = $1 AND id IN (${placeholders})`,
    [tenantId, ...resourceIds],
  );

  const validIds = result.rows.map((row) => row.id);
  const invalidIds = resourceIds.filter((id) => !validIds.includes(id));

  return { valid: validIds, invalid: invalidIds };
}

// ==========================================
// TENANT DATA COUNTS (FOR QUOTA CHECK)
// ==========================================

export async function getTenantDataCounts(
  tenantId: string,
): Promise<{
  customers: number;
  staff: number;
  branches: number;
  products: number;
  services: number;
  appointments: number;
}> {
  const [customers, staff, branches, products, services, appointments] = await Promise.all([
    query('SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND status = $1', [tenantId, 'active']),
    query('SELECT COUNT(*) FROM users WHERE tenant_id = $1 AND role IN ($2, $3, $4, $5)', [tenantId, 'manager', 'staff', 'receptionist', 'tenant_owner']),
    query('SELECT COUNT(*) FROM branches WHERE tenant_id = $1 AND status = $2', [tenantId, 'active']),
    query('SELECT COUNT(*) FROM products WHERE tenant_id = $1 AND is_active = true', [tenantId]),
    query('SELECT COUNT(*) FROM services WHERE tenant_id = $1 AND is_active = true', [tenantId]),
    query('SELECT COUNT(*) FROM appointments WHERE tenant_id = $1 AND status NOT IN ($2, $3, $4)', [tenantId, 'cancelled', 'no_show', 'deleted']),
  ]);

  return {
    customers: parseInt(customers.rows[0].count, 10),
    staff: parseInt(staff.rows[0].count, 10),
    branches: parseInt(branches.rows[0].count, 10),
    products: parseInt(products.rows[0].count, 10),
    services: parseInt(services.rows[0].count, 10),
    appointments: parseInt(appointments.rows[0].count, 10),
  };
}

// ==========================================
// TENANT QUOTA CHECK
// ==========================================

export async function checkTenantQuota(
  tenantId: string,
  resourceType: 'customers' | 'staff' | 'branches' | 'products' | 'services',
): Promise<{ allowed: boolean; current: number; max: number; message?: string }> {
  const counts = await getTenantDataCounts(tenantId);

  // Get plan limits
  const planResult = await query(
    `SELECT sp.max_customers, sp.max_staff, sp.max_branches, sp.max_products, sp.max_services
     FROM tenants t
     JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
     JOIN subscription_plans sp ON sp.id = ts.plan_id
     WHERE t.id = $1 AND ts.status = 'active'`,
    [tenantId],
  );

  if (planResult.rows.length === 0) {
    return { allowed: true, current: 0, max: 999999 };
  }

  const limits = planResult.rows[0];
  const maxMap: Record<typeof resourceType, number> = {
    customers: limits.max_customers || 999999,
    staff: limits.max_staff || 999999,
    branches: limits.max_branches || 999999,
    products: limits.max_products || 999999,
    services: limits.max_services || 999999,
  };

  const current = counts[resourceType];
  const max = maxMap[resourceType];

  return {
    allowed: current < max,
    current,
    max,
    message: current >= max ? `${resourceType} limit reached (${current}/${max})` : undefined,
  };
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default {
  setTenantContext,
  getTenantClient,
  withTenantContext,
  withTenantContextNoTx,
  resetTenantContext,
  validateTenantAccess,
  validateTenantAccessBulk,
  getTenantDataCounts,
  checkTenantQuota,
  getCurrentTenantContext,
  runWithTenantContext,
};