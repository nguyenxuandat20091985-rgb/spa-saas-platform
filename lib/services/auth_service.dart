import '../models/user_model.dart';

class AuthResult {
  final bool success;
  final UserModel? user;
  final String? errorMessage;

  const AuthResult({required this.success, this.user, this.errorMessage});

  factory AuthResult.ok(UserModel user) =>
      AuthResult(success: true, user: user);

  factory AuthResult.error(String message) =>
      AuthResult(success: false, errorMessage: message);
}

class AuthService {
  UserModel? _currentUser;
  final Map<String, String> _tokenStore = {};

  UserModel? get currentUser => _currentUser;
  bool get isAuthenticated => _currentUser != null;

  static final _emailRegex = RegExp(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
  );

  String? validateEmail(String email) {
    if (email.isEmpty) return 'Email is required';
    if (!_emailRegex.hasMatch(email)) return 'Invalid email format';
    return null;
  }

  String? validatePassword(String password) {
    if (password.isEmpty) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!password.contains(RegExp(r'[A-Z]'))) {
      return 'Password must contain at least one uppercase letter';
    }
    if (!password.contains(RegExp(r'[a-z]'))) {
      return 'Password must contain at least one lowercase letter';
    }
    if (!password.contains(RegExp(r'[0-9]'))) {
      return 'Password must contain at least one digit';
    }
    return null;
  }

  AuthResult login(String email, String password) {
    final emailError = validateEmail(email);
    if (emailError != null) return AuthResult.error(emailError);

    final passwordError = validatePassword(password);
    if (passwordError != null) return AuthResult.error(passwordError);

    final user = UserModel(
      id: 'user_${email.hashCode.abs()}',
      email: email,
      displayName: email.split('@').first,
      createdAt: DateTime.now(),
      lastLoginAt: DateTime.now(),
    );

    _currentUser = user;
    _tokenStore[user.id] = _generateToken(user.id);
    return AuthResult.ok(user);
  }

  AuthResult register(String email, String password, String displayName) {
    final emailError = validateEmail(email);
    if (emailError != null) return AuthResult.error(emailError);

    final passwordError = validatePassword(password);
    if (passwordError != null) return AuthResult.error(passwordError);

    if (displayName.trim().isEmpty) {
      return AuthResult.error('Display name is required');
    }
    if (displayName.length < 2) {
      return AuthResult.error('Display name must be at least 2 characters');
    }

    final user = UserModel(
      id: 'user_${email.hashCode.abs()}',
      email: email,
      displayName: displayName.trim(),
      createdAt: DateTime.now(),
      lastLoginAt: DateTime.now(),
    );

    _currentUser = user;
    _tokenStore[user.id] = _generateToken(user.id);
    return AuthResult.ok(user);
  }

  void logout() {
    if (_currentUser != null) {
      _tokenStore.remove(_currentUser!.id);
    }
    _currentUser = null;
  }

  String? getToken(String userId) => _tokenStore[userId];

  bool isTokenValid(String userId) => _tokenStore.containsKey(userId);

  AuthResult resetPassword(String email) {
    final emailError = validateEmail(email);
    if (emailError != null) return AuthResult.error(emailError);
    return const AuthResult(success: true);
  }

  String _generateToken(String userId) {
    final timestamp = DateTime.now().millisecondsSinceEpoch;
    return 'token_${userId}_$timestamp';
  }
}
