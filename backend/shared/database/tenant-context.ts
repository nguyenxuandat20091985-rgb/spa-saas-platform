import { PoolClient } from 'pg';
import { getClient } from './connection';
import { logger } from '../utils/logger';

export async function setTenantContext(client: PoolClient, tenantId: string): Promise<void> {
  await client.query(`SET app.current_tenant = $1`, [tenantId]);
  logger.debug('Set tenant context', { tenantId });
}

export async function getTenantClient(tenantId: string): Promise<PoolClient> {
  const client = await getClient();
  await setTenantContext(client, tenantId);
  return client;
}

export async function withTenantContext<T>(
  tenantId: string,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getTenantClient(tenantId);
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // RESET lại context để đảm bảo không bị rò rỉ dữ liệu sang Spa khác
    // khi client này được trả về Connection Pool
    try {
      await client.query('RESET app.current_tenant');
    } catch (resetError) {
      logger.error('Failed to reset tenant context', { error: resetError });
    }
    client.release();
  }
}
