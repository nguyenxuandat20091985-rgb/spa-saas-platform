import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import {
  InventoryItem,
  InventoryTransaction,
  InventoryAlert,
  ReceiveInventoryDto,
  DispatchInventoryDto,
  TransferInventoryDto,
  AdjustmentDto,
  CountDto,
  InventoryTransactionType,
} from '../../../shared/types/inventory';
import { Product, CreateProductDto, UpdateProductDto } from '../../../shared/types/product';
import { PaginatedResponse, PaginationParams } from '../../../shared/types/common';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  BusinessError,
} from '../../../shared/utils/errors';
import {
  rowToCamelCase,
  rowsToCamelCase,
  generateOrderNumber,
} from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('inventory-service');

// ==========================================
// INTERFACE
// ==========================================
interface InventoryWithDetails extends InventoryItem {
  productName: string;
  productSku: string;
  productImageUrl?: string;
  branchName: string;
}

interface TransactionWithDetails extends InventoryTransaction {
  productName: string;
  productSku: string;
  branchName: string;
  performedByName: string;
}

interface InventoryAlertWithDetails extends InventoryAlert {
  productName: string;
  branchName: string;
}

// ==========================================
// INVENTORY SERVICE
// ==========================================
export class InventoryService {
  constructor(private eventBus: EventBus) {}

  // ==========================================
  // 1. LẤY TỒN KHO
  // ==========================================
  async getInventory(
    tenantId: string,
    branchId?: string,
    includeInactive: boolean = false,
  ): Promise<InventoryWithDetails[]> {
    return withTenantContext(tenantId, async (client) => {
      const conditions = ['i.tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (branchId) {
        conditions.push(`i.branch_id = $${paramIndex++}`);
        values.push(branchId);
      }

      if (!includeInactive) {
        conditions.push(`p.is_active = true`);
      }

      const result = await client.query(
        `SELECT i.*,
                p.name as product_name,
                p.sku as product_sku,
                p.image_url as product_image_url,
                p.barcode,
                p.price,
                p.cost_price,
                b.name as branch_name,
                p.min_stock_level as product_min_stock,
                p.max_stock_level as product_max_stock
         FROM inventory i
         JOIN products p ON p.id = i.product_id
         JOIN branches b ON b.id = i.branch_id
         WHERE ${conditions.join(' AND ')}
         ORDER BY p.name`,
        values,
      );

      return rowsToCamelCase<InventoryWithDetails>(result.rows);
    });
  }

  // ==========================================
  // 2. LẤY TỒN KHO THEO SẢN PHẨM
  // ==========================================
  async getProductInventory(tenantId: string, productId: string): Promise<{
    product: Product;
    branches: Array<{
      branchId: string;
      branchName: string;
      quantity: number;
      minStockLevel: number;
      maxStockLevel: number;
      status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'overstock';
    }>;
    totalQuantity: number;
  }> {
    return withTenantContext(tenantId, async (client) => {
      // Get product
      const productResult = await client.query(
        'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
        [productId, tenantId],
      );
      if (productResult.rows.length === 0) {
        throw new NotFoundError('Product', productId);
      }
      const product = rowToCamelCase<Product>(productResult.rows[0]);

      // Get inventory by branches
      const inventoryResult = await client.query(
        `SELECT i.*, b.name as branch_name
         FROM inventory i
         JOIN branches b ON b.id = i.branch_id
         WHERE i.product_id = $1 AND i.tenant_id = $2`,
        [productId, tenantId],
      );

      const branches = inventoryResult.rows.map((row: any) => {
        const quantity = parseInt(row.quantity, 10);
        const minStock = product.minStockLevel || 5;
        const maxStock = product.maxStockLevel || 100;

        let status: 'in_stock' | 'low_stock' | 'out_of_stock' | 'overstock';
        if (quantity === 0) status = 'out_of_stock';
        else if (quantity <= minStock) status = 'low_stock';
        else if (maxStock && quantity >= maxStock) status = 'overstock';
        else status = 'in_stock';

        return {
          branchId: row.branch_id,
          branchName: row.branch_name,
          quantity,
          minStockLevel: minStock,
          maxStockLevel: maxStock || 0,
          status,
        };
      });

      const totalQuantity = branches.reduce((sum, b) => sum + b.quantity, 0);

      return {
        product,
        branches,
        totalQuantity,
      };
    });
  }

  // ==========================================
  // 3. NHẬP KHO
  // ==========================================
  async receiveInventory(
    tenantId: string,
    dto: ReceiveInventoryDto,
    performedBy: string,
  ): Promise<{ received: number; transactions: string[] }> {
    return withTenantContext(tenantId, async (client) => {
      const transactionIds: string[] = [];
      let receivedCount = 0;

      for (const item of dto.items) {
        // Validate product exists
        const productCheck = await client.query(
          'SELECT id, name FROM products WHERE id = $1 AND tenant_id = $2',
          [item.productId, tenantId],
        );
        if (productCheck.rows.length === 0) {
          throw new NotFoundError('Product', item.productId);
        }

        // Check branch exists
        const branchCheck = await client.query(
          'SELECT id FROM branches WHERE id = $1 AND tenant_id = $2',
          [dto.branchId, tenantId],
        );
        if (branchCheck.rows.length === 0) {
          throw new NotFoundError('Branch', dto.branchId);
        }

        // Get existing inventory
        const existing = await client.query(
          'SELECT quantity FROM inventory WHERE product_id = $1 AND branch_id = $2 AND tenant_id = $3',
          [item.productId, dto.branchId, tenantId],
        );

        const previousQuantity = existing.rows.length > 0 ? parseInt(existing.rows[0].quantity, 10) : 0;
        const newQuantity = previousQuantity + item.quantity;

        // Upsert inventory
        await client.query(
          `INSERT INTO inventory (id, tenant_id, branch_id, product_id, quantity,
            min_stock_level, max_stock_level, updated_at)
           VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (tenant_id, branch_id, product_id)
           DO UPDATE SET quantity = $4, updated_at = NOW()`,
          [
            tenantId,
            dto.branchId,
            item.productId,
            newQuantity,
            item.minStockLevel || 5,
            item.maxStockLevel || 100,
          ],
        );

        // Record transaction
        const transactionId = uuidv4();
        transactionIds.push(transactionId);
        await client.query(
          `INSERT INTO inventory_transactions (
            id, tenant_id, branch_id, product_id, type, quantity,
            previous_quantity, new_quantity, reference_id, reference_type,
            cost_price, notes, performed_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW())`,
          [
            transactionId,
            tenantId,
            dto.branchId,
            item.productId,
            'receive',
            item.quantity,
            previousQuantity,
            newQuantity,
            dto.referenceId || null,
            dto.referenceType || 'purchase_order',
            item.costPrice || null,
            item.notes || dto.notes || null,
            performedBy,
          ],
        );

        receivedCount++;
      }

      // Publish event
      await this.eventBus.publish(EventType.INVENTORY_RECEIVED, tenantId, {
        branchId: dto.branchId,
        items: dto.items.map((i) => ({ productId: i.productId, quantity: i.quantity })),
        referenceId: dto.referenceId,
      });

      logger.info('Inventory received', {
        tenantId,
        branchId: dto.branchId,
        items: dto.items.length,
        performedBy,
      });

      return {
        received: receivedCount,
        transactions: transactionIds,
      };
    });
  }

  // ==========================================
  // 4. XUẤT KHO
  // ==========================================
  async dispatchInventory(
    tenantId: string,
    dto: DispatchInventoryDto,
    performedBy: string,
  ): Promise<{ dispatched: number; transactions: string[] }> {
    return withTenantContext(tenantId, async (client) => {
      const transactionIds: string[] = [];
      let dispatchedCount = 0;
      const alerts: InventoryAlert[] = [];

      for (const item of dto.items) {
        const existing = await client.query(
          'SELECT quantity FROM inventory WHERE product_id = $1 AND branch_id = $2 AND tenant_id = $3',
          [item.productId, dto.branchId, tenantId],
        );

        if (existing.rows.length === 0) {
          throw new NotFoundError('Inventory item for product', item.productId);
        }

        const previousQuantity = parseInt(existing.rows[0].quantity, 10);
        if (previousQuantity < item.quantity) {
          throw new BusinessError(`Insufficient stock. Available: ${previousQuantity}, Requested: ${item.quantity}`);
        }

        const newQuantity = previousQuantity - item.quantity;

        await client.query(
          `UPDATE inventory SET quantity = $1, updated_at = NOW()
           WHERE product_id = $2 AND branch_id = $3 AND tenant_id = $4`,
          [newQuantity, item.productId, dto.branchId, tenantId],
        );

        const transactionId = uuidv4();
        transactionIds.push(transactionId);
        await client.query(
          `INSERT INTO inventory_transactions (
            id, tenant_id, branch_id, product_id, type, quantity,
            previous_quantity, new_quantity, reference_id, reference_type,
            notes, performed_by, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())`,
          [
            transactionId,
            tenantId,
            dto.branchId,
            item.productId,
            'dispatch',
            item.quantity,
            previousQuantity,
            newQuantity,
            dto.referenceId || null,
            dto.referenceType || 'sale',
            item.notes || dto.notes || null,
            performedBy,
          ],
        );

        // Check for alerts
        const invResult = await client.query(
          'SELECT min_stock_level, max_stock_level FROM inventory WHERE product_id = $1 AND branch_id = $2',
          [item.productId, dto.branchId],
        );
        if (invResult.rows.length > 0) {
          const minStock = invResult.rows[0].min_stock_level || 5;
          if (newQuantity <= minStock) {
            alerts.push({
              productId: item.productId,
              branchId: dto.branchId,
              currentQuantity: newQuantity,
              minQuantity: minStock,
              alertType: newQuantity === 0 ? 'out_of_stock' : 'low_stock',
            });
          }
        }

        dispatchedCount++;
      }

      // Publish alerts
      for (const alert of alerts) {
        const alertType = alert.alertType === 'out_of_stock'
          ? EventType.INVENTORY_OUT_OF_STOCK
          : EventType.INVENTORY_LOW_STOCK;
        await this.eventBus.publish(alertType, tenantId, {
          productId: alert.productId,
          branchId: alert.branchId,
          quantity: alert.currentQuantity,
        });
      }

      logger.info('Inventory dispatched', {
        tenantId,
        branchId: dto.branchId,
        items: dto.items.length,
        performedBy,
        alerts: alerts.length,
      });

      return {
        dispatched: dispatchedCount,
        transactions: transactionIds,
      };
    });
  }

  // ==========================================
  // 5. CHUYỂN KHO
  // ==========================================
  async transferInventory(
    tenantId: string,
    dto: TransferInventoryDto,
    performedBy: string,
  ): Promise<{ transferred: number; fromTransactions: string[]; toTransactions: string[] }> {
    return withTenantContext(tenantId, async (client) => {
      const transferId = uuidv4();
      const transferCode = generateOrderNumber('TRF');

      // Create transfer record
      await client.query(
        `INSERT INTO inventory_transfers (
          id, tenant_id, from_branch_id, to_branch_id, transfer_code,
          status, notes, created_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [transferId, tenantId, dto.fromBranchId, dto.toBranchId, transferCode, 'completed', dto.notes, performedBy],
      );

      // Dispatch from source
      const dispatchResult = await this.dispatchInventory(
        tenantId,
        {
          branchId: dto.fromBranchId,
          items: dto.items.map((i) => ({
            ...i,
            notes: `Transfer to ${dto.toBranchId} | ${i.notes || ''}`,
          })),
          referenceType: 'transfer_out',
          referenceId: transferId,
          notes: dto.notes,
        },
        performedBy,
      );

      // Receive to destination
      const receiveResult = await this.receiveInventory(
        tenantId,
        {
          branchId: dto.toBranchId,
          items: dto.items.map((i) => ({
            ...i,
            notes: `Transfer from ${dto.fromBranchId} | ${i.notes || ''}`,
          })),
          referenceType: 'transfer_in',
          referenceId: transferId,
          notes: dto.notes,
        },
        performedBy,
      );

      logger.info('Inventory transferred', {
        tenantId,
        transferId,
        fromBranch: dto.fromBranchId,
        toBranch: dto.toBranchId,
        items: dto.items.length,
        performedBy,
      });

      return {
        transferred: dto.items.length,
        fromTransactions: dispatchResult.transactions,
        toTransactions: receiveResult.transactions,
      };
    });
  }

  // ==========================================
  // 6. ĐIỀU CHỈNH TỒN KHO
  // ==========================================
  async adjustInventory(
    tenantId: string,
    dto: AdjustmentDto,
    performedBy: string,
  ): Promise<{ adjusted: number; transactions: string[] }> {
    return withTenantContext(tenantId, async (client) => {
      const transactionIds: string[] = [];
      let adjustedCount = 0;

      for (const item of dto.items) {
        const existing = await client.query(
          'SELECT quantity FROM inventory WHERE product_id = $1 AND branch_id = $2 AND tenant_id = $3',
          [item.productId, dto.branchId, tenantId],
        );

        if (existing.rows.length === 0) {
          throw new NotFoundError('Inventory item for product', item.productId);
        }

        const previousQuantity = parseInt(existing.rows[0].quantity, 10);
        const newQuantity = previousQuantity + item.quantity;

        if (newQuantity < 0) {
          throw new BusinessError(`Cannot adjust to negative quantity. Current: ${previousQuantity}, Adjustment: ${item.quantity}`);
        }

        await client.query(
          `UPDATE inventory SET quantity = $1, updated_at = NOW()
           WHERE product_id = $2 AND branch_id = $3 AND tenant_id = $4`,
          [newQuantity, item.productId, dto.branchId, tenantId],
        );

        const transactionId = uuidv4();
        transactionIds.push(transactionId);
        await client.query(
          `INSERT INTO inventory_transactions (
            id, tenant_id, branch_id, product_id, type, quantity,
            previous_quantity, new_quantity, notes, performed_by, created_at
          ) VALUES ($1, $2, $3, $4, 'adjustment', $5, $6, $7, $8, $9, NOW())`,
          [
            transactionId,
            tenantId,
            dto.branchId,
            item.productId,
            item.quantity,
            previousQuantity,
            newQuantity,
            `${item.reason} | ${dto.notes || ''}`,
            performedBy,
          ],
        );

        adjustedCount++;
      }

      logger.info('Inventory adjusted', {
        tenantId,
        branchId: dto.branchId,
        items: dto.items.length,
        performedBy,
      });

      return {
        adjusted: adjustedCount,
        transactions: transactionIds,
      };
    });
  }

  // ==========================================
  // 7. KIỂM KÊ KHO
  // ==========================================
  async countInventory(
    tenantId: string,
    dto: CountDto,
    performedBy: string,
  ): Promise<{
    counted: number;
    discrepancies: Array<{ productId: string; systemQuantity: number; countedQuantity: number; diff: number }>;
  }> {
    return withTenantContext(tenantId, async (client) => {
      const discrepancies: Array<{ productId: string; systemQuantity: number; countedQuantity: number; diff: number }> = [];
      let counted = 0;

      const countId = uuidv4();
      const countDate = dto.countDate ? new Date(dto.countDate) : new Date();

      for (const item of dto.items) {
        const existing = await client.query(
          'SELECT quantity FROM inventory WHERE product_id = $1 AND branch_id = $2 AND tenant_id = $3',
          [item.productId, dto.branchId, tenantId],
        );

        if (existing.rows.length === 0) {
          throw new NotFoundError('Inventory item for product', item.productId);
        }

        const systemQuantity = item.systemQuantity !== undefined
          ? item.systemQuantity
          : parseInt(existing.rows[0].quantity, 10);

        // Record count
        await client.query(
          `INSERT INTO inventory_counts (
            id, tenant_id, branch_id, product_id, count_id,
            system_quantity, counted_quantity, count_date, notes, performed_by, created_at
          ) VALUES (uuid_generate_v4(), $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [
            tenantId,
            dto.branchId,
            item.productId,
            countId,
            systemQuantity,
            item.countedQuantity,
            countDate,
            item.notes || dto.notes || null,
            performedBy,
          ],
        );

        const diff = item.countedQuantity - systemQuantity;
        if (diff !== 0) {
          discrepancies.push({
            productId: item.productId,
            systemQuantity,
            countedQuantity: item.countedQuantity,
            diff,
          });

          // Auto-adjust if discrepancy is significant (optional)
          if (Math.abs(diff) > 5) {
            await this.adjustInventory(
              tenantId,
              {
                branchId: dto.branchId,
                items: [{
                  productId: item.productId,
                  quantity: diff,
                  reason: `Kiểm kê: ${diff > 0 ? 'thừa' : 'thiếu'} ${Math.abs(diff)} đơn vị`,
                }],
                notes: `Auto-adjust from count ${countId}`,
              },
              performedBy,
            );
          }
        }

        counted++;
      }

      logger.info('Inventory count completed', {
        tenantId,
        branchId: dto.branchId,
        countId,
        counted,
        discrepancies: discrepancies.length,
        performedBy,
      });

      return {
        counted,
        discrepancies,
      };
    });
  }

  // ==========================================
  // 8. CẢNH BÁO TỒN KHO
  // ==========================================
  async getAlerts(tenantId: string): Promise<InventoryAlertWithDetails[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT i.product_id,
                p.name as product_name,
                p.sku as product_sku,
                i.branch_id,
                b.name as branch_name,
                i.quantity as current_quantity,
                i.min_stock_level as min_quantity,
                i.max_stock_level as max_quantity,
                CASE
                  WHEN i.quantity = 0 THEN 'out_of_stock'
                  WHEN i.quantity <= i.min_stock_level THEN 'low_stock'
                  WHEN i.quantity >= i.max_stock_level THEN 'overstock'
                END as alert_type
         FROM inventory i
         JOIN products p ON p.id = i.product_id
         JOIN branches b ON b.id = i.branch_id
         WHERE i.tenant_id = $1
           AND (i.quantity <= i.min_stock_level OR i.quantity >= i.max_stock_level)
         ORDER BY i.quantity ASC`,
        [tenantId],
      );

      return rowsToCamelCase<InventoryAlertWithDetails>(result.rows);
    });
  }

  // ==========================================
  // 9. LỊCH SỬ GIAO DỊCH
  // ==========================================
  async getTransactions(
    tenantId: string,
    params: {
      branchId?: string;
      productId?: string;
      type?: InventoryTransactionType;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<PaginatedResponse<TransactionWithDetails>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['t.tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.branchId) {
        conditions.push(`t.branch_id = $${paramIndex++}`);
        values.push(params.branchId);
      }
      if (params.productId) {
        conditions.push(`t.product_id = $${paramIndex++}`);
        values.push(params.productId);
      }
      if (params.type) {
        conditions.push(`t.type = $${paramIndex++}`);
        values.push(params.type);
      }
      if (params.startDate) {
        conditions.push(`DATE(t.created_at) >= $${paramIndex++}`);
        values.push(params.startDate);
      }
      if (params.endDate) {
        conditions.push(`DATE(t.created_at) <= $${paramIndex++}`);
        values.push(params.endDate);
      }

      const where = conditions.join(' AND ');
      const page = params.page || 1;
      const limit = params.limit || 50;
      const offset = (page - 1) * limit;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM inventory_transactions t WHERE ${where}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT t.*,
                p.name as product_name,
                p.sku as product_sku,
                b.name as branch_name,
                u.full_name as performed_by_name
         FROM inventory_transactions t
         JOIN products p ON p.id = t.product_id
         JOIN branches b ON b.id = t.branch_id
         LEFT JOIN users u ON u.id = t.performed_by
         WHERE ${where}
         ORDER BY t.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, limit, offset],
      );

      return {
        data: rowsToCamelCase<TransactionWithDetails>(dataResult.rows),
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    });
  }

  // ==========================================
  // 10. PRODUCT MANAGEMENT
  // ==========================================

  async createProduct(tenantId: string, dto: CreateProductDto): Promise<Product> {
    return withTenantContext(tenantId, async (client) => {
      // Check duplicate SKU
      const existing = await client.query(
        'SELECT id FROM products WHERE tenant_id = $1 AND sku = $2',
        [tenantId, dto.sku],
      );
      if (existing.rows.length > 0) {
        throw new ConflictError(`Product with SKU "${dto.sku}" already exists`);
      }

      // Check category exists
      if (dto.categoryId) {
        const categoryCheck = await client.query(
          'SELECT id FROM service_categories WHERE id = $1 AND tenant_id = $2',
          [dto.categoryId, tenantId],
        );
        if (categoryCheck.rows.length === 0) {
          throw new NotFoundError('Category', dto.categoryId);
        }
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO products (
          id, tenant_id, category_id, name, description, sku, barcode,
          price, cost_price, ingredients, usage_instructions, volume, unit,
          brand, is_active, min_stock_level, max_stock_level, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, NOW(), NOW())
        RETURNING *`,
        [
          id,
          tenantId,
          dto.categoryId || null,
          dto.name,
          dto.description || null,
          dto.sku,
          dto.barcode || null,
          dto.price,
          dto.costPrice || 0,
          dto.ingredients || [],
          dto.usageInstructions || null,
          dto.volume || null,
          dto.unit || null,
          dto.brand || null,
          dto.isActive !== undefined ? dto.isActive : true,
          dto.minStockLevel || 5,
          dto.maxStockLevel || null,
        ],
      );

      const product = rowToCamelCase<Product>(result.rows[0]);

      await this.eventBus.publish(EventType.PRODUCT_CREATED, tenantId, {
        productId: id,
        name: dto.name,
        sku: dto.sku,
      });

      logger.info('Product created', {
        tenantId,
        productId: id,
        name: dto.name,
        sku: dto.sku,
      });

      return product;
    });
  }

  async listProducts(
    tenantId: string,
    params: PaginationParams & {
      categoryId?: string;
      search?: string;
      status?: string;
      isActive?: boolean;
      lowStock?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
    },
  ): Promise<PaginatedResponse<Product>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.categoryId) {
        conditions.push(`category_id = $${paramIndex++}`);
        values.push(params.categoryId);
      }
      if (params.search) {
        conditions.push(`(name ILIKE $${paramIndex} OR sku ILIKE $${paramIndex} OR barcode ILIKE $${paramIndex})`);
        values.push(`%${params.search}%`);
        paramIndex++;
      }
      if (params.status) {
        conditions.push(`status = $${paramIndex++}`);
        values.push(params.status);
      }
      if (params.isActive !== undefined) {
        conditions.push(`is_active = $${paramIndex++}`);
        values.push(params.isActive);
      }

      // Low stock filter (requires join with inventory)
      if (params.lowStock) {
        conditions.push(
          `id IN (SELECT product_id FROM inventory WHERE tenant_id = $1 AND quantity <= min_stock_level)`,
        );
      }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;
      const sortBy = params.sortBy || 'name';
      const sortOrder = params.sortOrder || 'asc';

      const countResult = await client.query(
        `SELECT COUNT(*) FROM products WHERE ${where}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT * FROM products WHERE ${where}
         ORDER BY ${sortBy} ${sortOrder}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<Product>(dataResult.rows),
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit),
        },
      };
    });
  }

  async getProduct(tenantId: string, productId: string): Promise<Product> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
        [productId, tenantId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Product', productId);
      }
      return rowToCamelCase<Product>(result.rows[0]);
    });
  }

  async updateProduct(tenantId: string, productId: string, dto: UpdateProductDto): Promise<Product> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM products WHERE id = $1 AND tenant_id = $2',
        [productId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Product', productId);
      }

      // Check duplicate SKU if changed
      if (dto.sku && dto.sku !== existing.rows[0].sku) {
        const duplicate = await client.query(
          'SELECT id FROM products WHERE tenant_id = $1 AND sku = $2 AND id != $3',
          [tenantId, dto.sku, productId],
        );
        if (duplicate.rows.length > 0) {
          throw new ConflictError(`Product with SKU "${dto.sku}" already exists`);
        }
      }

      const fields: string[] = [];
      const values: unknown[] = [];
      let paramIndex = 1;

      const updateMap: Record<string, unknown> = {
        category_id: dto.categoryId,
        name: dto.name,
        description: dto.description,
        sku: dto.sku,
        barcode: dto.barcode,
        price: dto.price,
        cost_price: dto.costPrice,
        image_url: dto.imageUrl,
        images: dto.images,
        ingredients: dto.ingredients,
        usage_instructions: dto.usageInstructions,
        volume: dto.volume,
        unit: dto.unit,
        brand: dto.brand,
        is_active: dto.isActive,
        status: dto.status,
        min_stock_level: dto.minStockLevel,
        max_stock_level: dto.maxStockLevel,
      };

      for (const [field, value] of Object.entries(updateMap)) {
        if (value !== undefined) {
          fields.push(`${field} = $${paramIndex++}`);
          values.push(value);
        }
      }

      if (fields.length === 0) {
        return rowToCamelCase<Product>(existing.rows[0]);
      }

      fields.push('updated_at = NOW()');

      values.push(productId, tenantId);
      const result = await client.query(
        `UPDATE products SET ${fields.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        [...values, productId, tenantId],
      );

      await this.eventBus.publish(EventType.PRODUCT_UPDATED, tenantId, {
        productId,
        updatedFields: Object.keys(dto),
      });

      logger.info('Product updated', {
        tenantId,
        productId,
        updatedFields: Object.keys(dto),
      });

      return rowToCamelCase<Product>(result.rows[0]);
    });
  }

  async deleteProduct(tenantId: string, productId: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT id FROM products WHERE id = $1 AND tenant_id = $2',
        [productId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Product', productId);
      }

      // Check if product has inventory
      const inventoryCheck = await client.query(
        'SELECT quantity FROM inventory WHERE product_id = $1 AND tenant_id = $2',
        [productId, tenantId],
      );
      const totalQuantity = inventoryCheck.rows.reduce((sum, row) => sum + parseInt(row.quantity, 10), 0);
      if (totalQuantity > 0) {
        throw new BusinessError(`Cannot delete product with ${totalQuantity} units in stock. Please adjust inventory first.`);
      }

      await client.query(
        `UPDATE products SET is_active = false, status = 'archived', updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [productId, tenantId],
      );

      await this.eventBus.publish(EventType.PRODUCT_DELETED, tenantId, {
        productId,
      });

      logger.info('Product deleted', { tenantId, productId });
    });
  }

  // ==========================================
  // 11. BULK UPDATE MIN STOCK
  // ==========================================
  async bulkUpdateMinStock(
    tenantId: string,
    products: Array<{ productId: string; minStockLevel: number; maxStockLevel?: number }>,
  ): Promise<number> {
    return withTenantContext(tenantId, async (client) => {
      let updated = 0;
      for (const item of products) {
        const result = await client.query(
          `UPDATE products
           SET min_stock_level = $1,
               max_stock_level = COALESCE($2, max_stock_level),
               updated_at = NOW()
           WHERE id = $3 AND tenant_id = $4
           RETURNING id`,
          [item.minStockLevel, item.maxStockLevel || null, item.productId, tenantId],
        );
        if (result.rows.length > 0) updated++;
      }

      logger.info('Bulk min stock updated', { tenantId, updated });

      return updated;
    });
  }

  // ==========================================
  // 12. BÁO CÁO TỒN KHO
  // ==========================================
  async getInventoryReport(
    tenantId: string,
    branchId?: string,
    date?: string,
  ): Promise<{
    summary: { totalProducts: number; totalValue: number; totalCost: number; outOfStock: number; low