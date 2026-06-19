import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { InventoryItem, InventoryTransaction, InventoryAlert, ReceiveInventoryDto, DispatchInventoryDto, TransferInventoryDto } from '../../../shared/types/inventory';
import { Product, CreateProductDto, UpdateProductDto } from '../../../shared/types/product';
import { PaginatedResponse, PaginationParams } from '../../../shared/types/common';
import { NotFoundError, ValidationError } from '../../../shared/utils/errors';
import { rowToCamelCase, rowsToCamelCase } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('inventory-service');

export class InventoryService {
  constructor(private eventBus: EventBus) {}

  async getInventory(tenantId: string, branchId?: string): Promise<InventoryItem[]> {
    return withTenantContext(tenantId, async (client) => {
      const conditions = ['i.tenant_id = $1'];
      const values: unknown[] = [tenantId];
      if (branchId) {
        conditions.push('i.branch_id = $2');
        values.push(branchId);
      }

      const result = await client.query(
        `SELECT i.*, p.name as product_name, p.sku, p.image_url,
                b.name as branch_name
         FROM inventory i
         JOIN products p ON p.id = i.product_id
         JOIN branches b ON b.id = i.branch_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.name`,
        values,
      );

      return rowsToCamelCase<InventoryItem>(result.rows);
    });
  }

  async receiveInventory(tenantId: string, dto: ReceiveInventoryDto, performedBy: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      for (const item of dto.items) {
        // Upsert inventory
        const existing = await client.query(
          'SELECT quantity FROM inventory WHERE product_id = $1 AND branch_id = $2 AND tenant_id = $3',
          [item.productId, dto.branchId, tenantId],
        );

        const previousQuantity = existing.rows.length > 0 ? existing.rows[0].quantity : 0;
        const newQuantity = previousQuantity + item.quantity;

        await client.query(
          `INSERT INTO inventory (tenant_id, branch_id, product_id, quantity)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (branch_id, product_id) DO UPDATE SET quantity = $4, updated_at = NOW()`,
          [tenantId, dto.branchId, item.productId, newQuantity],
        );

        // Record transaction
        await client.query(
          `INSERT INTO inventory_transactions (tenant_id, branch_id, product_id, type, quantity,
            previous_quantity, new_quantity, reference_id, notes, performed_by)
           VALUES ($1, $2, $3, 'purchase', $4, $5, $6, $7, $8, $9)`,
          [tenantId, dto.branchId, item.productId, item.quantity,
           previousQuantity, newQuantity, dto.referenceId, item.notes || dto.notes, performedBy],
        );
      }

      await this.eventBus.publish(EventType.INVENTORY_RECEIVED, tenantId, {
        branchId: dto.branchId, items: dto.items,
      });

      logger.info('Inventory received', { tenantId, branchId: dto.branchId, items: dto.items.length });
    });
  }

  async dispatchInventory(tenantId: string, dto: DispatchInventoryDto, performedBy: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      for (const item of dto.items) {
        const existing = await client.query(
          'SELECT quantity FROM inventory WHERE product_id = $1 AND branch_id = $2 AND tenant_id = $3',
          [item.productId, dto.branchId, tenantId],
        );

        if (existing.rows.length === 0) {
          throw new NotFoundError('Inventory item', item.productId);
        }

        const previousQuantity = existing.rows[0].quantity;
        if (previousQuantity < item.quantity) {
          throw new ValidationError(`Insufficient stock for product ${item.productId}`);
        }

        const newQuantity = previousQuantity - item.quantity;

        await client.query(
          `UPDATE inventory SET quantity = $1, updated_at = NOW()
           WHERE product_id = $2 AND branch_id = $3 AND tenant_id = $4`,
          [newQuantity, item.productId, dto.branchId, tenantId],
        );

        await client.query(
          `INSERT INTO inventory_transactions (tenant_id, branch_id, product_id, type, quantity,
            previous_quantity, new_quantity, reference_id, reference_type, notes, performed_by)
           VALUES ($1, $2, $3, 'sale', $4, $5, $6, $7, $8, $9, $10)`,
          [tenantId, dto.branchId, item.productId, item.quantity,
           previousQuantity, newQuantity, dto.referenceId, dto.referenceType,
           item.notes || dto.notes, performedBy],
        );

        // Check low stock alert
        const invResult = await client.query(
          'SELECT min_quantity FROM inventory WHERE product_id = $1 AND branch_id = $2',
          [item.productId, dto.branchId],
        );
        if (invResult.rows.length > 0 && newQuantity <= invResult.rows[0].min_quantity) {
          const alertType = newQuantity === 0 ? EventType.INVENTORY_OUT_OF_STOCK : EventType.INVENTORY_LOW_STOCK;
          await this.eventBus.publish(alertType, tenantId, {
            productId: item.productId, branchId: dto.branchId, quantity: newQuantity,
          });
        }
      }
    });
  }

  async transferInventory(tenantId: string, dto: TransferInventoryDto, performedBy: string): Promise<void> {
    await this.dispatchInventory(tenantId, {
      branchId: dto.fromBranchId,
      items: dto.items.map((i) => ({ ...i, notes: `Transfer to ${dto.toBranchId}` })),
      referenceType: 'transfer',
      notes: dto.notes,
    }, performedBy);

    await this.receiveInventory(tenantId, {
      branchId: dto.toBranchId,
      items: dto.items.map((i) => ({ ...i, notes: `Transfer from ${dto.fromBranchId}` })),
      referenceId: dto.fromBranchId,
      notes: dto.notes,
    }, performedBy);
  }

  async getAlerts(tenantId: string): Promise<InventoryAlert[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT i.product_id, p.name as product_name, i.branch_id, b.name as branch_name,
                i.quantity as current_quantity, i.min_quantity,
                CASE
                  WHEN i.quantity = 0 THEN 'out_of_stock'
                  WHEN i.quantity <= i.min_quantity THEN 'low_stock'
                  WHEN i.quantity >= i.max_quantity THEN 'overstock'
                END as alert_type
         FROM inventory i
         JOIN products p ON p.id = i.product_id
         JOIN branches b ON b.id = i.branch_id
         WHERE i.tenant_id = $1
           AND (i.quantity <= i.min_quantity OR i.quantity >= i.max_quantity)
         ORDER BY i.quantity ASC`,
        [tenantId],
      );

      return rowsToCamelCase<InventoryAlert>(result.rows);
    });
  }

  // Product management
  async createProduct(tenantId: string, dto: CreateProductDto): Promise<Product> {
    return withTenantContext(tenantId, async (client) => {
      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO products (id, tenant_id, category_id, name, description, sku, barcode,
          price, cost_price, ingredients, usage_instructions, volume, unit, brand)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [id, tenantId, dto.categoryId, dto.name, dto.description, dto.sku, dto.barcode,
         dto.price, dto.costPrice, dto.ingredients || [], dto.usageInstructions,
         dto.volume, dto.unit, dto.brand],
      );
      return rowToCamelCase<Product>(result.rows[0]);
    });
  }

  async listProducts(tenantId: string, params: PaginationParams & {
    categoryId?: string; search?: string;
  }): Promise<PaginatedResponse<Product>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['tenant_id = $1', "status = 'active'"];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.categoryId) {
        conditions.push(`category_id = $${paramIndex++}`);
        values.push(params.categoryId);
      }
      if (params.search) {
        conditions.push(`(name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex})`);
        values.push(`%${params.search}%`);
        paramIndex++;
      }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(`SELECT COUNT(*) FROM products WHERE ${where}`, values);
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT * FROM products WHERE ${where} ORDER BY name LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<Product>(dataResult.rows),
        pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
      };
    });
  }

  async updateProduct(tenantId: string, productId: string, dto: UpdateProductDto): Promise<Product> {
    return withTenantContext(tenantId, async (client) => {
      const fields: string[] = [];
      const values: unknown[] = [];
      let pi = 1;

      const map: Record<string, unknown> = {
        category_id: dto.categoryId, name: dto.name, description: dto.description,
        sku: dto.sku, barcode: dto.barcode, price: dto.price, cost_price: dto.costPrice,
        image_url: dto.imageUrl, images: dto.images, ingredients: dto.ingredients,
        usage_instructions: dto.usageInstructions, volume: dto.volume, unit: dto.unit,
        brand: dto.brand, is_active: dto.isActive, status: dto.status,
      };

      for (const [f, v] of Object.entries(map)) {
        if (v !== undefined) { fields.push(`${f} = $${pi++}`); values.push(v); }
      }
      if (fields.length === 0) {
        const r = await client.query('SELECT * FROM products WHERE id = $1 AND tenant_id = $2', [productId, tenantId]);
        return rowToCamelCase<Product>(r.rows[0]);
      }
      fields.push('updated_at = NOW()');

      const result = await client.query(
        `UPDATE products SET ${fields.join(', ')} WHERE id = $${pi} AND tenant_id = $${pi + 1} RETURNING *`,
        [...values, productId, tenantId],
      );
      if (result.rows.length === 0) throw new NotFoundError('Product', productId);
      return rowToCamelCase<Product>(result.rows[0]);
    });
  }
}
