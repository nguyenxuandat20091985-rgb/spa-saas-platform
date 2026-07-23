import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:spa_shared/theme/app_theme.dart';
import 'package:spa_shared/constants/app_colors.dart';
import 'package:spa_shared/utils/locale_provider.dart';
import 'screens/auth/login_screen.dart';
import 'screens/main_shell.dart';
import 'screens/splash_screen.dart';
import 'bloc/auth/auth_bloc.dart';
import 'bloc/auth/auth_event.dart';
import 'bloc/auth/auth_state.dart';
import 'services/api_service.dart';
import 'services/auth_service.dart';
import 'repositories/auth_repository.dart';
import 'bloc/dashboard/dashboard_bloc.dart';
import 'bloc/dashboard/dashboard_event.dart';
import 'repositories/dashboard_repository.dart';

void main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize dependencies
  final prefs = await SharedPreferences.getInstance();
  final apiService = ApiService();
  final authService = AuthService(apiService);
  final authRepository = AuthRepository(authService, prefs);
  final dashboardRepository = DashboardRepository(apiService);

  runApp(
    MultiRepositoryProvider(
      providers: [
        RepositoryProvider<AuthRepository>.value(value: authRepository),
        RepositoryProvider<ApiService>.value(value: apiService),
        RepositoryProvider<AuthService>.value(value: authService),
        RepositoryProvider<DashboardRepository>.value(value: dashboardRepository),
      ],
      child: MultiBlocProvider(
        providers: [
          BlocProvider<AuthBloc>(
            create: (context) => AuthBloc(authRepository)..add(AuthCheckStatusEvent()),
          ),
          BlocProvider<DashboardBloc>(
            create: (context) => DashboardBloc(dashboardRepository),
          ),
        ],
        child: const SpaOwnerApp(),
      ),
    ),
  );
}

class SpaOwnerApp extends StatelessWidget {
  const SpaOwnerApp({super.key});

  @override
  Widget build(BuildContext context) {
    return BlocBuilder<AuthBloc, AuthState>(
      builder: (context, authState) {
        return MaterialApp(
          title: 'AI Spa Enterprise',
          debugShowCheckedModeBanner: false,
          theme: AppTheme.lightTheme,
          darkTheme: AppTheme.darkTheme,
          themeMode: ThemeMode.system,
          initialRoute: _getInitialRoute(authState),
          routes: {
            '/splash': (_) => const SplashScreen(),
            '/login': (_) => const LoginScreen(),
            '/main': (_) => const MainShell(),
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

  String _getInitialRoute(AuthState authState) {
    if (authState is AuthLoading) {
      return '/splash';
    } else if (authState is AuthAuthenticated) {
      return '/main';
    } else {
      return '/login';
    }
  }
}