import 'package:flutter/material.dart';

import 'services/auth_service.dart';
import 'services/project_service.dart';
import 'services/billing_service.dart';
import 'services/notification_service.dart';
import 'services/analytics_service.dart';

void main() {
  runApp(const SpaSaasPlatformApp());
}

class SpaSaasPlatformApp extends StatelessWidget {
  const SpaSaasPlatformApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'SPA SaaS Platform',
      theme: ThemeData(
        colorSchemeSeed: Colors.blue,
        useMaterial3: true,
      ),
      home: const HomePage(),
    );
  }
}

class HomePage extends StatefulWidget {
  const HomePage({super.key});

  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _authService = AuthService();
  final _projectService = ProjectService();
  final _billingService = BillingService();
  final _notificationService = NotificationService();
  final _analyticsService = AnalyticsService();

  @override
  void initState() {
    super.initState();
    _analyticsService.trackPageView('home');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('SPA SaaS Platform'),
        actions: [
          if (_authService.isAuthenticated)
            IconButton(
              icon: Badge(
                label: Text(
                  _notificationService
                      .getUnreadCount(_authService.currentUser!.id)
                      .toString(),
                ),
                child: const Icon(Icons.notifications),
              ),
              onPressed: () {},
            ),
        ],
      ),
      body: Center(
        child: _authService.isAuthenticated
            ? _buildDashboard()
            : _buildLoginPrompt(),
      ),
    );
  }

  Widget _buildLoginPrompt() {
    return const Column(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Icon(Icons.cloud, size: 80, color: Colors.blue),
        SizedBox(height: 16),
        Text(
          'Welcome to SPA SaaS Platform',
          style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
        ),
        SizedBox(height: 8),
        Text('Please sign in to continue'),
      ],
    );
  }

  Widget _buildDashboard() {
    final user = _authService.currentUser!;
    final projects = _projectService.getProjectsForUser(user.id);
    final tier = _billingService.getSubscription(user.id);

    return Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Welcome, ${user.displayName}!',
              style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text('Plan: ${tier.name} | Projects: ${projects.length}'),
        ],
      ),
    );
  }
}
