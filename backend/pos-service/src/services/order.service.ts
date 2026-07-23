import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import {
  Order,
  CreateOrderDto,
  ProcessPaymentDto,
  UpdateOrderDto,
  RefundDto,
  OrderItem,
  PaymentStatus,
  OrderStatus,
} from '../../../shared/types/order';
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
  generateInvoiceNumber,
  calculateTax,
  calculateLoyaltyPoints,
  formatCurrency,
} from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('pos-service');

// ==========================================
// INTERFACE
// ==========================================
interface OrderWithDetails extends Order {
  customerName: string;
  staffName: string;
  items: OrderItem[];
}

interface InvoiceWithDetails {
  id: string;
  invoiceNumber: string;
  customerName: string;
  amount: number;
  tax: number;
  total: number;
  status: string;
  createdAt: Date;
  paidAt?: Date;
}

// ==========================================
// ORDER SERVICE
// ==========================================
export class OrderService {
  constructor(private eventBus: EventBus) {}

  // ==========================================
  // 1. TẠO ĐƠN HÀNG
  // ==========================================
  async createOrder(tenantId: string, dto: CreateOrderDto): Promise<Order> {
    return withTenantContext(tenantId, async (client) => {
      const orderId = uuidv4();
      const orderNumber = generateOrderNumber();

      // Validate customer
      const customerResult = await client.query(
        `SELECT id, full_name, loyalty_points, status
         FROM customers WHERE id = $1 AND tenant_id = $2`,
        [dto.customerId, tenantId],
      );
      if (customerResult.rows.length === 0) {
        throw new NotFoundError('Customer', dto.customerId);
      }
      const customer = customerResult.rows[0];
      if (customer.status === 'blocked') {
        throw new BusinessError('Customer is blocked');
      }

      // Resolve item details and calculate totals
      let subtotal = 0;
      const resolvedItems: Array<OrderItem & { itemName: string; unitPrice: number; costPrice?: number }> = [];

      for (const item of dto.items) {
        let itemName: string;
        let unitPrice: number;
        let costPrice: number | undefined;

        if (item.itemType === 'service') {
          const result = await client.query(
            `SELECT name, price, discount_price FROM services
             WHERE id = $1 AND tenant_id = $2 AND status = $3`,
            [item.itemId, tenantId, 'active'],
          );
          if (result.rows.length === 0) {
            throw new NotFoundError('Service', item.itemId);
          }
          itemName = result.rows[0].name;
          unitPrice = result.rows[0].discount_price || result.rows[0].price;
        } else {
          const result = await client.query(
            `SELECT p.name, p.price, p.cost_price, i.quantity as stock
             FROM products p
             JOIN inventory i ON i.product_id = p.id
             WHERE p.id = $1 AND p.tenant_id = $2 AND i.branch_id = $3 AND p.status = $4`,
            [item.itemId, tenantId, dto.branchId, 'active'],
          );
          if (result.rows.length === 0) {
            throw new NotFoundError('Product', item.itemId);
          }
          itemName = result.rows[0].name;
          unitPrice = result.rows[0].price;
          costPrice = result.rows[0].cost_price || 0;

          // Check stock
          if ((result.rows[0].stock || 0) < item.quantity) {
            throw new BusinessError(
              `Insufficient stock for product "${itemName}". Available: ${result.rows[0].stock}`,
            );
          }

          // Deduct inventory
          await client.query(
            `UPDATE inventory
             SET quantity = quantity - $1,
                 reserved_quantity = reserved_quantity - $1,
                 updated_at = NOW()
             WHERE product_id = $2 AND branch_id = $3 AND tenant_id = $4`,
            [item.quantity, item.itemId, dto.branchId, tenantId],
          );

          // Create inventory transaction
          await client.query(
            `INSERT INTO inventory_transactions (id, tenant_id, branch_id, product_id, quantity, type, reference_id)
             VALUES (uuid_generate_v4(), $1, $2, $3, $4, 'sale', $5)`,
            [tenantId, dto.branchId, item.itemId, -item.quantity, orderId],
          );
        }

        const discount = item.discount || 0;
        const total = (unitPrice * item.quantity) - discount;
        subtotal += total;

        resolvedItems.push({
          id: uuidv4(),
          orderId,
          itemType: item.itemType,
          itemId: item.itemId,
          itemName,
          quantity: item.quantity,
          unitPrice,
          discount,
          total,
          costPrice,
          notes: item.notes,
        });
      }

      // Apply voucher
      let discountAmount = 0;
      let appliedVoucherId: string | undefined = dto.voucherId;
      if (dto.voucherId) {
        const voucherResult = await client.query(
          `SELECT * FROM vouchers
           WHERE id = $1 AND tenant_id = $2 AND status = 'active'
             AND valid_from <= NOW() AND valid_until >= NOW()
             AND used_count < max_uses
             AND (min_order_amount IS NULL OR min_order_amount <= $3)`,
          [dto.voucherId, tenantId, subtotal],
        );
        if (voucherResult.rows.length > 0) {
          const voucher = voucherResult.rows[0];
          if (voucher.type === 'percentage') {
            discountAmount = subtotal * (voucher.value / 100);
          } else if (voucher.type === 'fixed_amount') {
            discountAmount = Math.min(voucher.value, subtotal);
          }

          // Cap discount
          if (voucher.max_discount && discountAmount > voucher.max_discount) {
            discountAmount = voucher.max_discount;
          }

          await client.query(
            `UPDATE vouchers SET used_count = used_count + 1, updated_at = NOW()
             WHERE id = $1`,
            [dto.voucherId],
          );
        } else {
          appliedVoucherId = undefined;
        }
      }

      // Apply loyalty points
      let loyaltyDiscount = 0;
      let loyaltyPointsUsed = 0;
      if (dto.loyaltyPointsUsed && dto.loyaltyPointsUsed > 0) {
        const maxPoints = Math.min(
          dto.loyaltyPointsUsed,
          customer.loyalty_points || 0,
          Math.floor((subtotal - discountAmount) / 1000),
        );
        if (maxPoints > 0) {
          loyaltyPointsUsed = maxPoints;
          loyaltyDiscount = maxPoints * 1000; // 1 point = 1,000 VND
          await client.query(
            `UPDATE customers SET loyalty_points = loyalty_points - $1, updated_at = NOW()
             WHERE id = $2`,
            [loyaltyPointsUsed, dto.customerId],
          );
        }
      }

      const totalDiscount = Math.round((discountAmount + loyaltyDiscount) * 100) / 100;
      const taxableAmount = Math.max(0, subtotal - totalDiscount);
      const taxAmount = calculateTax(taxableAmount);
      const totalAmount = Math.round((taxableAmount + taxAmount) * 100) / 100;
      const loyaltyPointsEarned = calculateLoyaltyPoints(totalAmount);

      // Create order
      await client.query(
        `INSERT INTO orders (
          id, tenant_id, branch_id, customer_id, staff_id, order_number,
          status, subtotal, discount_amount, tax_amount, total_amount,
          payment_method, payment_status, voucher_id,
          loyalty_points_used, loyalty_points_earned, notes,
          shipping_address, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, NOW(), NOW())`,
        [
          orderId,
          tenantId,
          dto.branchId,
          dto.customerId,
          dto.staffId,
          orderNumber,
          'pending',
          subtotal,
          totalDiscount,
          taxAmount,
          totalAmount,
          dto.paymentMethod || null,
          'pending',
          appliedVoucherId,
          loyaltyPointsUsed,
          loyaltyPointsEarned,
          dto.notes || '',
          dto.shippingAddress || '',
        ],
      );

      // Create order items
      for (const item of resolvedItems) {
        await client.query(
          `INSERT INTO order_items (
            id, order_id, item_type, item_id, item_name,
            quantity, unit_price, discount, total, cost_price, notes
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            item.id,
            orderId,
            item.itemType,
            item.itemId,
            item.itemName,
            item.quantity,
            item.unitPrice,
            item.discount,
            item.total,
            item.costPrice || 0,
            item.notes || '',
          ],
        );
      }

      // Create invoice
      const invoiceNumber = generateInvoiceNumber();
      await client.query(
        `INSERT INTO invoices (
          tenant_id, order_id, customer_id, invoice_number,
          amount, tax, total, status, due_date
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', NOW() + INTERVAL '30 days')`,
        [tenantId, orderId, dto.customerId, invoiceNumber, taxableAmount, taxAmount, totalAmount],
      );

      // Publish event
      await this.eventBus.publish(EventType.ORDER_CREATED, tenantId, {
        orderId,
        orderNumber,
        customerId: dto.customerId,
        customerName: customer.full_name,
        totalAmount,
        itemCount: dto.items.length,
      });

      logger.info('Order created', {
        tenantId,
        orderId,
        orderNumber,
        totalAmount,
        customerId: dto.customerId,
        itemCount: dto.items.length,
      });

      const orderResult = await client.query(
        `SELECT o.*, json_agg(oi.*) as items
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.id = $1
         GROUP BY o.id`,
        [orderId],
      );

      return rowToCamelCase<Order>(orderResult.rows[0]);
    });
  }

  // ==========================================
  // 2. CẬP NHẬT ĐƠN HÀNG
  // ==========================================
  async updateOrder(tenantId: string, orderId: string, dto: UpdateOrderDto): Promise<Order> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
        [orderId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }

      if (existing.rows[0].payment_status === 'paid') {
        throw new BusinessError('Cannot update paid order');
      }

      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (dto.shippingAddress !== undefined) {
        updates.push(`shipping_address = $${paramIndex++}`);
        values.push(dto.shippingAddress);
      }
      if (dto.notes !== undefined) {
        updates.push(`notes = $${paramIndex++}`);
        values.push(dto.notes);
      }
      if (dto.status) {
        updates.push(`status = $${paramIndex++}`);
        values.push(dto.status);
      }

      if (updates.length === 0) {
        return rowToCamelCase<Order>(existing.rows[0]);
      }

      updates.push('updated_at = NOW()');
      values.push(orderId, tenantId);

      const result = await client.query(
        `UPDATE orders SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        [...values, orderId, tenantId],
      );

      return rowToCamelCase<Order>(result.rows[0]);
    });
  }

  // ==========================================
  // 3. THANH TOÁN
  // ==========================================
  async processPayment(tenantId: string, orderId: string, dto: ProcessPaymentDto): Promise<Order> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        `SELECT o.*, c.full_name as customer_name, c.email as customer_email
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.id = $1 AND o.tenant_id = $2`,
        [orderId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }

      const order = existing.rows[0];

      if (order.payment_status === 'paid') {
        throw new ValidationError('Order is already paid');
      }

      if (order.payment_status === 'refunded') {
        throw new ValidationError('Refunded order cannot be paid');
      }

      // Check amount
      if (dto.amount > order.total_amount) {
        throw new ValidationError('Payment amount exceeds total');
      }

      let newStatus: PaymentStatus = dto.amount >= order.total_amount ? 'paid' : 'partial';

      // If payment is via cash, handle change
      let changeAmount = 0;
      if (dto.paymentMethod === 'cash' && dto.cashAmount) {
        changeAmount = dto.cashAmount - dto.amount;
        if (changeAmount < 0) {
          throw new ValidationError('Cash amount is less than payment amount');
        }
      }

      await client.query(
        `UPDATE orders
         SET payment_status = $1,
             payment_method = $2,
             payment_reference = $3,
             paid_at = CASE WHEN $1 = 'paid' THEN NOW() ELSE paid_at END,
             updated_at = NOW()
         WHERE id = $4`,
        [newStatus, dto.paymentMethod, dto.paymentReference || null, orderId],
      );

      // Update invoice
      if (newStatus === 'paid') {
        await client.query(
          `UPDATE invoices
           SET status = 'paid', paid_at = NOW(), updated_at = NOW()
           WHERE order_id = $1`,
          [orderId],
        );

        // Update customer total_spent and earn loyalty points
        await client.query(
          `UPDATE customers
           SET total_spent = total_spent + $1,
               loyalty_points = loyalty_points + $2,
               last_purchase_at = NOW(),
               updated_at = NOW()
           WHERE id = $3`,
          [order.total_amount, order.loyalty_points_earned, order.customer_id],
        );

        // Update order status
        await client.query(
          `UPDATE orders SET status = 'completed', updated_at = NOW() WHERE id = $1`,
          [orderId],
        );

        // Publish events
        await this.eventBus.publish(EventType.PAYMENT_COMPLETED, tenantId, {
          orderId,
          orderNumber: order.order_number,
          customerId: order.customer_id,
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          amount: order.total_amount,
          paymentMethod: dto.paymentMethod,
          loyaltyPointsEarned: order.loyalty_points_earned,
        });

        await this.eventBus.publish(EventType.ORDER_COMPLETED, tenantId, {
          orderId,
          orderNumber: order.order_number,
          customerId: order.customer_id,
          totalAmount: order.total_amount,
        });
      }

      const result = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      return rowToCamelCase<Order>(result.rows[0]);
    });
  }

  // ==========================================
  // 4. HỦY ĐƠN HÀNG
  // ==========================================
  async cancelOrder(tenantId: string, orderId: string, reason?: string): Promise<Order> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
        [orderId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }

      const order = existing.rows[0];

      if (order.payment_status === 'paid') {
        throw new BusinessError('Cannot cancel paid order, use refund instead');
      }

      // Restore inventory
      const itemsResult = await client.query(
        'SELECT item_id, quantity FROM order_items WHERE order_id = $1 AND item_type = $2',
        [orderId, 'product'],
      );
      for (const item of itemsResult.rows) {
        await client.query(
          `UPDATE inventory
           SET quantity = quantity + $1, updated_at = NOW()
           WHERE product_id = $2 AND branch_id = $3 AND tenant_id = $4`,
          [item.quantity, item.item_id, order.branch_id, tenantId],
        );
      }

      await client.query(
        `UPDATE orders
         SET status = 'cancelled',
             cancelled_at = NOW(),
             cancellation_reason = $1,
             updated_at = NOW()
         WHERE id = $2`,
        [reason || 'Cancelled by staff', orderId],
      );

      // Update invoice
      await client.query(
        `UPDATE invoices SET status = 'cancelled', updated_at = NOW()
         WHERE order_id = $1`,
        [orderId],
      );

      await this.eventBus.publish(EventType.ORDER_CANCELLED, tenantId, {
        orderId,
        customerId: order.customer_id,
        reason: reason || 'No reason provided',
      });

      logger.info('Order cancelled', {
        tenantId,
        orderId,
        reason,
      });

      const result = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      return rowToCamelCase<Order>(result.rows[0]);
    });
  }

  // ==========================================
  // 5. HOÀN TIỀN
  // ==========================================
  async processRefund(tenantId: string, orderId: string, dto: RefundDto): Promise<Order> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        `SELECT o.*, c.full_name as customer_name, c.email as customer_email
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE o.id = $1 AND o.tenant_id = $2`,
        [orderId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }

      const order = existing.rows[0];

      if (order.payment_status !== 'paid') {
        throw new ValidationError('Only paid orders can be refunded');
      }

      const refundAmount = dto.amount || order.total_amount;

      if (refundAmount > order.total_amount) {
        throw new ValidationError('Refund amount exceeds order total');
      }

      // Restore inventory
      const itemsResult = await client.query(
        'SELECT item_id, quantity FROM order_items WHERE order_id = $1 AND item_type = $2',
        [orderId, 'product'],
      );
      for (const item of itemsResult.rows) {
        await client.query(
          `UPDATE inventory
           SET quantity = quantity + $1, updated_at = NOW()
           WHERE product_id = $2 AND branch_id = $3 AND tenant_id = $4`,
          [item.quantity, item.item_id, order.branch_id, tenantId],
        );
      }

      // Deduct loyalty points if needed
      if (dto.refundToCustomer && order.loyalty_points_earned > 0) {
        await client.query(
          `UPDATE customers
           SET loyalty_points = loyalty_points - $1,
               total_spent = total_spent - $2,
               updated_at = NOW()
           WHERE id = $3`,
          [order.loyalty_points_earned, refundAmount, order.customer_id],
        );
      }

      await client.query(
        `UPDATE orders
         SET payment_status = 'refunded',
             status = 'refunded',
             refunded_at = NOW(),
             refund_amount = $1,
             refund_reason = $2,
             updated_at = NOW()
         WHERE id = $3`,
        [refundAmount, dto.reason, orderId],
      );

      // Update invoice
      await client.query(
        `UPDATE invoices
         SET status = 'refunded', updated_at = NOW()
         WHERE order_id = $1`,
        [orderId],
      );

      await this.eventBus.publish(EventType.ORDER_REFUNDED, tenantId, {
        orderId,
        customerId: order.customer_id,
        customerName: order.customer_name,
        customerEmail: order.customer_email,
        amount: refundAmount,
        reason: dto.reason,
      });

      logger.info('Refund processed', {
        tenantId,
        orderId,
        amount: refundAmount,
        reason: dto.reason,
      });

      const result = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      return rowToCamelCase<Order>(result.rows[0]);
    });
  }

  // ==========================================
  // 6. LẤY CHI TIẾT ĐƠN HÀNG
  // ==========================================
  async getOrder(tenantId: string, orderId: string): Promise<OrderWithDetails> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT o.*,
                json_agg(oi.*) as items,
                c.full_name as customer_name,
                u.full_name as staff_name,
                b.name as branch_name
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         JOIN customers c ON c.id = o.customer_id
         JOIN users u ON u.id = o.staff_id
         JOIN branches b ON b.id = o.branch_id
         WHERE o.id = $1 AND o.tenant_id = $2
         GROUP BY o.id, c.full_name, u.full_name, b.name`,
        [orderId, tenantId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Order', orderId);
      }
      return rowToCamelCase<OrderWithDetails>(result.rows[0]);
    });
  }

  // ==========================================
  // 7. DANH SÁCH ĐƠN HÀNG
  // ==========================================
  async listOrders(
    tenantId: string,
    params: PaginationParams & {
      branchId?: string;
      customerId?: string;
      staffId?: string;
      status?: OrderStatus;
      paymentStatus?: PaymentStatus;
      startDate?: string;
      endDate?: string;
      search?: string;
      minAmount?: number;
      maxAmount?: number;
    },
  ): Promise<PaginatedResponse<Order>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['o.tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.branchId) {
        conditions.push(`o.branch_id = $${paramIndex++}`);
        values.push(params.branchId);
      }
      if (params.customerId) {
        conditions.push(`o.customer_id = $${paramIndex++}`);
        values.push(params.customerId);
      }
      if (params.staffId) {
        conditions.push(`o.staff_id = $${paramIndex++}`);
        values.push(params.staffId);
      }
      if (params.status) {
        conditions.push(`o.status = $${paramIndex++}`);
        values.push(params.status);
      }
      if (params.paymentStatus) {
        conditions.push(`o.payment_status = $${paramIndex++}`);
        values.push(params.paymentStatus);
      }
      if (params.startDate) {
        conditions.push(`DATE(o.created_at) >= $${paramIndex++}`);
        values.push(params.startDate);
      }
      if (params.endDate) {
        conditions.push(`DATE(o.created_at) <= $${paramIndex++}`);
        values.push(params.endDate);
      }
      if (params.search) {
        conditions.push(
          `(c.full_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex} OR o.order_number ILIKE $${paramIndex})`,
        );
        values.push(`%${params.search}%`);
        paramIndex++;
      }
      if (params.minAmount !== undefined) {
        conditions.push(`o.total_amount >= $${paramIndex++}`);
        values.push(params.minAmount);
      }
      if (params.maxAmount !== undefined) {
        conditions.push(`o.total_amount <= $${paramIndex++}`);
        values.push(params.maxAmount);
      }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE ${where}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT o.*, c.full_name as customer_name
         FROM orders o
         JOIN customers c ON c.id = o.customer_id
         WHERE ${where}
         ORDER BY o.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<Order>(dataResult.rows),
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
  // 8. DANH SÁCH INVOICES
  // ==========================================
  async listInvoices(
    tenantId: string,
    params: PaginationParams & {
      customerId?: string;
      status?: string;
      startDate?: string;
      endDate?: string;
    },
  ): Promise<PaginatedResponse<InvoiceWithDetails>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['i.tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.customerId) {
        conditions.push(`i.customer_id = $${paramIndex++}`);
        values.push(params.customerId);
      }
      if (params.status) {
        conditions.push(`i.status = $${paramIndex++}`);
        values.push(params.status);
      }
      if (params.startDate) {
        conditions.push(`DATE(i.created_at) >= $${paramIndex++}`);
        values.push(params.startDate);
      }
      if (params.endDate) {
        conditions.push(`DATE(i.created_at) <= $${paramIndex++}`);
        values.push(params.endDate);
      }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM invoices i WHERE ${where}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT i.*, c.full_name as customer_name
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         WHERE ${where}
         ORDER BY i.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<InvoiceWithDetails>(dataResult.rows),
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
  // 9. CHI TIẾT INVOICE
  // ==========================================
  async getInvoice(tenantId: string, invoiceId: string): Promise<InvoiceWithDetails> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT i.*, c.full_name as customer_name, c.email as customer_email, c.phone as customer_phone
         FROM invoices i
         JOIN customers c ON c.id = i.customer_id
         WHERE i.id = $1 AND i.tenant_id = $2`,
        [invoiceId, tenantId],
      );
      if (result.rows.length === 0) {
        throw new NotFoundError('Invoice', invoiceId);
      }
      return rowToCamelCase<InvoiceWithDetails>(result.rows[0]);
    });
  }

  // ==========================================
  // 10. THỐNG KÊ HÀNG NGÀY
  // ==========================================
  async getDailyStats(tenantId: string): Promise<{
    totalOrders: number;
    totalRevenue: number;
    totalItems: number;
    averageOrderValue: number;
    topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  }> {
    return withTenantContext(tenantId, async (client) => {
      const today = new Date().toISOString().slice(0, 10);

      // Total orders and revenue
      const summaryResult = await client.query(
        `SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
         FROM orders
         WHERE tenant_id = $1 AND DATE(created_at) = $2 AND payment_status = 'paid'`,
        [tenantId, today],
      );

      // Top products
      const productsResult = await client.query(
        `SELECT oi.item_name, SUM(oi.quantity) as quantity, SUM(oi.total) as revenue
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         WHERE o.tenant_id = $1 AND DATE(o.created_at) = $2 AND o.payment_status = 'paid'
         GROUP BY oi.item_name
         ORDER BY quantity DESC
         LIMIT 10`,
        [tenantId, today],
      );

      const summary = summaryResult.rows[0];
      const totalOrders = parseInt(summary.count, 10);
      const totalRevenue = parseFloat(summary.revenue);

      return {
        totalOrders,
        totalRevenue,
        totalItems: productsResult.rows.reduce((sum, r) => sum + parseInt(r.quantity, 10), 0),
        averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        topProducts: productsResult.rows.map((r) => ({
          name: r.item_name,
          quantity: parseInt(r.quantity, 10),
          revenue: parseFloat(r.revenue),
        })),
      };
    });
  }

  // ==========================================
  // 11. GIỎ HÀNG TẠM (CART)
  // ==========================================
  async saveCart(tenantId: string, userId: string, cartData: any): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      await client.query(
        `INSERT INTO carts (tenant_id, user_id, data, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (tenant_id, user_id)
         DO UPDATE SET data = $3, updated_at = NOW()`,
        [tenantId, userId, JSON.stringify(cartData)],
      );
      logger.info('Cart saved', { tenantId, userId });
    });
  }

  async getCart(tenantId: string, userId: string): Promise<any> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        'SELECT data FROM carts WHERE tenant_id = $1 AND user_id = $2',
        [tenantId, userId],
      );
      return result.rows.length > 0 ? result.rows[0].data : null;
    });
  }

  async clearCart(tenantId: string, userId: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      await client.query(
        'DELETE FROM carts WHERE tenant_id = $1 AND user_id = $2',
        [tenantId, userId],
      );
      logger.info('Cart cleared', { tenantId, userId });
    });
  }

  // ==========================================
  // 12. TẠO PDF HÓA ĐƠN (PLACEHOLDER)
  // ==========================================
  async generateInvoicePDF(tenantId: string, invoiceId: string): Promise<Buffer> {
    const invoice = await this.getInvoice(tenantId, invoiceId);
    // TODO: Generate PDF using a library like pdfkit or puppeteer
    // For now, return a simple placeholder
    logger.info('PDF generation requested', { tenantId, invoiceId });
    return Buffer.from(`Invoice ${invoice.invoiceNumber}: ${formatCurrency(invoice.total)}`, 'utf-8');
  }
}