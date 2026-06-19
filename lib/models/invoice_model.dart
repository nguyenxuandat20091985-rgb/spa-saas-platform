class InvoiceModel {
  final String id;
  final String userId;
  final double amount;
  final String currency;
  final InvoiceStatus status;
  final DateTime issuedAt;
  final DateTime dueDate;
  final DateTime? paidAt;
  final List<InvoiceLineItem> lineItems;

  const InvoiceModel({
    required this.id,
    required this.userId,
    required this.amount,
    this.currency = 'USD',
    this.status = InvoiceStatus.pending,
    required this.issuedAt,
    required this.dueDate,
    this.paidAt,
    this.lineItems = const [],
  });

  factory InvoiceModel.fromJson(Map<String, dynamic> json) {
    return InvoiceModel(
      id: json['id'] as String,
      userId: json['userId'] as String,
      amount: (json['amount'] as num).toDouble(),
      currency: json['currency'] as String? ?? 'USD',
      status:
          InvoiceStatus.fromString(json['status'] as String? ?? 'pending'),
      issuedAt: DateTime.parse(json['issuedAt'] as String),
      dueDate: DateTime.parse(json['dueDate'] as String),
      paidAt: json['paidAt'] != null
          ? DateTime.parse(json['paidAt'] as String)
          : null,
      lineItems: (json['lineItems'] as List<dynamic>?)
              ?.map(
                (e) => InvoiceLineItem.fromJson(e as Map<String, dynamic>),
              )
              .toList() ??
          [],
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'userId': userId,
      'amount': amount,
      'currency': currency,
      'status': status.name,
      'issuedAt': issuedAt.toIso8601String(),
      'dueDate': dueDate.toIso8601String(),
      'paidAt': paidAt?.toIso8601String(),
      'lineItems': lineItems.map((e) => e.toJson()).toList(),
    };
  }

  bool get isOverdue =>
      status == InvoiceStatus.pending && DateTime.now().isAfter(dueDate);

  double get tax => amount * 0.1;

  double get totalWithTax => amount + tax;

  InvoiceModel markAsPaid() {
    return InvoiceModel(
      id: id,
      userId: userId,
      amount: amount,
      currency: currency,
      status: InvoiceStatus.paid,
      issuedAt: issuedAt,
      dueDate: dueDate,
      paidAt: DateTime.now(),
      lineItems: lineItems,
    );
  }

  @override
  bool operator ==(Object other) {
    if (identical(this, other)) return true;
    return other is InvoiceModel && other.id == id;
  }

  @override
  int get hashCode => id.hashCode;
}

class InvoiceLineItem {
  final String description;
  final int quantity;
  final double unitPrice;

  const InvoiceLineItem({
    required this.description,
    required this.quantity,
    required this.unitPrice,
  });

  factory InvoiceLineItem.fromJson(Map<String, dynamic> json) {
    return InvoiceLineItem(
      description: json['description'] as String,
      quantity: json['quantity'] as int,
      unitPrice: (json['unitPrice'] as num).toDouble(),
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'description': description,
      'quantity': quantity,
      'unitPrice': unitPrice,
    };
  }

  double get total => quantity * unitPrice;
}

enum InvoiceStatus {
  pending,
  paid,
  overdue,
  cancelled,
  refunded;

  static InvoiceStatus fromString(String value) {
    return InvoiceStatus.values.firstWhere(
      (status) => status.name == value,
      orElse: () => InvoiceStatus.pending,
    );
  }

  bool get isFinalized => this == paid || this == cancelled || this == refunded;
}
