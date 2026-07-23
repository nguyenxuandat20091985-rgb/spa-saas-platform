import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/constants/app_strings.dart';
import 'package:spa_shared/theme/theme_provider.dart';
import 'package:spa_shared/utils/locale_provider.dart';
import 'screens/home/home_screen.dart';
import 'screens/ai/ai_assistant_screen.dart';
import 'screens/booking/customer_booking_screen.dart';
import 'screens/shop/shop_screen.dart';
import 'screens/profile/profile_screen.dart';
import 'screens/auth/login_screen.dart';
import 'screens/auth/splash_screen.dart';
import 'bloc/auth/auth_bloc.dart';
import 'bloc/auth/auth_event.dart';
import 'bloc/auth/auth_state.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'repositories/auth_repository.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize dependencies
  final prefs = await SharedPreferences.getInstance();
  final apiService = ApiService();
  final authService = AuthService(apiService);
  final authRepository = AuthRepository(authService, prefs);

  runApp(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AuthRepository>.value(value: authRepository),
        RepositoryProvider<ApiService>.value(value: apiService),
        RepositoryProvider<AuthService>.value(value: authService),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthBloc>(
            create: (context) => AuthBloc(authRepository)..add(AuthCheckStatusEvent()),
          ),
        ],
        child: const CustomerApp(),
      ),
    ),
  );
}

class CustomerApp extends StatelessWidget {
  const CustomerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, authState) {
        return MaterialApp(
          title: AppStrings.appName,
          debugShowCheckedModeBanner: false,
          theme: ThemeData(
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(
              seedColor: AppColors.primary,
              brightness: Brightness.light,
            ),
            scaffoldBackgroundColor: AppColors.background,
            textTheme: GoogleFonts.interTextTheme(),
            appBarTheme: AppBarTheme(
              backgroundColor: Colors.transparent,
              elevation: 0,
              centerTitle: true,
              titleTextStyle: GoogleFonts.playfairDisplay(
                fontSize: 22,
                fontWeight: FontWeight.w600,
                color: AppColors.textPrimary,
              ),
              systemOverlayStyle: const SystemUiOverlayStyle(
                statusBarColor: Colors.transparent,
                statusBarIconBrightness: Brightness.dark,
              ),
            ),
            bottomNavigationBarTheme: BottomNavigationBarThemeData(
              backgroundColor: AppColors.surface,
              elevation: 8,
              selectedItemColor: AppColors.primary,
              unselectedItemColor: AppColors.textSecondary,
              selectedLabelStyle: const TextStyle(fontWeight: FontWeight.w600),
              unselectedLabelStyle: const TextStyle(fontWeight: FontWeight.normal),
              type: BottomNavigationBarType.fixed,
            ),
            cardTheme: CardTheme(
              elevation: 2,
              shape: RoundedRectangleBorder(
                borderRadius: BorderRadius.circular(16),
              ),
            ),
            inputDecorationTheme: InputDecorationTheme(
              filled: true,
              fillColor: AppColors.surface,
              border: OutlineInputBorder(
                borderRadius: BorderRadius.circular(12),
                borderSide: BorderSide.none,
              ),
              contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
            ),
            elevatedButtonTheme: ElevatedButtonThemeData(
              style: ElevatedButton.styleFrom(
                backgroundColor: AppColors.primary,
                foregroundColor: Colors.white,
                shape: RoundedRectangleBorder(
                  borderRadius: BorderRadius.circular(12),
                ),
                padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 24),
                textStyle: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600),
              ),
            ),
          ),
          darkTheme: ThemeData(
            useMaterial3: true,
            colorScheme: ColorScheme.fromSeed(
              seedColor: AppColors.primary,
              brightness: Brightness.dark,
            ),
            scaffoldBackgroundColor: AppColors.darkBackground,
            textTheme: GoogleFonts.interTextTheme(ThemeData.dark().textTheme),
          ),
          themeMode: ThemeMode.system,
          home: _getInitialScreen(authState),
          routes: {
            '/login': (context) => const LoginScreen(),
            '/home': (context) => const CustomerMainShell(),
          },
          onGenerateRoute: (settings) {
            // Handle deep links
            return null;
          },
          locale: LocaleProvider.getLocale(context),
          supportedLocales: const [Locale('vi'), Locale('en')],
          localizationsDelegates: const [
            // AppLocalizations.delegate,
          ],
        );
      },
    );
  }

  Widget _getInitialScreen(AuthState authState) {
    if (authState is AuthAuthenticated) {
      return const CustomerMainShell();
    } else if (authState is AuthUnauthenticated) {
      return const LoginScreen();
    } else if (authState is AuthLoading) {
      return const SplashScreen();
    } else {
      return const SplashScreen();
    }
  }
}

// ==========================================
// CUSTOMER MAIN SHELL (BOTTOM NAVIGATION)
// ==========================================
class CustomerMainShell extends StatefulWidget {
  const CustomerMainShell({super.key});

  @override
  State<CustomerMainShell> createState() => _CustomerMainShellState();
}

class _CustomerMainShellState extends State<CustomerMainShell>
    with SingleTickerProviderStateMixin {
  int _currentIndex = 0;
  late final PageController _pageController;
  int _unreadNotifications = 3;

  final List<Widget> _screens = const [
    HomeScreen(),
    AiAssistantScreen(),
    CustomerBookingScreen(),
    ShopScreen(),
    ProfileScreen(),
  ];

  final List<String> _titles = [
    'Trang chủ',
    'Trợ lý AI',
    'Đặt lịch',
    'Cửa hàng',
    'Cá nhân',
  ];

  @override
  void initState() {
    super.initState();
    _pageController = PageController();
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
    return Scaffold(
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
                  icon: Icons.home_outlined,
                  activeIcon: Icons.home,
                  label: 'Home',
                  isActive: _currentIndex == 0,
                  onTap: () => _onTabTapped(0),
                ),
                _NavItem(
                  icon: Icons.auto_awesome_outlined,
                  activeIcon: Icons.auto_awesome,
                  label: 'AI',
                  isActive: _currentIndex == 1,
                  onTap: () => _onTabTapped(1),
                ),
                _NavItem(
                  icon: Icons.calendar_month_outlined,
                  activeIcon: Icons.calendar_month,
                  label: 'Booking',
                  isActive: _currentIndex == 2,
                  onTap: () => _onTabTapped(2),
                  showBadge: true,
                  badgeCount: 2,
                ),
                _NavItem(
                  icon: Icons.shopping_bag_outlined,
                  activeIcon: Icons.shopping_bag,
                  label: 'Shop',
                  isActive: _currentIndex == 3,
                  onTap: () => _onTabTapped(3),
                ),
                _NavItem(
                  icon: Icons.person_outline,
                  activeIcon: Icons.person,
                  label: 'Profile',
                  isActive: _currentIndex == 4,
                  onTap: () => _onTabTapped(4),
                  showBadge: true,
                  badgeCount: _unreadNotifications,
                ),
              ],
            ),
          ),
        ),
      ),
    );
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
                fontSize: 10,
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