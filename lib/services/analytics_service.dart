class AnalyticsEvent {
  final String name;
  final String? userId;
  final Map<String, dynamic> properties;
  final DateTime timestamp;

  const AnalyticsEvent({
    required this.name,
    this.userId,
    this.properties = const {},
    required this.timestamp,
  });

  Map<String, dynamic> toJson() {
    return {
      'name': name,
      'userId': userId,
      'properties': properties,
      'timestamp': timestamp.toIso8601String(),
    };
  }
}

class AnalyticsService {
  final List<AnalyticsEvent> _events = [];
  bool _isEnabled = true;

  bool get isEnabled => _isEnabled;
  List<AnalyticsEvent> get allEvents => List.unmodifiable(_events);

  void enable() => _isEnabled = true;
  void disable() => _isEnabled = false;

  void trackEvent(String name, {String? userId, Map<String, dynamic>? properties}) {
    if (!_isEnabled) return;

    if (name.trim().isEmpty) {
      throw AnalyticsException('Event name cannot be empty');
    }

    _events.add(AnalyticsEvent(
      name: name.trim(),
      userId: userId,
      properties: properties ?? {},
      timestamp: DateTime.now(),
    ));
  }

  void trackPageView(String pageName, {String? userId}) {
    trackEvent('page_view', userId: userId, properties: {'page': pageName});
  }

  void trackUserAction(String action, {String? userId, String? target}) {
    final props = <String, dynamic>{'action': action};
    if (target != null) props['target'] = target;
    trackEvent('user_action', userId: userId, properties: props);
  }

  void trackError(String error, {String? userId, String? stackTrace}) {
    final props = <String, dynamic>{'error': error};
    if (stackTrace != null) props['stackTrace'] = stackTrace;
    trackEvent('error', userId: userId, properties: props);
  }

  List<AnalyticsEvent> getEventsForUser(String userId) {
    return _events.where((e) => e.userId == userId).toList();
  }

  List<AnalyticsEvent> getEventsByName(String name) {
    return _events.where((e) => e.name == name).toList();
  }

  List<AnalyticsEvent> getEventsInRange(DateTime start, DateTime end) {
    return _events
        .where((e) => e.timestamp.isAfter(start) && e.timestamp.isBefore(end))
        .toList();
  }

  Map<String, int> getEventCountsByName() {
    final counts = <String, int>{};
    for (final event in _events) {
      counts[event.name] = (counts[event.name] ?? 0) + 1;
    }
    return counts;
  }

  Map<String, int> getPageViewCounts() {
    final pageViews = getEventsByName('page_view');
    final counts = <String, int>{};
    for (final event in pageViews) {
      final page = event.properties['page'] as String?;
      if (page != null) {
        counts[page] = (counts[page] ?? 0) + 1;
      }
    }
    return counts;
  }

  int get totalEvents => _events.length;

  int getUniqueUsers() {
    return _events
        .where((e) => e.userId != null)
        .map((e) => e.userId!)
        .toSet()
        .length;
  }

  void clearEvents() => _events.clear();
}

class AnalyticsException implements Exception {
  final String message;
  AnalyticsException(this.message);
  @override
  String toString() => message;
}
