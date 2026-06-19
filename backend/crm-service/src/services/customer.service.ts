import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { query } from '../../../shared/database/connection';
import { CreateCustomerDto, UpdateCustomerDto, Customer } from '../../../shared/types/customer';
import { PaginationParams, PaginatedResponse } from '../../../shared/types/common';
import { NotFoundError, ConflictError } from '../../../shared/utils/errors';
import { rowToCamelCase, rowsToCamelCase } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('crm-service');

export class CustomerService {
  constructor(private eventBus: EventBus) {}

  async create(tenantId: string, dto: CreateCustomerDto, createdBy?: string): Promise<Customer> {
    return withTenantContext(tenantId, async (client) => {
      // Check duplicate phone
      const existing = await client.query(
        'SELECT id FROM customers WHERE tenant_id = $1 AND phone = $2',
        [tenantId, dto.phone],
      );
      if (existing.rows.length > 0) {
        throw new ConflictError('Customer with this phone number already exists');
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO customers (id, tenant_id, full_name, phone, email, gender, date_of_birth,
          skin_type, skin_concerns, allergy_notes, acquisition_source, tags, notes, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'active')
         RETURNING *`,
        [
          id, tenantId, dto.fullName, dto.phone, dto.email, dto.gender,
          dto.dateOfBirth, dto.skinType, dto.skinConcerns || [],
          dto.allergyNotes, dto.acquisitionSource, dto.tags || [], dto.notes,
        ],
      );

      const customer = rowToCamelCase<Customer>(result.rows[0]);

      await this.eventBus.publish(EventType.CUSTOMER_CREATED, tenantId, {
        customerId: id,
        fullName: dto.fullName,
        phone: dto.phone,
      }, createdBy);

      logger.info('Customer created', { tenantId, customerId: id });
      return customer;
    });
  }

  async getById(tenantId: string, customerId: string): Promise<Customer> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
        [customerId, tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      return rowToCamelCase<Customer>(result.rows[0]);
    });
  }

  async list(tenantId: string, params: PaginationParams & {
    search?: string;
    membershipTier?: string;
    status?: string;
    tags?: string[];
  }): Promise<PaginatedResponse<Customer>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.search) {
        conditions.push(`(full_name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
        values.push(`%${params.search}%`);
        paramIndex++;
      }

      if (params.membershipTier) {
        conditions.push(`membership_tier = $${paramIndex}`);
        values.push(params.membershipTier);
        paramIndex++;
      }

      if (params.status) {
        conditions.push(`status = $${paramIndex}`);
        values.push(params.status);
        paramIndex++;
      }

      if (params.tags && params.tags.length > 0) {
        conditions.push(`tags && $${paramIndex}`);
        values.push(params.tags);
        paramIndex++;
      }

      const where = conditions.join(' AND ');
      const sortBy = params.sortBy || 'created_at';
      const sortOrder = params.sortOrder || 'desc';
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(`SELECT COUNT(*) FROM customers WHERE ${where}`, values);
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT * FROM customers WHERE ${where}
         ORDER BY ${sortBy} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<Customer>(dataResult.rows),
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit),
        },
      };
    });
  }

  async update(tenantId: string, customerId: string, dto: UpdateCustomerDto): Promise<Customer> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2',
        [customerId, tenantId],
      );

      if (existing.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const updateFields: Record<string, unknown> = {
        full_name: dto.fullName,
        phone: dto.phone,
        email: dto.email,
        gender: dto.gender,
        date_of_birth: dto.dateOfBirth,
        avatar_url: dto.avatarUrl,
        skin_type: dto.skinType,
        skin_concerns: dto.skinConcerns,
        allergy_notes: dto.allergyNotes,
        tags: dto.tags,
        notes: dto.notes,
      };

      for (const [field, value] of Object.entries(updateFields)) {
        if (value !== undefined) {
          fields.push(`${field} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      }

      if (fields.length === 0) {
        return rowToCamelCase<Customer>(existing.rows[0]);
      }

      fields.push('updated_at = NOW()');

      const result = await client.query(
        `UPDATE customers SET ${fields.join(', ')} WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1} RETURNING *`,
        [...values, customerId, tenantId],
      );

      await this.eventBus.publish(EventType.CUSTOMER_UPDATED, tenantId, { customerId });

      return rowToCamelCase<Customer>(result.rows[0]);
    });
  }

  async getHistory(tenantId: string, customerId: string): Promise<Record<string, unknown>> {
    return withTenantContext(tenantId, async (client) => {
      // Get service history
      const servicesResult = await client.query(
        `SELECT a.*, s.name as service_name, u.full_name as staff_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         LEFT JOIN users u ON u.id = a.staff_id
         WHERE a.customer_id = $1 AND a.tenant_id = $2
         ORDER BY a.start_time DESC LIMIT 50`,
        [customerId, tenantId],
      );

      // Get purchase history
      const ordersResult = await client.query(
        `SELECT o.*, json_agg(oi.*) as items
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.customer_id = $1 AND o.tenant_id = $2
         GROUP BY o.id
         ORDER BY o.created_at DESC LIMIT 50`,
        [customerId, tenantId],
      );

      // Get interactions
      const interactionsResult = await client.query(
        `SELECT * FROM customer_interactions
         WHERE customer_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 100`,
        [customerId, tenantId],
      );

      // Get skin records
      const skinRecordsResult = await client.query(
        `SELECT * FROM customer_skin_records
         WHERE customer_id = $1 AND tenant_id = $2
         ORDER BY created_at DESC LIMIT 20`,
        [customerId, tenantId],
      );

      return {
        services: rowsToCamelCase(servicesResult.rows),
        orders: rowsToCamelCase(ordersResult.rows),
        interactions: rowsToCamelCase(interactionsResult.rows),
        skinRecords: rowsToCamelCase(skinRecordsResult.rows),
      };
    });
  }

  async getSegments(tenantId: string): Promise<Record<string, unknown>> {
    return withTenantContext(tenantId, async (client) => {
      // VIP customers (top 10% by spend)
      const vipResult = await client.query(
        `SELECT * FROM customers
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY total_spent DESC
         LIMIT (SELECT GREATEST(1, COUNT(*) / 10) FROM customers WHERE tenant_id = $1)`,
        [tenantId],
      );

      // Dormant (no visit in 60+ days)
      const dormantResult = await client.query(
        `SELECT * FROM customers
         WHERE tenant_id = $1 AND status = 'active'
           AND (last_visit_at < NOW() - INTERVAL '60 days' OR last_visit_at IS NULL)
         ORDER BY last_visit_at ASC NULLS FIRST`,
        [tenantId],
      );

      // At-risk (visited 3+ times but no visit in 30-60 days)
      const atRiskResult = await client.query(
        `SELECT * FROM customers
         WHERE tenant_id = $1 AND status = 'active'
           AND visit_count >= 3
           AND last_visit_at < NOW() - INTERVAL '30 days'
           AND last_visit_at >= NOW() - INTERVAL '60 days'
         ORDER BY total_spent DESC`,
        [tenantId],
      );

      // New this month
      const newResult = await client.query(
        `SELECT * FROM customers
         WHERE tenant_id = $1
           AND created_at >= date_trunc('month', NOW())
         ORDER BY created_at DESC`,
        [tenantId],
      );

      return {
        vip: rowsToCamelCase(vipResult.rows),
        dormant: rowsToCamelCase(dormantResult.rows),
        atRisk: rowsToCamelCase(atRiskResult.rows),
        newThisMonth: rowsToCamelCase(newResult.rows),
      };
    });
  }

  async addInteraction(
    tenantId: string,
    customerId: string,
    type: string,
    channel: string,
    content: string,
    staffId?: string,
  ): Promise<void> {
    await withTenantContext(tenantId, async (client) => {
      await client.query(
        `INSERT INTO customer_interactions (tenant_id, customer_id, type, channel, content, staff_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, customerId, type, channel, content, staffId],
      );
    });
  }

  async addSkinRecord(
    tenantId: string,
    customerId: string,
    imageUrl: string,
    analysisResult: Record<string, unknown> | null,
    notes: string | null,
    recordedBy: string | null,
  ): Promise<void> {
    await withTenantContext(tenantId, async (client) => {
      await client.query(
        `INSERT INTO customer_skin_records (tenant_id, customer_id, image_url, analysis_result, notes, recorded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [tenantId, customerId, imageUrl, analysisResult ? JSON.stringify(analysisResult) : null, notes, recordedBy],
      );
    });
  }
}
