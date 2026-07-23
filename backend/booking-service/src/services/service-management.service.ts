import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import {
  SpaService,
  ServiceCategory,
  CreateServiceDto,
  UpdateServiceDto,
  ServiceStatus,
} from '../../../shared/types/service';
import { PaginatedResponse, PaginationParams } from '../../../shared/types/common';
import {
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../../shared/utils/errors';
import {
  rowToCamelCase,
  rowsToCamelCase,
  slugify,
} from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('service-management');

// ==========================================
// INTERFACE
// ==========================================
interface ServiceWithCategory extends SpaService {
  categoryName: string;
}

// ==========================================
// SERVICE MANAGEMENT SERVICE
// ==========================================
export class ServiceManagementService {
  constructor(private eventBus?: EventBus) {}

  // ==========================================
  // 1. TẠO DANH MỤC DỊCH VỤ
  // ==========================================
  async createCategory(
    tenantId: string,
    name: string,
    description?: string,
    icon?: string,
    sortOrder?: number,
  ): Promise<ServiceCategory> {
    return withTenantContext(tenantId, async (client) => {
      // Check duplicate name
      const existing = await client.query(
        'SELECT id FROM service_categories WHERE tenant_id = $1 AND name = $2',
        [tenantId, name],
      );
      if (existing.rows.length > 0) {
        throw new ConflictError(`Category "${name}" already exists`);
      }

      // Get next sort order
      let order = sortOrder;
      if (!order) {
        const maxOrder = await client.query(
          'SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM service_categories WHERE tenant_id = $1',
          [tenantId],
        );
        order = maxOrder.rows[0].next;
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO service_categories (id, tenant_id, name, description, icon, sort_order)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [id, tenantId, name, description, icon, order],
      );

      // Update sort order if needed
      if (sortOrder) {
        await client.query(
          `UPDATE service_categories
           SET sort_order = sort_order + 1
           WHERE tenant_id = $1 AND sort_order >= $2 AND id != $3`,
          [tenantId, sortOrder, id],
        );
      }

      const category = rowToCamelCase<ServiceCategory>(result.rows[0]);

      logger.info('Category created', {
        tenantId,
        categoryId: id,
        name,
        sortOrder: order,
      });

      return category;
    });
  }

  // ==========================================
  // 2. DANH SÁCH DANH MỤC
  // ==========================================
  async listCategories(tenantId: string, includeInactive: boolean = false): Promise<ServiceCategory[]> {
    return withTenantContext(tenantId, async (client) => {
      const statusCondition = includeInactive ? '' : 'AND status = $2';
      const values = includeInactive ? [tenantId] : [tenantId, 'active'];

      const result = await client.query(
        `SELECT * FROM service_categories WHERE tenant_id = $1 ${statusCondition} ORDER BY sort_order`,
        values,
      );
      return rowsToCamelCase<ServiceCategory>(result.rows);
    });
  }

  // ==========================================
  // 3. LẤY CHI TIẾT DANH MỤC
  // ==========================================
  async getCategory(tenantId: string, categoryId: string): Promise<ServiceCategory> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT * FROM service_categories WHERE id = $1 AND tenant_id = $2',
        [categoryId, tenantId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Category', categoryId);
      }
      return rowToCamelCase<ServiceCategory>(result.rows[0]);
    });
  }

  // ==========================================
  // 4. CẬP NHẬT DANH MỤC
  // ==========================================
  async updateCategory(
    tenantId: string,
    categoryId: string,
    dto: Partial<Pick<ServiceCategory, 'name' | 'description' | 'icon' | 'sortOrder' | 'status'>>,
  ): Promise<ServiceCategory> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM service_categories WHERE id = $1 AND tenant_id = $2',
        [categoryId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Category', categoryId);
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (dto.name) {
        updates.push(`name = $${paramIndex++}`);
        values.push(dto.name);
      }
      if (dto.description !== undefined) {
        updates.push(`description = $${paramIndex++}`);
        values.push(dto.description);
      }
      if (dto.icon !== undefined) {
        updates.push(`icon = $${paramIndex++}`);
        values.push(dto.icon);
      }
      if (dto.status) {
        updates.push(`status = $${paramIndex++}`);
        values.push(dto.status);
      }
      if (dto.sortOrder !== undefined) {
        // Handle sort order update
        const current = existing.rows[0];
        if (current.sort_order !== dto.sortOrder) {
          const oldOrder = current.sort_order;
          const newOrder = dto.sortOrder;

          if (newOrder < oldOrder) {
            // Move up: shift others down
            await client.query(
              `UPDATE service_categories
               SET sort_order = sort_order + 1
               WHERE tenant_id = $1 AND sort_order >= $2 AND sort_order < $3 AND id != $4`,
              [tenantId, newOrder, oldOrder, categoryId],
            );
          } else {
            // Move down: shift others up
            await client.query(
              `UPDATE service_categories
               SET sort_order = sort_order - 1
               WHERE tenant_id = $1 AND sort_order > $2 AND sort_order <= $3 AND id != $4`,
              [tenantId, oldOrder, newOrder, categoryId],
            );
          }
          updates.push(`sort_order = $${paramIndex++}`);
          values.push(newOrder);
        }
      }

      if (updates.length === 0) {
        return rowToCamelCase<ServiceCategory>(existing.rows[0]);
      }

      updates.push('updated_at = NOW()');
      values.push(categoryId, tenantId);

      const result = await client.query(
        `UPDATE service_categories SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        [...values, categoryId, tenantId],
      );

      logger.info('Category updated', {
        tenantId,
        categoryId,
        updatedFields: Object.keys(dto),
      });

      return rowToCamelCase<ServiceCategory>(result.rows[0]);
    });
  }

  // ==========================================
  // 5. XÓA DANH MỤC
  // ==========================================
  async deleteCategory(tenantId: string, categoryId: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT id, sort_order FROM service_categories WHERE id = $1 AND tenant_id = $2',
        [categoryId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Category', categoryId);
      }

      // Check if category has services
      const servicesResult = await client.query(
        'SELECT COUNT(*) FROM services WHERE category_id = $1 AND tenant_id = $2 AND status = $3',
        [categoryId, tenantId, 'active'],
      );
      if (parseInt(servicesResult.rows[0].count, 10) > 0) {
        throw new ConflictError('Cannot delete category with active services. Archive services first.');
      }

      const deleted = await client.query(
        'DELETE FROM service_categories WHERE id = $1 AND tenant_id = $2 RETURNING id',
        [categoryId, tenantId],
      );
      if (deleted.rows.length === 0) {
        throw new NotFoundError('Category', categoryId);
      }

      logger.info('Category deleted', { tenantId, categoryId });
    });
  }

  // ==========================================
  // 6. TẠO DỊCH VỤ
  // ==========================================
  async createService(tenantId: string, dto: CreateServiceDto): Promise<SpaService> {
    return withTenantContext(tenantId, async (client) => {
      // Check duplicate name
      const existing = await client.query(
        'SELECT id FROM services WHERE tenant_id = $1 AND name = $2',
        [tenantId, dto.name],
      );
      if (existing.rows.length > 0) {
        throw new ConflictError(`Service "${dto.name}" already exists`);
      }

      // Check category exists
      const categoryResult = await client.query(
        'SELECT id, name FROM service_categories WHERE id = $1 AND tenant_id = $2',
        [dto.categoryId, tenantId],
      );
      if (categoryResult.rows.length === 0) {
        throw new NotFoundError('Category', dto.categoryId);
      }

      const id = uuidv4();
      const slug = slugify(dto.name);

      const result = await client.query(
        `INSERT INTO services (id, tenant_id, category_id, name, slug, description,
          duration_minutes, price, discount_price, image_url, procedure_steps,
          contraindications, is_active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         RETURNING *`,
        [
          id,
          tenantId,
          dto.categoryId,
          dto.name,
          slug,
          dto.description || '',
          dto.durationMinutes,
          dto.price,
          dto.discountPrice || null,
          dto.imageUrl || null,
          JSON.stringify(dto.procedureSteps || []),
          dto.contraindications || [],
          dto.isActive !== undefined ? dto.isActive : true,
        ],
      );

      const service = rowToCamelCase<SpaService>(result.rows[0]);

      // Publish event
      if (this.eventBus) {
        await this.eventBus.publish(EventType.SERVICE_CREATED, tenantId, {
          serviceId: id,
          name: dto.name,
          categoryId: dto.categoryId,
          price: dto.price,
          durationMinutes: dto.durationMinutes,
        });
      }

      logger.info('Service created', {
        tenantId,
        serviceId: id,
        name: dto.name,
        categoryId: dto.categoryId,
        price: dto.price,
      });

      return service;
    });
  }

  // ==========================================
  // 7. LẤY CHI TIẾT DỊCH VỤ
  // ==========================================
  async getService(tenantId: string, serviceId: string): Promise<ServiceWithCategory> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT s.*, c.name as category_name
         FROM services s
         JOIN service_categories c ON c.id = s.category_id
         WHERE s.id = $1 AND s.tenant_id = $2`,
        [serviceId, tenantId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Service', serviceId);
      }
      return rowToCamelCase<ServiceWithCategory>(result.rows[0]);
    });
  }

  // ==========================================
  // 8. DANH SÁCH DỊCH VỤ (PHÂN TRANG)
  // ==========================================
  async listServices(
    tenantId: string,
    params: PaginationParams & {
      categoryId?: string;
      search?: string;
      status?: string;
      popular?: boolean;
      minPrice?: number;
      maxPrice?: number;
      isActive?: boolean;
    },
  ): Promise<PaginatedResponse<SpaService>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['s.tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.categoryId) {
        conditions.push(`s.category_id = $${paramIndex++}`);
        values.push(params.categoryId);
      }
      if (params.search) {
        conditions.push(`(s.name ILIKE $${paramIndex} OR s.description ILIKE $${paramIndex})`);
        values.push(`%${params.search}%`);
        paramIndex++;
      }
      if (params.status) {
        conditions.push(`s.status = $${paramIndex++}`);
        values.push(params.status);
      }
      if (params.isActive !== undefined) {
        conditions.push(`s.is_active = $${paramIndex++}`);
        values.push(params.isActive);
      }
      if (params.popular) {
        conditions.push('s.is_popular = true');
      }
      if (params.minPrice !== undefined) {
        conditions.push(`s.price >= $${paramIndex++}`);
        values.push(params.minPrice);
      }
      if (params.maxPrice !== undefined) {
        conditions.push(`s.price <= $${paramIndex++}`);
        values.push(params.maxPrice);
      }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM services s WHERE ${where}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT s.*, c.name as category_name
         FROM services s
         LEFT JOIN service_categories c ON c.id = s.category_id
         WHERE ${where}
         ORDER BY ${params.sortBy || 'sort_order'} ${params.sortOrder || 'asc'}, s.name
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<SpaService>(dataResult.rows),
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
  // 9. CẬP NHẬT DỊCH VỤ
  // ==========================================
  async updateService(tenantId: string, serviceId: string, dto: UpdateServiceDto): Promise<SpaService> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM services WHERE id = $1 AND tenant_id = $2',
        [serviceId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Service', serviceId);
      }

      // If category changed, verify new category exists
      if (dto.categoryId && dto.categoryId !== existing.rows[0].category_id) {
        const categoryResult = await client.query(
          'SELECT id FROM service_categories WHERE id = $1 AND tenant_id = $2',
          [dto.categoryId, tenantId],
        );
        if (categoryResult.rows.length === 0) {
          throw new NotFoundError('Category', dto.categoryId);
        }
      }

      // If name changed, check duplicate
      if (dto.name && dto.name !== existing.rows[0].name) {
        const duplicate = await client.query(
          'SELECT id FROM services WHERE tenant_id = $1 AND name = $2 AND id != $3',
          [tenantId, dto.name, serviceId],
        );
        if (duplicate.rows.length > 0) {
          throw new ConflictError(`Service "${dto.name}" already exists`);
        }
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      const updateMap: Record<string, unknown> = {
        category_id: dto.categoryId,
        name: dto.name,
        slug: dto.name ? slugify(dto.name) : undefined,
        description: dto.description,
        duration_minutes: dto.durationMinutes,
        price: dto.price,
        discount_price: dto.discountPrice,
        image_url: dto.imageUrl,
        procedure_steps: dto.procedureSteps ? JSON.stringify(dto.procedureSteps) : undefined,
        contraindications: dto.contraindications,
        is_popular: dto.isPopular,
        status: dto.status,
        is_active: dto.isActive,
      };

      for (const [field, value] of Object.entries(updateMap)) {
        if (value !== undefined) {
          updates.push(`${field} = $${paramIndex++}`);
          values.push(value);
        }
      }

      if (updates.length === 0) {
        return rowToCamelCase<SpaService>(existing.rows[0]);
      }

      updates.push('updated_at = NOW()');

      values.push(serviceId, tenantId);
      const result = await client.query(
        `UPDATE services SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        [...values, serviceId, tenantId],
      );

      // Publish event
      if (this.eventBus) {
        await this.eventBus.publish(EventType.SERVICE_UPDATED, tenantId, {
          serviceId,
          updatedFields: Object.keys(dto),
        });
      }

      logger.info('Service updated', {
        tenantId,
        serviceId,
        updatedFields: Object.keys(dto),
      });

      return rowToCamelCase<SpaService>(result.rows[0]);
    });
  }

  // ==========================================
  // 10. XÓA DỊCH VỤ
  // ==========================================
  async deleteService(tenantId: string, serviceId: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT id, name FROM services WHERE id = $1 AND tenant_id = $2',
        [serviceId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Service', serviceId);
      }

      // Check if service has any appointments
      const appointmentsResult = await client.query(
        'SELECT COUNT(*) FROM appointments WHERE service_id = $1 AND tenant_id = $2 AND status NOT IN ($3, $4)',
        [serviceId, tenantId, 'cancelled', 'completed'],
      );
      if (parseInt(appointmentsResult.rows[0].count, 10) > 0) {
        throw new ConflictError('Cannot delete service with active appointments. Archive service instead.');
      }

      // Soft delete
      await client.query(
        `UPDATE services SET status = 'archived', is_active = false, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [serviceId, tenantId],
      );

      // Publish event
      if (this.eventBus) {
        await this.eventBus.publish(EventType.SERVICE_DELETED, tenantId, {
          serviceId,
          name: existing.rows[0].name,
        });
      }

      logger.info('Service archived', {
        tenantId,
        serviceId,
        name: existing.rows[0].name,
      });
    });
  }

  // ==========================================
  // 11. CẬP NHẬT THỨ TỰ SẮP XẾP NHIỀU DỊCH VỤ
  // ==========================================
  async reorderServices(tenantId: string, serviceIds: string[]): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      for (let i = 0; i < serviceIds.length; i++) {
        await client.query(
          'UPDATE services SET sort_order = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
          [i + 1, serviceIds[i], tenantId],
        );
      }

      logger.info('Services reordered', {
        tenantId,
        count: serviceIds.length,
      });
    });
  }

  // ==========================================
  // 12. LẤY DỊCH VỤ PHỔ BIẾN
  // ==========================================
  async getPopularServices(tenantId: string, limit: number = 10): Promise<SpaService[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT s.*, c.name as category_name
         FROM services s
         LEFT JOIN service_categories c ON c.id = s.category_id
         WHERE s.tenant_id = $1 AND s.is_popular = true AND s.status = $2
         ORDER BY s.booking_count DESC
         LIMIT $3`,
        [tenantId, 'active', limit],
      );
      return rowsToCamelCase<SpaService>(result.rows);
    });
  }
}