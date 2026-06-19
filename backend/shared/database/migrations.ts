import { PoolClient } from 'pg';
import { getPool } from './connection';
import { logger } from '../utils/logger';

export async function runMigrations(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await createMigrationsTable(client);
    await createExtensions(client);
    await createCoreTables(client);
    await createBusinessTables(client);
    await createAiTables(client);
    await createAnalyticsTables(client);
    await createRlsPolicies(client);
    await createIndexes(client);

    await client.query('COMMIT');
    logger.info('All migrations completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Migration failed', { error });
    throw error;
  } finally {
    client.release();
  }
}

async function createMigrationsTable(client: PoolClient): Promise<void> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);
}

async function migrationExists(client: PoolClient, name: string): Promise<boolean> {
  const result = await client.query('SELECT 1 FROM _migrations WHERE name = $1', [name]);
  return result.rows.length > 0;
}

async function markMigration(client: PoolClient, name: string): Promise<void> {
  await client.query('INSERT INTO _migrations (name) VALUES ($1) ON CONFLICT DO NOTHING', [name]);
}

async function createExtensions(client: PoolClient): Promise<void> {
  const name = '001_extensions';
  if (await migrationExists(client, name)) return;

  await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);
  await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

  await markMigration(client, name);
  logger.info('Migration: extensions created');
}

async function createCoreTables(client: PoolClient): Promise<void> {
  const name = '002_core_tables';
  if (await migrationExists(client, name)) return;

  // Tenants
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenants (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(255) NOT NULL,
      slug VARCHAR(100) NOT NULL UNIQUE,
      owner_id UUID,
      subscription_plan VARCHAR(20) NOT NULL DEFAULT 'free',
      status VARCHAR(20) NOT NULL DEFAULT 'trial',
      settings JSONB NOT NULL DEFAULT '{}',
      branding JSONB NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Branches
  await client.query(`
    CREATE TABLE IF NOT EXISTS branches (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      address TEXT,
      phone VARCHAR(20),
      email VARCHAR(255),
      working_hours JSONB NOT NULL DEFAULT '{}',
      latitude DECIMAL(10, 8),
      longitude DECIMAL(11, 8),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Users
  await client.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
      firebase_uid VARCHAR(255) UNIQUE,
      email VARCHAR(255) NOT NULL,
      phone VARCHAR(20),
      full_name VARCHAR(255) NOT NULL,
      avatar_url TEXT,
      role VARCHAR(20) NOT NULL DEFAULT 'customer',
      branch_id UUID REFERENCES branches(id),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      permissions TEXT[] DEFAULT '{}',
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Update tenant owner reference
  await client.query(`
    ALTER TABLE tenants DROP CONSTRAINT IF EXISTS tenants_owner_id_fkey;
    ALTER TABLE tenants ADD CONSTRAINT tenants_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE SET NULL
  `);

  await markMigration(client, name);
  logger.info('Migration: core tables created');
}

async function createBusinessTables(client: PoolClient): Promise<void> {
  const name = '003_business_tables';
  if (await migrationExists(client, name)) return;

  // Customers
  await client.query(`
    CREATE TABLE IF NOT EXISTS customers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      full_name VARCHAR(255) NOT NULL,
      phone VARCHAR(20) NOT NULL,
      email VARCHAR(255),
      gender VARCHAR(10),
      date_of_birth DATE,
      avatar_url TEXT,
      skin_type VARCHAR(20),
      skin_concerns TEXT[] DEFAULT '{}',
      allergy_notes TEXT,
      membership_tier VARCHAR(20),
      loyalty_points INTEGER NOT NULL DEFAULT 0,
      total_spent DECIMAL(12, 2) NOT NULL DEFAULT 0,
      visit_count INTEGER NOT NULL DEFAULT 0,
      last_visit_at TIMESTAMPTZ,
      acquisition_source VARCHAR(30),
      tags TEXT[] DEFAULT '{}',
      ai_profile JSONB DEFAULT '{}',
      notes TEXT,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Customer interactions
  await client.query(`
    CREATE TABLE IF NOT EXISTS customer_interactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      staff_id UUID REFERENCES users(id),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Customer skin records
  await client.query(`
    CREATE TABLE IF NOT EXISTS customer_skin_records (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      image_url TEXT NOT NULL,
      analysis_result JSONB,
      notes TEXT,
      recorded_by UUID REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Service categories
  await client.query(`
    CREATE TABLE IF NOT EXISTS service_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      icon VARCHAR(50),
      sort_order INTEGER NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Services
  await client.query(`
    CREATE TABLE IF NOT EXISTS services (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      category_id UUID REFERENCES service_categories(id),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      duration_minutes INTEGER NOT NULL,
      price DECIMAL(12, 2) NOT NULL,
      discount_price DECIMAL(12, 2),
      image_url TEXT,
      procedure_steps JSONB DEFAULT '[]',
      contraindications TEXT[] DEFAULT '{}',
      is_popular BOOLEAN DEFAULT false,
      booking_count INTEGER DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Product categories
  await client.query(`
    CREATE TABLE IF NOT EXISTS product_categories (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      description TEXT,
      icon VARCHAR(50),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Products
  await client.query(`
    CREATE TABLE IF NOT EXISTS products (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      category_id UUID REFERENCES product_categories(id),
      name VARCHAR(255) NOT NULL,
      description TEXT,
      sku VARCHAR(100),
      barcode VARCHAR(100),
      price DECIMAL(12, 2) NOT NULL,
      cost_price DECIMAL(12, 2),
      image_url TEXT,
      images TEXT[] DEFAULT '{}',
      ingredients TEXT[] DEFAULT '{}',
      usage_instructions TEXT,
      volume VARCHAR(50),
      unit VARCHAR(20),
      brand VARCHAR(100),
      is_active BOOLEAN DEFAULT true,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Rooms
  await client.query(`
    CREATE TABLE IF NOT EXISTS rooms (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      name VARCHAR(100) NOT NULL,
      capacity INTEGER DEFAULT 1,
      equipment TEXT[] DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'available',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Equipment
  await client.query(`
    CREATE TABLE IF NOT EXISTS equipment (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(100),
      serial_number VARCHAR(100),
      maintenance_schedule JSONB DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'available',
      last_maintenance_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Staff schedules
  await client.query(`
    CREATE TABLE IF NOT EXISTS staff_schedules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      staff_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
      day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
      start_time TIME NOT NULL,
      end_time TIME NOT NULL,
      is_available BOOLEAN DEFAULT true,
      break_start TIME,
      break_end TIME,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(staff_id, branch_id, day_of_week)
    )
  `);

  // Appointments
  await client.query(`
    CREATE TABLE IF NOT EXISTS appointments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id),
      customer_id UUID NOT NULL REFERENCES customers(id),
      service_id UUID NOT NULL REFERENCES services(id),
      staff_id UUID REFERENCES users(id),
      room_id UUID REFERENCES rooms(id),
      equipment_id UUID REFERENCES equipment(id),
      start_time TIMESTAMPTZ NOT NULL,
      end_time TIMESTAMPTZ NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      notes TEXT,
      source VARCHAR(20) DEFAULT 'app',
      reminder_sent BOOLEAN DEFAULT false,
      confirmed_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      cancellation_reason TEXT,
      total_price DECIMAL(12, 2) NOT NULL DEFAULT 0,
      deposit_amount DECIMAL(12, 2),
      deposit_paid BOOLEAN DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Orders
  await client.query(`
    CREATE TABLE IF NOT EXISTS orders (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id),
      customer_id UUID NOT NULL REFERENCES customers(id),
      staff_id UUID NOT NULL REFERENCES users(id),
      order_number VARCHAR(50) NOT NULL,
      subtotal DECIMAL(12, 2) NOT NULL DEFAULT 0,
      discount_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
      tax_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
      total_amount DECIMAL(12, 2) NOT NULL DEFAULT 0,
      payment_method VARCHAR(20),
      payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      payment_reference VARCHAR(255),
      voucher_id UUID,
      loyalty_points_used INTEGER DEFAULT 0,
      loyalty_points_earned INTEGER DEFAULT 0,
      notes TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Order items
  await client.query(`
    CREATE TABLE IF NOT EXISTS order_items (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      item_type VARCHAR(20) NOT NULL,
      item_id UUID NOT NULL,
      item_name VARCHAR(255) NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price DECIMAL(12, 2) NOT NULL,
      discount DECIMAL(12, 2) NOT NULL DEFAULT 0,
      total DECIMAL(12, 2) NOT NULL,
      notes TEXT
    )
  `);

  // Invoices
  await client.query(`
    CREATE TABLE IF NOT EXISTS invoices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      order_id UUID REFERENCES orders(id),
      customer_id UUID NOT NULL REFERENCES customers(id),
      invoice_number VARCHAR(50) NOT NULL,
      amount DECIMAL(12, 2) NOT NULL,
      tax DECIMAL(12, 2) NOT NULL DEFAULT 0,
      total DECIMAL(12, 2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      due_date DATE NOT NULL,
      paid_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Installments
  await client.query(`
    CREATE TABLE IF NOT EXISTS installments (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      invoice_id UUID NOT NULL REFERENCES invoices(id),
      customer_id UUID NOT NULL REFERENCES customers(id),
      total_amount DECIMAL(12, 2) NOT NULL,
      installment_count INTEGER NOT NULL,
      paid_count INTEGER NOT NULL DEFAULT 0,
      next_due_date DATE NOT NULL,
      amount_per_installment DECIMAL(12, 2) NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Inventory
  await client.query(`
    CREATE TABLE IF NOT EXISTS inventory (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id),
      product_id UUID NOT NULL REFERENCES products(id),
      quantity INTEGER NOT NULL DEFAULT 0,
      min_quantity INTEGER NOT NULL DEFAULT 5,
      max_quantity INTEGER NOT NULL DEFAULT 1000,
      location VARCHAR(100),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(branch_id, product_id)
    )
  `);

  // Inventory transactions
  await client.query(`
    CREATE TABLE IF NOT EXISTS inventory_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id),
      product_id UUID NOT NULL REFERENCES products(id),
      type VARCHAR(20) NOT NULL,
      quantity INTEGER NOT NULL,
      previous_quantity INTEGER NOT NULL,
      new_quantity INTEGER NOT NULL,
      reference_id VARCHAR(255),
      reference_type VARCHAR(50),
      notes TEXT,
      performed_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Membership tiers
  await client.query(`
    CREATE TABLE IF NOT EXISTS membership_tiers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(50) NOT NULL,
      level INTEGER NOT NULL,
      min_points INTEGER NOT NULL DEFAULT 0,
      discount_percentage DECIMAL(5, 2) NOT NULL DEFAULT 0,
      benefits JSONB DEFAULT '[]',
      color VARCHAR(20) NOT NULL DEFAULT '#000000',
      icon VARCHAR(50),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Membership cards
  await client.query(`
    CREATE TABLE IF NOT EXISTS membership_cards (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id),
      tier_id UUID NOT NULL REFERENCES membership_tiers(id),
      card_number VARCHAR(50) NOT NULL UNIQUE,
      points_balance INTEGER NOT NULL DEFAULT 0,
      total_points_earned INTEGER NOT NULL DEFAULT 0,
      activated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Loyalty transactions
  await client.query(`
    CREATE TABLE IF NOT EXISTS loyalty_transactions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id),
      type VARCHAR(20) NOT NULL,
      points INTEGER NOT NULL,
      reference_id VARCHAR(255),
      reference_type VARCHAR(50),
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Vouchers
  await client.query(`
    CREATE TABLE IF NOT EXISTS vouchers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      code VARCHAR(50) NOT NULL,
      type VARCHAR(30) NOT NULL,
      value DECIMAL(12, 2) NOT NULL,
      min_order_amount DECIMAL(12, 2),
      max_uses INTEGER NOT NULL DEFAULT 1,
      used_count INTEGER NOT NULL DEFAULT 0,
      valid_from TIMESTAMPTZ NOT NULL,
      valid_until TIMESTAMPTZ NOT NULL,
      applicable_service_ids UUID[] DEFAULT '{}',
      applicable_product_ids UUID[] DEFAULT '{}',
      applicable_customer_ids UUID[] DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, code)
    )
  `);

  // Customer vouchers
  await client.query(`
    CREATE TABLE IF NOT EXISTS customer_vouchers (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id UUID NOT NULL REFERENCES customers(id),
      voucher_id UUID NOT NULL REFERENCES vouchers(id),
      used_at TIMESTAMPTZ,
      order_id UUID REFERENCES orders(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Notifications
  await client.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      customer_id UUID REFERENCES customers(id),
      type VARCHAR(30) NOT NULL,
      channel VARCHAR(20) NOT NULL DEFAULT 'in_app',
      title VARCHAR(255) NOT NULL,
      body TEXT NOT NULL,
      data JSONB DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      sent_at TIMESTAMPTZ,
      read_at TIMESTAMPTZ,
      scheduled_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Notification templates
  await client.query(`
    CREATE TABLE IF NOT EXISTS notification_templates (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      type VARCHAR(30) NOT NULL,
      channel VARCHAR(20) NOT NULL,
      title_template TEXT NOT NULL,
      body_template TEXT NOT NULL,
      variables TEXT[] DEFAULT '{}',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Campaigns
  await client.query(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(20) NOT NULL DEFAULT 'one_time',
      channel VARCHAR(20) NOT NULL,
      target_segment JSONB NOT NULL DEFAULT '{}',
      content JSONB NOT NULL DEFAULT '{}',
      schedule_at TIMESTAMPTZ,
      sent_at TIMESTAMPTZ,
      status VARCHAR(20) NOT NULL DEFAULT 'draft',
      reach_count INTEGER DEFAULT 0,
      open_count INTEGER DEFAULT 0,
      click_count INTEGER DEFAULT 0,
      conversion_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Automation rules
  await client.query(`
    CREATE TABLE IF NOT EXISTS automation_rules (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      name VARCHAR(255) NOT NULL,
      trigger_event VARCHAR(100) NOT NULL,
      conditions JSONB DEFAULT '[]',
      actions JSONB DEFAULT '[]',
      is_active BOOLEAN DEFAULT true,
      last_triggered_at TIMESTAMPTZ,
      trigger_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Subscription plans (platform-level)
  await client.query(`
    CREATE TABLE IF NOT EXISTS subscription_plans (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      name VARCHAR(100) NOT NULL,
      slug VARCHAR(50) NOT NULL UNIQUE,
      tier VARCHAR(20) NOT NULL,
      monthly_price DECIMAL(10, 2) NOT NULL,
      yearly_price DECIMAL(10, 2) NOT NULL,
      max_branches INTEGER NOT NULL DEFAULT 1,
      max_staff INTEGER NOT NULL DEFAULT 5,
      max_customers INTEGER NOT NULL DEFAULT 100,
      max_products INTEGER NOT NULL DEFAULT 50,
      max_services INTEGER NOT NULL DEFAULT 20,
      storage_gb INTEGER NOT NULL DEFAULT 1,
      features JSONB NOT NULL DEFAULT '{}',
      ai_features JSONB NOT NULL DEFAULT '{}',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Tenant subscriptions
  await client.query(`
    CREATE TABLE IF NOT EXISTS tenant_subscriptions (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      plan_id UUID NOT NULL REFERENCES subscription_plans(id),
      status VARCHAR(20) NOT NULL DEFAULT 'trial',
      current_period_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      current_period_end TIMESTAMPTZ NOT NULL,
      trial_ends_at TIMESTAMPTZ,
      cancelled_at TIMESTAMPTZ,
      billing_cycle VARCHAR(10) NOT NULL DEFAULT 'monthly',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // Platform invoices
  await client.query(`
    CREATE TABLE IF NOT EXISTS platform_invoices (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      subscription_id UUID NOT NULL REFERENCES tenant_subscriptions(id),
      invoice_number VARCHAR(50) NOT NULL UNIQUE,
      amount DECIMAL(10, 2) NOT NULL,
      currency VARCHAR(3) NOT NULL DEFAULT 'VND',
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      due_date DATE NOT NULL,
      paid_at TIMESTAMPTZ,
      payment_method VARCHAR(30),
      description TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await markMigration(client, name);
  logger.info('Migration: business tables created');
}

async function createAiTables(client: PoolClient): Promise<void> {
  const name = '004_ai_tables';
  if (await migrationExists(client, name)) return;

  // AI knowledge documents
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      title VARCHAR(255) NOT NULL,
      type VARCHAR(20) NOT NULL,
      file_url TEXT,
      content_text TEXT,
      chunk_count INTEGER DEFAULT 0,
      embedding_status VARCHAR(20) NOT NULL DEFAULT 'pending',
      uploaded_by UUID NOT NULL REFERENCES users(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // AI knowledge chunks
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      document_id UUID NOT NULL REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      content TEXT NOT NULL,
      embedding_id VARCHAR(255),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // AI conversations
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_conversations (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      customer_id UUID REFERENCES customers(id),
      user_id UUID REFERENCES users(id),
      session_id VARCHAR(255) NOT NULL,
      context_type VARCHAR(30) NOT NULL DEFAULT 'customer_chat',
      started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      ended_at TIMESTAMPTZ,
      message_count INTEGER DEFAULT 0,
      tokens_used INTEGER DEFAULT 0,
      satisfaction_score INTEGER,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // AI messages
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_messages (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      conversation_id UUID NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
      role VARCHAR(20) NOT NULL,
      content TEXT NOT NULL,
      tokens_used INTEGER DEFAULT 0,
      model_used VARCHAR(50),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  // AI product knowledge
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_product_knowledge (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      enhanced_description TEXT,
      benefits_summary TEXT,
      usage_guide TEXT,
      faq JSONB DEFAULT '[]',
      embedding_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, product_id)
    )
  `);

  // AI service knowledge
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_service_knowledge (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
      enhanced_description TEXT,
      procedure_detail TEXT,
      aftercare_guide TEXT,
      faq JSONB DEFAULT '[]',
      embedding_id VARCHAR(255),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, service_id)
    )
  `);

  // AI usage tracking
  await client.query(`
    CREATE TABLE IF NOT EXISTS ai_usage (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      tokens_used INTEGER NOT NULL DEFAULT 0,
      conversations INTEGER NOT NULL DEFAULT 0,
      messages INTEGER NOT NULL DEFAULT 0,
      tokens_by_model JSONB DEFAULT '{}',
      tokens_by_feature JSONB DEFAULT '{}',
      estimated_cost DECIMAL(10, 4) DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, date)
    )
  `);

  await markMigration(client, name);
  logger.info('Migration: AI tables created');
}

async function createAnalyticsTables(client: PoolClient): Promise<void> {
  const name = '005_analytics_tables';
  if (await migrationExists(client, name)) return;

  // Daily metrics
  await client.query(`
    CREATE TABLE IF NOT EXISTS daily_metrics (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      branch_id UUID NOT NULL REFERENCES branches(id),
      date DATE NOT NULL,
      revenue DECIMAL(12, 2) NOT NULL DEFAULT 0,
      order_count INTEGER NOT NULL DEFAULT 0,
      new_customers INTEGER NOT NULL DEFAULT 0,
      returning_customers INTEGER NOT NULL DEFAULT 0,
      avg_ticket DECIMAL(12, 2) NOT NULL DEFAULT 0,
      top_services JSONB DEFAULT '[]',
      top_products JSONB DEFAULT '[]',
      staff_performance JSONB DEFAULT '[]',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(tenant_id, branch_id, date)
    )
  `);

  // Audit logs
  await client.query(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
      tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
      user_id UUID REFERENCES users(id),
      action VARCHAR(100) NOT NULL,
      entity_type VARCHAR(50) NOT NULL,
      entity_id UUID,
      old_values JSONB,
      new_values JSONB,
      ip_address INET,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await markMigration(client, name);
  logger.info('Migration: analytics tables created');
}

async function createRlsPolicies(client: PoolClient): Promise<void> {
  const name = '006_rls_policies';
  if (await migrationExists(client, name)) return;

  const tenantTables = [
    'branches', 'customers', 'customer_interactions', 'customer_skin_records',
    'service_categories', 'services', 'product_categories', 'products',
    'rooms', 'equipment', 'staff_schedules', 'appointments', 'orders',
    'invoices', 'installments', 'inventory', 'inventory_transactions',
    'membership_tiers', 'membership_cards', 'loyalty_transactions',
    'vouchers', 'customer_vouchers', 'notifications', 'notification_templates',
    'campaigns', 'automation_rules', 'ai_knowledge_documents',
    'ai_knowledge_chunks', 'ai_conversations', 'ai_product_knowledge',
    'ai_service_knowledge', 'ai_usage', 'daily_metrics', 'audit_logs',
  ];

  for (const table of tenantTables) {
    await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`);

    await client.query(`
      DROP POLICY IF EXISTS tenant_isolation_${table} ON ${table};
      CREATE POLICY tenant_isolation_${table} ON ${table}
        USING (tenant_id = current_setting('app.current_tenant', true)::uuid)
        WITH CHECK (tenant_id = current_setting('app.current_tenant', true)::uuid)
    `);
  }

  // Users table has optional tenant_id (super_admin has null)
  await client.query(`ALTER TABLE users ENABLE ROW LEVEL SECURITY`);
  await client.query(`
    DROP POLICY IF EXISTS tenant_isolation_users ON users;
    CREATE POLICY tenant_isolation_users ON users
      USING (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
      )
      WITH CHECK (
        tenant_id IS NULL
        OR tenant_id = current_setting('app.current_tenant', true)::uuid
      )
  `);

  await markMigration(client, name);
  logger.info('Migration: RLS policies created');
}

async function createIndexes(client: PoolClient): Promise<void> {
  const name = '007_indexes';
  if (await migrationExists(client, name)) return;

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_branches_tenant ON branches(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)',
    'CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid)',
    'CREATE INDEX IF NOT EXISTS idx_customers_tenant ON customers(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(tenant_id, phone)',
    'CREATE INDEX IF NOT EXISTS idx_customers_email ON customers(tenant_id, email)',
    'CREATE INDEX IF NOT EXISTS idx_customers_membership ON customers(tenant_id, membership_tier)',
    'CREATE INDEX IF NOT EXISTS idx_customer_interactions_customer ON customer_interactions(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_services_tenant ON services(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id)',
    'CREATE INDEX IF NOT EXISTS idx_products_tenant ON products(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_products_sku ON products(tenant_id, sku)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_tenant ON appointments(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_customer ON appointments(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_staff ON appointments(staff_id)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_time ON appointments(tenant_id, start_time)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(tenant_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_orders_tenant ON orders(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number)',
    'CREATE INDEX IF NOT EXISTS idx_inventory_branch_product ON inventory(branch_id, product_id)',
    'CREATE INDEX IF NOT EXISTS idx_inventory_transactions_product ON inventory_transactions(product_id)',
    'CREATE INDEX IF NOT EXISTS idx_membership_cards_customer ON membership_cards(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_loyalty_transactions_customer ON loyalty_transactions(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_vouchers_code ON vouchers(tenant_id, code)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_notifications_status ON notifications(tenant_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_ai_conversations_customer ON ai_conversations(customer_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON ai_messages(conversation_id)',
    'CREATE INDEX IF NOT EXISTS idx_ai_knowledge_chunks_document ON ai_knowledge_chunks(document_id)',
    'CREATE INDEX IF NOT EXISTS idx_daily_metrics_date ON daily_metrics(tenant_id, date)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant ON audit_logs(tenant_id)',
    'CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id)',
  ];

  for (const idx of indexes) {
    await client.query(idx);
  }

  await markMigration(client, name);
  logger.info('Migration: indexes created');
}
