import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/utils/formatters.dart';

void main() {
  group('Formatters - currency', () {
    test('formats with default symbol', () {
      expect(Formatters.currency(29.99), '\$29.99');
    });

    test('formats with custom symbol', () {
      expect(Formatters.currency(29.99, symbol: '€'), '€29.99');
    });

    test('formats with custom decimals', () {
      expect(Formatters.currency(29.9, decimals: 0), '\$30');
    });

    test('formats zero', () {
      expect(Formatters.currency(0), '\$0.00');
    });
  });

  group('Formatters - compactNumber', () {
    test('formats billions', () {
      expect(Formatters.compactNumber(1500000000), '1.5B');
    });

    test('formats millions', () {
      expect(Formatters.compactNumber(2500000), '2.5M');
    });

    test('formats thousands', () {
      expect(Formatters.compactNumber(1500), '1.5K');
    });

    test('returns plain number for small values', () {
      expect(Formatters.compactNumber(999), '999');
    });

    test('handles negative billions', () {
      expect(Formatters.compactNumber(-1500000000), '-1.5B');
    });
  });

  group('Formatters - percentage', () {
    test('formats with default decimals', () {
      expect(Formatters.percentage(0.756), '75.6%');
    });

    test('formats with custom decimals', () {
      expect(Formatters.percentage(0.756, decimals: 0), '76%');
    });

    test('formats zero', () {
      expect(Formatters.percentage(0), '0.0%');
    });
  });

  group('Formatters - truncate', () {
    test('returns text unchanged when shorter than max', () {
      expect(Formatters.truncate('hello', 10), 'hello');
    });

    test('truncates with ellipsis', () {
      expect(Formatters.truncate('hello world', 8), 'hello...');
    });

    test('uses custom ellipsis', () {
      expect(
        Formatters.truncate('hello world', 8, ellipsis: '…'),
        'hello w…',
      );
    });

    test('returns text when equal to max length', () {
      expect(Formatters.truncate('hello', 5), 'hello');
    });
  });

  group('Formatters - capitalize', () {
    test('capitalizes first letter', () {
      expect(Formatters.capitalize('hello'), 'Hello');
    });

    test('lowercases rest', () {
      expect(Formatters.capitalize('HELLO'), 'Hello');
    });

    test('returns empty for empty string', () {
      expect(Formatters.capitalize(''), '');
    });
  });

  group('Formatters - titleCase', () {
    test('capitalizes each word', () {
      expect(Formatters.titleCase('hello world'), 'Hello World');
    });

    test('handles single word', () {
      expect(Formatters.titleCase('hello'), 'Hello');
    });

    test('returns empty for empty string', () {
      expect(Formatters.titleCase(''), '');
    });
  });

  group('Formatters - initials', () {
    test('returns initials from name', () {
      expect(Formatters.initials('John Doe'), 'JD');
    });

    test('returns single initial for single name', () {
      expect(Formatters.initials('John'), 'J');
    });

    test('respects maxInitials', () {
      expect(Formatters.initials('John Michael Doe', maxInitials: 3), 'JMD');
      expect(Formatters.initials('John Michael Doe', maxInitials: 1), 'J');
    });

    test('handles extra whitespace', () {
      expect(Formatters.initials('  John   Doe  '), 'JD');
    });
  });

  group('Formatters - fileSize', () {
    test('formats bytes', () {
      expect(Formatters.fileSize(500), '500 B');
    });

    test('formats kilobytes', () {
      expect(Formatters.fileSize(1536), '1.5 KB');
    });

    test('formats megabytes', () {
      expect(Formatters.fileSize(1572864), '1.5 MB');
    });

    test('formats gigabytes', () {
      expect(Formatters.fileSize(1610612736), '1.5 GB');
    });
  });

  group('Formatters - slug', () {
    test('converts to slug', () {
      expect(Formatters.slug('Hello World'), 'hello-world');
    });

    test('removes special characters', () {
      expect(Formatters.slug('Hello, World!'), 'hello-world');
    });

    test('collapses multiple spaces/hyphens', () {
      expect(Formatters.slug('hello   world'), 'hello-world');
    });

    test('trims whitespace', () {
      expect(Formatters.slug('  hello  '), 'hello');
    });
  });

  group('Formatters - pluralize', () {
    test('uses singular for 1', () {
      expect(Formatters.pluralize(1, 'item'), '1 item');
    });

    test('uses plural for 0', () {
      expect(Formatters.pluralize(0, 'item'), '0 items');
    });

    test('uses plural for > 1', () {
      expect(Formatters.pluralize(5, 'item'), '5 items');
    });

    test('uses custom plural', () {
      expect(Formatters.pluralize(5, 'person', plural: 'people'), '5 people');
    });
  });

  group('Formatters - relativeTime', () {
    test('returns "just now" for very recent', () {
      final now = DateTime.now();
      expect(Formatters.relativeTime(now), 'just now');
    });

    test('returns minutes ago', () {
      final ago = DateTime.now().subtract(const Duration(minutes: 5));
      expect(Formatters.relativeTime(ago), '5 minutes ago');
    });

    test('returns "1 minute ago" for singular', () {
      final ago = DateTime.now().subtract(const Duration(minutes: 1));
      expect(Formatters.relativeTime(ago), '1 minute ago');
    });

    test('returns hours ago', () {
      final ago = DateTime.now().subtract(const Duration(hours: 3));
      expect(Formatters.relativeTime(ago), '3 hours ago');
    });

    test('returns "1 hour ago" for singular', () {
      final ago = DateTime.now().subtract(const Duration(hours: 1));
      expect(Formatters.relativeTime(ago), '1 hour ago');
    });

    test('returns days ago', () {
      final ago = DateTime.now().subtract(const Duration(days: 5));
      expect(Formatters.relativeTime(ago), '5 days ago');
    });

    test('returns months ago', () {
      final ago = DateTime.now().subtract(const Duration(days: 60));
      expect(Formatters.relativeTime(ago), '2 months ago');
    });

    test('returns years ago', () {
      final ago = DateTime.now().subtract(const Duration(days: 400));
      expect(Formatters.relativeTime(ago), '1 year ago');
    });
  });
}
