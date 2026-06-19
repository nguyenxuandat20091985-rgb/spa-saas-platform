class Formatters {
  static String currency(double amount, {String symbol = '\$', int decimals = 2}) {
    final formatted = amount.toStringAsFixed(decimals);
    return '$symbol$formatted';
  }

  static String compactNumber(num value) {
    if (value.abs() >= 1e9) {
      return '${(value / 1e9).toStringAsFixed(1)}B';
    }
    if (value.abs() >= 1e6) {
      return '${(value / 1e6).toStringAsFixed(1)}M';
    }
    if (value.abs() >= 1e3) {
      return '${(value / 1e3).toStringAsFixed(1)}K';
    }
    return value.toString();
  }

  static String percentage(double value, {int decimals = 1}) {
    return '${(value * 100).toStringAsFixed(decimals)}%';
  }

  static String truncate(String text, int maxLength, {String ellipsis = '...'}) {
    if (text.length <= maxLength) return text;
    return '${text.substring(0, maxLength - ellipsis.length)}$ellipsis';
  }

  static String capitalize(String text) {
    if (text.isEmpty) return text;
    return text[0].toUpperCase() + text.substring(1).toLowerCase();
  }

  static String titleCase(String text) {
    if (text.isEmpty) return text;
    return text.split(' ').map(capitalize).join(' ');
  }

  static String initials(String name, {int maxInitials = 2}) {
    final parts = name.trim().split(RegExp(r'\s+'));
    final initialsStr = parts
        .where((part) => part.isNotEmpty)
        .take(maxInitials)
        .map((part) => part[0].toUpperCase())
        .join();
    return initialsStr;
  }

  static String relativeTime(DateTime dateTime) {
    final now = DateTime.now();
    final diff = now.difference(dateTime);

    if (diff.inDays > 365) {
      final years = (diff.inDays / 365).floor();
      return '$years${years == 1 ? ' year' : ' years'} ago';
    }
    if (diff.inDays > 30) {
      final months = (diff.inDays / 30).floor();
      return '$months${months == 1 ? ' month' : ' months'} ago';
    }
    if (diff.inDays > 0) {
      return '${diff.inDays}${diff.inDays == 1 ? ' day' : ' days'} ago';
    }
    if (diff.inHours > 0) {
      return '${diff.inHours}${diff.inHours == 1 ? ' hour' : ' hours'} ago';
    }
    if (diff.inMinutes > 0) {
      return '${diff.inMinutes}${diff.inMinutes == 1 ? ' minute' : ' minutes'} ago';
    }
    return 'just now';
  }

  static String fileSize(int bytes) {
    if (bytes < 1024) return '$bytes B';
    if (bytes < 1024 * 1024) {
      return '${(bytes / 1024).toStringAsFixed(1)} KB';
    }
    if (bytes < 1024 * 1024 * 1024) {
      return '${(bytes / (1024 * 1024)).toStringAsFixed(1)} MB';
    }
    return '${(bytes / (1024 * 1024 * 1024)).toStringAsFixed(1)} GB';
  }

  static String slug(String text) {
    return text
        .toLowerCase()
        .trim()
        .replaceAll(RegExp(r'[^a-z0-9\s-]'), '')
        .replaceAll(RegExp(r'[\s-]+'), '-');
  }

  static String pluralize(int count, String singular, {String? plural}) {
    final word = count == 1 ? singular : (plural ?? '${singular}s');
    return '$count $word';
  }
}
