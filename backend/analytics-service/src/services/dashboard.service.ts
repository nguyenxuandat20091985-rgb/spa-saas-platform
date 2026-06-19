import { withTenantContext } from '../../../shared/database/tenant-context';
import { DashboardOverview, RevenueReport, CustomerAnalytics, StaffPerformanceReport } from '../../../shared/types/analytics';
import { rowsToCamelCase } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';

const logger = createServiceLogger('dashboard');

export class DashboardService {
  async getOverview(tenantId: string, branchId?: string): Promise<DashboardOverview> {
    return withTenantContext(tenantId, async (client) => {
      const branchCondition = branchId ? `AND branch_id = '${branchId}'` : '';

      // Revenue
      const todayRevenue = await client.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders
         WHERE tenant_id = $1 AND payment_status = 'paid'
           AND DATE(created_at) = CURRENT_DATE ${branchCondition}`,
        [tenantId],
      );

      const weekRevenue = await client.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders
         WHERE tenant_id = $1 AND payment_status = 'paid'
           AND created_at >= date_trunc('week', NOW()) ${branchCondition}`,
        [tenantId],
      );

      const monthRevenue = await client.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders
         WHERE tenant_id = $1 AND payment_status = 'paid'
           AND created_at >= date_trunc('month', NOW()) ${branchCondition}`,
        [tenantId],
      );

      const yearRevenue = await client.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders
         WHERE tenant_id = $1 AND payment_status = 'paid'
           AND created_at >= date_trunc('year', NOW()) ${branchCondition}`,
        [tenantId],
      );

      // Previous month for comparison
      const prevMonthRevenue = await client.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders
         WHERE tenant_id = $1 AND payment_status = 'paid'
           AND created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
           AND created_at < date_trunc('month', NOW()) ${branchCondition}`,
        [tenantId],
      );

      const previousDay = await client.query(
        `SELECT COALESCE(SUM(total_amount), 0) as total FROM orders
         WHERE tenant_id = $1 AND payment_status = 'paid'
           AND DATE(created_at) = CURRENT_DATE - 1 ${branchCondition}`,
        [tenantId],
      );

      const todayVal = parseFloat(todayRevenue.rows[0].total);
      const prevDayVal = parseFloat(previousDay.rows[0].total);
      const monthVal = parseFloat(monthRevenue.rows[0].total);
      const prevMonthVal = parseFloat(prevMonthRevenue.rows[0].total);

      // Costs for profit
      const monthCosts = await client.query(
        `SELECT COALESCE(SUM(oi.quantity * p.cost_price), 0) as total_cost
         FROM order_items oi
         JOIN orders o ON o.id = oi.order_id
         LEFT JOIN products p ON p.id = oi.item_id AND oi.item_type = 'product'
         WHERE o.tenant_id = $1 AND o.payment_status = 'paid'
           AND o.created_at >= date_trunc('month', NOW()) ${branchCondition}`,
        [tenantId],
      );
      const costVal = parseFloat(monthCosts.rows[0].total_cost || '0');

      // KPI
      const avgTicket = await client.query(
        `SELECT COALESCE(AVG(total_amount), 0) as avg FROM orders
         WHERE tenant_id = $1 AND payment_status = 'paid'
           AND created_at >= date_trunc('month', NOW()) ${branchCondition}`,
        [tenantId],
      );

      const totalCustomers = await client.query(
        "SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND status = 'active'",
        [tenantId],
      );

      const returningCustomers = await client.query(
        "SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND visit_count > 1 AND status = 'active'",
        [tenantId],
      );

      const newThisMonth = await client.query(
        `SELECT COUNT(*) FROM customers WHERE tenant_id = $1
         AND created_at >= date_trunc('month', NOW())`,
        [tenantId],
      );

      const vipCustomers = await client.query(
        "SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND membership_tier IN ('gold', 'platinum', 'diamond') AND status = 'active'",
        [tenantId],
      );

      const dormantCustomers = await client.query(
        `SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND status = 'active'
         AND (last_visit_at < NOW() - INTERVAL '60 days' OR last_visit_at IS NULL)`,
        [tenantId],
      );

      const atRiskCustomers = await client.query(
        `SELECT COUNT(*) FROM customers WHERE tenant_id = $1 AND status = 'active'
         AND visit_count >= 3 AND last_visit_at < NOW() - INTERVAL '30 days'
         AND last_visit_at >= NOW() - INTERVAL '60 days'`,
        [tenantId],
      );

      // Today appointments
      const todayAppointments = await client.query(
        `SELECT status, COUNT(*) as count FROM appointments
         WHERE tenant_id = $1 AND DATE(start_time) = CURRENT_DATE ${branchCondition}
         GROUP BY status`,
        [tenantId],
      );

      const appointmentStats = {
        todayTotal: 0, todayCompleted: 0, todayPending: 0, todayCancelled: 0,
      };

      for (const row of todayAppointments.rows) {
        const count = parseInt(row.count, 10);
        appointmentStats.todayTotal += count;
        if (row.status === 'completed') appointmentStats.todayCompleted = count;
        if (row.status === 'pending' || row.status === 'confirmed') appointmentStats.todayPending += count;
        if (row.status === 'cancelled') appointmentStats.todayCancelled = count;
      }

      // Booking rate (confirmed / total this month)
      const bookingRateResult = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status IN ('confirmed', 'completed', 'in_progress')) as confirmed,
           COUNT(*) as total
         FROM appointments
         WHERE tenant_id = $1 AND created_at >= date_trunc('month', NOW()) ${branchCondition}`,
        [tenantId],
      );
      const bookingRate = bookingRateResult.rows[0].total > 0
        ? parseInt(bookingRateResult.rows[0].confirmed, 10) / parseInt(bookingRateResult.rows[0].total, 10)
        : 0;

      const totalCust = parseInt(totalCustomers.rows[0].count, 10);
      const returningCust = parseInt(returningCustomers.rows[0].count, 10);
      const retention = totalCust > 0 ? returningCust / totalCust : 0;

      return {
        revenue: {
          today: todayVal,
          week: parseFloat(weekRevenue.rows[0].total),
          month: monthVal,
          year: parseFloat(yearRevenue.rows[0].total),
          todayGrowth: prevDayVal > 0 ? ((todayVal - prevDayVal) / prevDayVal) * 100 : 0,
          monthGrowth: prevMonthVal > 0 ? ((monthVal - prevMonthVal) / prevMonthVal) * 100 : 0,
        },
        profit: {
          month: monthVal - costVal,
          margin: monthVal > 0 ? ((monthVal - costVal) / monthVal) * 100 : 0,
        },
        kpi: {
          avgTicket: parseFloat(avgTicket.rows[0].avg),
          customerRetention: retention * 100,
          bookingRate: bookingRate * 100,
          staffUtilization: 0, // TODO: calculate from schedules
        },
        customers: {
          total: totalCust,
          newThisMonth: parseInt(newThisMonth.rows[0].count, 10),
          vip: parseInt(vipCustomers.rows[0].count, 10),
          dormant: parseInt(dormantCustomers.rows[0].count, 10),
          atRisk: parseInt(atRiskCustomers.rows[0].count, 10),
        },
        appointments: appointmentStats,
      };
    });
  }

  async getRevenueReport(tenantId: string, period: string, branchId?: string): Promise<RevenueReport> {
    return withTenantContext(tenantId, async (client) => {
      let dateFormat: string;
      let startDate: string;

      switch (period) {
        case 'week':
          dateFormat = 'YYYY-MM-DD';
          startDate = "NOW() - INTERVAL '7 days'";
          break;
        case 'month':
          dateFormat = 'YYYY-MM-DD';
          startDate = "date_trunc('month', NOW())";
          break;
        case 'year':
          dateFormat = 'YYYY-MM';
          startDate = "date_trunc('year', NOW())";
          break;
        default:
          dateFormat = 'YYYY-MM-DD';
          startDate = "date_trunc('month', NOW())";
      }

      const branchCond = branchId ? `AND o.branch_id = '${branchId}'` : '';

      const result = await client.query(
        `SELECT to_char(o.created_at, '${dateFormat}') as date,
                SUM(o.total_amount) as revenue,
                COUNT(*) as order_count,
                SUM(CASE WHEN oi.item_type = 'service' THEN oi.total ELSE 0 END) as service_revenue,
                SUM(CASE WHEN oi.item_type = 'product' THEN oi.total ELSE 0 END) as product_revenue
         FROM orders o
         LEFT JOIN order_items oi ON oi.order_id = o.id
         WHERE o.tenant_id = $1 AND o.payment_status = 'paid'
           AND o.created_at >= ${startDate} ${branchCond}
         GROUP BY to_char(o.created_at, '${dateFormat}')
         ORDER BY date`,
        [tenantId],
      );

      const data = result.rows.map((r) => ({
        date: r.date,
        revenue: parseFloat(r.revenue),
        orderCount: parseInt(r.order_count, 10),
        serviceRevenue: parseFloat(r.service_revenue || '0'),
        productRevenue: parseFloat(r.product_revenue || '0'),
      }));

      const totalRevenue = data.reduce((sum, d) => sum + d.revenue, 0);
      const totalOrders = data.reduce((sum, d) => sum + d.orderCount, 0);

      return {
        period,
        data,
        total: {
          revenue: totalRevenue,
          orderCount: totalOrders,
          avgTicket: totalOrders > 0 ? totalRevenue / totalOrders : 0,
        },
      };
    });
  }

  async getCustomerAnalytics(tenantId: string): Promise<CustomerAnalytics> {
    return withTenantContext(tenantId, async (client) => {
      const totals = await client.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'active') as total,
           COUNT(*) FILTER (WHERE created_at >= date_trunc('month', NOW())) as new_this_month,
           COUNT(*) FILTER (WHERE visit_count > 1 AND status = 'active') as returning,
           AVG(total_spent) FILTER (WHERE status = 'active') as avg_ltv,
           AVG(visit_count) FILTER (WHERE visit_count > 0 AND status = 'active') as avg_visits
         FROM customers WHERE tenant_id = $1`,
        [tenantId],
      );

      const total = parseInt(totals.rows[0].total, 10);
      const returning = parseInt(totals.rows[0].returning, 10);

      const segments = await client.query(
        `SELECT membership_tier, COUNT(*) as count, AVG(total_spent) as avg_spend
         FROM customers WHERE tenant_id = $1 AND status = 'active'
         GROUP BY membership_tier`,
        [tenantId],
      );

      const channels = await client.query(
        `SELECT acquisition_source, COUNT(*) as count
         FROM customers WHERE tenant_id = $1
         GROUP BY acquisition_source`,
        [tenantId],
      );

      return {
        totalCustomers: total,
        newCustomers: parseInt(totals.rows[0].new_this_month, 10),
        returningCustomers: returning,
        churnRate: 0,
        avgVisitFrequency: parseFloat(totals.rows[0].avg_visits || '0'),
        avgLifetimeValue: parseFloat(totals.rows[0].avg_ltv || '0'),
        segmentDistribution: segments.rows.map((s) => ({
          segment: s.membership_tier || 'none',
          count: parseInt(s.count, 10),
          percentage: total > 0 ? (parseInt(s.count, 10) / total) * 100 : 0,
          avgSpend: parseFloat(s.avg_spend || '0'),
        })),
        acquisitionChannels: channels.rows.map((c) => ({
          channel: c.acquisition_source || 'unknown',
          count: parseInt(c.count, 10),
          percentage: total > 0 ? (parseInt(c.count, 10) / total) * 100 : 0,
        })),
      };
    });
  }

  async getStaffPerformance(tenantId: string, branchId?: string): Promise<StaffPerformanceReport[]> {
    return withTenantContext(tenantId, async (client) => {
      const branchCond = branchId ? `AND a.branch_id = '${branchId}'` : '';

      const result = await client.query(
        `SELECT u.id as staff_id, u.full_name as staff_name,
                COUNT(*) as total_appointments,
                COUNT(*) FILTER (WHERE a.status = 'completed') as completed,
                COUNT(*) FILTER (WHERE a.status = 'cancelled') as cancelled,
                COALESCE(SUM(a.total_price) FILTER (WHERE a.status = 'completed'), 0) as total_revenue
         FROM users u
         LEFT JOIN appointments a ON a.staff_id = u.id
           AND a.created_at >= date_trunc('month', NOW()) ${branchCond}
         WHERE u.tenant_id = $1 AND u.role IN ('staff', 'manager')
         GROUP BY u.id, u.full_name
         ORDER BY total_revenue DESC`,
        [tenantId],
      );

      return result.rows.map((r) => ({
        staffId: r.staff_id,
        staffName: r.staff_name,
        totalAppointments: parseInt(r.total_appointments, 10),
        completedAppointments: parseInt(r.completed, 10),
        cancelledAppointments: parseInt(r.cancelled, 10),
        totalRevenue: parseFloat(r.total_revenue),
        avgRating: 0,
        utilization: 0,
        topServices: [],
      }));
    });
  }
}
