import '../models/invoice_model.dart';
import '../models/user_model.dart';

class BillingService {
  final Map<String, InvoiceModel> _invoices = {};
  final Map<String, SubscriptionTier> _subscriptions = {};
  int _idCounter = 0;

  List<InvoiceModel> get allInvoices => _invoices.values.toList();

  SubscriptionTier getSubscription(String userId) {
    return _subscriptions[userId] ?? SubscriptionTier.free;
  }

  void setSubscription(String userId, SubscriptionTier tier) {
    _subscriptions[userId] = tier;
  }

  InvoiceModel createInvoice({
    required String userId,
    required List<InvoiceLineItem> lineItems,
    String currency = 'USD',
    int dueDays = 30,
  }) {
    if (lineItems.isEmpty) {
      throw BillingException('Invoice must have at least one line item');
    }

    for (final item in lineItems) {
      if (item.quantity <= 0) {
        throw BillingException('Line item quantity must be positive');
      }
      if (item.unitPrice < 0) {
        throw BillingException('Line item unit price cannot be negative');
      }
    }

    final amount = lineItems.fold<double>(
      0,
      (sum, item) => sum + item.total,
    );

    final now = DateTime.now();
    _idCounter++;
    final invoice = InvoiceModel(
      id: 'inv_${now.millisecondsSinceEpoch}_$_idCounter',
      userId: userId,
      amount: amount,
      currency: currency,
      issuedAt: now,
      dueDate: now.add(Duration(days: dueDays)),
      lineItems: lineItems,
    );

    _invoices[invoice.id] = invoice;
    return invoice;
  }

  InvoiceModel? getInvoice(String invoiceId) => _invoices[invoiceId];

  List<InvoiceModel> getInvoicesForUser(String userId) {
    return _invoices.values
        .where((invoice) => invoice.userId == userId)
        .toList();
  }

  InvoiceModel payInvoice(String invoiceId) {
    final invoice = _invoices[invoiceId];
    if (invoice == null) {
      throw InvoiceNotFoundException('Invoice $invoiceId not found');
    }

    if (invoice.status.isFinalized) {
      throw BillingException(
        'Cannot pay invoice with status: ${invoice.status.name}',
      );
    }

    final paid = invoice.markAsPaid();
    _invoices[invoiceId] = paid;
    return paid;
  }

  InvoiceModel cancelInvoice(String invoiceId) {
    final invoice = _invoices[invoiceId];
    if (invoice == null) {
      throw InvoiceNotFoundException('Invoice $invoiceId not found');
    }

    if (invoice.status == InvoiceStatus.paid) {
      throw BillingException('Cannot cancel a paid invoice');
    }

    final cancelled = InvoiceModel(
      id: invoice.id,
      userId: invoice.userId,
      amount: invoice.amount,
      currency: invoice.currency,
      status: InvoiceStatus.cancelled,
      issuedAt: invoice.issuedAt,
      dueDate: invoice.dueDate,
      lineItems: invoice.lineItems,
    );

    _invoices[invoiceId] = cancelled;
    return cancelled;
  }

  double calculateUpgradeCost(
    SubscriptionTier currentTier,
    SubscriptionTier newTier,
  ) {
    if (newTier.index <= currentTier.index) return 0;
    return newTier.monthlyPrice - currentTier.monthlyPrice;
  }

  double calculateMonthlyRevenue() {
    return _subscriptions.values.fold<double>(
      0,
      (sum, tier) => sum + tier.monthlyPrice,
    );
  }

  List<InvoiceModel> getOverdueInvoices() {
    return _invoices.values.where((invoice) => invoice.isOverdue).toList();
  }

  Map<InvoiceStatus, int> getInvoiceStatusSummary() {
    final summary = <InvoiceStatus, int>{};
    for (final invoice in _invoices.values) {
      summary[invoice.status] = (summary[invoice.status] ?? 0) + 1;
    }
    return summary;
  }
}

class BillingException implements Exception {
  final String message;
  BillingException(this.message);
  @override
  String toString() => message;
}

class InvoiceNotFoundException implements Exception {
  final String message;
  InvoiceNotFoundException(this.message);
  @override
  String toString() => message;
}
