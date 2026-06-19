import { AuditFields, TenantScoped, BranchScoped } from './common';

export interface DailyMetrics extends AuditFields, BranchScoped {
  id: string;
  date: Date;
  revenue: number;
  orderCount: number;
  newCustomers: number;
  returningCustomers: number;
  avgTicket: number;
  topServices: Array<{ serviceId: string; name: string; count: number; revenue: number }>;
  topProducts: Array<{ productId: string; name: string; count: number; revenue: number }>;
  staffPerformance: Array<{ staffId: string; name: string; appointments: number; revenue: number; rating: number }>;
}

export interface DashboardOverview {
  revenue: {
    today: number;
    week: number;
    month: number;
    year: number;
    todayGrowth: number;
    monthGrowth: number;
  };
  profit: {
    month: number;
    margin: number;
  };
  kpi: {
    avgTicket: number;
    customerRetention: number;
    bookingRate: number;
    staffUtilization: number;
  };
  customers: {
    total: number;
    newThisMonth: number;
    vip: number;
    dormant: number;
    atRisk: number;
  };
  appointments: {
    todayTotal: number;
    todayCompleted: number;
    todayPending: number;
    todayCancelled: number;
  };
}

export interface RevenueReport {
  period: string;
  data: Array<{
    date: string;
    revenue: number;
    orderCount: number;
    serviceRevenue: number;
    productRevenue: number;
  }>;
  total: {
    revenue: number;
    orderCount: number;
    avgTicket: number;
  };
  comparison?: {
    previousPeriodRevenue: number;
    growthPercentage: number;
  };
}

export interface CustomerAnalytics {
  totalCustomers: number;
  newCustomers: number;
  returningCustomers: number;
  churnRate: number;
  avgVisitFrequency: number;
  avgLifetimeValue: number;
  segmentDistribution: Array<{
    segment: string;
    count: number;
    percentage: number;
    avgSpend: number;
  }>;
  acquisitionChannels: Array<{
    channel: string;
    count: number;
    percentage: number;
  }>;
}

export interface StaffPerformanceReport {
  staffId: string;
  staffName: string;
  totalAppointments: number;
  completedAppointments: number;
  cancelledAppointments: number;
  totalRevenue: number;
  avgRating: number;
  utilization: number;
  topServices: Array<{ serviceName: string; count: number }>;
}

export interface AuditLog extends AuditFields {
  id: string;
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  ipAddress?: string;
}
