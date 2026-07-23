import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { DatabaseConfig } from '../config';
import { logger } from '../utils/logger';
import { DatabaseError, ValidationError } from '../utils/errors';

// ==========================================
// INTERFACE & TYPE
// ==========================================
interface QueryOptions {
  timeout?: number;
  retries?: number;
  retryDelay?: number;
}

interface QueryWithParams<T extends QueryResultRow = any> {
  text: string;
  values?: any[];
  options?: QueryOptions;
}

let pool: Pool | null = null;
let poolConfig: DatabaseConfig | null = null;

// ==========================================
// POOL MANAGEMENT
// ==========================================

export function createPool(config: DatabaseConfig): Pool {
  if (pool) {
    logger.warn('Pool already exists, closing existing pool');
    closePool();
  }

  poolConfig = config;

  pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : false,
    max: config.maxConnections || 20,
    min: config.minConnections || 2,
    idleTimeoutMillis: config.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis || 10000,
    maxUses: 10000, // Refresh connections after 10000 uses
    allowExitOnIdle: true,
  });

  pool.on('error', (err) => {
    logger.error('Unexpected database pool error', {
      error: err.message,
      stack: err.stack,
    });
  });

  pool.on('connect', () => {
    logger.debug('New database connection established');
  });

  pool.on('remove', () => {
    logger.debug('Database connection removed from pool');
  });

  pool.on('acquire', () => {
    logger.debug('Database connection acquired from pool');
  });

  logger.info('Database pool created', {
    host: config.host,
    database: config.database,
    maxConnections: config.maxConnections,
  });

  return pool;
}

export function getPool(): Pool {
  if (!pool) {
    throw new DatabaseError('Database pool not initialized. Call createPool first.');
  }
  return pool;
}

export function getPoolConfig(): DatabaseConfig | null {
  return poolConfig;
}

// ==========================================
// QUERY WITH RETRY & TIMEOUT
// ==========================================

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: unknown[],
  options: QueryOptions = {},
): Promise<QueryResult<T>> {
  const { timeout = 30000, retries = 2, retryDelay = 1000 } = options;

  let lastError: Error | null = null;
  let attempt = 0;

  while (attempt <= retries) {
    try {
      const start = Date.now();
      const p = getPool();

      // Query with timeout
      const result = await Promise.race([
        p.query<T>(text, params),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Query timeout after ${timeout}ms`)), timeout)
        ),
      ]) as QueryResult<T>;

      const duration = Date.now() - start;

      // Log query performance
      if (duration > 1000) {
        logger.warn('Slow query detected', {
          text: text.substring(0, 200),
          duration,
          rows: result.rowCount,
        });
      } else {
        logger.debug('Query executed', {
          text: text.substring(0, 100),
          duration,
          rows: result.rowCount,
        });
      }

      return result;
    } catch (error) {
      lastError = error as Error;
      attempt++;

      if (attempt <= retries) {
        logger.warn(`Query attempt ${attempt} failed, retrying in ${retryDelay}ms`, {
          error: lastError.message,
          text: text.substring(0, 100),
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  throw new DatabaseError(
    `Query failed after ${retries} retries: ${lastError?.message || 'Unknown error'}`,
    { text: text.substring(0, 100), params },
  );
}

// ==========================================
// BULK QUERY (BATCH)
// ==========================================

export async function queryBulk<T extends QueryResultRow = any>(
  queries: QueryWithParams[],
  options: QueryOptions = {},
): Promise<QueryResult<T>[]> {
  const client = await getClient();
  try {
    const results: QueryResult<T>[] = [];
    for (const q of queries) {
      const result = await query<T>(q.text, q.values, { ...options, ...q.options });
      results.push(result);
    }
    return results;
  } finally {
    client.release();
  }
}

// ==========================================
// TRANSACTION
// ==========================================

export async function transaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  options: { isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' } = {},
): Promise<T> {
  const client = await getClient();
  let isRollback = false;

  try {
    await client.query('BEGIN');

    if (options.isolationLevel) {
      await client.query(`SET TRANSACTION ISOLATION LEVEL ${options.isolationLevel}`);
    }

    const result = await fn(client);

    await client.query('COMMIT');
    return result;
  } catch (error) {
    isRollback = true;
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', {
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  } finally {
    client.release();
  }
}

// ==========================================
// TRANSACTION (WITH AUTO RETRY)
// ==========================================

export async function transactionWithRetry<T>(
  fn: (client: PoolClient) => Promise<T>,
  maxRetries: number = 3,
  options: { isolationLevel?: 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE' } = {},
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await transaction(fn, options);
    } catch (error) {
      lastError = error as Error;

      // Only retry on serialization failures
      const isSerializationFailure =
        error instanceof Error &&
        (error.message.includes('serialization') ||
         error.message.includes('deadlock') ||
         error.message.includes('could not serialize'));

      if (!isSerializationFailure || attempt === maxRetries) {
        throw error;
      }

      logger.warn(`Transaction attempt ${attempt} failed, retrying...`, {
        error: error.message,
      });

      // Exponential backoff
      const delay = Math.min(100 * Math.pow(2, attempt - 1), 2000);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError || new DatabaseError('Transaction failed after retries');
}

// ==========================================
// GET CLIENT
// ==========================================

export async function getClient(): Promise<PoolClient> {
  const p = getPool();
  const client = await p.connect();

  // Add query logging for client
  const originalQuery = client.query.bind(client);
  client.query = ((text: string | QueryConfig, params?: any[]) => {
    const start = Date.now();
    const result = originalQuery(text, params);
    result.then((res) => {
      const duration = Date.now() - start;
      if (duration > 500) {
        logger.debug('Slow client query', {
          text: typeof text === 'string' ? text.substring(0, 100) : text.text,
          duration,
        });
      }
    }).catch((err) => {
      logger.error('Client query error', { error: err.message });
    });
    return result;
  }) as any;

  return client;
}

// ==========================================
// HEALTH CHECK
// ==========================================

export async function healthCheck(): Promise<{
  healthy: boolean;
  latency: number;
  poolStats: {
    total: number;
    idle: number;
    waiting: number;
  };
}> {
  try {
    const start = Date.now();
    const result = await query<{ health: number }>('SELECT 1 as health');
    const latency = Date.now() - start;

    const p = getPool();
    const poolStats = {
      total: p.totalCount,
      idle: p.idleCount,
      waiting: p.waitingCount,
    };

    return {
      healthy: result.rows.length > 0,
      latency,
      poolStats,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: 0,
      poolStats: { total: 0, idle: 0, waiting: 0 },
    };
  }
}

// ==========================================
// CLOSE POOL
// ==========================================

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
    logger.info('Database pool closed');
  }
}

// ==========================================
// UTILITY: BUILD WHERE CLAUSE
// ==========================================

export function buildWhereClause(
  conditions: Record<string, unknown>,
  paramIndex: number = 1,
): { whereClause: string; values: unknown[] } {
  const values: unknown[] = [];
  const clauses: string[] = [];

  for (const [key, value] of Object.entries(conditions)) {
    if (value !== undefined && value !== null) {
      clauses.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  }

  return {
    whereClause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '',
    values,
  };
}

// ==========================================
// UTILITY: BUILD UPDATE SET
// ==========================================

export function buildUpdateSet(
  data: Record<string, unknown>,
  paramIndex: number = 1,
): { setClause: string; values: unknown[] } {
  const values: unknown[] = [];
  const clauses: string[] = [];

  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      clauses.push(`${key} = $${paramIndex++}`);
      values.push(value);
    }
  }

  return {
    setClause: clauses.join(', '),
    values,
  };
}

// ==========================================
// UTILITY: BUILD INSERT
// ==========================================

export function buildInsert(
  table: string,
  data: Record<string, unknown>,
): { text: string; values: unknown[] } {
  const keys = Object.keys(data).filter(k => data[k] !== undefined);
  const values = keys.map(k => data[k]);
  const placeholders = values.map((_, i) => `$${i + 1}`);

  return {
    text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`,
    values,
  };
}

// ==========================================
// UTILITY: BUILD UPSERT
// ==========================================

export function buildUpsert(
  table: string,
  data: Record<string, unknown>,
  conflictColumn: string,
  updateColumns?: string[],
): { text: string; values: unknown[] } {
  const keys = Object.keys(data).filter(k => data[k] !== undefined);
  const values = keys.map(k => data[k]);
  const placeholders = values.map((_, i) => `$${i + 1}`);

  const updateFields = updateColumns || keys;
  const updateSet = updateFields
    .filter(k => k !== conflictColumn)
    .map(k => `${k} = EXCLUDED.${k}`)
    .join(', ');

  return {
    text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')})
           ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateSet}
           RETURNING *`,
    values,
  };
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default {
  createPool,
  getPool,
  getPoolConfig,
  query,
  queryBulk,
  transaction,
  transactionWithRetry,
  getClient,
  healthCheck,
  closePool,
  buildWhereClause,
  buildUpdateSet,
  buildInsert,
  buildUpsert,
};