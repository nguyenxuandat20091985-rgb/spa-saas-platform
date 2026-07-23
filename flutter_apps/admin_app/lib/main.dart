import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/formatters.dart';
import 'package:spa_shared/widgets/loading_widget.dart';
import 'package:spa_shared/widgets/empty_state_widget.dart';
import 'package:spa_shared/widgets/stat_card.dart';
import 'package:fl_chart/fl_chart.dart';
import 'bloc/admin/admin_bloc.dart';
import 'bloc/admin/admin_event.dart';
import 'bloc/admin/admin_state.dart';
import 'services/admin_api_service.dart';
import 'repositories/admin_repository.dart';
import 'widgets/sidebar_navigation.dart';
import 'widgets/tenant_list.dart';
import 'widgets/plans_grid.dart';
import 'widgets/ai_usage_chart.dart';
import 'widgets/revenue_chart.dart';
import 'widgets/settings_list.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize dependencies
  final prefs = await SharedPreferences.getInstance();
  final apiService = AdminApiService();
  final adminRepository = AdminRepository(apiService, prefs);

  runApp(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AdminRepository>.value(value: adminRepository),
        RepositoryProvider<AdminApiService>.value(value: apiService),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AdminBloc>(
            create: (context) => AdminBloc(adminRepository)..add(LoadAdminDashboardEvent()),
          ),
        ],
        child: const AdminApp(),
      ),
    ),
  );
}

class AdminApp extends StatelessWidget {
  const AdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Spa Admin Platform',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2C3E50),
          brightness: Brightness.light,
        ),
        scaffoldBackgroundColor: const Color(0xFFF5F6FA),
        textTheme: GoogleFonts.interTextTheme(),
        appBarTheme: AppBarTheme(
          backgroundColor: const Color(0xFF2C3E50),
          foregroundColor: Colors.white,
          elevation: 0,
          titleTextStyle: GoogleFonts.inter(
            fontSize: 18,
            fontWeight: FontWeight.w600,
            color: Colors.white,
          ),
          iconTheme: const IconThemeData(color: Colors.white),
        ),
        cardTheme: CardTheme(
          elevation: 2,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: Colors.white,
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(8),
            borderSide: BorderSide.none,
          ),
          contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        ),
        elevatedButtonTheme: ElevatedButtonThemeData(
          style: ElevatedButton.styleFrom(
            backgroundColor: const Color(0xFF2C3E50),
            foregroundColor: Colors.white,
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(8),
            ),
            padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 24),
          ),
        ),
      ),
      darkTheme: ThemeData(
        useMaterial3: true,
        colorScheme: ColorScheme.fromSeed(
          seedColor: const Color(0xFF2C3E50),
          brightness: Brightness.dark,
        ),
        scaffoldBackgroundColor: const Color(0xFF1A1A2E),
      ),
      themeMode: ThemeMode.system,
      home: const AdminMainShell(),
    );
  }
}

class AdminMainShell extends StatefulWidget {
  const AdminMainShell({super.key});

  @override
  State<AdminMainShell> createState() => _AdminMainShellState();
}

class _AdminMainShellState extends State<AdminMainShell>
    with SingleTickerProviderStateMixin {
  int _currentIndex = 0;

  final List<Widget> _pages = const [
    _AdminDashboard(),
    _TenantsPage(),
    _PlansPage(),
    _AiUsagePage(),
    _RevenuePage(),
    _SettingsPage(),
  ];

  final List<String> _titles = [
    'Dashboard',
    'Tenant Management',
    'Subscription Plans',
    'AI Usage',
    'Revenue',
    'Settings',
  ];

  final List<IconData> _icons = [
    Icons.dashboard,
    Icons.business,
    Icons.subscriptions,
    Icons.auto_awesome,
    Icons.attach_money,
    Icons.settings,
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          // Sidebar
          SidebarNavigation(
            selectedIndex: _currentIndex,
            onDestinationSelected: (index) {
              setState(() => _currentIndex = index);
            },
            titles: _titles,
            icons: _icons,
          ),
          const VerticalDivider(width: 1),

          // Main Content
          Expanded(
            child: IndexedStack(
              index: _currentIndex,
              children: _pages,
            ),
          ),
        ],
      ),
    );
  }
}

// ==========================================
// ADMIN DASHBOARD
// ==========================================
class _AdminDashboard extends StatefulWidget {
  const _AdminDashboard();

  @override
  State<_AdminDashboard> createState() => _AdminDashboardState();
}

class _AdminDashboardState extends State<_AdminDashboard>
    with AutomaticKeepAliveClientMixin {
  @override
  bool get wantKeepAlive => true;

  @override
  Widget build(BuildContext context) {
    super.build(context);

    return BlocConsumer<AdminBloc, AdminState>(
      listener: (context, state) {
        if (state is AdminError) {
          ScaffoldMessenger.of(context).showSnackBar(
            SnackBar(
              content: Text(state.message),
              backgroundColor: Colors.red,
              behavior: SnackBarBehavior.floating,
            ),
          );
        }
      },
      builder: (context, state) {
        if (state is AdminLoading && state.isInitial) {
          return Scaffold(
            appBar: AppBar(title: const Text('Admin Dashboard')),
            body: const Center(child: LoadingWidget()),
          );
        }

        final dashboard = state is AdminDashboardLoaded ? state.data : null;

        return Scaffold(
          appBar: AppBar(
            title: const Text('Admin Dashboard'),
            actions: [
              IconButton(
                icon: const Icon(Icons.refresh),
                onPressed: () {
                  context.read<AdminBloc>().add(const LoadAdminDashboardEvent());
                },
              ),
              IconButton(
                icon: const Icon(Icons.download_outlined),
                onPressed: () {},
              ),
            ],
          ),
          body: RefreshIndicator(
            onRefresh: () async {
              context.read<AdminBloc>().add(const LoadAdminDashboardEvent());
            },
            child: SingleChildScrollView(
              padding: const EdgeInsets.all(24),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  // Stats
                  GridView.count(
                    crossAxisCount: 4,
                    shrinkWrap: true,
                    physics: const NeverScrollableScrollPhysics(),
                    crossAxisSpacing: 16,
                    mainAxisSpacing: 16,
                    childAspectRatio: 1.6,
                    children: [
                      StatCard(
                        title: 'Total Tenants',
                        value: '${dashboard?.totalTenants ?? 0}',
                        icon: Icons.business,
                        color: AppColors.info,
                        growth: dashboard?.tenantGrowth,
                      ),
                      StatCard(
                        title: 'Active Subscriptions',
                        value: '${dashboard?.activeSubscriptions ?? 0}',
                        icon: Icons.subscriptions,
                        color: AppColors.success,
                        growth: dashboard?.subscriptionGrowth,
                      ),
                      StatCard(
                        title: 'Monthly Revenue',
                        value: AppFormatters.currency(dashboard?.monthlyRevenue ?? 0),
                        icon: Icons.attach_money,
                        color: AppColors.accent,
                        growth: dashboard?.revenueGrowth,
                      ),
                      StatCard(
                        title: 'AI Tokens Used',
                        value: '${dashboard?.aiTokensUsed ?? 0}',
                        icon: Icons.auto_awesome,
                        color: AppColors.primary,
                        growth: dashboard?.aiGrowth,
                      ),
                    ],
                  ),
                  const SizedBox(height: 24),

                  // Revenue Chart
                  if (dashboard?.revenueData != null && dashboard!.revenueData.isNotEmpty) ...[
                    Text(
                      'Revenue Trend',
                      style: GoogleFonts.inter(
                        fontSize: 18,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Container(
                      padding: const EdgeInsets.all(16),
                      decoration: BoxDecoration(
                        color: Colors.white,
                        borderRadius: BorderRadius.circular(12),
                        border: Border.all(color: AppColors.divider),
                      ),
                      height: 250,
                      child: RevenueChart(data: dashboard.revenueData),
                    ),
                    const SizedBox(height: 24),
                  ],

                  // Recent Tenants
                  Row(
                    mainAxisAlignment: MainAxisAlignment.spaceBetween,
                    children: [
                      Text(
                        'Recent Tenants',
                        style: GoogleFonts.inter(
                          fontSize: 18,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                      TextButton(
                        onPressed: () {
                          // Navigate to tenants page
                        },
                        child: const Text('View All'),
                      ),
                    ],
                  ),
                  const SizedBox(height: 12),
                  Container(
                    decoration: BoxDecoration(
                      color: Colors.white,
                      borderRadius: BorderRadius.circular(12),
                      border: Border.all(color: AppColors.divider),
                    ),
                    child: dashboard?.recentTenants?.isNotEmpty ?? false
                        ? ListView.separated(
                            shrinkWrap: true,
                            physics: const NeverScrollableScrollPhysics(),
                            itemCount: dashboard.recentTenants.length,
                            separatorBuilder: (_, __) => const Divider(),
                            itemBuilder: (context, index) {
                              final tenant = dashboard.recentTenants[index];
                              return ListTile(
                                leading: CircleAvatar(
                                  backgroundColor: AppColors.primary.withOpacity(0.1),
                                  child: Text(
                                    tenant.name[0].toUpperCase(),
                                    style: const TextStyle(color: AppColors.primary),
                                  ),
                                ),
                                title: Text(tenant.name),
                                subtitle: Text(tenant.email),
                                trailing: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                                  decoration: BoxDecoration(
                                    color: _getStatusColor(tenant.status).withOpacity(0.1),
                                    borderRadius: BorderRadius.circular(8),
                                  ),
                                  child: Text(
                                    tenant.status,
                                    style: TextStyle(
                                      color: _getStatusColor(tenant.status),
                                      fontSize: 12,
                                      fontWeight: FontWeight.w500,
                                    ),
                                  ),
                                ),
                              );
                            },
                          )
                        : const Center(
                            child: Padding(
                              padding: EdgeInsets.all(32),
                              child: Text(
                                'No tenants yet',
                                style: TextStyle(color: AppColors.textSecondary),
                              ),
                            ),
                          ),
                  ),
                  const SizedBox(height: 24),

                  // Quick Actions
                  Text(
                    'Quick Actions',
                    style: GoogleFonts.inter(
                      fontSize: 18,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 12),
                  Wrap(
                    spacing: 8,
                    runSpacing: 8,
                    children: [
                      _QuickAction(
                        icon: Icons.business_center,
                        label: 'Add Tenant',
                        onTap: () {},
                        color: AppColors.primary,
                      ),
                      _QuickAction(
                        icon: Icons.subscriptions,
                        label: 'Manage Plans',
                        onTap: () {},
                        color: AppColors.success,
                      ),
                      _QuickAction(
                        icon: Icons.auto_awesome,
                        label: 'AI Settings',
                        onTap: () {},
                        color: const Color(0xFF9B59B6),
                      ),
                      _QuickAction(
                        icon: Icons.attach_money,
                        label: 'View Revenue',
                        onTap: () {},
                        color: AppColors.accent,
                      ),
                    ],
                  ),
                  const SizedBox(height: 32),
                ],
              ),
            ),
          ),
        );
      },
    );
  }

  Color _getStatusColor(String status) {
    switch (status.toLowerCase()) {
      case 'active':
        return AppColors.success;
      case 'trial':
        return AppColors.info;
      case 'suspended':
        return AppColors.warning;
      case 'cancelled':
        return AppColors.error;
      default:
        return AppColors.textSecondary;
    }
  }
}

// ==========================================
// QUICK ACTION
// ==========================================
class _QuickAction extends StatelessWidget {
  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final Color color;

  const _QuickAction({
    required this.icon,
    required this.label,
    required this.onTap,
    required this.color,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 12),
        decoration: BoxDecoration(
          color: color.withOpacity(0.05),
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: color.withOpacity(0.2)),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, color: color, size: 18),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                color: color,
                fontWeight: FontWeight.w500,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

// ==========================================
// TENANTS PAGE
// ==========================================
class _TenantsPage extends StatelessWidget {
  const _TenantsPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tenant Management'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddTenantDialog(context),
          ),
          IconButton(
            icon: const Icon(Icons.filter_list),
            onPressed: () {},
          ),
          IconButton(
            icon: const Icon(Icons.search),
            onPressed: () {},
          ),
        ],
      ),
      body: BlocBuilder<AdminBloc, AdminState>(
        builder: (context, state) {
          if (state is AdminLoading && state.isInitial) {
            return const Center(child: LoadingWidget());
          }

          final tenants = state is TenantsLoaded ? state.tenants : <dynamic>[];

          if (tenants.isEmpty) {
            return const EmptyStateWidget(
              icon: Icons.business_center,
              title: 'No tenants',
              message: 'Tenants will appear here when spa owners register',
              actionLabel: 'Add Tenant',
              onAction: _showAddTenantDialog,
            );
          }

          return TenantList(
            tenants: tenants,
            onTap: (tenantId) {},
            onStatusChange: (tenantId, status) {},
          );
        },
      ),
    );
  }

  static void _showAddTenantDialog(BuildContext context) {
    // Implementation
  }
}

// ==========================================
// PLANS PAGE
// ==========================================
class _PlansPage extends StatelessWidget {
  const _PlansPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Subscription Plans'),
        actions: [
          IconButton(
            icon: const Icon(Icons.add),
            onPressed: () => _showAddPlanDialog(context),
          ),
        ],
      ),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Service Plans',
              style: GoogleFonts.inter(
                fontSize: 18,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 16),
            BlocBuilder<AdminBloc, AdminState>(
              builder: (context, state) {
                if (state is AdminLoading && state.isInitial) {
                  return const Center(child: LoadingWidget());
                }

                final plans = state is PlansLoaded ? state.plans : <dynamic>[];

                if (plans.isEmpty) {
                  return const EmptyStateWidget(
                    icon: Icons.subscriptions,
                    title: 'No plans',
                    message: 'Create subscription plans for tenants',
                    actionLabel: 'Add Plan',
                    onAction: _showAddPlanDialog,
                  );
                }

                return PlansGrid(plans: plans);
              },
            ),
          ],
        ),
      ),
    );
  }

  static void _showAddPlanDialog(BuildContext context) {
    // Implementation
  }
}

// ==========================================
// AI USAGE PAGE
// ==========================================
class _AiUsagePage extends StatelessWidget {
  const _AiUsagePage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('AI Usage'),
        actions: [
          IconButton(
            icon: const Icon(Icons.download_outlined),
            onPressed: () {},
          ),
        ],
      ),
      body: BlocBuilder<AdminBloc, AdminState>(
        builder: (context, state) {
          if (state is AdminLoading && state.isInitial) {
            return const Center(child: LoadingWidget());
          }

          final usage = state is AiUsageLoaded ? state.usage : null;

          if (usage == null || usage.isEmpty) {
            return const EmptyStateWidget(
              icon: Icons.auto_awesome,
              title: 'No AI usage data',
              message: 'AI usage statistics will appear when tenants use AI features',
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Summary stats
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                  childAspectRatio: 1.8,
                  children: [
                    StatCard(
                      title: 'Total Tokens',
                      value: '${usage.totalTokens}',
                      icon: Icons.auto_awesome,
                      color: AppColors.primary,
                    ),
                    StatCard(
                      title: 'Total Messages',
                      value: '${usage.totalMessages}',
                      icon: Icons.chat,
                      color: AppColors.info,
                    ),
                    StatCard(
                      title: 'Est. Cost',
                      value: AppFormatters.currency(usage.totalCost ?? 0),
                      icon: Icons.attach_money,
                      color: AppColors.accent,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Chart
                Text(
                  'Usage by Tenant',
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.divider),
                  ),
                  height: 300,
                  child: AiUsageChart(data: usage),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ==========================================
// REVENUE PAGE
// ==========================================
class _RevenuePage extends StatelessWidget {
  const _RevenuePage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Revenue'),
        actions: [
          IconButton(
            icon: const Icon(Icons.download_outlined),
            onPressed: () {},
          ),
        ],
      ),
      body: BlocBuilder<AdminBloc, AdminState>(
        builder: (context, state) {
          if (state is AdminLoading && state.isInitial) {
            return const Center(child: LoadingWidget());
          }

          final revenue = state is RevenueLoaded ? state.revenue : null;

          if (revenue == null) {
            return const EmptyStateWidget(
              icon: Icons.attach_money,
              title: 'No revenue data',
              message: 'Revenue data will appear when tenants subscribe to paid plans',
            );
          }

          return SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                // Summary stats
                GridView.count(
                  crossAxisCount: 3,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  crossAxisSpacing: 16,
                  mainAxisSpacing: 16,
                  childAspectRatio: 1.8,
                  children: [
                    StatCard(
                      title: 'Total Revenue',
                      value: AppFormatters.currency(revenue.totalRevenue ?? 0),
                      icon: Icons.attach_money,
                      color: AppColors.accent,
                    ),
                    StatCard(
                      title: 'This Month',
                      value: AppFormatters.currency(revenue.monthlyRevenue ?? 0),
                      icon: Icons.calendar_month,
                      color: AppColors.success,
                    ),
                    StatCard(
                      title: 'Paid Subscriptions',
                      value: '${revenue.paidCount ?? 0}',
                      icon: Icons.subscriptions,
                      color: AppColors.info,
                    ),
                  ],
                ),
                const SizedBox(height: 24),

                // Chart
                Text(
                  'Revenue Trend',
                  style: GoogleFonts.inter(
                    fontSize: 18,
                    fontWeight: FontWeight.w600,
                  ),
                ),
                const SizedBox(height: 12),
                Container(
                  padding: const EdgeInsets.all(16),
                  decoration: BoxDecoration(
                    color: Colors.white,
                    borderRadius: BorderRadius.circular(12),
                    border: Border.all(color: AppColors.divider),
                  ),
                  height: 250,
                  child: RevenueChart(
                    data: revenue.chartData ?? [],
                    isRevenue: true,
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }
}

// ==========================================
// SETTINGS PAGE
// ==========================================
class _SettingsPage extends StatelessWidget {
  const _SettingsPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          SettingsList(
            items: const [
              SettingsItem(
                icon: Icons.security,
                title: 'Security Settings',
                subtitle: 'Manage admin security and access',
              ),
              SettingsItem(
                icon: Icons.email,
                title: 'Email Configuration',
                subtitle: 'Configure email server and templates',
              ),
              SettingsItem(
                icon: Icons.notifications,
                title: 'Notifications',
                subtitle: 'Configure system notifications',
              ),
              SettingsItem(
                icon: Icons.storage,
                title: 'Database',
                subtitle: 'Database configuration and maintenance',
              ),
              SettingsItem(
                icon: Icons.auto_awesome,
                title: 'AI Configuration',
                subtitle: 'Configure AI providers and models',
              ),
              SettingsItem(
                icon: Icons.backup,
                title: 'Backup & Recovery',
                subtitle: 'Manage system backups',
              ),
            ],
            onTap: (index) {},
          ),
        ],
      ),
    );
  }
}