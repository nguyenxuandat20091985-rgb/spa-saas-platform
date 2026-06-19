import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { SpaService, ServiceCategory, CreateServiceDto, UpdateServiceDto } from '../../../shared/types/service';
import { PaginatedResponse, PaginationParams } from '../../../shared/types/common';
import { NotFoundError } from '../../../shared/utils/errors';
import { rowToCamelCase, rowsToCamelCase } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';

const logger = createServiceLogger('service-management');

export class ServiceManagementService {
  async createCategory(tenantId: string, name: string, description?: string, icon?: string): Promise<ServiceCategory> {
    return withTenantContext(tenantId, async (client) => {
      const maxOrder = await client.query(
        'SELECT COALESCE(MAX(sort_order), 0) + 1 as next FROM service_categories WHERE tenant_id = $1',
        [tenantId],
      );

      const result = await client.query(
        `INSERT INTO service_categories (id, tenant_id, name, description, icon, sort_order)
         VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, name, description, icon, maxOrder.rows[0].next],
      );

      return rowToCamelCase<ServiceCategory>(result.rows[0]);
    });
  }

  async listCategories(tenantId: string): Promise<ServiceCategory[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT * FROM service_categories WHERE tenant_id = $1 AND status = $2 ORDER BY sort_order',
        [tenantId, 'active'],
      );
      return rowsToCamelCase<ServiceCategory>(result.rows);
    });
  }

  async createService(tenantId: string, dto: CreateServiceDto): Promise<SpaService> {
    return withTenantContext(tenantId, async (client) => {
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO services (id, tenant_id, category_id, name, description, duration_minutes,
          price, discount_price, procedure_steps, contraindications)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING *`,
        [
          id, tenantId, dto.categoryId, dto.name, dto.description, dto.durationMinutes,
          dto.price, dto.discountPrice, JSON.stringify(dto.procedureSteps || []),
          dto.contraindications || [],
        ],
      );

      logger.info('Service created', { tenantId, serviceId: id, name: dto.name });
      return rowToCamelCase<SpaService>(result.rows[0]);
    });
  }

  async getService(tenantId: string, serviceId: string): Promise<SpaService> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT * FROM services WHERE id = $1 AND tenant_id = $2',
        [serviceId, tenantId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Service', serviceId);
      }
      return rowToCamelCase<SpaService>(result.rows[0]);
    });
  }

  async listServices(tenantId: string, params: PaginationParams & {
    categoryId?: string;
    search?: string;
    status?: string;
    popular?: boolean;
  }): Promise<PaginatedResponse<SpaService>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.categoryId) {
        conditions.push(`category_id = $${paramIndex++}`);
        values.push(params.categoryId);
      }
      if (params.search) {
        conditions.push(`(name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`);
        values.push(`%${params.search}%`);
        paramIndex++;
      }
      if (params.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(params.status);
      }
      if (params.popular) {
        conditions.push('is_popular = true');
      }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(`SELECT COUNT(*) FROM services WHERE ${where}`, values);
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT * FROM services WHERE ${where}
         ORDER BY ${params.sortBy || 'sort_order'} ${params.sortOrder || 'asc'}, name
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<SpaService>(dataResult.rows),
        pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
      };
    });
  }

  async updateService(tenantId: string, serviceId: string, dto: UpdateServiceDto): Promise<SpaService> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM services WHERE id = $1 AND tenant_id = $2',
        [serviceId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Service', serviceId);
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const updateMap: Record<string, unknown> = {
        category_id: dto.categoryId,
        name: dto.name,
        description: dto.description,
        duration_minutes: dto.durationMinutes,
        price: dto.price,
        discount_price: dto.discountPrice,
        image_url: dto.imageUrl,
        procedure_steps: dto.procedureSteps ? JSON.stringify(dto.procedureSteps) : undefined,
        contraindications: dto.contraindications,
        is_popular: dto.isPopular,
        status: dto.status,
      };

      for (const [field, value] of Object.entries(updateMap)) {
        if (value !== undefined) {
          fields.push(`${field} = $${paramIndex++}`);
          values.push(value);
        }
      }

      if (fields.length === 0) {
        return rowToCamelCase<SpaService>(existing.rows[0]);
      }

      fields.push('updated_at = NOW()');

      const result = await client.query(
        `UPDATE services SET ${fields.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        [...values, serviceId, tenantId],
      );

      return rowToCamelCase<SpaService>(result.rows[0]);
    });
  }
}
