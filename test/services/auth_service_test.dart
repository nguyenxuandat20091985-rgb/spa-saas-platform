import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/services/auth_service.dart';

void main() {
  late AuthService authService;

  setUp(() {
    authService = AuthService();
  });

  group('AuthService - validateEmail', () {
    test('returns null for valid email', () {
      expect(authService.validateEmail('test@example.com'), isNull);
      expect(authService.validateEmail('user.name+tag@domain.co'), isNull);
    });

    test('returns error for empty email', () {
      expect(authService.validateEmail(''), 'Email is required');
    });

    test('returns error for invalid email format', () {
      expect(authService.validateEmail('notanemail'), 'Invalid email format');
      expect(authService.validateEmail('missing@'), 'Invalid email format');
      expect(authService.validateEmail('@domain.com'), 'Invalid email format');
    });
  });

  group('AuthService - validatePassword', () {
    test('returns null for valid password', () {
      expect(authService.validatePassword('StrongP4ss'), isNull);
    });

    test('returns error for empty password', () {
      expect(authService.validatePassword(''), 'Password is required');
    });

    test('returns error for short password', () {
      expect(
        authService.validatePassword('Sh0rt'),
        'Password must be at least 8 characters',
      );
    });

    test('returns error for missing uppercase', () {
      expect(
        authService.validatePassword('alllower1'),
        'Password must contain at least one uppercase letter',
      );
    });

    test('returns error for missing lowercase', () {
      expect(
        authService.validatePassword('ALLUPPER1'),
        'Password must contain at least one lowercase letter',
      );
    });

    test('returns error for missing digit', () {
      expect(
        authService.validatePassword('NoDigitHere'),
        'Password must contain at least one digit',
      );
    });
  });

  group('AuthService - login', () {
    test('successful login returns user', () {
      final result = authService.login('test@example.com', 'StrongP4ss');
      expect(result.success, isTrue);
      expect(result.user, isNotNull);
      expect(result.user!.email, 'test@example.com');
      expect(result.errorMessage, isNull);
    });

    test('login sets currentUser', () {
      expect(authService.isAuthenticated, isFalse);
      authService.login('test@example.com', 'StrongP4ss');
      expect(authService.isAuthenticated, isTrue);
      expect(authService.currentUser, isNotNull);
    });

    test('login with invalid email fails', () {
      final result = authService.login('bademail', 'StrongP4ss');
      expect(result.success, isFalse);
      expect(result.errorMessage, isNotNull);
    });

    test('login with weak password fails', () {
      final result = authService.login('test@example.com', 'weak');
      expect(result.success, isFalse);
      expect(result.errorMessage, isNotNull);
    });
  });

  group('AuthService - register', () {
    test('successful registration returns user', () {
      final result = authService.register(
        'new@example.com',
        'StrongP4ss',
        'New User',
      );
      expect(result.success, isTrue);
      expect(result.user!.displayName, 'New User');
    });

    test('register with invalid email fails', () {
      final result = authService.register(
        'bademail',
        'StrongP4ss',
        'User',
      );
      expect(result.success, isFalse);
      expect(result.errorMessage, 'Invalid email format');
    });

    test('register with weak password fails', () {
      final result = authService.register(
        'test@example.com',
        'weak',
        'User',
      );
      expect(result.success, isFalse);
      expect(result.errorMessage, isNotNull);
    });

    test('register with empty display name fails', () {
      final result = authService.register(
        'new@example.com',
        'StrongP4ss',
        '',
      );
      expect(result.success, isFalse);
      expect(result.errorMessage, 'Display name is required');
    });

    test('register with short display name fails', () {
      final result = authService.register(
        'new@example.com',
        'StrongP4ss',
        'A',
      );
      expect(result.success, isFalse);
      expect(result.errorMessage, 'Display name must be at least 2 characters');
    });

    test('register trims display name', () {
      final result = authService.register(
        'new@example.com',
        'StrongP4ss',
        '  John Doe  ',
      );
      expect(result.user!.displayName, 'John Doe');
    });
  });

  group('AuthService - logout', () {
    test('logout clears currentUser', () {
      authService.login('test@example.com', 'StrongP4ss');
      expect(authService.isAuthenticated, isTrue);
      authService.logout();
      expect(authService.isAuthenticated, isFalse);
      expect(authService.currentUser, isNull);
    });

    test('logout when not authenticated does not throw', () {
      expect(() => authService.logout(), returnsNormally);
    });
  });

  group('AuthService - token management', () {
    test('login generates a token', () {
      final result = authService.login('test@example.com', 'StrongP4ss');
      final token = authService.getToken(result.user!.id);
      expect(token, isNotNull);
      expect(token, startsWith('token_'));
    });

    test('isTokenValid returns true after login', () {
      final result = authService.login('test@example.com', 'StrongP4ss');
      expect(authService.isTokenValid(result.user!.id), isTrue);
    });

    test('isTokenValid returns false after logout', () {
      final result = authService.login('test@example.com', 'StrongP4ss');
      final userId = result.user!.id;
      authService.logout();
      expect(authService.isTokenValid(userId), isFalse);
    });

    test('getToken returns null for unknown user', () {
      expect(authService.getToken('unknown'), isNull);
    });
  });

  group('AuthService - resetPassword', () {
    test('resetPassword succeeds with valid email', () {
      final result = authService.resetPassword('test@example.com');
      expect(result.success, isTrue);
    });

    test('resetPassword fails with invalid email', () {
      final result = authService.resetPassword('bademail');
      expect(result.success, isFalse);
    });
  });
}
