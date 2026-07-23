import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/widgets/badge_icon.dart';
import 'package:spa_shared/utils/notification_utils.dart';
import 'dashboard/dashboard_screen.dart';
import 'crm/crm_screen.dart';
import 'booking/booking_screen.dart';
import 'pos/pos_screen.dart';
import 'ai/ai_hub_screen.dart';
import '../bloc/notification/notification_bloc.dart';
import '../bloc/notification/notification_event.dart';
import '../bloc/notification/notification_state.dart';

class MainShell extends StatefulWidget {
  const MainShell({super.key});

  @override
  State<MainShell> createState() => _MainShellState();
}

class _MainShellState extends State<MainShell>
    with SingleTickerProviderStateMixin {
  int _currentIndex = 0;
  late final PageController _pageController;

  final List<Widget> _screens = const [
    DashboardScreen(),
    CrmScreen(),
    BookingScreen(),
    PosScreen(),
    AiHubScreen(),
  ];

  final List<String> _titles = [
    'Tổng quan',
    'Khách hàng',
    'Đặt lịch',
    'Bán hàng',
    'AI Hub',
  ];

  final List<IconData> _icons = [
    Icons.dashboard_outlined,
    Icons.people_outline,
    Icons.calendar_month_outlined,
    Icons.point_of_sale_outlined,
    Icons.auto_awesome_outlined,
  ];

  final List<IconData> _activeIcons = [
    Icons.dashboard,
    Icons.people,
    Icons.calendar_month,
    Icons.point_of_sale,
    Icons.auto_awesome,
  ];

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
    // Load notifications
    context.read<NotificationBloc>().add(const LoadNotificationsEvent());
  }

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  void _onTabTapped(int index) {
    setState(() {
      _currentIndex = index;
    });
    _pageController.animateToPage(
      index,
      duration: const Duration(milliseconds: 300),
      curve: Curves.easeInOut,
    );
  }

  @override
  Widget build(BuildContext context) {
    return BlocListener<NotificationBloc, NotificationState>(
      listener: (context, state) {
        if (state is NotificationError) {
          // Show error if needed
        }
      },
      child: Scaffold(
        body: PageView(
          controller: _pageController,
          onPageChanged: (index) {
            setState(() {
              _currentIndex = index;
            });
          },
          physics: const NeverScrollableScrollPhysics(),
          children: _screens,
        ),
        bottomNavigationBar: Container(
          decoration: BoxDecoration(
            color: AppColors.surface,
            boxShadow: [
              BoxShadow(
                color: Colors.black.withOpacity(0.05),
                blurRadius: 10,
                offset: const Offset(0, -2),
              ),
            ],
          ),
          child: SafeArea(
            child: Padding(
              padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
              child: Row(
                mainAxisAlignment: MainAxisAlignment.spaceAround,
                children: [
                  _NavItem(
                    icon: _icons[0],
                    activeIcon: _activeIcons[0],
                    label: _titles[0],
                    isActive: _currentIndex == 0,
                    onTap: () => _onTabTapped(0),
                  ),
                  _NavItem(
                    icon: _icons[1],
                    activeIcon: _activeIcons[1],
                    label: _titles[1],
                    isActive: _currentIndex == 1,
                    onTap: () => _onTabTapped(1),
                  ),
                  _NavItem(
                    icon: _icons[2],
                    activeIcon: _activeIcons[2],
                    label: _titles[2],
                    isActive: _currentIndex == 2,
                    onTap: () => _onTabTapped(2),
                    showBadge: true,
                    badgeCount: _getBookingBadgeCount(),
                  ),
                  _NavItem(
                    icon: _icons[3],
                    activeIcon: _activeIcons[3],
                    label: _titles[3],
                    isActive: _currentIndex == 3,
                    onTap: () => _onTabTapped(3),
                  ),
                  _NavItem(
                    icon: _icons[4],
                    activeIcon: _activeIcons[4],
                    label: _titles[4],
                    isActive: _currentIndex == 4,
                    onTap: () => _onTabTapped(4),
                    showBadge: true,
                    badgeCount: _getAiBadgeCount(),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  int _getBookingBadgeCount() {
    // Get pending booking count from state
    return 0; // Placeholder
  }

  int _getAiBadgeCount() {
    // Get AI pending recommendations count
    return 0; // Placeholder
  }
}

// ==========================================
// BOTTOM NAVIGATION ITEM
// ==========================================
class _NavItem extends StatelessWidget {
  final IconData icon;
  final IconData activeIcon;
  final String label;
  final bool isActive;
  final VoidCallback onTap;
  final bool showBadge;
  final int badgeCount;

  const _NavItem({
    required this.icon,
    required this.activeIcon,
    required this.label,
    required this.isActive,
    required this.onTap,
    this.showBadge = false,
    this.badgeCount = 0,
  });

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(12),
      splashColor: AppColors.primary.withOpacity(0.1),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Stack(
              children: [
                Icon(
                  isActive ? activeIcon : icon,
                  color: isActive ? AppColors.primary : AppColors.textSecondary,
                  size: 24,
                ),
                if (showBadge && badgeCount > 0)
                  Positioned(
                    right: -4,
                    top: -4,
                    child: Container(
                      padding: const EdgeInsets.all(4),
                      decoration: const BoxDecoration(
                        color: Colors.red,
                        shape: BoxShape.circle,
                      ),
                      constraints: const BoxConstraints(
                        minWidth: 16,
                        minHeight: 16,
                      ),
                      child: Text(
                        badgeCount > 9 ? '9+' : '$badgeCount',
                        style: const TextStyle(
                          color: Colors.white,
                          fontSize: 10,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                    ),
                  ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              label,
              style: TextStyle(
                fontSize: 11,
                fontWeight: isActive ? FontWeight.w600 : FontWeight.normal,
                color: isActive ? AppColors.primary : AppColors.textSecondary,
              ),
            ),
          ],
        ),
      ),
    );
  }
}