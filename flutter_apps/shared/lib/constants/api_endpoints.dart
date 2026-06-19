class ApiEndpoints {
  static String baseUrl = 'http://localhost:3000';

  // Auth
  static const String login = '/api/v1/auth/login';
  static const String register = '/api/v1/auth/register';
  static const String refreshToken = '/api/v1/auth/refresh-token';
  static const String forgotPassword = '/api/v1/auth/forgot-password';
  static const String resetPassword = '/api/v1/auth/reset-password';
  static const String profile = '/api/v1/auth/profile';

  // Customers
  static const String customers = '/api/v1/customers';
  static const String customerSegments = '/api/v1/customers/segments';

  // Appointments
  static const String appointments = '/api/v1/appointments';
  static const String appointmentCalendar = '/api/v1/appointments/calendar';
  static const String availableSlots = '/api/v1/availability/slots';

  // Services
  static const String services = '/api/v1/services';
  static const String serviceCategories = '/api/v1/service-categories';

  // Products
  static const String products = '/api/v1/products';

  // Orders
  static const String orders = '/api/v1/orders';
  static const String invoices = '/api/v1/invoices';

  // Inventory
  static const String inventory = '/api/v1/inventory';
  static const String inventoryAlerts = '/api/v1/inventory/alerts';
  static const String inventoryReceive = '/api/v1/inventory/receive';
  static const String inventoryDispatch = '/api/v1/inventory/dispatch';
  static const String inventoryTransfer = '/api/v1/inventory/transfer';

  // Dashboard
  static const String dashboardOverview = '/api/v1/dashboard/overview';
  static const String dashboardRevenue = '/api/v1/dashboard/revenue';
  static const String dashboardStaffPerformance = '/api/v1/dashboard/staff-performance';

  // Analytics
  static const String analyticsRevenue = '/api/v1/analytics/revenue';
  static const String analyticsCustomers = '/api/v1/analytics/customers';
  static const String analyticsStaff = '/api/v1/analytics/staff';

  // AI
  static const String aiChat = '/api/v1/ai/chat';
  static const String aiConversations = '/api/v1/ai/conversations';
  static const String aiSkinAnalysis = '/api/v1/ai/skin-analysis';
  static const String aiSalesConsult = '/api/v1/ai/sales/consult';
  static const String aiMarketing = '/api/v1/ai/marketing/generate-campaign';
  static const String aiKnowledgeUpload = '/api/v1/ai/knowledge/upload';
  static const String aiKnowledgeDocuments = '/api/v1/ai/knowledge/documents';
  static const String aiKnowledgeTrain = '/api/v1/ai/knowledge/train';

  // Admin
  static const String adminTenants = '/api/v1/admin/tenants';
  static const String adminRevenue = '/api/v1/admin/revenue';
  static const String adminAiUsage = '/api/v1/admin/ai-usage';
  static const String adminPlans = '/api/v1/admin/plans';
  static const String adminSubscriptions = '/api/v1/admin/subscriptions';
}
