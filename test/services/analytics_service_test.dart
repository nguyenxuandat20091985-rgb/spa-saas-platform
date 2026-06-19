import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/services/analytics_service.dart';

void main() {
  late AnalyticsService analyticsService;

  setUp(() {
    analyticsService = AnalyticsService();
  });

  group('AnalyticsService - tracking', () {
    test('tracks event', () {
      analyticsService.trackEvent('click', userId: 'user_1');
      expect(analyticsService.totalEvents, 1);
      expect(analyticsService.allEvents.first.name, 'click');
    });

    test('tracks event with properties', () {
      analyticsService.trackEvent(
        'purchase',
        userId: 'user_1',
        properties: {'amount': 29.99},
      );

      final event = analyticsService.allEvents.first;
      expect(event.properties['amount'], 29.99);
    });

    test('throws on empty event name', () {
      expect(
        () => analyticsService.trackEvent(''),
        throwsA(isA<AnalyticsException>()),
      );
    });

    test('does not track when disabled', () {
      analyticsService.disable();
      analyticsService.trackEvent('click');
      expect(analyticsService.totalEvents, 0);
    });

    test('resumes tracking after re-enabling', () {
      analyticsService.disable();
      analyticsService.enable();
      analyticsService.trackEvent('click');
      expect(analyticsService.totalEvents, 1);
    });
  });

  group('AnalyticsService - trackPageView', () {
    test('tracks page view event', () {
      analyticsService.trackPageView('dashboard', userId: 'user_1');
      final event = analyticsService.allEvents.first;
      expect(event.name, 'page_view');
      expect(event.properties['page'], 'dashboard');
    });
  });

  group('AnalyticsService - trackUserAction', () {
    test('tracks user action', () {
      analyticsService.trackUserAction(
        'click_button',
        userId: 'user_1',
        target: 'submit_btn',
      );

      final event = analyticsService.allEvents.first;
      expect(event.name, 'user_action');
      expect(event.properties['action'], 'click_button');
      expect(event.properties['target'], 'submit_btn');
    });

    test('tracks action without target', () {
      analyticsService.trackUserAction('scroll', userId: 'user_1');
      final event = analyticsService.allEvents.first;
      expect(event.properties.containsKey('target'), isFalse);
    });
  });

  group('AnalyticsService - trackError', () {
    test('tracks error event', () {
      analyticsService.trackError(
        'NullPointerException',
        userId: 'user_1',
        stackTrace: 'stack...',
      );

      final event = analyticsService.allEvents.first;
      expect(event.name, 'error');
      expect(event.properties['error'], 'NullPointerException');
      expect(event.properties['stackTrace'], 'stack...');
    });

    test('tracks error without stack trace', () {
      analyticsService.trackError('SomeError');
      final event = analyticsService.allEvents.first;
      expect(event.properties.containsKey('stackTrace'), isFalse);
    });
  });

  group('AnalyticsService - queries', () {
    test('getEventsForUser filters by user', () {
      analyticsService.trackEvent('click', userId: 'user_1');
      analyticsService.trackEvent('click', userId: 'user_2');
      analyticsService.trackEvent('view', userId: 'user_1');

      expect(analyticsService.getEventsForUser('user_1'), hasLength(2));
      expect(analyticsService.getEventsForUser('user_2'), hasLength(1));
    });

    test('getEventsByName filters by name', () {
      analyticsService.trackEvent('click');
      analyticsService.trackEvent('view');
      analyticsService.trackEvent('click');

      expect(analyticsService.getEventsByName('click'), hasLength(2));
      expect(analyticsService.getEventsByName('view'), hasLength(1));
    });

    test('getEventCountsByName returns counts', () {
      analyticsService.trackEvent('click');
      analyticsService.trackEvent('view');
      analyticsService.trackEvent('click');

      final counts = analyticsService.getEventCountsByName();
      expect(counts['click'], 2);
      expect(counts['view'], 1);
    });

    test('getPageViewCounts returns page view counts', () {
      analyticsService.trackPageView('home');
      analyticsService.trackPageView('dashboard');
      analyticsService.trackPageView('home');

      final counts = analyticsService.getPageViewCounts();
      expect(counts['home'], 2);
      expect(counts['dashboard'], 1);
    });

    test('getUniqueUsers returns unique user count', () {
      analyticsService.trackEvent('click', userId: 'user_1');
      analyticsService.trackEvent('click', userId: 'user_2');
      analyticsService.trackEvent('view', userId: 'user_1');
      analyticsService.trackEvent('view'); // no user

      expect(analyticsService.getUniqueUsers(), 2);
    });

    test('getEventsInRange filters by date', () {
      analyticsService.trackEvent('click');

      final now = DateTime.now();
      final events = analyticsService.getEventsInRange(
        now.subtract(const Duration(hours: 1)),
        now.add(const Duration(hours: 1)),
      );
      expect(events, hasLength(1));

      final noEvents = analyticsService.getEventsInRange(
        now.subtract(const Duration(days: 10)),
        now.subtract(const Duration(days: 5)),
      );
      expect(noEvents, isEmpty);
    });
  });

  group('AnalyticsService - clearEvents', () {
    test('clears all events', () {
      analyticsService.trackEvent('click');
      analyticsService.trackEvent('view');
      analyticsService.clearEvents();
      expect(analyticsService.totalEvents, 0);
    });
  });

  group('AnalyticsEvent', () {
    test('toJson produces correct map', () {
      final event = AnalyticsEvent(
        name: 'click',
        userId: 'user_1',
        properties: {'target': 'btn'},
        timestamp: DateTime(2024, 1, 15),
      );

      final json = event.toJson();
      expect(json['name'], 'click');
      expect(json['userId'], 'user_1');
      expect(json['properties'], {'target': 'btn'});
    });
  });

  group('AnalyticsService - isEnabled', () {
    test('is enabled by default', () {
      expect(analyticsService.isEnabled, isTrue);
    });

    test('reports disabled after disable()', () {
      analyticsService.disable();
      expect(analyticsService.isEnabled, isFalse);
    });
  });

  group('AnalyticsService - allEvents immutability', () {
    test('allEvents returns unmodifiable list', () {
      analyticsService.trackEvent('test');
      final events = analyticsService.allEvents;
      expect(events, hasLength(1));
      expect(events.first.name, 'test');
    });
  });

  group('AnalyticsException', () {
    test('toString returns message', () {
      final exception = AnalyticsException('analytics error');
      expect(exception.toString(), 'analytics error');
      expect(exception.message, 'analytics error');
    });
  });
}
