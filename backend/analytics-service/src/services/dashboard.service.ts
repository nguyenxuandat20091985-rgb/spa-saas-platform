import { withTenantContext } from '../../../shared/database/tenant-context';
import {
  DashboardOverview,
  RevenueReport,
  CustomerAnalytics,
  StaffPerformanceReport,
  ServiceAnalytics,
  InventoryAnalytics,
  ChannelPerformance,
  CustomReportData,
} from '../../../shared/types/analytics';
import { rowsToCamelCase, parseDateRange, getWeekStart, getWeekEnd, getMonthStart, getMonthEnd } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { NotFoundError } from '../../../shared/utils/errors';

const logger = createServiceLogger('dashboard');

// ==========================================
// INTERFACE
// ==========================================
interface RevenueQueryParams {
  period?: string;
  branchId?: string;
  groupBy?: string;
  startDate?: string;
  endDate?: string;
  compareWith?: string;
  includeDetails?: boolean;
}

interface ExportParams {
  reportType: string;
  format: string;
  period: string;
  branchId?: string;
}

// ==========================================
// DASHBOARD SERVICE
// ==========================================
export class DashboardService {
  // ==========================================
  // 1. OVERVIEW (TỔNG QUAN)
  // ==========================================
  async getOverview(
    tenantId: string,
    branchId?: string,
    period: string = 'month',
    startDate?: string,
    endDate?: string,
  ): Promise<DashboardOverview> {
    return withTenantContext(tenantId, async (client) => {
      // Determine date range
      let dateRange: { startDate: Date; endDate: Date };
      let compareRange: { startDate: Date; endDate: Date } | null = null;

      if (startDate && endDate) {
        dateRange = { startDate: new Date(startDate), endDate: new Date(endDate) };
        const duration = dateRange.endDate.getTime() - dateRange.startDate.getTime();
        compareRange = {
          startDate: new Date(dateRange.startDate.getTime() - duration),
          endDate: new Date(dateRange.startDate.getTime() - 1),
        };
      } else {
        dateRange = this.getDateRange(period);
        compareRange = this.getCompareRange(period);
      }

      const branchCondition = branchId ? `AND branch_id = '${branchId}'` : '';
      const branchConditionA = branchId ? `AND a.branch_id = '${branchId}'` : '';
      const dateCondition = `AND created_at >= '${dateRange.startDate.toISOString()}' AND created_at <= '${dateRange.endDate.toISOString()}'`;
      const compareCondition = compareRange
        ? `AND created_at >= '${compareRange.startDate.toISOString()}' AND created_at <= '${compareRange.endDate.toISOString()}'`
        : '';

      // Revenue
      const revenueResult = await client.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total,
                COUNT(*) as order_count,
                COALESCE(AVG(total_amount), 0) as avg
         FROM orders
         WHERE tenant_id = $1 AND payment_status = 'paid' ${dateCondition} ${branchCondition}`,
        [tenantId],
      );

      const compareRevenueResult = compareRange
        ? await client.query(
            `SELECT COALESCE(SUM(total_amount), 0) as total
             FROM orders
             WHERE tenant_id = $1 AND payment_status = 'paid' ${compareCondition} ${branchCondition}`,
            [tenantId],
          )
        : { rows: [{ total: 0 }] };

      const currentRevenue = parseFloat(revenueResult.rows[0].total);
      const compareRevenue = parseFloat(compareRevenueResult.rows[0].total);
      const orderCount = parseInt(revenueResult.rows[0].order_count, 10);
      const avgTicket = parseFloat(revenueResult.rows[0].avg);

      // Costs
      const costResult = await client.query(
        `SELECT COALESCE(SUM(oi.quantity * COALESCE(p.cost_price, 0)), 0) as total_cost
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.item_id AND oi.item_type = 'product'
         WHERE o.tenant_id = $1 AND o.payment_status = 'paid' ${dateCondition} ${branchCondition}`,
        [tenantId],
      );
      const totalCost = parseFloat(costResult.rows[0].total_cost || '0');

      // Customers
      const customerResult = await client.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE created_at >= '${dateRange.startDate.toISOString()}') as new,
           COUNT(*) FILTER (WHERE visit_count > 1) as returning,
           COUNT(*) FILTER (WHERE membership_tier IN ('gold', 'platinum', 'diamond')) as vip,
           COUNT(*) FILTER (WHERE last_visit_at < NOW() - INTERVAL '60 days' OR last_visit_at IS NULL) as dormant,
           COUNT(*) FILTER (WHERE visit_count >= 3 AND last_visit_at < NOW() - INTERVAL '30 days' AND last_visit_at >= NOW() - INTERVAL '60 days') as at_risk
         FROM customers
         WHERE tenant_id = $1 AND status = 'active'`,
        [tenantId],
      );

      const totalCustomers = parseInt(customerResult.rows[0].total, 10);
      const returningCustomers = parseInt(customerResult.rows[0].returning, 10);

      // Appointments
      const appointmentResult = await client.query(
        `SELECT status, COUNT(*) as count
         FROM appointments
         WHERE tenant_id = $1 ${dateCondition} ${branchConditionA}
         GROUP BY status`,
        [tenantId],
      );

      const appointmentStats = {
        todayTotal: 0,
        todayCompleted: 0,
        todayPending: 0,
        todayCancelled: 0,
      };

      for (const row of appointmentResult.rows) {
        const count = parseInt(row.count, 10);
        appointmentStats.todayTotal += count;
        if (row.status === 'completed') appointmentStats.todayCompleted = count;
        if (row.status === 'pending' || row.status === 'confirmed') appointmentStats.todayPending += count;
        if (row.status === 'cancelled') appointmentStats.todayCancelled = count;
      }

      // Booking rate
      const bookingRateResult = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed', 'in_progress')) as confirmed,
           COUNT(*) as total
         FROM appointments
         WHERE tenant_id = $1 ${dateCondition} ${branchConditionA}`,
        [tenantId],
      );
      const bookingRate = bookingRateResult.rows[0].total > 0
        ? parseInt(bookingRateResult.rows[0].confirmed, 10) / parseInt(bookingRateResult.rows[0].total, 10)
        : 0;

      // Retention rate
      const retention = totalCustomers > 0 ? returningCustomers / totalCustomers : 0;

      // Staff utilization
      const staffUtilization = await this.calculateStaffUtilization(client, tenantId, dateRange, branchId);

      return {
        revenue: {
          total: currentRevenue,
          growth: compareRevenue > 0 ? ((currentRevenue - compareRevenue) / compareRevenue) * 100 : 0,
          orderCount,
          avgTicket,
          compareRevenue,
        },
        profit: {
          total: currentRevenue - totalCost,
          margin: currentRevenue > 0 ? ((currentRevenue - totalCost) / currentRevenue) * 100 : 0,
          cost: totalCost,
        },
        customers: {
          total: totalCustomers,
          new: parseInt(customerResult.rows[0].new, 10),
          returning: returningCustomers,
          vip: parseInt(customerResult.rows[0].vip, 10),
          dormant: parseInt(customerResult.rows[0].dormant, 10),
          atRisk: parseInt(customerResult.rows[0].at_risk, 10),
          retention: retention * 100,
        },
        appointments: appointmentStats,
        kpi: {
          bookingRate: bookingRate * 100,
          staffUtilization: staffUtilization,
          customerRetention: retention * 100,
          avgTicket,
        },
        period: {
          startDate: dateRange.startDate.toISOString(),
          endDate: dateRange.endDate.toISOString(),
          label: this.getPeriodLabel(period, dateRange),
        },
      };
    });
  }

  // ==========================================
  // 2. REVENUE REPORT
  // ==========================================
  async getRevenueReport(tenantId: string, params: RevenueQueryParams): Promise<RevenueReport> {
    return withTenantContext(tenantId, async (client) => {
      const {
        period = 'month',
        branchId,
        groupBy = 'day',
        startDate: customStart,
        endDate: customEnd,
        compareWith,
        includeDetails = false,
      } = params;

      let dateFormat: string;
      let startDate: string;
      let endDate: string;
      let groupByClause: string;

      if (customStart && customEnd) {
        startDate = `'${customStart}'`;
        endDate = `'${customEnd}'`;
        dateFormat = groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
        groupByClause = `to_char(o.created_at, '${dateFormat}')`;
      } else {
        const range = this.getDateRange(period);
        startDate = `'${range.startDate.toISOString()}'`;
        endDate = `'${range.endDate.toISOString()}'`;
        dateFormat = groupBy === 'month' ? 'YYYY-MM' : 'YYYY-MM-DD';
        groupByClause = `to_char(o.created_at, '${dateFormat}')`;
      }

      const branchCond = branchId ? `AND o.branch_id = '${branchId}'` : '';

      const result = await client.query(
        `SELECT ${groupByClause} as date_group,
                SUM(o.total_amount) as revenue,
                COUNT(*) as order_count,
                COALESCE(SUM(CASE WHEN oi.item_type = 'service' THEN oi.total ELSE 0 END), 0) as service_revenue,
                COALESCE(SUM(CASE WHEN oi.item_type = 'product' THEN oi.total ELSE 0 END), 0) as product_revenue,
                COALESCE(AVG(o.total_amount), 0) as avg_ticket
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.tenant_id = $1 AND o.payment_status = 'paid'
           AND o.created_at >= ${startDate} AND o.created_at <= ${endDate} ${branchCond}
         GROUP BY ${groupByClause}
         ORDER BY date_group`,
        [tenantId],
      );

      const data = result.rows.map((r) => ({
        date: r.date_group,
        revenue: parseFloat(r.revenue),
        orderCount: parseInt(r.order_count, 10),
        serviceRevenue: parseFloat(r.service_revenue || '0'),
        productRevenue: parseFloat(r.product_revenue || '0'),
        avgTicket: parseFloat(r.avg_ticket || '0'),
      }));

      const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
      const totalOrders = data.reduce((sum, d) => sum + d.orderCount, 0);

      // Compare with previous period
      let comparison: any = null;
      if (compareWith) {
        const compareStart = new Date(startDate);
        const compareEnd = new Date(endDate);
        const duration = compareEnd.getTime() - compareStart.getTime();
        const prevStart = new Date(compareStart.getTime() - duration);
        const prevEnd = new Date(compareStart.getTime() - 1);

        const compareResult = await client.query(
          `SELECT COALESCE(SUM(total_amount), 0) as total,
                  COUNT(*) as count
           FROM orders
           WHERE tenant_id = $1 AND payment_status = 'paid'
             AND created_at >= '${prevStart.toISOString()}' AND created_at <= '${prevEnd.toISOString()}'
             ${branchCond}`,
          [tenantId],
        );

        const prevRevenue = parseFloat(compareResult.rows[0].total);
        comparison = {
          previousRevenue: prevRevenue,
          growth: prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0,
          previousOrders: parseInt(compareResult.rows[0].count, 10),
        };
      }

      return {
        period: period || 'custom',
        data,
        total: {
          revenue: totalRevenue,
          orderCount: totalOrders,
          avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        },
        comparison,
        summary: {
          serviceRevenue: data.reduce((sum, d) => sum + d.serviceRevenue, 0),
          productRevenue: data.reduce((sum, d) => sum + d.productRevenue, 0),
        },
      };
    });
  }

  // ==========================================
  // 3. CUSTOMER ANALYTICS
  // ==========================================
  async getCustomerAnalytics(tenantId: string, period: string = 'month', segment: string = 'all'): Promise<CustomerAnalytics> {
    return withTenantContext(tenantId, async (client) => {
      const range = this.getDateRange(period);

      // Filter by segment
      let segmentCondition = 'status = $1';
      const segmentValues: any[] = ['active'];
      if (segment === 'vip') {
        segmentCondition += ' AND membership_tier IN ($2, $3, $4)';
        segmentValues.push('gold', 'platinum', 'diamond');
      } else if (segment === 'new') {
        segmentCondition += ` AND created_at >= '${range.startDate.toISOString()}'`;
      } else if (segment === 'dormant') {
        segmentCondition += ` AND (last_visit_at < NOW() - INTERVAL '60 days' OR last_visit_at IS NULL)`;
      } else if (segment === 'at_risk') {
        segmentCondition += ` AND visit_count >= 3 AND last_visit_at < NOW() - INTERVAL '30 days' AND last_visit_at >= NOW() - INTERVAL '60 days'`;
      }

      const segmentIndex = segmentValues.length;

      const totals = await client.query(
        `SELECT
           COUNT(*) as total,
           COUNT(*) FILTER (WHERE created_at >= '${range.startDate.toISOString()}') as new_this_period,
           COUNT(*) FILTER (WHERE visit_count > 1) as returning,
           COALESCE(AVG(total_spent), 0) as avg_ltv,
           COALESCE(AVG(visit_count), 0) as avg_visits
         FROM customers
         WHERE tenant_id = $1 AND ${segmentCondition}`,
        [tenantId, ...segmentValues.slice(1)],
      );

      const total = parseInt(totals.rows[0].total, 10);
      const returning = parseInt(totals.rows[0].returning, 10);

      const segments = await client.query(
        `SELECT membership_tier, COUNT(*) as count,
                COALESCE(AVG(total_spent), 0) as avg_spend,
                COALESCE(AVG(visit_count), 0) as avg_visits
         FROM customers
         WHERE tenant_id = $1 AND status = 'active'
         GROUP BY membership_tier
         ORDER BY count DESC`,
        [tenantId],
      );

      const channels = await client.query(
        `SELECT acquisition_source, COUNT(*) as count,
                COALESCE(AVG(total_spent), 0) as avg_spend
         FROM customers
         WHERE tenant_id = $1
         GROUP BY acquisition_source
         ORDER BY count DESC`,
        [tenantId],
      );

      return {
        totalCustomers: total,
        newCustomers: parseInt(totals.rows[0].new_this_period, 10),
        returningCustomers: returning,
        churnRate: total > 0 ? (1 - (returning / total)) * 100 : 0,
        avgVisitFrequency: parseFloat(totals.rows[0].avg_visits || '0'),
        avgLifetimeValue: parseFloat(totals.rows[0].avg_ltv || '0'),
        segmentDistribution: segments.rows.map((s) => ({
          segment: s.membership_tier || 'none',
          count: parseInt(s.count, 10),
          percentage: total > 0 ? (parseInt(s.count, 10) / total) * 100 : 0,
          avgSpend: parseFloat(s.avg_spend || '0'),
          avgVisits: parseFloat(s.avg_visits || '0'),
        })),
        acquisitionChannels: channels.rows.map((c) => ({
          channel: c.acquisition_source || 'unknown',
          count: parseInt(c.count, 10),
          percentage: total > 0 ? (parseInt(c.count, 10) / total) * 100 : 0,
          avgSpend: parseFloat(c.avg_spend || '0'),
        })),
      };
    });
  }

  // ==========================================
  // 4. STAFF PERFORMANCE
  // ==========================================
  async getStaffPerformance(
    tenantId: string,
    branchId?: string,
    period: string = 'month',
    limit: number = 10,
  ): Promise<StaffPerformanceReport[]> {
    return withTenantContext(tenantId, async (client) => {
      const range = this.getDateRange(period);
      const branchCond = branchId ? `AND a.branch_id = '${branchId}'` : '';
      const dateCond = `AND a.created_at >= '${range.startDate.toISOString()}' AND a.created_at <= '${range.endDate.toISOString()}'`;

      const result = await client.query(
        `SELECT u.id as staff_id, u.full_name as staff_name,
                COUNT(*) as total_appointments,
                COUNT(*) FILTER (WHERE a.status = 'completed') as completed,
                COUNT(*) FILTER (WHERE a.status = 'cancelled') as cancelled,
                COALESCE(SUM(a.total_price) FILTER (WHERE a.status = 'completed'), 0) as total_revenue,
                COALESCE(AVG(CASE WHEN a.status = 'completed' THEN a.total_price END), 0) as avg_ticket
         FROM users u
         LEFT JOIN appointments a ON a.staff_id = u.id ${dateCond} ${branchCond}
         WHERE u.tenant_id = $1 AND u.role IN ('staff', 'manager')
         GROUP BY u.id, u.full_name
         ORDER BY total_revenue DESC
         LIMIT $2`,
        [tenantId, limit],
      );

      const results = result.rows.map((r) => ({
        staffId: r.staff_id,
        staffName: r.staff_name,
        totalAppointments: parseInt(r.total_appointments, 10),
        completedAppointments: parseInt(r.completed, 10),
        cancelledAppointments: parseInt(r.cancelled, 10),
        totalRevenue: parseFloat(r.total_revenue),
        avgTicket: parseFloat(r.avg_ticket || '0'),
        avgRating: 0, // To be implemented
        utilization: 0, // To be implemented
        topServices: [], // To be implemented
      }));

      return results;
    });
  }

  // ==========================================
  // 5. SERVICE ANALYTICS
  // ==========================================
  async getServiceAnalytics(
    tenantId: string,
    branchId?: string,
    period: string = 'month',
    limit: number = 10,
  ): Promise<ServiceAnalytics> {
    return withTenantContext(tenantId, async (client) => {
      const range = this.getDateRange(period);
      const branchCond = branchId ? `AND a.branch_id = '${branchId}'` : '';
      const dateCond = `AND a.created_at >= '${range.startDate.toISOString()}' AND a.created_at <= '${range.endDate.toISOString()}'`;

      const result = await client.query(
        `SELECT s.id as service_id, s.name as service_name,
                COUNT(*) as total_bookings,
                COALESCE(AVG(r.rating), 0) as avg_rating,
                COALESCE(SUM(a.total_price), 0) as total_revenue,
                s.category_id, c.name as category_name
         FROM services s
         JOIN appointments a ON a.service_id = s.id ${dateCond} ${branchCond}
         LEFT JOIN service_reviews r ON r.service_id = s.id
         LEFT JOIN service_categories c ON c.id = s.category_id
         WHERE s.tenant_id = $1 AND s.status = 'active'
         GROUP BY s.id, s.name, s.category_id, c.name
         ORDER BY total_revenue DESC
         LIMIT $2`,
        [tenantId, limit],
      );

      const topServices = result.rows.map((r) => ({
        id: r.service_id,
        name: r.service_name,
        category: r.category_name,
        bookings: parseInt(r.total_bookings, 10),
        revenue: parseFloat(r.total_revenue),
        rating: parseFloat(r.avg_rating || '0'),
      }));

      return {
        topServices,
        summary: {
          totalRevenue: topServices.reduce((sum, s) => sum + s.revenue, 0),
          totalBookings: topServices.reduce((sum, s) => sum + s.bookings, 0),
          topCategory: topServices.length > 0 ? topServices[0].category : '',
        },
      };
    });
  }

  // ==========================================
  // 6. INVENTORY ANALYTICS
  // ==========================================
  async getInventoryAnalytics(tenantId: string, branchId?: string): Promise<InventoryAnalytics> {
    return withTenantContext(tenantId, async (client) => {
      const branchCond = branchId ? `AND branch_id = '${branchId}'` : '';

      const result = await client.query(
        `SELECT
           COUNT(*) as total_products,
           SUM(quantity) as total_units,
           SUM(quantity * price) as total_value,
           SUM(quantity * cost_price) as total_cost,
           COUNT(*) FILTER (WHERE quantity = 0) as out_of_stock,
           COUNT(*) FILTER (WHERE quantity > 0 AND quantity <= min_stock_level) as low_stock,
           COUNT(*) FILTER (WHERE quantity >= max_stock_level) as overstock
         FROM inventory i
         JOIN products p ON p.id = i.product_id
         WHERE i.tenant_id = $1 ${branchCond}`,
        [tenantId],
      );

      const row = result.rows[0];
      const totalProducts = parseInt(row.total_products, 10);

      return {
        totalProducts,
        totalUnits: parseInt(row.total_units, 10),
        totalValue: parseFloat(row.total_value || '0'),
        totalCost: parseFloat(row.total_cost || '0'),
        outOfStock: parseInt(row.out_of_stock, 10),
        lowStock: parseInt(row.low_stock, 10),
        overstock: parseInt(row.overstock, 10),
        healthyStock: totalProducts - parseInt(row.out_of_stock, 10) - parseInt(row.low_stock, 10) - parseInt(row.overstock, 10),
        healthScore: totalProducts > 0
          ? ((totalProducts - parseInt(row.out_of_stock, 10) - parseInt(row.low_stock, 10) - parseInt(row.overstock, 10)) / totalProducts) * 100
          : 0,
      };
    });
  }

  // ==========================================
  // 7. CHANNEL PERFORMANCE
  // ==========================================
  async getChannelPerformance(tenantId: string): Promise<ChannelPerformance[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT acquisition_source as channel,
                COUNT(*) as customer_count,
                COALESCE(AVG(total_spent), 0) as avg_ltv,
                COALESCE(SUM(total_spent), 0) as total_revenue
         FROM customers
         WHERE tenant_id = $1 AND status = 'active'
         GROUP BY acquisition_source
         ORDER BY total_revenue DESC`,
        [tenantId],
      );

      const totalRevenue = result.rows.reduce((sum, r) => sum + parseFloat(r.total_revenue || '0'), 0);

      return result.rows.map((r) => ({
        channel: r.channel || 'unknown',
        customerCount: parseInt(r.customer_count, 10),
        avgLtv: parseFloat(r.avg_ltv || '0'),
        totalRevenue: parseFloat(r.total_revenue || '0'),
        revenuePercentage: totalRevenue > 0 ? (parseFloat(r.total_revenue || '0') / totalRevenue) * 100 : 0,
      }));
    });
  }

  // ==========================================
  // 8. CUSTOM REPORT
  // ==========================================
  async getCustomReport(
    tenantId: string,
    startDate: string,
    endDate: string,
    metrics?: string[],
  ): Promise<CustomReportData> {
    return withTenantContext(tenantId, async (client) => {
      const metricsToFetch = metrics || ['revenue', 'orders', 'customers', 'services', 'staff'];
      const result: CustomReportData = {
        period: { startDate, endDate },
        metrics: {},
        breakdown: {},
      };

      // Revenue
      if (metricsToFetch.includes('revenue')) {
        const revenueResult = await client.query(
          `SELECT to_char(created_at, 'YYYY-MM-DD') as date,
                  SUM(total_amount) as amount,
                  COUNT(*) as count
           FROM orders
           WHERE tenant_id = $1 AND payment_status = 'paid'
             AND created_at >= $2 AND created_at <= $3
           GROUP BY to_char(created_at, 'YYYY-MM-DD')
           ORDER BY date`,
          [tenantId, startDate, endDate],
        );
        result.metrics.revenue = {
          total: revenueResult.rows.reduce((sum, r) => sum + parseFloat(r.amount), 0),
          daily: revenueResult.rows.map((r) => ({
            date: r.date,
            value: parseFloat(r.amount),
            count: parseInt(r.count, 10),
          })),
        };
        result.breakdown.revenue = revenueResult.rows.map((r) => ({
          date: r.date,
          revenue: parseFloat(r.amount),
        }));
      }

      // Orders
      if (metricsToFetch.includes('orders')) {
        const ordersResult = await client.query(
          `SELECT status, COUNT(*) as count
           FROM orders
           WHERE tenant_id = $1 AND created_at >= $2 AND created_at <= $3
           GROUP BY status`,
          [tenantId, startDate, endDate],
        );
        result.metrics.orders = {
          total: ordersResult.rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0),
          byStatus: ordersResult.rows.map((r) => ({
            status: r.status,
            count: parseInt(r.count, 10),
          })),
        };
      }

      // Customers
      if (metricsToFetch.includes('customers')) {
        const customersResult = await client.query(
          `SELECT COUNT(*) as total,
                  COUNT(*) FILTER (WHERE created_at >= $2 AND created_at <= $3) as new
           FROM customers
           WHERE tenant_id = $1`,
          [tenantId, startDate, endDate],
        );
        result.metrics.customers = {
          total: parseInt(customersResult.rows[0].total, 10),
          new: parseInt(customersResult.rows[0].new, 10),
        };
      }

      // Services
      if (metricsToFetch.includes('services')) {
        const servicesResult = await client.query(
          `SELECT s.name, COUNT(*) as bookings, SUM(a.total_price) as revenue
           FROM services s
           JOIN appointments a ON a.service_id = s.id
           WHERE s.tenant_id = $1 AND a.created_at >= $2 AND a.created_at <= $3
           GROUP BY s.name
           ORDER BY revenue DESC
           LIMIT 10`,
          [tenantId, startDate, endDate],
        );
        result.metrics.services = servicesResult.rows.map((r) => ({
          name: r.name,
          bookings: parseInt(r.bookings, 10),
          revenue: parseFloat(r.revenue || '0'),
        }));
      }

      // Staff
      if (metricsToFetch.includes('staff')) {
        const staffResult = await client.query(
          `SELECT u.full_name as name,
                  COUNT(*) as appointments,
                  SUM(a.total_price) as revenue
           FROM users u
           JOIN appointments a ON a.staff_id = u.id
           WHERE u.tenant_id = $1 AND u.role IN ('staff', 'manager')
             AND a.created_at >= $2 AND a.created_at <= $3
           GROUP BY u.full_name
           ORDER BY revenue DESC
           LIMIT 10`,
          [tenantId, startDate, endDate],
        );
        result.metrics.staff = staffResult.rows.map((r) => ({
          name: r.name,
          appointments: parseInt(r.appointments, 10),
          revenue: parseFloat(r.revenue || '0'),
        }));
      }

      return result;
    });
  }

  // ==========================================
  // 9. EXPORT REPORT
  // ==========================================
  async exportReport(tenantId: string, params: ExportParams): Promise<{
    content: Buffer | string;
    filename: string;
    mimeType: string;
  }> {
    const { reportType, format, period, branchId } = params;

    let data: any;
    let columns: string[] = [];
    let rows: string[][] = [];

    switch (reportType) {
      case 'revenue': {
        const report = await this.getRevenueReport(tenantId, { period, branchId, groupBy: 'day' });
        data = report.data;
        columns = ['Date', 'Revenue', 'Order Count', 'Avg Ticket'];
        rows = data.map((d: any) => [
          d.date,
          d.revenue.toFixed(2),
          d.orderCount.toString(),
          d.avgTicket.toFixed(2),
        ]);
        break;
      }
      case 'staff': {
        const report = await this.getStaffPerformance(tenantId, branchId, period);
        data = report;
        columns = ['Staff', 'Total Appointments', 'Completed', 'Revenue', 'Avg Ticket'];
        rows = data.map((d: any) => [
          d.staffName,
          d.totalAppointments.toString(),
          d.completedAppointments.toString(),
          d.totalRevenue.toFixed(2),
          d.avgTicket.toFixed(2),
        ]);
        break;
      }
      case 'services': {
        const report = await this.getServiceAnalytics(tenantId, branchId, period);
        data = report.topServices;
        columns = ['Service', 'Category', 'Bookings', 'Revenue', 'Rating'];
        rows = data.map((d: any) => [
          d.name,
          d.category || 'N/A',
          d.bookings.toString(),
          d.revenue.toFixed(2),
          d.rating.toFixed(1),
        ]);
        break;
      }
      case 'customers': {
        const report = await this.getCustomerAnalytics(tenantId, period);
        columns = ['Total Customers', 'New', 'Returning', 'Avg LTV', 'Avg Visits'];
        rows = [[
          report.totalCustomers.toString(),
          report.newCustomers.toString(),
          report.returningCustomers.toString(),
          report.avgLifetimeValue.toFixed(2),
          report.avgVisitFrequency.toFixed(2),
        ]];
        break;
      }
      case 'inventory': {
        const report = await this.getInventoryAnalytics(tenantId, branchId);
        columns = ['Total Products', 'Total Units', 'Total Value', 'Out of Stock', 'Low Stock'];
        rows = [[
          report.totalProducts.toString(),
          report.totalUnits.toString(),
          report.totalValue.toFixed(2),
          report.outOfStock.toString(),
          report.lowStock.toString(),
        ]];
        break;
      }
      default:
        throw new NotFoundError('Report type', reportType);
    }

    // Generate CSV
    const csvContent = [columns.join(','), ...rows.map(r => r.join(','))].join('\n');

    // Generate Excel (XLSX) - Placeholder
    let content: Buffer | string = csvContent;
    let mimeType = 'text/csv';
    let extension = 'csv';

    if (format === 'excel') {
      // TODO: Use exceljs or similar library
      // For now, return CSV with .xlsx extension (will be handled client-side)
      content = csvContent;
      mimeType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      extension = 'xlsx';
    } else if (format === 'pdf') {
      // TODO: Use pdfkit or similar library
      // For now, return CSV with .pdf extension
      content = csvContent;
      mimeType = 'application/pdf';
      extension = 'pdf';
    }

    const filename = `report-${reportType}-${period}-${new Date().toISOString().slice(0, 10)}.${extension}`;

    return {
      content,
      filename,
      mimeType,
    };
  }

  // ==========================================
  // 10. UTILITY FUNCTIONS
  // ==========================================

  private getDateRange(period: string): { startDate: Date; endDate: Date } {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date(now);

    switch (period) {
      case 'today':
        startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      case 'week':
        startDate = getWeekStart(now);
        endDate = getWeekEnd(now);
        break;
      case 'month':
        startDate = getMonthStart(now);
        endDate = getMonthEnd(now);
        break;
      case 'quarter':
        const quarterMonth = Math.floor(now.getMonth() / 3) * 3;
        startDate = new Date(now.getFullYear(), quarterMonth, 1);
        endDate = new Date(now.getFullYear(), quarterMonth + 3, 0, 23, 59, 59, 999);
        break;
      case 'year':
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      default:
        startDate = getMonthStart(now);
        endDate = getMonthEnd(now);
    }

    return { startDate, endDate };
  }

  private getCompareRange(period: string): { startDate: Date; endDate: Date } | null {
    const range = this.getDateRange(period);
    const duration = range.endDate.getTime() - range.startDate.getTime();
    return {
      startDate: new Date(range.startDate.getTime() - duration),
      endDate: new Date(range.startDate.getTime() - 1),
    };
  }

  private getPeriodLabel(period: string, range: { startDate: Date; endDate: Date }): string {
    if (period === 'custom') {
      return `${range.startDate.toISOString().slice(0, 10)} - ${range.endDate.toISOString().slice(0, 10)}`;
    }
    const labels: Record<string, string> = {
      today: 'Today',
      week: 'This Week',
      month: 'This Month',
      quarter: 'This Quarter',
      year: 'This Year',
    };
    return labels[period] || 'Custom Period';
  }

  private async calculateStaffUtilization(
    client: any,
    tenantId: string,
    dateRange: { startDate: Date; endDate: Date },
    branchId?: string,
  ): Promise<number> {
    // Calculate staff utilization based on appointments vs available hours
    const branchCond = branchId ? `AND branch_id = '${branchId}'` : '';

    const result = await client.query(
      `SELECT
         COUNT(DISTINCT staff_id) as active_staff,
         COUNT(*) as total_appointments,
         SUM(duration_minutes) as total_minutes
       FROM appointments a
       JOIN services s ON s.id = a.service_id
       WHERE a.tenant_id = $1
         AND a.status NOT IN ('cancelled', 'no_show')
         AND a.created_at >= '${dateRange.startDate.toISOString()}'
         AND a.created_at <= '${dateRange.endDate.toISOString()}'
         ${branchCond}`,
      [tenantId],
    );

    const activeStaff = parseInt(result.rows[0].active_staff, 10);
    const totalMinutes = parseInt(result.rows[0].total_minutes, 10);

    if (activeStaff === 0) return 0;

    // Assuming 8 hours per day, 5 days per week
    const daysInRange = Math.ceil((dateRange.endDate.getTime() - dateRange.startDate.getTime()) / (1000 * 60 * 60 * 24));
    const totalAvailableMinutes = activeStaff * daysInRange * 8 * 60;

    return totalAvailableMinutes > 0 ? (totalMinutes / totalAvailableMinutes) * 100 : 0;
  }
}