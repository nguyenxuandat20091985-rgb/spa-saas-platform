import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/formatters.dart';
import 'package:spa_shared/widgets/loading_widget.dart';

void main() {
  WidgetsFlutterBinding.ensureInitialized();
  runApp(const AdminApp());
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
        ),
      ),
      home: const AdminMainShell(),
    );
  }
}

class AdminMainShell extends StatefulWidget {
  const AdminMainShell({super.key});

  @override
  State<AdminMainShell> createState() => _AdminMainShellState();
}

class _AdminMainShellState extends State<AdminMainShell> {
  int _currentIndex = 0;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Row(
        children: [
          // Sidebar
          NavigationRail(
            selectedIndex: _currentIndex,
            onDestinationSelected: (i) => setState(() => _currentIndex = i),
            backgroundColor: const Color(0xFF2C3E50),
            extended: MediaQuery.of(context).size.width > 900,
            labelType: MediaQuery.of(context).size.width <= 900 ? NavigationRailLabelType.selected : NavigationRailLabelType.none,
            selectedIconTheme: const IconThemeData(color: AppColors.accent),
            selectedLabelTextStyle: const TextStyle(color: AppColors.accent),
            unselectedIconTheme: IconThemeData(color: Colors.white.withValues(alpha: 0.7)),
            unselectedLabelTextStyle: TextStyle(color: Colors.white.withValues(alpha: 0.7)),
            leading: Padding(
              padding: const EdgeInsets.symmetric(vertical: 16),
              child: Column(
                children: [
                  Container(
                    padding: const EdgeInsets.all(8),
                    decoration: BoxDecoration(
                      color: Colors.white.withValues(alpha: 0.1),
                      borderRadius: BorderRadius.circular(12),
                    ),
                    child: const Icon(Icons.admin_panel_settings, color: Colors.white, size: 28),
                  ),
                  const SizedBox(height: 4),
                  Text('Admin', style: GoogleFonts.inter(color: Colors.white60, fontSize: 10)),
                ],
              ),
            ),
            destinations: const [
              NavigationRailDestination(icon: Icon(Icons.dashboard), label: Text('Dashboard')),
              NavigationRailDestination(icon: Icon(Icons.business), label: Text('Tenants')),
              NavigationRailDestination(icon: Icon(Icons.subscriptions), label: Text('Plans')),
              NavigationRailDestination(icon: Icon(Icons.auto_awesome), label: Text('AI Usage')),
              NavigationRailDestination(icon: Icon(Icons.attach_money), label: Text('Revenue')),
              NavigationRailDestination(icon: Icon(Icons.settings), label: Text('Settings')),
            ],
          ),
          const VerticalDivider(width: 1),
          Expanded(
            child: IndexedStack(
              index: _currentIndex,
              children: const [
                _AdminDashboard(),
                _TenantsPage(),
                _PlansPage(),
                _AiUsagePage(),
                _RevenuePage(),
                _SettingsPage(),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _AdminDashboard extends StatelessWidget {
  const _AdminDashboard();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Admin Dashboard')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            GridView.count(
              crossAxisCount: 4,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 16,
              mainAxisSpacing: 16,
              childAspectRatio: 1.6,
              children: [
                StatCard(title: 'Total Tenants', value: '0', icon: Icons.business, color: AppColors.info),
                StatCard(title: 'Active Subscriptions', value: '0', icon: Icons.subscriptions, color: AppColors.success),
                StatCard(title: 'Monthly Revenue', value: AppFormatters.currency(0), icon: Icons.attach_money, color: AppColors.accent),
                StatCard(title: 'AI Tokens Used', value: '0', icon: Icons.auto_awesome, color: AppColors.primary),
              ],
            ),
            const SizedBox(height: 24),
            Text('Recent Tenants', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 12),
            Container(
              decoration: BoxDecoration(
                color: Colors.white,
                borderRadius: BorderRadius.circular(12),
                border: Border.all(color: AppColors.divider),
              ),
              child: const Center(
                child: Padding(
                  padding: EdgeInsets.all(32),
                  child: Text('No tenants yet', style: TextStyle(color: AppColors.textSecondary)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _TenantsPage extends StatelessWidget {
  const _TenantsPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Tenant Management'),
        actions: [
          IconButton(icon: const Icon(Icons.add), onPressed: () {}),
          IconButton(icon: const Icon(Icons.filter_list), onPressed: () {}),
        ],
      ),
      body: const EmptyStateWidget(
        icon: Icons.business_center,
        title: 'No tenants',
        message: 'Tenants will appear here when spa owners register',
      ),
    );
  }
}

class _PlansPage extends StatelessWidget {
  const _PlansPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Subscription Plans')),
      body: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('Service Plans', style: GoogleFonts.inter(fontSize: 18, fontWeight: FontWeight.w600)),
            const SizedBox(height: 16),
            GridView.count(
              crossAxisCount: 5,
              shrinkWrap: true,
              physics: const NeverScrollableScrollPhysics(),
              crossAxisSpacing: 12,
              mainAxisSpacing: 12,
              childAspectRatio: 0.7,
              children: const [
                _PlanCard(name: 'FREE', price: '0', color: AppColors.textSecondary, features: ['1 Branch', '5 Staff', '100 Customers', 'Basic CRM']),
                _PlanCard(name: 'BASIC', price: '499K', color: AppColors.info, features: ['2 Branches', '15 Staff', '1K Customers', 'CRM + POS', 'Booking']),
                _PlanCard(name: 'PRO', price: '999K', color: AppColors.success, features: ['5 Branches', '50 Staff', '5K Customers', 'All Features', 'Basic AI']),
                _PlanCard(name: 'ENTERPRISE', price: '2.499K', color: AppColors.accent, features: ['Unlimited', 'Unlimited', 'Unlimited', 'All Features', 'Advanced AI']),
                _PlanCard(name: 'AI VIP', price: '4.999K', color: Color(0xFF9B59B6), features: ['Everything', 'AI Sales', 'AI Marketing', 'AI Prediction', 'AI CEO']),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  final String name;
  final String price;
  final Color color;
  final List<String> features;

  const _PlanCard({required this.name, required this.price, required this.color, required this.features});

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: Colors.white,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: color.withValues(alpha: 0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(name, style: TextStyle(color: color, fontWeight: FontWeight.bold, fontSize: 16)),
          const SizedBox(height: 4),
          Text('${price} VND/mo', style: GoogleFonts.inter(fontSize: 20, fontWeight: FontWeight.bold)),
          const Divider(),
          ...features.map((f) => Padding(
            padding: const EdgeInsets.symmetric(vertical: 2),
            child: Row(
              children: [
                Icon(Icons.check, size: 14, color: color),
                const SizedBox(width: 4),
                Expanded(child: Text(f, style: const TextStyle(fontSize: 12))),
              ],
            ),
          )),
        ],
      ),
    );
  }
}

class _AiUsagePage extends StatelessWidget {
  const _AiUsagePage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('AI Usage')),
      body: const EmptyStateWidget(
        icon: Icons.auto_awesome,
        title: 'No AI usage data',
        message: 'AI usage statistics will appear when tenants use AI features',
      ),
    );
  }
}

class _RevenuePage extends StatelessWidget {
  const _RevenuePage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Revenue')),
      body: const EmptyStateWidget(
        icon: Icons.attach_money,
        title: 'No revenue data',
        message: 'Revenue data will appear when tenants subscribe to paid plans',
      ),
    );
  }
}

class _SettingsPage extends StatelessWidget {
  const _SettingsPage();

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Settings')),
      body: ListView(
        padding: const EdgeInsets.all(24),
        children: [
          _SettingItem(icon: Icons.security, title: 'Security Settings', onTap: () {}),
          _SettingItem(icon: Icons.email, title: 'Email Configuration', onTap: () {}),
          _SettingItem(icon: Icons.notifications, title: 'Notifications', onTap: () {}),
          _SettingItem(icon: Icons.storage, title: 'Database', onTap: () {}),
          _SettingItem(icon: Icons.auto_awesome, title: 'AI Configuration', onTap: () {}),
          _SettingItem(icon: Icons.backup, title: 'Backup & Recovery', onTap: () {}),
        ],
      ),
    );
  }
}

class _SettingItem extends StatelessWidget {
  final IconData icon;
  final String title;
  final VoidCallback onTap;

  const _SettingItem({required this.icon, required this.title, required this.onTap});

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        leading: Icon(icon, color: AppColors.textSecondary),
        title: Text(title),
        trailing: const Icon(Icons.chevron_right),
        onTap: onTap,
      ),
    );
  }
}
