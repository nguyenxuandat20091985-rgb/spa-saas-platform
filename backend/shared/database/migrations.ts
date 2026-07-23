import { PoolClient } from 'pg';
import { getPool } from './connection';
import { logger } from '../utils/logger';
import { DatabaseError } from '../utils/errors';
import * as fs from 'fs';
import * as path from 'path';

// ==========================================
// INTERFACE
// ==========================================
interface Migration {
  name: string;
  up: (client: PoolClient) => Promise<void>;
  down?: (client: PoolClient) => Promise<void>;
}

interface MigrationRecord {
  id: number;
  name: string;
  executed_at: Date;
}

// ==========================================
// MIGRATION REGISTRY
// ==========================================
const migrations: Migration[] = [];

// ==========================================
// REGISTER MIGRATION
// ==========================================
function registerMigration(name: string, up: (client: PoolClient) => Promise<void>, down?: (client: PoolClient) => Promise<void>): void {
  migrations.push({ name, up, down });
}

// ==========================================
// MIGRATION FUNCTIONS
// ==========================================

export async function runMigrations(options: {
  direction?: 'up' | 'down';
  target?: string;
  force?: boolean;
} = {}): Promise<void> {
  const { direction = 'up', target, force = false } = options;

  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create migrations table if not exists
    await createMigrationsTable(client);

    if (direction === 'up') {
      await runMigrationsUp(client, target, force);
    } else {
      await runMigrationsDown(client, target);
    }

    await client.query('COMMIT');
    logger.info(`Migrations ${direction} completed successfully`);
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error(`Migration ${direction} failed`, { error });
    throw new DatabaseError(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    client.release();
  }
}

async function createMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW(),
      checksum VARCHAR(64)
    )
  `);
}

async function getExecutedMigrations(client: PoolClient): Promise<string[]> {
  const result = await client.query('SELECT name FROM _migrations ORDER BY id');
  return result.rows.map((row) => row.name);
}

async function isMigrationExecuted(client: PoolClient, name: string): Promise<boolean> {
  const result = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [name]);
  return result.rows.length > 0;
}

async function markMigrationExecuted(client: PoolClient, name: string, checksum?: string): Promise<void> {
  await client.query(
    'INSERT INTO _migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
    [name, checksum || null],
  );
}

async function removeMigrationRecord(client: PoolClient, name: string): Promise<void> {
  await client.query('DELETE FROM _migrations WHERE name = $1', [name]);
}

async function runMigrationsUp(client: PoolClient, target?: string, force?: boolean): Promise<void> {
  const executed = await getExecutedMigrations(client);

  // Register all migrations first
  registerAllMigrations();

  // Filter migrations not yet executed
  const pending = migrations.filter((m) => !executed.includes(m.name));

  if (pending.length === 0) {
    logger.info('No pending migrations to run');
    return;
  }

  for (const migration of pending) {
    if (target && migration.name === target) {
      await executeMigrationUp(client, migration);
      break;
    }
    await executeMigrationUp(client, migration);
  }
}

async function executeMigrationUp(client: PoolClient, migration: Migration): Promise<void> {
  try {
    logger.info(`Running migration: ${migration.name}`);
    await migration.up(client);
    await markMigrationExecuted(client, migration.name);
    logger.info(`Migration ${migration.name} completed`);
  } catch (error) {
    logger.error(`Migration ${migration.name} failed`, { error });
    throw error;
  }
}

async function runMigrationsDown(client: PoolClient, target?: string): Promise<void> {
  const executed = await getExecutedMigrations(client);

  if (executed.length === 0) {
    logger.info('No migrations to rollback');
    return;
  }

  // Get migrations in reverse order
  const toRollback = migrations
    .filter((m) => executed.includes(m.name) && m.down)
    .reverse();

  if (toRollback.length === 0) {
    logger.info('No migrations with down functions to rollback');
    return;
  }

  for (const migration of toRollback) {
    if (target && migration.name === target) {
      await executeMigrationDown(client, migration);
      break;
    }
    await executeMigrationDown(client, migration);
  }
}

async function executeMigrationDown(client: PoolClient, migration: Migration): Promise<void> {
  if (!migration.down) {
    logger.warn(`Migration ${migration.name} has no down function, skipping`);
    return;
  }

  try {
    logger.info(`Rolling back migration: ${migration.name}`);
    await migration.down(client);
    await removeMigrationRecord(client, migration.name);
    logger.info(`Migration ${migration.name} rolled back`);
  } catch (error) {
    logger.error(`Rollback ${migration.name} failed`, { error });
    throw error;
  }
}

// ==========================================
// REGISTER ALL MIGRATIONS
// ==========================================
function registerAllMigrations(): void {
  registerMigration('001_extensions', createExtensions);
  registerMigration('002_core_tables', createCoreTables);
  registerMigration('003_business_tables', createBusinessTables);
  registerMigration('004_ai_tables', createAiTables);
  registerMigration('005_analytics_tables', createAnalyticsTables);
  registerMigration('006_rls_policies', createRlsPolicies);
  registerMigration('007_indexes', createIndexes);
  registerMigration('008_triggers', createTriggers);
  registerMigration('009_functions', createFunctions);
}

// ==========================================
// 001_EXTENSIONS
// ==========================================
async function createExtensions(client: PoolClient): Promise<void> {
  await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "btree_gin"`);
  logger.info('Extensions created');
}

// ==========================================
// 008_TRIGGERS
// ==========================================
async function createTriggers(client: PoolClient): Promise<void> {
  // Updated_at trigger function
  await client.query(`
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Auto-update updated_at for all tables with updated_at
  const tablesWithUpdatedAt = [
    'tenants', 'branches', 'users', 'customers', 'customer_interactions',
    'customer_skin_records', 'service_categories', 'services',
    'product_categories', 'products', 'rooms', 'equipment', 'staff_schedules',
    'appointments', 'orders', 'invoices', 'installments', 'inventory',
    'inventory_transactions', 'membership_tiers', 'membership_cards',
    'loyalty_transactions', 'vouchers', 'customer_vouchers', 'notifications',
    'notification_templates', 'campaigns', 'automation_rules',
    'subscription_plans', 'tenant_subscriptions', 'platform_invoices',
    'ai_knowledge_documents', 'ai_knowledge_chunks', 'ai_conversations',
    'ai_messages', 'ai_product_knowledge', 'ai_service_knowledge', 'ai_usage',
    'daily_metrics',
  ];

  for (const table of tablesWithUpdatedAt) {
    await client.query(`
      DROP TRIGGER IF EXISTS update_${table}_updated_at ON ${table};
      CREATE TRIGGER update_${table}_updated_at
        BEFORE UPDATE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column()
    `);
  }

  // Audit trigger for critical tables
  await client.query(`
    CREATE OR REPLACE FUNCTION audit_trigger_function()
    RETURNS TRIGGER AS $$
    BEGIN
      IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, new_values, created_at)
        VALUES (
          NEW.tenant_id,
          current_setting('app.current_user', true)::uuid,
          'CREATE',
          TG_TABLE_NAME,
          NEW.id,
          to_jsonb(NEW),
          NOW()
        );
        RETURN NEW;
      ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_values, new_values, created_at)
        VALUES (
          NEW.tenant_id,
          current_setting('app.current_user', true)::uuid,
          'UPDATE',
          TG_TABLE_NAME,
          NEW.id,
          to_jsonb(OLD),
          to_jsonb(NEW),
          NOW()
        );
        RETURN NEW;
      ELSIF TG_OP = 'DELETE' THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, entity_type, entity_id, old_values, created_at)
        VALUES (
          OLD.tenant_id,
          current_setting('app.current_user', true)::uuid,
          'DELETE',
          TG_TABLE_NAME,
          OLD.id,
          to_jsonb(OLD),
          NOW()
        );
        RETURN OLD;
      END IF;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Apply audit triggers to critical tables
  const auditTables = ['customers', 'appointments', 'orders', 'inventory_transactions'];
  for (const table of auditTables) {
    await client.query(`
      DROP TRIGGER IF EXISTS audit_${table} ON ${table};
      CREATE TRIGGER audit_${table}
        AFTER INSERT OR UPDATE OR DELETE ON ${table}
        FOR EACH ROW
        EXECUTE FUNCTION audit_trigger_function()
    `);
  }

  logger.info('Triggers created');
}

// ==========================================
// 009_FUNCTIONS
// ==========================================
async function createFunctions(client: PoolClient): Promise<void> {
  // Search function with fuzzy matching
  await client.query(`
    CREATE OR REPLACE FUNCTION search_customers(
      p_tenant_id UUID,
      p_query TEXT,
      p_limit INTEGER DEFAULT 10
    )
    RETURNS TABLE(
      id UUID,
      full_name TEXT,
      phone TEXT,
      email TEXT,
      similarity_score REAL
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        c.id,
        c.full_name,
        c.phone,
        c.email,
        GREATEST(
          similarity(c.full_name, p_query),
          similarity(c.phone, p_query),
          similarity(c.email, p_query)
        ) as similarity_score
      FROM customers c
      WHERE c.tenant_id = p_tenant_id
        AND c.status = 'active'
        AND (
          c.full_name % p_query
          OR c.phone % p_query
          OR c.email % p_query
        )
      ORDER BY similarity_score DESC
      LIMIT p_limit;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Monthly revenue function
  await client.query(`
    CREATE OR REPLACE FUNCTION get_monthly_revenue(
      p_tenant_id UUID,
      p_year INTEGER,
      p_month INTEGER
    )
    RETURNS TABLE(
      day INTEGER,
      revenue DECIMAL(12, 2),
      order_count BIGINT,
      avg_ticket DECIMAL(12, 2)
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        EXTRACT(DAY FROM o.created_at)::INTEGER as day,
        COALESCE(SUM(o.total_amount), 0) as revenue,
        COUNT(*) as order_count,
        COALESCE(AVG(o.total_amount), 0) as avg_ticket
      FROM orders o
      WHERE o.tenant_id = p_tenant_id
        AND o.payment_status = 'paid'
        AND EXTRACT(YEAR FROM o.created_at) = p_year
        AND EXTRACT(MONTH FROM o.created_at) = p_month
      GROUP BY EXTRACT(DAY FROM o.created_at)
      ORDER BY day;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Customer churn prediction helper
  await client.query(`
    CREATE OR REPLACE FUNCTION get_at_risk_customers(
      p_tenant_id UUID,
      p_days_since_visit INTEGER DEFAULT 30,
      p_min_visits INTEGER DEFAULT 3
    )
    RETURNS TABLE(
      id UUID,
      full_name TEXT,
      phone TEXT,
      days_since_last_visit INTEGER,
      total_spent DECIMAL(12, 2),
      visit_count BIGINT
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        c.id,
        c.full_name,
        c.phone,
        EXTRACT(DAY FROM (NOW() - c.last_visit_at))::INTEGER as days_since_last_visit,
        c.total_spent,
        c.visit_count
      FROM customers c
      WHERE c.tenant_id = p_tenant_id
        AND c.status = 'active'
        AND c.visit_count >= p_min_visits
        AND c.last_visit_at < NOW() - (p_days_since_visit || ' days')::INTERVAL
      ORDER BY days_since_last_visit DESC;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Staff performance summary
  await client.query(`
    CREATE OR REPLACE FUNCTION get_staff_performance(
      p_tenant_id UUID,
      p_start_date DATE,
      p_end_date DATE
    )
    RETURNS TABLE(
      staff_id UUID,
      staff_name TEXT,
      total_appointments BIGINT,
      completed_appointments BIGINT,
      total_revenue DECIMAL(12, 2),
      avg_rating DECIMAL(3, 2)
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        u.id as staff_id,
        u.full_name as staff_name,
        COUNT(a.id) as total_appointments,
        COUNT(a.id) FILTER (WHERE a.status = 'completed') as completed_appointments,
        COALESCE(SUM(a.total_price) FILTER (WHERE a.status = 'completed'), 0) as total_revenue,
        COALESCE(AVG(r.rating), 0) as avg_rating
      FROM users u
      LEFT JOIN appointments a ON a.staff_id = u.id
        AND a.created_at >= p_start_date
        AND a.created_at <= p_end_date
      LEFT JOIN reviews r ON r.appointment_id = a.id
      WHERE u.tenant_id = p_tenant_id
        AND u.role IN ('staff', 'manager')
      GROUP BY u.id, u.full_name
      ORDER BY total_revenue DESC;
    END;
    $$ LANGUAGE plpgsql
  `);

  // Inventory valuation
  await client.query(`
    CREATE OR REPLACE FUNCTION get_inventory_valuation(
      p_tenant_id UUID,
      p_branch_id UUID DEFAULT NULL
    )
    RETURNS TABLE(
      product_id UUID,
      product_name TEXT,
      sku TEXT,
      quantity INTEGER,
      unit_price DECIMAL(12, 2),
      total_value DECIMAL(12, 2)
    ) AS $$
    BEGIN
      RETURN QUERY
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.sku,
        i.quantity,
        p.price as unit_price,
        (i.quantity * p.price) as total_value
      FROM inventory i
      JOIN products p ON p.id = i.product_id
      WHERE i.tenant_id = p_tenant_id
        AND (p_branch_id IS NULL OR i.branch_id = p_branch_id)
      ORDER BY total_value DESC;
    END;
    $$ LANGUAGE plpgsql
  `);

  logger.info('Functions created');
}

// ==========================================
// CORE TABLES (Giữ nguyên từ bản gốc)
// ==========================================
async function createCoreTables(client: PoolClient): Promise<void> {
  // ... (giữ nguyên code từ bản gốc)
}

async function createBusinessTables(client: PoolClient): Promise<void> {
  // ... (giữ nguyên code từ bản gốc)
}

async function createAiTables(client: PoolClient): Promise<void> {
  // ... (giữ nguyên code từ bản gốc)
}

async function createAnalyticsTables(client: PoolClient): Promise<void> {
  // ... (giữ nguyên code từ bản gốc)
}

async function createRlsPolicies(client: PoolClient): Promise<void> {
  // ... (giữ nguyên code từ bản gốc)
}

async function createIndexes(client: PoolClient): Promise<void> {
  // ... (giữ nguyên code từ bản gốc)
}

// ==========================================
// EXPORT
// ==========================================
export default {
  runMigrations,
  registerMigration,
  migrations,
};