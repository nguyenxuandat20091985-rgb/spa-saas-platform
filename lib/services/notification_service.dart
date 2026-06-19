class NotificationModel {
  final String id;
  final String userId;
  final String title;
  final String body;
  final NotificationType type;
  final bool isRead;
  final DateTime createdAt;
  final Map<String, dynamic>? metadata;

  const NotificationModel({
    required this.id,
    required this.userId,
    required this.title,
    required this.body,
    this.type = NotificationType.info,
    this.isRead = false,
    required this.createdAt,
    this.metadata,
  });

  NotificationModel markAsRead() {
    return NotificationModel(
      id: id,
      userId: userId,
      title: title,
      body: body,
      type: type,
      isRead: true,
      createdAt: createdAt,
      metadata: metadata,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'title': title,
      'body': body,
      'type': type.name,
      'isRead': isRead,
      'createdAt': createdAt.toIso8601String(),
      'metadata': metadata,
    };
  }

  factory NotificationModel.fromJson(Map<String, dynamic> json) {
    return NotificationModel(
      id: json['id'] as String,
      userId: json['userId'] as String,
      title: json['title'] as String,
      body: json['body'] as String,
      type: NotificationType.fromString(json['type'] as String? ?? 'info'),
      isRead: json['isRead'] as bool? ?? false,
      createdAt: DateTime.parse(json['createdAt'] as String),
      metadata: json['metadata'] as Map<String, dynamic>?,
    );
  }
}

enum NotificationType {
  info,
  warning,
  error,
  success,
  billing,
  projectUpdate;

  static NotificationType fromString(String value) {
    return NotificationType.values.firstWhere(
      (type) => type.name == value,
      orElse: () => NotificationType.info,
    );
  }
}

class NotificationService {
  final Map<String, NotificationModel> _notifications = {};
  int _idCounter = 0;

  List<NotificationModel> get allNotifications =>
      _notifications.values.toList()
        ..sort((a, b) => b.createdAt.compareTo(a.createdAt));

  NotificationModel sendNotification({
    required String userId,
    required String title,
    required String body,
    NotificationType type = NotificationType.info,
    Map<String, dynamic>? metadata,
  }) {
    if (title.trim().isEmpty) {
      throw NotificationException('Notification title cannot be empty');
    }
    if (body.trim().isEmpty) {
      throw NotificationException('Notification body cannot be empty');
    }

    final now = DateTime.now();
    _idCounter++;
    final notification = NotificationModel(
      id: 'notif_${now.millisecondsSinceEpoch}_$_idCounter',
      userId: userId,
      title: title.trim(),
      body: body.trim(),
      type: type,
      createdAt: now,
      metadata: metadata,
    );

    _notifications[notification.id] = notification;
    return notification;
  }

  List<NotificationModel> getNotificationsForUser(String userId) {
    return _notifications.values
        .where((n) => n.userId == userId)
        .toList()
      ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  }

  List<NotificationModel> getUnreadNotifications(String userId) {
    return getNotificationsForUser(userId)
        .where((n) => !n.isRead)
        .toList();
  }

  int getUnreadCount(String userId) {
    return getUnreadNotifications(userId).length;
  }

  NotificationModel markAsRead(String notificationId) {
    final notification = _notifications[notificationId];
    if (notification == null) {
      throw NotificationException('Notification $notificationId not found');
    }

    final updated = notification.markAsRead();
    _notifications[notificationId] = updated;
    return updated;
  }

  int markAllAsRead(String userId) {
    var count = 0;
    for (final entry in _notifications.entries.toList()) {
      if (entry.value.userId == userId && !entry.value.isRead) {
        _notifications[entry.key] = entry.value.markAsRead();
        count++;
      }
    }
    return count;
  }

  bool deleteNotification(String notificationId) {
    return _notifications.remove(notificationId) != null;
  }

  int clearNotificationsForUser(String userId) {
    final toRemove = _notifications.entries
        .where((e) => e.value.userId == userId)
        .map((e) => e.key)
        .toList();
    for (final id in toRemove) {
      _notifications.remove(id);
    }
    return toRemove.length;
  }
}

class NotificationException implements Exception {
  final String message;
  NotificationException(this.message);
  @override
  String toString() => message;
}
