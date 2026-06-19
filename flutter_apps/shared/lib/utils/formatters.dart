import 'package:intl/intl.dart';

class AppFormatters {
  static final _currencyFormat = NumberFormat('#,##0', 'vi_VN');
  static final _dateFormat = DateFormat('dd/MM/yyyy');
  static final _dateTimeFormat = DateFormat('dd/MM/yyyy HH:mm');
  static final _timeFormat = DateFormat('HH:mm');
  static final _shortDateFormat = DateFormat('dd/MM');
  static final _monthYearFormat = DateFormat('MM/yyyy');

  static String currency(num amount, {String unit = 'VND'}) {
    return '${_currencyFormat.format(amount)} $unit';
  }

  static String date(DateTime dt) => _dateFormat.format(dt);
  static String dateTime(DateTime dt) => _dateTimeFormat.format(dt);
  static String time(DateTime dt) => _timeFormat.format(dt);
  static String shortDate(DateTime dt) => _shortDateFormat.format(dt);
  static String monthYear(DateTime dt) => _monthYearFormat.format(dt);

  static String relativeTime(DateTime dt) {
    final diff = DateTime.now().difference(dt);
    if (diff.inMinutes < 1) return 'Vừa xong';
    if (diff.inMinutes < 60) return '${diff.inMinutes} phút trước';
    if (diff.inHours < 24) return '${diff.inHours} giờ trước';
    if (diff.inDays < 7) return '${diff.inDays} ngày trước';
    if (diff.inDays < 30) return '${(diff.inDays / 7).floor()} tuần trước';
    if (diff.inDays < 365) return '${(diff.inDays / 30).floor()} tháng trước';
    return '${(diff.inDays / 365).floor()} năm trước';
  }

  static String compactNumber(num value) {
    if (value >= 1000000000) return '${(value / 1000000000).toStringAsFixed(1)}B';
    if (value >= 1000000) return '${(value / 1000000).toStringAsFixed(1)}M';
    if (value >= 1000) return '${(value / 1000).toStringAsFixed(1)}K';
    return value.toString();
  }

  static String percentage(double value) => '${value.toStringAsFixed(1)}%';

  static String phone(String phone) {
    if (phone.length == 10) {
      return '${phone.substring(0, 4)} ${phone.substring(4, 7)} ${phone.substring(7)}';
    }
    return phone;
  }
}
