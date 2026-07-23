import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { query } from '../../../shared/database/connection';
import {
  CreateCustomerDto,
  UpdateCustomerDto,
  Customer,
  CustomerInteraction,
  CustomerSkinRecord,
  CustomerNote,
} from '../../../shared/types/customer';
import { PaginationParams, PaginatedResponse } from '../../../shared/types/common';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
  BusinessError,
} from '../../../shared/utils/errors';
import {
  rowToCamelCase,
  rowsToCamelCase,
  isValidVietnamesePhone,
} from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('crm-service');

// ==========================================
// INTERFACE
// ==========================================
interface CustomerWithDetails extends Customer {
  membershipName?: string;
  nextTier?: string;
  pointsToNextTier?: number;
}

interface CustomerHistory {
  appointments: any[];
  orders: any[];
  interactions: CustomerInteraction[];
  skinRecords: CustomerSkinRecord[];
  notes: CustomerNote[];
  loyaltyTransactions: any[];
}

interface CustomerStats {
  total: number;
  active: number;
  newThisMonth: number;
  vip: number;
  dormant: number;
  atRisk: number;
  averageSpent: number;
  totalRevenue: number;
  topCustomers: Customer[];
}

// ==========================================
// CUSTOMER SERVICE
// ==========================================
export class CustomerService {
  constructor(private eventBus: EventBus) {}

  // ==========================================
  // 1. TẠO KHÁCH HÀNG
  // ==========================================
  async create(tenantId: string, dto: CreateCustomerDto, createdBy?: string): Promise<Customer> {
    return withTenantContext(tenantId, async (client) => {
      // Validate phone
      if (dto.phone && !isValidVietnamesePhone(dto.phone)) {
        throw new ValidationError('Invalid Vietnamese phone number');
      }

      // Check duplicate phone
      if (dto.phone) {
        const existing = await client.query(
          'SELECT id FROM customers WHERE tenant_id = $1 AND phone = $2 AND status != $3',
          [tenantId, dto.phone, 'deleted'],
        );
        if (existing.rows.length > 0) {
          throw new ConflictError('Customer with this phone number already exists');
        }
      }

      // Check duplicate email
      if (dto.email) {
        const existing = await client.query(
          'SELECT id FROM customers WHERE tenant_id = $1 AND email = $2 AND status != $3',
          [tenantId, dto.email, 'deleted'],
        );
        if (existing.rows.length > 0) {
          throw new ConflictError('Customer with this email already exists');
        }
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO customers (
          id, tenant_id, full_name, phone, email, gender, date_of_birth,
          avatar_url, skin_type, skin_concerns, allergy_notes,
          acquisition_source, tags, notes, status, membership_tier,
          created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, 'active', $15, $16, NOW(), NOW())
        RETURNING *`,
        [
          id,
          tenantId,
          dto.fullName,
          dto.phone,
          dto.email || null,
          dto.gender || null,
          dto.dateOfBirth || null,
          dto.avatarUrl || null,
          dto.skinType || null,
          dto.skinConcerns || [],
          dto.allergyNotes || null,
          dto.acquisitionSource || 'walk_in',
          dto.tags || [],
          dto.notes || null,
          dto.membershipTier || 'silver',
          createdBy || null,
        ],
      );

      const customer = rowToCamelCase<Customer>(result.rows[0]);

      // Publish event
      await this.eventBus.publish(EventType.CUSTOMER_CREATED, tenantId, {
        customerId: id,
        fullName: dto.fullName,
        phone: dto.phone,
        email: dto.email,
      }, createdBy);

      logger.info('Customer created', {
        tenantId,
        customerId: id,
        fullName: dto.fullName,
        phone: dto.phone,
      });

      return customer;
    });
  }

  // ==========================================
  // 2. LẤY CHI TIẾT KHÁCH HÀNG
  // ==========================================
  async getById(tenantId: string, customerId: string): Promise<CustomerWithDetails> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT c.*,
                mt.name as membership_name,
                LEAD(mt.name) OVER (ORDER BY mt.level) as next_tier,
                LEAD(mt.min_points) OVER (ORDER BY mt.level) - c.loyalty_points as points_to_next_tier
         FROM customers c
         LEFT JOIN membership_tiers mt ON mt.tenant_id = c.tenant_id AND mt.level = c.membership_tier
         WHERE c.id = $1 AND c.tenant_id = $2 AND c.status != $3`,
        [customerId, tenantId, 'deleted'],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      return rowToCamelCase<CustomerWithDetails>(result.rows[0]);
    });
  }

  // ==========================================
  // 3. LẤY KHÁCH HÀNG THEO USER ID
  // ==========================================
  async getByUserId(tenantId: string, userId: string): Promise<Customer | null> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT * FROM customers WHERE tenant_id = $1 AND user_id = $2 AND status != $3',
        [tenantId, userId, 'deleted'],
      );
      if (result.rows.length === 0) return null;
      return rowToCamelCase<Customer>(result.rows[0]);
    });
  }

  // ==========================================
  // 4. CẬP NHẬT THEO USER ID (SELF-SERVICE)
  // ==========================================
  async updateByUserId(tenantId: string, userId: string, dto: UpdateCustomerDto): Promise<Customer> {
    const customer = await this.getByUserId(tenantId, userId);
    if (!customer) {
      throw new NotFoundError('Customer profile for user', userId);
    }
    return this.update(tenantId, customer.id, dto);
  }

  // ==========================================
  // 5. DANH SÁCH KHÁCH HÀNG (PHÂN TRANG + LỌC)
  // ==========================================
  async list(
    tenantId: string,
    params: PaginationParams & {
      search?: string;
      membershipTier?: string;
      status?: string;
      skinType?: string;
      acquisitionSource?: string;
      hasMembership?: boolean;
      minSpent?: number;
      maxSpent?: number;
      startDate?: string;
      endDate?: string;
      tags?: string[];
    },
  ): Promise<PaginatedResponse<Customer>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['tenant_id = $1', "status != 'deleted'"];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.search) {
        conditions.push(
          `(full_name ILIKE $${paramIndex} OR phone ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`,
        );
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

      if (params.skinType) {
        conditions.push(`skin_type = $${paramIndex}`);
        values.push(params.skinType);
        paramIndex++;
      }

      if (params.acquisitionSource) {
        conditions.push(`acquisition_source = $${paramIndex}`);
        values.push(params.acquisitionSource);
        paramIndex++;
      }

      if (params.hasMembership !== undefined) {
        if (params.hasMembership) {
          conditions.push(`membership_tier IS NOT NULL`);
        } else {
          conditions.push(`membership_tier IS NULL`);
        }
      }

      if (params.minSpent !== undefined) {
        conditions.push(`total_spent >= $${paramIndex}`);
        values.push(params.minSpent);
        paramIndex++;
      }

      if (params.maxSpent !== undefined) {
        conditions.push(`total_spent <= $${paramIndex}`);
        values.push(params.maxSpent);
        paramIndex++;
      }

      if (params.startDate) {
        conditions.push(`DATE(created_at) >= $${paramIndex}`);
        values.push(params.startDate);
        paramIndex++;
      }

      if (params.endDate) {
        conditions.push(`DATE(created_at) <= $${paramIndex}`);
        values.push(params.endDate);
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

      const countResult = await client.query(
        `SELECT COUNT(*) FROM customers WHERE ${where}`,
        values,
      );
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

  // ==========================================
  // 6. CẬP NHẬT KHÁCH HÀNG
  // ==========================================
  async update(tenantId: string, customerId: string, dto: UpdateCustomerDto): Promise<Customer> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM customers WHERE id = $1 AND tenant_id = $2 AND status != $3',
        [customerId, tenantId, 'deleted'],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      // Validate phone if changed
      if (dto.phone) {
        if (!isValidVietnamesePhone(dto.phone)) {
          throw new ValidationError('Invalid Vietnamese phone number');
        }
        const duplicate = await client.query(
          'SELECT id FROM customers WHERE tenant_id = $1 AND phone = $2 AND id != $3 AND status != $4',
          [tenantId, dto.phone, customerId, 'deleted'],
        );
        if (duplicate.rows.length > 0) {
          throw new ConflictError('Phone number already used by another customer');
        }
      }

      // Validate email if changed
      if (dto.email) {
        const duplicate = await client.query(
          'SELECT id FROM customers WHERE tenant_id = $1 AND email = $2 AND id != $3 AND status != $4',
          [tenantId, dto.email, customerId, 'deleted'],
        );
        if (duplicate.rows.length > 0) {
          throw new ConflictError('Email already used by another customer');
        }
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
        acquisition_source: dto.acquisitionSource,
        tags: dto.tags,
        notes: dto.notes,
        status: dto.status,
        preferred_staff_id: dto.preferredStaffId,
        preferred_time_slot: dto.preferredTimeSlot,
        address: dto.address,
        city: dto.city,
        district: dto.district,
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

      values.push(customerId, tenantId);
      const result = await client.query(
        `UPDATE customers SET ${fields.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        [...values, customerId, tenantId],
      );

      await this.eventBus.publish(EventType.CUSTOMER_UPDATED, tenantId, {
        customerId,
        updatedFields: Object.keys(dto),
      });

      logger.info('Customer updated', {
        tenantId,
        customerId,
        updatedFields: Object.keys(dto),
      });

      return rowToCamelCase<Customer>(result.rows[0]);
    });
  }

  // ==========================================
  // 7. XÓA KHÁCH HÀNG (SOFT DELETE)
  // ==========================================
  async delete(tenantId: string, customerId: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2 AND status != $3',
        [customerId, tenantId, 'deleted'],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      await client.query(
        `UPDATE customers SET status = 'deleted', deleted_at = NOW(), updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [customerId, tenantId],
      );

      logger.info('Customer deleted', { tenantId, customerId });
    });
  }

  // ==========================================
  // 8. LẤY LỊCH SỬ KHÁCH HÀNG
  // ==========================================
  async getHistory(tenantId: string, customerId: string): Promise<CustomerHistory> {
    return withTenantContext(tenantId, async (client) => {
      // Check customer exists
      const customerCheck = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
        [customerId, tenantId],
      );
      if (customerCheck.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      // Appointments
      const appointmentsResult = await client.query(
        `SELECT a.*, s.name as service_name, u.full_name as staff_name,
                b.name as branch_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN branches b ON b.id = a.branch_id
         WHERE a.customer_id = $1 AND a.tenant_id = $2
         ORDER BY a.start_time DESC LIMIT 50`,
        [customerId, tenantId],
      );

      // Orders
      const ordersResult = await client.query(
        `SELECT o.*, json_agg(oi.*) as items
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.customer_id = $1 AND o.tenant_id = $2
         GROUP BY o.id
         ORDER BY o.created_at DESC LIMIT 50`,
        [customerId, tenantId],
      );

      // Interactions
      const interactionsResult = await client.query(
        `SELECT i.*, u.full_name as staff_name
         FROM customer_interactions i
         LEFT JOIN users u ON u.id = i.staff_id
         WHERE i.customer_id = $1 AND i.tenant_id = $2
         ORDER BY i.created_at DESC LIMIT 100`,
        [customerId, tenantId],
      );

      // Skin records
      const skinRecordsResult = await client.query(
        `SELECT sr.*, u.full_name as recorded_by_name
         FROM customer_skin_records sr
         LEFT JOIN users u ON u.id = sr.recorded_by
         WHERE sr.customer_id = $1 AND sr.tenant_id = $2
         ORDER BY sr.created_at DESC LIMIT 20`,
        [customerId, tenantId],
      );

      // Notes
      const notesResult = await client.query(
        `SELECT n.*, u.full_name as author_name
         FROM customer_notes n
         LEFT JOIN users u ON u.id = n.author_id
         WHERE n.customer_id = $1 AND n.tenant_id = $2
         ORDER BY n.created_at DESC LIMIT 50`,
        [customerId, tenantId],
      );

      // Loyalty transactions
      const loyaltyResult = await client.query(
        `SELECT l.* FROM loyalty_transactions l
         WHERE l.customer_id = $1 AND l.tenant_id = $2
         ORDER BY l.created_at DESC LIMIT 50`,
        [customerId, tenantId],
      );

      return {
        appointments: rowsToCamelCase(appointmentsResult.rows),
        orders: rowsToCamelCase(ordersResult.rows),
        interactions: rowsToCamelCase(interactionsResult.rows),
        skinRecords: rowsToCamelCase(skinRecordsResult.rows),
        notes: rowsToCamelCase(notesResult.rows),
        loyaltyTransactions: rowsToCamelCase(loyaltyResult.rows),
      };
    });
  }

  // ==========================================
  // 9. PHÂN KHÚC KHÁCH HÀNG
  // ==========================================
  async getSegments(tenantId: string): Promise<Record<string, unknown>> {
    return withTenantContext(tenantId, async (client) => {
      // VIP (top 10% by spend)
      const vipResult = await client.query(
        `SELECT * FROM customers
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY total_spent DESC
         LIMIT (SELECT GREATEST(1, COUNT(*) / 10) FROM customers WHERE tenant_id = $1 AND status = 'active')`,
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
           AND status = 'active'
         ORDER BY created_at DESC`,
        [tenantId],
      );

      // High potential (high spend but low visit count)
      const highPotentialResult = await client.query(
        `SELECT * FROM customers
         WHERE tenant_id = $1 AND status = 'active'
           AND total_spent > (SELECT AVG(total_spent) FROM customers WHERE tenant_id = $1 AND status = 'active')
           AND visit_count < 3
         ORDER BY total_spent DESC`,
        [tenantId],
      );

      return {
        vip: rowsToCamelCase(vipResult.rows),
        dormant: rowsToCamelCase(dormantResult.rows),
        atRisk: rowsToCamelCase(atRiskResult.rows),
        newThisMonth: rowsToCamelCase(newResult.rows),
        highPotential: rowsToCamelCase(highPotentialResult.rows),
        counts: {
          vip: vipResult.rows.length,
          dormant: dormantResult.rows.length,
          atRisk: atRiskResult.rows.length,
          newThisMonth: newResult.rows.length,
          highPotential: highPotentialResult.rows.length,
        },
      };
    });
  }

  // ==========================================
  // 10. THỐNG KÊ
  // ==========================================
  async getStats(tenantId: string): Promise<CustomerStats> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE status = 'active') as active,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) as new_this_month,
           COUNT(*) FILTER (WHERE total_spent > (SELECT AVG(total_spent) FROM customers WHERE tenant_id = $1 AND status = 'active')) as vip,
           COUNT(*) FILTER (WHERE last_visit_at < NOW() - INTERVAL '60 days' OR last_visit_at IS NULL) as dormant,
           COUNT(*) FILTER (WHERE visit_count >= 3 AND last_visit_at < NOW() - INTERVAL '30 days' AND last_visit_at >= NOW() - INTERVAL '60 days') as at_risk,
           COALESCE(AVG(total_spent), 0) as average_spent,
           COALESCE(SUM(total_spent), 0) as total_revenue
         FROM customers
         WHERE tenant_id = $1 AND status != 'deleted'`,
        [tenantId],
      );

      const stats = result.rows[0];

      // Top 5 customers
      const topResult = await client.query(
        `SELECT * FROM customers
         WHERE tenant_id = $1 AND status = 'active'
         ORDER BY total_spent DESC
         LIMIT 5`,
        [tenantId],
      );

      return {
        total: parseInt(stats.total, 10),
        active: parseInt(stats.active, 10),
        newThisMonth: parseInt(stats.new_this_month, 10),
        vip: parseInt(stats.vip, 10),
        dormant: parseInt(stats.dormant, 10),
        atRisk: parseInt(stats.at_risk, 10),
        averageSpent: parseFloat(stats.average_spent),
        totalRevenue: parseFloat(stats.total_revenue),
        topCustomers: rowsToCamelCase<Customer>(topResult.rows),
      };
    });
  }

  // ==========================================
  // 11. GHI NHẬN TƯƠNG TÁC
  // ==========================================
  async addInteraction(
    tenantId: string,
    customerId: string,
    type: string,
    channel: string,
    content: string,
    staffId?: string,
    tags?: string[],
    rating?: number,
  ): Promise<CustomerInteraction> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
        [customerId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO customer_interactions (
          id, tenant_id, customer_id, type, channel, content,
          staff_id, tags, rating, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *`,
        [id, tenantId, customerId, type, channel, content, staffId, tags || [], rating || null],
      );

      // Update customer last interaction
      await client.query(
        `UPDATE customers SET last_interaction_at = NOW(), updated_at = NOW()
         WHERE id = $1`,
        [customerId],
      );

      logger.info('Interaction recorded', {
        tenantId,
        customerId,
        interactionId: id,
        type,
        channel,
      });

      return rowToCamelCase<CustomerInteraction>(result.rows[0]);
    });
  }

  // ==========================================
  // 12. LẤY DANH SÁCH TƯƠNG TÁC
  // ==========================================
  async getInteractions(tenantId: string, customerId: string): Promise<CustomerInteraction[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT i.*, u.full_name as staff_name
         FROM customer_interactions i
         LEFT JOIN users u ON u.id = i.staff_id
         WHERE i.customer_id = $1 AND i.tenant_id = $2
         ORDER BY i.created_at DESC`,
        [customerId, tenantId],
      );
      return rowsToCamelCase<CustomerInteraction>(result.rows);
    });
  }

  // ==========================================
  // 13. GHI NHẬN HỒ SƠ DA
  // ==========================================
  async addSkinRecord(
    tenantId: string,
    customerId: string,
    imageUrl?: string,
    analysisResult?: Record<string, unknown>,
    notes?: string,
    recordedBy?: string | null,
    temperature?: number,
    humidity?: number,
  ): Promise<CustomerSkinRecord> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
        [customerId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO customer_skin_records (
          id, tenant_id, customer_id, image_url, analysis_result, notes,
          recorded_by, temperature, humidity, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *`,
        [
          id,
          tenantId,
          customerId,
          imageUrl || null,
          analysisResult ? JSON.stringify(analysisResult) : null,
          notes || null,
          recordedBy || null,
          temperature || null,
          humidity || null,
        ],
      );

      logger.info('Skin record added', {
        tenantId,
        customerId,
        recordId: id,
        hasImage: !!imageUrl,
      });

      return rowToCamelCase<CustomerSkinRecord>(result.rows[0]);
    });
  }

  // ==========================================
  // 14. LẤY DANH SÁCH HỒ SƠ DA
  // ==========================================
  async getSkinRecords(tenantId: string, customerId: string): Promise<CustomerSkinRecord[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT sr.*, u.full_name as recorded_by_name
         FROM customer_skin_records sr
         LEFT JOIN users u ON u.id = sr.recorded_by
         WHERE sr.customer_id = $1 AND sr.tenant_id = $2
         ORDER BY sr.created_at DESC`,
        [customerId, tenantId],
      );
      return rowsToCamelCase<CustomerSkinRecord>(result.rows);
    });
  }

  // ==========================================
  // 15. THÊM GHI CHÚ
  // ==========================================
  async addNote(
    tenantId: string,
    customerId: string,
    content: string,
    type: string = 'general',
    authorId?: string,
  ): Promise<CustomerNote> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
        [customerId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO customer_notes (id, tenant_id, customer_id, content, type, author_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())
         RETURNING *`,
        [id, tenantId, customerId, content, type, authorId || null],
      );

      logger.info('Note added', {
        tenantId,
        customerId,
        noteId: id,
        type,
      });

      return rowToCamelCase<CustomerNote>(result.rows[0]);
    });
  }

  // ==========================================
  // 16. LẤY DANH SÁCH GHI CHÚ
  // ==========================================
  async getNotes(tenantId: string, customerId: string): Promise<CustomerNote[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT n.*, u.full_name as author_name
         FROM customer_notes n
         LEFT JOIN users u ON u.id = n.author_id
         WHERE n.customer_id = $1 AND n.tenant_id = $2
         ORDER BY n.created_at DESC`,
        [customerId, tenantId],
      );
      return rowsToCamelCase<CustomerNote>(result.rows);
    });
  }

  // ==========================================
  // 17. HÀNH ĐỘNG HÀNG LOẠT
  // ==========================================
  async bulkAction(
    tenantId: string,
    action: string,
    customerIds: string[],
    data?: Record<string, any>,
  ): Promise<{ success: boolean; count: number; message: string }> {
    return withTenantContext(tenantId, async (client) => {
      let count = 0;

      switch (action) {
        case 'assign_tag':
          if (!data?.tag) throw new ValidationError('Tag is required');
          for (const id of customerIds) {
            await client.query(
              `UPDATE customers
               SET tags = array_append(tags, $1), updated_at = NOW()
               WHERE id = $2 AND tenant_id = $3 AND NOT ($1 = ANY(tags))`,
              [data.tag, id, tenantId],
            );
            count++;
          }
          break;

        case 'remove_tag':
          if (!data?.tag) throw new ValidationError('Tag is required');
          for (const id of customerIds) {
            await client.query(
              `UPDATE customers
               SET tags = array_remove(tags, $1), updated_at = NOW()
               WHERE id = $2 AND tenant_id = $3`,
              [data.tag, id, tenantId],
            );
            count++;
          }
          break;

        case 'block':
          for (const id of customerIds) {
            await client.query(
              `UPDATE customers SET status = 'blocked', updated_at = NOW()
               WHERE id = $1 AND tenant_id = $2`,
              [id, tenantId],
            );
            count++;
          }
          break;

        case 'unblock':
          for (const id of customerIds) {
            await client.query(
              `UPDATE customers SET status = 'active', updated_at = NOW()
               WHERE id = $1 AND tenant_id = $2`,
              [id, tenantId],
            );
            count++;
          }
          break;

        default:
          throw new ValidationError(`Unknown action: ${action}`);
      }

      logger.info('Bulk action executed', {
        tenantId,
        action,
        count,
      });

      return {
        success: true,
        count,
        message: `Successfully executed ${action} on ${count} customers`,
      };
    });
  }

  // ==========================================
  // 18. LẤY LỊCH HẸN CỦA CHÍNH MÌNH (SELF-SERVICE)
  // ==========================================
  async getSelfAppointments(tenantId: string, userId: string): Promise<any[]> {
    const customer = await this.getByUserId(tenantId, userId);
    if (!customer) {
      return [];
    }
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT a.*, s.name as service_name, u.full_name as staff_name,
                b.name as branch_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN branches b ON b.id = a.branch_id
         WHERE a.customer_id = $1 AND a.tenant_id = $2
         ORDER BY a.start_time DESC
         LIMIT 50`,
        [customer.id, tenantId],
      );
      return rowsToCamelCase(result.rows);
    });
  }

  // ==========================================
  // 19. LẤY THÔNG TIN THÀNH VIÊN
  // ==========================================
  async getMembership(tenantId: string, customerId: string): Promise<{
    tier: string;
    tierName: string;
    points: number;
    nextTier?: string;
    nextTierName?: string;
    pointsToNextTier?: number;
  }> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT c.membership_tier as tier,
                c.loyalty_points as points,
                mt.name as tier_name,
                LEAD(mt.name) OVER (ORDER BY mt.level) as next_tier_name,
                LEAD(mt.min_points) OVER (ORDER BY mt.level) - c.loyalty_points as points_to_next_tier
         FROM customers c
         LEFT JOIN membership_tiers mt ON mt.tenant_id = c.tenant_id AND mt.level = c.membership_tier
         WHERE c.id = $1 AND c.tenant_id = $2`,
        [customerId, tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      const row = result.rows[0];
      return {
        tier: row.tier,
        tierName: row.tier_name || row.tier,
        points: parseInt(row.points, 10) || 0,
        nextTier: row.points_to_next_tier !== null ? (parseInt(row.tier, 10) + 1) : undefined,
        nextTierName: row.next_tier_name || undefined,
        pointsToNextTier: row.points_to_next_tier !== null ? parseInt(row.points_to_next_tier, 10) : undefined,
      };
    });
  }

  // ==========================================
  // 20. CẬP NHẬT HẠNG THÀNH VIÊN (MANUAL)
  // ==========================================
  async updateMembership(
    tenantId: string,
    customerId: string,
    tier: string,
    reason?: string,
  ): Promise<{ success: boolean; message: string }> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
        [customerId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Customer', customerId);
      }

      await client.query(
        `UPDATE customers SET membership_tier = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [tier, customerId, tenantId],
      );

      logger.info('Membership updated manually', {
        tenantId,
        customerId,
        tier,
        reason,
      });

      return {
        success: true,
        message: `Membership updated to ${tier}${reason ? ` (${reason})` : ''}`,
      };
    });
  }
}