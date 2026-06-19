class AppointmentModel {
  final String id;
  final String tenantId;
  final String branchId;
  final String customerId;
  final String serviceId;
  final String? staffId;
  final String? roomId;
  final DateTime startTime;
  final DateTime endTime;
  final String status;
  final String? notes;
  final String source;
  final double? totalPrice;
  final String? serviceName;
  final String? customerName;
  final String? staffName;
  final String? roomName;
  final DateTime createdAt;

  const AppointmentModel({
    required this.id,
    required this.tenantId,
    required this.branchId,
    required this.customerId,
    required this.serviceId,
    this.staffId,
    this.roomId,
    required this.startTime,
    required this.endTime,
    required this.status,
    this.notes,
    this.source = 'app',
    this.totalPrice,
    this.serviceName,
    this.customerName,
    this.staffName,
    this.roomName,
    required this.createdAt,
  });

  factory AppointmentModel.fromJson(Map<String, dynamic> json) {
    return AppointmentModel(
      id: json['id'] as String,
      tenantId: json['tenantId'] as String? ?? json['tenant_id'] as String? ?? '',
      branchId: json['branchId'] as String? ?? json['branch_id'] as String? ?? '',
      customerId: json['customerId'] as String? ?? json['customer_id'] as String? ?? '',
      serviceId: json['serviceId'] as String? ?? json['service_id'] as String? ?? '',
      staffId: json['staffId'] as String? ?? json['staff_id'] as String?,
      roomId: json['roomId'] as String? ?? json['room_id'] as String?,
      startTime: DateTime.parse(json['startTime'] as String? ?? json['start_time'] as String),
      endTime: DateTime.parse(json['endTime'] as String? ?? json['end_time'] as String),
      status: json['status'] as String,
      notes: json['notes'] as String?,
      source: json['source'] as String? ?? 'app',
      totalPrice: (json['totalPrice'] ?? json['total_price'] as num?)?.toDouble(),
      serviceName: json['serviceName'] as String? ?? json['service_name'] as String?,
      customerName: json['customerName'] as String? ?? json['customer_name'] as String?,
      staffName: json['staffName'] as String? ?? json['staff_name'] as String?,
      roomName: json['roomName'] as String? ?? json['room_name'] as String?,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? json['created_at'] as String? ?? '') ?? DateTime.now(),
    );
  }

  bool get isPending => status == 'pending';
  bool get isConfirmed => status == 'confirmed';
  bool get isInProgress => status == 'in_progress';
  bool get isCompleted => status == 'completed';
  bool get isCancelled => status == 'cancelled';
  bool get isNoShow => status == 'no_show';

  String get statusDisplay {
    switch (status) {
      case 'pending': return 'Chờ xác nhận';
      case 'confirmed': return 'Đã xác nhận';
      case 'in_progress': return 'Đang thực hiện';
      case 'completed': return 'Hoàn thành';
      case 'cancelled': return 'Đã hủy';
      case 'no_show': return 'Không đến';
      default: return status;
    }
  }

  Duration get duration => endTime.difference(startTime);
}
