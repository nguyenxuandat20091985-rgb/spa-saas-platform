class Validators {
  static final _emailRegex = RegExp(
    r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$',
  );

  static final _urlRegex = RegExp(
    r'^https?://[^\s/$.?#].[^\s]*$',
    caseSensitive: false,
  );

  static final _phoneRegex = RegExp(r'^\+?[\d\s\-()]{7,15}$');

  static String? validateRequired(String? value, String fieldName) {
    if (value == null || value.trim().isEmpty) {
      return '$fieldName is required';
    }
    return null;
  }

  static String? validateEmail(String? email) {
    if (email == null || email.trim().isEmpty) return 'Email is required';
    if (!_emailRegex.hasMatch(email.trim())) return 'Invalid email format';
    return null;
  }

  static String? validateUrl(String? url) {
    if (url == null || url.trim().isEmpty) return null; // optional
    if (!_urlRegex.hasMatch(url.trim())) return 'Invalid URL format';
    return null;
  }

  static String? validatePhone(String? phone) {
    if (phone == null || phone.trim().isEmpty) return null; // optional
    if (!_phoneRegex.hasMatch(phone.trim())) return 'Invalid phone format';
    return null;
  }

  static String? validateMinLength(String? value, int minLength, String fieldName) {
    if (value == null || value.length < minLength) {
      return '$fieldName must be at least $minLength characters';
    }
    return null;
  }

  static String? validateMaxLength(String? value, int maxLength, String fieldName) {
    if (value != null && value.length > maxLength) {
      return '$fieldName cannot exceed $maxLength characters';
    }
    return null;
  }

  static String? validateRange(num? value, num min, num max, String fieldName) {
    if (value == null) return '$fieldName is required';
    if (value < min || value > max) {
      return '$fieldName must be between $min and $max';
    }
    return null;
  }

  static String? validatePositive(num? value, String fieldName) {
    if (value == null) return '$fieldName is required';
    if (value <= 0) return '$fieldName must be positive';
    return null;
  }

  static String? validatePassword(String? password) {
    if (password == null || password.isEmpty) return 'Password is required';
    if (password.length < 8) return 'Password must be at least 8 characters';
    if (!password.contains(RegExp(r'[A-Z]'))) {
      return 'Password must contain an uppercase letter';
    }
    if (!password.contains(RegExp(r'[a-z]'))) {
      return 'Password must contain a lowercase letter';
    }
    if (!password.contains(RegExp(r'[0-9]'))) {
      return 'Password must contain a digit';
    }
    if (!password.contains(RegExp(r'[!@#$%^&*(),.?":{}|<>]'))) {
      return 'Password must contain a special character';
    }
    return null;
  }

  static String? validateConfirmPassword(String? password, String? confirm) {
    if (confirm == null || confirm.isEmpty) {
      return 'Please confirm your password';
    }
    if (password != confirm) return 'Passwords do not match';
    return null;
  }
}
