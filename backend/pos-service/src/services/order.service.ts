import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { Order, CreateOrderDto, ProcessPaymentDto, OrderItem, PaymentStatus } from '../../../shared/types/order';
import { PaginatedResponse, PaginationParams } from '../../../shared/types/common';
import { NotFoundError, ValidationError } from '../../../shared/utils/errors';
import { rowToCamelCase, rowsToCamelCase, generateOrderNumber, generateInvoiceNumber, calculateTax, calculateLoyaltyPoints } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('pos-service');

export class OrderService {
  constructor(private eventBus: EventBus) {}

  async createOrder(tenantId: string, dto: CreateOrderDto): Promise<Order> {
    return withTenantContext(tenantId, async (client) => {
      const orderId = uuidv4();
      const orderNumber = generateOrderNumber();

      // Resolve item details and calculate totals
      let subtotal = 0;
      const resolvedItems: Array<OrderItem & { itemName: string; unitPrice: number }> = [];

      for (const item of dto.items) {
        let itemName: string;
        let unitPrice: number;

        if (item.itemType === 'service') {
          const result = await client.query(
            'SELECT name, price, discount_price FROM services WHERE id = $1 AND tenant_id = $2',
            [item.itemId, tenantId],
          );
          if (result.rows.length === 0) throw new NotFoundError('Service', item.itemId);
          itemName = result.rows[0].name;
          unitPrice = result.rows[0].discount_price || result.rows[0].price;
        } else {
          const result = await client.query(
            'SELECT name, price FROM products WHERE id = $1 AND tenant_id = $2',
            [item.itemId, tenantId],
          );
          if (result.rows.length === 0) throw new NotFoundError('Product', item.itemId);
          itemName = result.rows[0].name;
          unitPrice = result.rows[0].price;

          // Deduct inventory
          await client.query(
            `UPDATE inventory SET quantity = quantity - $1, updated_at = NOW()
             WHERE product_id = $2 AND branch_id = $3 AND tenant_id = $4`,
            [item.quantity, item.itemId, dto.branchId, tenantId],
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
          notes: item.notes,
        });
      }

      // Apply voucher
      let discountAmount = 0;
      if (dto.voucherId) {
        const voucherResult = await client.query(
          `SELECT * FROM vouchers
           WHERE id = $1 AND tenant_id = $2 AND status = 'active'
             AND valid_from <= NOW() AND valid_until >= NOW()
             AND used_count < max_uses`,
          [dto.voucherId, tenantId],
        );
        if (voucherResult.rows.length > 0) {
          const voucher = voucherResult.rows[0];
          if (!voucher.min_order_amount || subtotal >= voucher.min_order_amount) {
            if (voucher.type === 'percentage') {
              discountAmount = subtotal * (voucher.value / 100);
            } else if (voucher.type === 'fixed_amount') {
              discountAmount = Math.min(voucher.value, subtotal);
            }

            await client.query(
              'UPDATE vouchers SET used_count = used_count + 1 WHERE id = $1',
              [dto.voucherId],
            );
          }
        }
      }

      // Apply loyalty points
      let loyaltyDiscount = 0;
      if (dto.loyaltyPointsUsed && dto.loyaltyPointsUsed > 0) {
        const customerResult = await client.query(
          'SELECT loyalty_points FROM customers WHERE id = $1 AND tenant_id = $2',
          [dto.customerId, tenantId],
        );
        if (customerResult.rows.length > 0 && customerResult.rows[0].loyalty_points >= dto.loyaltyPointsUsed) {
          loyaltyDiscount = dto.loyaltyPointsUsed * 1000; // 1 point = 1,000 VND
          await client.query(
            'UPDATE customers SET loyalty_points = loyalty_points - $1 WHERE id = $2',
            [dto.loyaltyPointsUsed, dto.customerId],
          );
        }
      }

      const totalDiscount = discountAmount + loyaltyDiscount;
      const taxAmount = calculateTax(subtotal - totalDiscount);
      const totalAmount = subtotal - totalDiscount + taxAmount;
      const loyaltyPointsEarned = calculateLoyaltyPoints(totalAmount);

      // Create order
      await client.query(
        `INSERT INTO orders (id, tenant_id, branch_id, customer_id, staff_id, order_number,
          subtotal, discount_amount, tax_amount, total_amount, payment_method, payment_status,
          voucher_id, loyalty_points_used, loyalty_points_earned, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'pending', $12, $13, $14, $15)`,
        [orderId, tenantId, dto.branchId, dto.customerId, dto.staffId, orderNumber,
         subtotal, totalDiscount, taxAmount, totalAmount, dto.paymentMethod,
         dto.voucherId, dto.loyaltyPointsUsed || 0, loyaltyPointsEarned, dto.notes],
      );

      // Create order items
      for (const item of resolvedItems) {
        await client.query(
          `INSERT INTO order_items (id, order_id, item_type, item_id, item_name, quantity, unit_price, discount, total, notes)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
          [item.id, orderId, item.itemType, item.itemId, item.itemName,
           item.quantity, item.unitPrice, item.discount, item.total, item.notes],
        );
      }

      // Create invoice
      const invoiceNumber = generateInvoiceNumber();
      await client.query(
        `INSERT INTO invoices (tenant_id, order_id, customer_id, invoice_number, amount, tax, total, status, due_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'draft', NOW() + INTERVAL '30 days')`,
        [tenantId, orderId, dto.customerId, invoiceNumber, subtotal - totalDiscount, taxAmount, totalAmount],
      );

      await this.eventBus.publish(EventType.ORDER_CREATED, tenantId, {
        orderId, customerId: dto.customerId, totalAmount, orderNumber,
      });

      logger.info('Order created', { tenantId, orderId, orderNumber, totalAmount });

      const orderResult = await client.query(
        `SELECT o.*, json_agg(oi.*) as items
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         WHERE o.id = $1
         GROUP BY o.id`,
        [orderId],
      );

      return rowToCamelCase<Order>(orderResult.rows[0]);
    });
  }

  async processPayment(tenantId: string, orderId: string, dto: ProcessPaymentDto): Promise<Order> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM orders WHERE id = $1 AND tenant_id = $2',
        [orderId, tenantId],
      );
      if (existing.rows.length === 0) throw new NotFoundError('Order', orderId);

      const order = existing.rows[0];
      if (order.payment_status === 'paid') {
        throw new ValidationError('Order is already paid');
      }

      let newStatus: PaymentStatus = 'paid';
      if (dto.amount < order.total_amount) {
        newStatus = 'partial';
      }

      await client.query(
        `UPDATE orders SET payment_status = $1, payment_method = $2, payment_reference = $3, updated_at = NOW()
         WHERE id = $4`,
        [newStatus, dto.paymentMethod, dto.paymentReference, orderId],
      );

      // Update invoice
      if (newStatus === 'paid') {
        await client.query(
          `UPDATE invoices SET status = 'paid', paid_at = NOW(), updated_at = NOW()
           WHERE order_id = $1`,
          [orderId],
        );

        // Update customer total_spent and earn loyalty points
        await client.query(
          `UPDATE customers SET
            total_spent = total_spent + $1,
            loyalty_points = loyalty_points + $2,
            updated_at = NOW()
           WHERE id = $3`,
          [order.total_amount, order.loyalty_points_earned, order.customer_id],
        );

        await this.eventBus.publish(EventType.PAYMENT_COMPLETED, tenantId, {
          orderId, customerId: order.customer_id, amount: order.total_amount,
          loyaltyPointsEarned: order.loyalty_points_earned,
        });
      }

      const result = await client.query('SELECT * FROM orders WHERE id = $1', [orderId]);
      return rowToCamelCase<Order>(result.rows[0]);
    });
  }

  async getOrder(tenantId: string, orderId: string): Promise<Order> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT o.*, json_agg(oi.*) as items,
                c.full_name as customer_name, u.full_name as staff_name
         FROM orders o
         JOIN order_items oi ON oi.order_id = o.id
         JOIN customers c ON c.id = o.customer_id
         JOIN users u ON u.id = o.staff_id
         WHERE o.id = $1 AND o.tenant_id = $2
         GROUP BY o.id, c.full_name, u.full_name`,
        [orderId, tenantId],
      );
      if (result.rows.length === 0) throw new NotFoundError('Order', orderId);
      return rowToCamelCase<Order>(result.rows[0]);
    });
  }

  async listOrders(tenantId: string, params: PaginationParams & {
    branchId?: string; customerId?: string; paymentStatus?: string; startDate?: string; endDate?: string;
  }): Promise<PaginatedResponse<Order>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['o.tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.branchId) { conditions.push(`o.branch_id = $${paramIndex++}`); values.push(params.branchId); }
      if (params.customerId) { conditions.push(`o.customer_id = $${paramIndex++}`); values.push(params.customerId); }
      if (params.paymentStatus) { conditions.push(`o.payment_status = $${paramIndex++}`); values.push(params.paymentStatus); }
      if (params.startDate) { conditions.push(`o.created_at >= $${paramIndex++}`); values.push(params.startDate); }
      if (params.endDate) { conditions.push(`o.created_at <= $${paramIndex++}`); values.push(params.endDate); }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(`SELECT COUNT(*) FROM orders o WHERE ${where}`, values);
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
        pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
      };
    });
  }
}
