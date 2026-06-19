import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/utils/date_utils.dart';

void main() {
  group('AppDateUtils - isSameDay', () {
    test('returns true for same day', () {
      final a = DateTime(2024, 1, 15, 10, 30);
      final b = DateTime(2024, 1, 15, 20, 0);
      expect(AppDateUtils.isSameDay(a, b), isTrue);
    });

    test('returns false for different days', () {
      final a = DateTime(2024, 1, 15);
      final b = DateTime(2024, 1, 16);
      expect(AppDateUtils.isSameDay(a, b), isFalse);
    });

    test('returns false for different months', () {
      final a = DateTime(2024, 1, 15);
      final b = DateTime(2024, 2, 15);
      expect(AppDateUtils.isSameDay(a, b), isFalse);
    });
  });

  group('AppDateUtils - isToday', () {
    test('returns true for today', () {
      expect(AppDateUtils.isToday(DateTime.now()), isTrue);
    });

    test('returns false for yesterday', () {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      expect(AppDateUtils.isToday(yesterday), isFalse);
    });
  });

  group('AppDateUtils - isYesterday', () {
    test('returns true for yesterday', () {
      final yesterday = DateTime.now().subtract(const Duration(days: 1));
      expect(AppDateUtils.isYesterday(yesterday), isTrue);
    });

    test('returns false for today', () {
      expect(AppDateUtils.isYesterday(DateTime.now()), isFalse);
    });
  });

  group('AppDateUtils - isThisWeek', () {
    test('returns true for today', () {
      expect(AppDateUtils.isThisWeek(DateTime.now()), isTrue);
    });

    test('returns false for date far in the past', () {
      final farPast = DateTime.now().subtract(const Duration(days: 30));
      expect(AppDateUtils.isThisWeek(farPast), isFalse);
    });

    test('returns false for date far in the future', () {
      final farFuture = DateTime.now().add(const Duration(days: 30));
      expect(AppDateUtils.isThisWeek(farFuture), isFalse);
    });
  });

  group('AppDateUtils - isThisMonth', () {
    test('returns true for this month', () {
      expect(AppDateUtils.isThisMonth(DateTime.now()), isTrue);
    });

    test('returns false for different month', () {
      final now = DateTime.now();
      final otherMonth = DateTime(now.year, now.month == 1 ? 12 : now.month - 1, 1);
      expect(AppDateUtils.isThisMonth(otherMonth), isFalse);
    });
  });

  group('AppDateUtils - startOfDay', () {
    test('returns midnight', () {
      final date = DateTime(2024, 1, 15, 14, 30, 45);
      final start = AppDateUtils.startOfDay(date);
      expect(start.hour, 0);
      expect(start.minute, 0);
      expect(start.second, 0);
      expect(start.day, 15);
    });
  });

  group('AppDateUtils - endOfDay', () {
    test('returns 23:59:59.999', () {
      final date = DateTime(2024, 1, 15, 14, 30, 45);
      final end = AppDateUtils.endOfDay(date);
      expect(end.hour, 23);
      expect(end.minute, 59);
      expect(end.second, 59);
      expect(end.millisecond, 999);
      expect(end.day, 15);
    });
  });

  group('AppDateUtils - startOfMonth', () {
    test('returns first day of month', () {
      final date = DateTime(2024, 3, 15);
      final start = AppDateUtils.startOfMonth(date);
      expect(start.day, 1);
      expect(start.month, 3);
    });
  });

  group('AppDateUtils - endOfMonth', () {
    test('returns last day of month', () {
      final date = DateTime(2024, 1, 15);
      final end = AppDateUtils.endOfMonth(date);
      expect(end.day, 31);
      expect(end.month, 1);
    });

    test('handles February in leap year', () {
      final date = DateTime(2024, 2, 10);
      final end = AppDateUtils.endOfMonth(date);
      expect(end.day, 29);
    });

    test('handles February in non-leap year', () {
      final date = DateTime(2023, 2, 10);
      final end = AppDateUtils.endOfMonth(date);
      expect(end.day, 28);
    });
  });

  group('AppDateUtils - daysInMonth', () {
    test('returns 31 for January', () {
      expect(AppDateUtils.daysInMonth(2024, 1), 31);
    });

    test('returns 29 for February in leap year', () {
      expect(AppDateUtils.daysInMonth(2024, 2), 29);
    });

    test('returns 28 for February in non-leap year', () {
      expect(AppDateUtils.daysInMonth(2023, 2), 28);
    });

    test('returns 30 for April', () {
      expect(AppDateUtils.daysInMonth(2024, 4), 30);
    });
  });

  group('AppDateUtils - daysBetween', () {
    test('returns correct day difference', () {
      final from = DateTime(2024, 1, 1);
      final to = DateTime(2024, 1, 15);
      expect(AppDateUtils.daysBetween(from, to), 14);
    });

    test('returns 0 for same day', () {
      final date = DateTime(2024, 1, 15, 10, 30);
      final sameDay = DateTime(2024, 1, 15, 20, 0);
      expect(AppDateUtils.daysBetween(date, sameDay), 0);
    });

    test('returns negative for reverse order', () {
      final from = DateTime(2024, 1, 15);
      final to = DateTime(2024, 1, 1);
      expect(AppDateUtils.daysBetween(from, to), -14);
    });
  });

  group('AppDateUtils - dateRange', () {
    test('returns range of dates', () {
      final start = DateTime(2024, 1, 1);
      final end = DateTime(2024, 1, 5);
      final range = AppDateUtils.dateRange(start, end);
      expect(range, hasLength(5));
      expect(range.first.day, 1);
      expect(range.last.day, 5);
    });

    test('returns single date for same day', () {
      final date = DateTime(2024, 1, 15);
      final range = AppDateUtils.dateRange(date, date);
      expect(range, hasLength(1));
    });
  });

  group('AppDateUtils - addBusinessDays', () {
    test('skips weekends', () {
      // Friday Jan 12, 2024
      final friday = DateTime(2024, 1, 12);
      final result = AppDateUtils.addBusinessDays(friday, 1);
      // Should be Monday Jan 15
      expect(result.weekday, DateTime.monday);
      expect(result.day, 15);
    });

    test('adds business days correctly', () {
      // Monday Jan 8, 2024
      final monday = DateTime(2024, 1, 8);
      final result = AppDateUtils.addBusinessDays(monday, 5);
      // Should be Monday Jan 15
      expect(result.weekday, DateTime.monday);
    });
  });

  group('AppDateUtils - isWeekend / isBusinessDay', () {
    test('Saturday is weekend', () {
      final saturday = DateTime(2024, 1, 13);
      expect(AppDateUtils.isWeekend(saturday), isTrue);
      expect(AppDateUtils.isBusinessDay(saturday), isFalse);
    });

    test('Sunday is weekend', () {
      final sunday = DateTime(2024, 1, 14);
      expect(AppDateUtils.isWeekend(sunday), isTrue);
      expect(AppDateUtils.isBusinessDay(sunday), isFalse);
    });

    test('Monday is business day', () {
      final monday = DateTime(2024, 1, 15);
      expect(AppDateUtils.isWeekend(monday), isFalse);
      expect(AppDateUtils.isBusinessDay(monday), isTrue);
    });
  });

  group('AppDateUtils - formatDuration', () {
    test('formats days and hours', () {
      expect(
        AppDateUtils.formatDuration(const Duration(days: 2, hours: 5)),
        '2d 5h',
      );
    });

    test('formats hours and minutes', () {
      expect(
        AppDateUtils.formatDuration(const Duration(hours: 3, minutes: 30)),
        '3h 30m',
      );
    });

    test('formats minutes and seconds', () {
      expect(
        AppDateUtils.formatDuration(const Duration(minutes: 5, seconds: 30)),
        '5m 30s',
      );
    });

    test('formats seconds only', () {
      expect(
        AppDateUtils.formatDuration(const Duration(seconds: 45)),
        '45s',
      );
    });
  });
}
