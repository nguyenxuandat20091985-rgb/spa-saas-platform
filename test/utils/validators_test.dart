import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/utils/validators.dart';

void main() {
  group('Validators - validateRequired', () {
    test('returns null for non-empty value', () {
      expect(Validators.validateRequired('hello', 'Field'), isNull);
    });

    test('returns error for null value', () {
      expect(Validators.validateRequired(null, 'Name'), 'Name is required');
    });

    test('returns error for empty value', () {
      expect(Validators.validateRequired('', 'Name'), 'Name is required');
    });

    test('returns error for whitespace-only value', () {
      expect(Validators.validateRequired('   ', 'Name'), 'Name is required');
    });
  });

  group('Validators - validateEmail', () {
    test('returns null for valid emails', () {
      expect(Validators.validateEmail('test@example.com'), isNull);
      expect(Validators.validateEmail('user.name@domain.co'), isNull);
      expect(Validators.validateEmail('user+tag@domain.com'), isNull);
    });

    test('returns error for empty email', () {
      expect(Validators.validateEmail(''), 'Email is required');
      expect(Validators.validateEmail(null), 'Email is required');
    });

    test('returns error for invalid emails', () {
      expect(Validators.validateEmail('notanemail'), 'Invalid email format');
      expect(Validators.validateEmail('missing@'), 'Invalid email format');
      expect(Validators.validateEmail('@domain.com'), 'Invalid email format');
    });
  });

  group('Validators - validateUrl', () {
    test('returns null for valid URLs', () {
      expect(Validators.validateUrl('https://example.com'), isNull);
      expect(Validators.validateUrl('http://localhost:3000'), isNull);
    });

    test('returns null for empty/null (optional)', () {
      expect(Validators.validateUrl(null), isNull);
      expect(Validators.validateUrl(''), isNull);
    });

    test('returns error for invalid URLs', () {
      expect(Validators.validateUrl('not-a-url'), 'Invalid URL format');
      expect(Validators.validateUrl('ftp://example.com'), 'Invalid URL format');
    });
  });

  group('Validators - validatePhone', () {
    test('returns null for valid phone numbers', () {
      expect(Validators.validatePhone('+1234567890'), isNull);
      expect(Validators.validatePhone('(555) 123-4567'), isNull);
    });

    test('returns null for empty/null (optional)', () {
      expect(Validators.validatePhone(null), isNull);
      expect(Validators.validatePhone(''), isNull);
    });

    test('returns error for invalid phone', () {
      expect(Validators.validatePhone('abc'), 'Invalid phone format');
      expect(Validators.validatePhone('12'), 'Invalid phone format');
    });
  });

  group('Validators - validateMinLength', () {
    test('returns null when meets minimum', () {
      expect(Validators.validateMinLength('hello', 3, 'Field'), isNull);
      expect(Validators.validateMinLength('abc', 3, 'Field'), isNull);
    });

    test('returns error when too short', () {
      expect(
        Validators.validateMinLength('ab', 3, 'Name'),
        'Name must be at least 3 characters',
      );
    });

    test('returns error for null', () {
      expect(
        Validators.validateMinLength(null, 3, 'Name'),
        'Name must be at least 3 characters',
      );
    });
  });

  group('Validators - validateMaxLength', () {
    test('returns null when within limit', () {
      expect(Validators.validateMaxLength('hello', 10, 'Field'), isNull);
    });

    test('returns null for null value', () {
      expect(Validators.validateMaxLength(null, 10, 'Field'), isNull);
    });

    test('returns error when too long', () {
      expect(
        Validators.validateMaxLength('abcdef', 3, 'Name'),
        'Name cannot exceed 3 characters',
      );
    });
  });

  group('Validators - validateRange', () {
    test('returns null for value in range', () {
      expect(Validators.validateRange(5, 1, 10, 'Count'), isNull);
      expect(Validators.validateRange(1, 1, 10, 'Count'), isNull);
      expect(Validators.validateRange(10, 1, 10, 'Count'), isNull);
    });

    test('returns error for null', () {
      expect(Validators.validateRange(null, 1, 10, 'Count'), 'Count is required');
    });

    test('returns error for out of range', () {
      expect(
        Validators.validateRange(0, 1, 10, 'Count'),
        'Count must be between 1 and 10',
      );
      expect(
        Validators.validateRange(11, 1, 10, 'Count'),
        'Count must be between 1 and 10',
      );
    });
  });

  group('Validators - validatePositive', () {
    test('returns null for positive value', () {
      expect(Validators.validatePositive(5, 'Amount'), isNull);
      expect(Validators.validatePositive(0.01, 'Amount'), isNull);
    });

    test('returns error for null', () {
      expect(Validators.validatePositive(null, 'Amount'), 'Amount is required');
    });

    test('returns error for zero', () {
      expect(
        Validators.validatePositive(0, 'Amount'),
        'Amount must be positive',
      );
    });

    test('returns error for negative', () {
      expect(
        Validators.validatePositive(-5, 'Amount'),
        'Amount must be positive',
      );
    });
  });

  group('Validators - validatePassword', () {
    test('returns null for strong password', () {
      expect(Validators.validatePassword('StrongP4ss!'), isNull);
    });

    test('returns error for empty password', () {
      expect(Validators.validatePassword(''), 'Password is required');
      expect(Validators.validatePassword(null), 'Password is required');
    });

    test('returns error for short password', () {
      expect(
        Validators.validatePassword('Sh0rt!'),
        'Password must be at least 8 characters',
      );
    });

    test('returns error for missing uppercase', () {
      expect(
        Validators.validatePassword('lowercase1!'),
        'Password must contain an uppercase letter',
      );
    });

    test('returns error for missing lowercase', () {
      expect(
        Validators.validatePassword('UPPERCASE1!'),
        'Password must contain a lowercase letter',
      );
    });

    test('returns error for missing digit', () {
      expect(
        Validators.validatePassword('NoDigitsHere!'),
        'Password must contain a digit',
      );
    });

    test('returns error for missing special character', () {
      expect(
        Validators.validatePassword('NoSpecial1'),
        'Password must contain a special character',
      );
    });
  });

  group('Validators - validateConfirmPassword', () {
    test('returns null when passwords match', () {
      expect(
        Validators.validateConfirmPassword('password1', 'password1'),
        isNull,
      );
    });

    test('returns error for empty confirmation', () {
      expect(
        Validators.validateConfirmPassword('pass', ''),
        'Please confirm your password',
      );
      expect(
        Validators.validateConfirmPassword('pass', null),
        'Please confirm your password',
      );
    });

    test('returns error when passwords differ', () {
      expect(
        Validators.validateConfirmPassword('pass1', 'pass2'),
        'Passwords do not match',
      );
    });
  });
}
