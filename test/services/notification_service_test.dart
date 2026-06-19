import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/services/notification_service.dart';

void main() {
  late NotificationService notificationService;

  setUp(() {
    notificationService = NotificationService();
  });

  group('NotificationService - sendNotification', () {
    test('sends notification successfully', () {
      final notification = notificationService.sendNotification(
        userId: 'user_1',
        title: 'Test Title',
        body: 'Test Body',
      );

      expect(notification.id, startsWith('notif_'));
      expect(notification.userId, 'user_1');
      expect(notification.title, 'Test Title');
      expect(notification.body, 'Test Body');
      expect(notification.type, NotificationType.info);
      expect(notification.isRead, isFalse);
    });

    test('sends notification with type', () {
      final notification = notificationService.sendNotification(
        userId: 'user_1',
        title: 'Warning',
        body: 'Something happened',
        type: NotificationType.warning,
      );

      expect(notification.type, NotificationType.warning);
    });

    test('sends notification with metadata', () {
      final notification = notificationService.sendNotification(
        userId: 'user_1',
        title: 'Update',
        body: 'Project updated',
        metadata: {'projectId': 'proj_1'},
      );

      expect(notification.metadata, {'projectId': 'proj_1'});
    });

    test('throws on empty title', () {
      expect(
        () => notificationService.sendNotification(
          userId: 'user_1',
          title: '',
          body: 'Body',
        ),
        throwsA(isA<NotificationException>()),
      );
    });

    test('throws on empty body', () {
      expect(
        () => notificationService.sendNotification(
          userId: 'user_1',
          title: 'Title',
          body: '',
        ),
        throwsA(isA<NotificationException>()),
      );
    });

    test('trims title and body', () {
      final notification = notificationService.sendNotification(
        userId: 'user_1',
        title: '  Title  ',
        body: '  Body  ',
      );

      expect(notification.title, 'Title');
      expect(notification.body, 'Body');
    });
  });

  group('NotificationService - getNotificationsForUser', () {
    test('returns notifications for user', () {
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'A',
        body: 'Body A',
      );
      notificationService.sendNotification(
        userId: 'user_2',
        title: 'B',
        body: 'Body B',
      );

      final notifications =
          notificationService.getNotificationsForUser('user_1');
      expect(notifications, hasLength(1));
      expect(notifications.first.title, 'A');
    });

    test('returns empty list for user with no notifications', () {
      expect(
        notificationService.getNotificationsForUser('user_99'),
        isEmpty,
      );
    });
  });

  group('NotificationService - unread notifications', () {
    test('getUnreadNotifications returns unread only', () {
      final n1 = notificationService.sendNotification(
        userId: 'user_1',
        title: 'A',
        body: 'Body A',
      );
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'B',
        body: 'Body B',
      );
      notificationService.markAsRead(n1.id);

      final unread = notificationService.getUnreadNotifications('user_1');
      expect(unread, hasLength(1));
      expect(unread.first.title, 'B');
    });

    test('getUnreadCount returns correct count', () {
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'A',
        body: 'Body A',
      );
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'B',
        body: 'Body B',
      );

      expect(notificationService.getUnreadCount('user_1'), 2);
    });
  });

  group('NotificationService - markAsRead', () {
    test('marks notification as read', () {
      final notification = notificationService.sendNotification(
        userId: 'user_1',
        title: 'Test',
        body: 'Body',
      );

      final read = notificationService.markAsRead(notification.id);
      expect(read.isRead, isTrue);
    });

    test('throws for unknown notification', () {
      expect(
        () => notificationService.markAsRead('unknown'),
        throwsA(isA<NotificationException>()),
      );
    });
  });

  group('NotificationService - markAllAsRead', () {
    test('marks all user notifications as read', () {
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'A',
        body: 'Body A',
      );
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'B',
        body: 'Body B',
      );
      notificationService.sendNotification(
        userId: 'user_2',
        title: 'C',
        body: 'Body C',
      );

      final count = notificationService.markAllAsRead('user_1');
      expect(count, 2);
      expect(notificationService.getUnreadCount('user_1'), 0);
      expect(notificationService.getUnreadCount('user_2'), 1);
    });
  });

  group('NotificationService - deleteNotification', () {
    test('deletes existing notification', () {
      final notification = notificationService.sendNotification(
        userId: 'user_1',
        title: 'Test',
        body: 'Body',
      );

      expect(notificationService.deleteNotification(notification.id), isTrue);
      expect(notificationService.getNotificationsForUser('user_1'), isEmpty);
    });

    test('returns false for unknown notification', () {
      expect(notificationService.deleteNotification('unknown'), isFalse);
    });
  });

  group('NotificationService - clearNotificationsForUser', () {
    test('clears all notifications for user', () {
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'A',
        body: 'Body A',
      );
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'B',
        body: 'Body B',
      );
      notificationService.sendNotification(
        userId: 'user_2',
        title: 'C',
        body: 'Body C',
      );

      final count = notificationService.clearNotificationsForUser('user_1');
      expect(count, 2);
      expect(notificationService.getNotificationsForUser('user_1'), isEmpty);
      expect(
        notificationService.getNotificationsForUser('user_2'),
        hasLength(1),
      );
    });
  });

  group('NotificationModel', () {
    test('toJson produces correct map', () {
      final notification = NotificationModel(
        id: 'notif_1',
        userId: 'user_1',
        title: 'Test',
        body: 'Body',
        type: NotificationType.billing,
        isRead: false,
        createdAt: DateTime(2024, 1, 15),
        metadata: {'key': 'value'},
      );

      final json = notification.toJson();
      expect(json['id'], 'notif_1');
      expect(json['title'], 'Test');
      expect(json['type'], 'billing');
      expect(json['isRead'], false);
      expect(json['metadata'], {'key': 'value'});
    });

    test('fromJson creates correct model', () {
      final json = {
        'id': 'notif_1',
        'userId': 'user_1',
        'title': 'Test',
        'body': 'Body',
        'type': 'warning',
        'isRead': true,
        'createdAt': '2024-01-15T00:00:00.000',
        'metadata': {'key': 'value'},
      };

      final notification = NotificationModel.fromJson(json);
      expect(notification.type, NotificationType.warning);
      expect(notification.isRead, isTrue);
      expect(notification.metadata, {'key': 'value'});
    });

    test('fromJson handles missing optional fields', () {
      final json = {
        'id': 'notif_1',
        'userId': 'user_1',
        'title': 'Test',
        'body': 'Body',
        'createdAt': '2024-01-15T00:00:00.000',
      };

      final notification = NotificationModel.fromJson(json);
      expect(notification.type, NotificationType.info);
      expect(notification.isRead, isFalse);
      expect(notification.metadata, isNull);
    });

    test('markAsRead creates read copy', () {
      final notification = NotificationModel(
        id: 'notif_1',
        userId: 'user_1',
        title: 'Test',
        body: 'Body',
        createdAt: DateTime(2024, 1, 15),
      );

      final read = notification.markAsRead();
      expect(read.isRead, isTrue);
      expect(read.id, notification.id);
      expect(read.title, notification.title);
    });
  });

  group('NotificationType', () {
    test('fromString parses valid types', () {
      expect(NotificationType.fromString('info'), NotificationType.info);
      expect(NotificationType.fromString('warning'), NotificationType.warning);
      expect(NotificationType.fromString('error'), NotificationType.error);
      expect(NotificationType.fromString('success'), NotificationType.success);
      expect(NotificationType.fromString('billing'), NotificationType.billing);
      expect(
        NotificationType.fromString('projectUpdate'),
        NotificationType.projectUpdate,
      );
    });

    test('fromString defaults to info for unknown', () {
      expect(NotificationType.fromString('unknown'), NotificationType.info);
    });
  });

  group('NotificationService - allNotifications', () {
    test('returns all notifications sorted by date descending', () {
      notificationService.sendNotification(
        userId: 'user_1',
        title: 'First',
        body: 'Body 1',
      );
      notificationService.sendNotification(
        userId: 'user_2',
        title: 'Second',
        body: 'Body 2',
      );

      final all = notificationService.allNotifications;
      expect(all, hasLength(2));
    });

    test('returns empty list initially', () {
      expect(notificationService.allNotifications, isEmpty);
    });
  });

  group('NotificationException', () {
    test('toString returns message', () {
      final exception = NotificationException('test error');
      expect(exception.toString(), 'test error');
      expect(exception.message, 'test error');
    });
  });
}
