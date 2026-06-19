import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/models/invoice_model.dart';

void main() {
  group('InvoiceModel', () {
    final issuedAt = DateTime(2024, 1, 15);
    final dueDate = DateTime(2024, 2, 15);

    InvoiceModel createInvoice({
      String id = 'inv_1',
      String userId = 'user_1',
      double amount = 100.0,
      String currency = 'USD',
      InvoiceStatus status = InvoiceStatus.pending,
      DateTime? paidAt,
      List<InvoiceLineItem> lineItems = const [],
    }) {
      return InvoiceModel(
        id: id,
        userId: userId,
        amount: amount,
        currency: currency,
        status: status,
        issuedAt: issuedAt,
        dueDate: dueDate,
        paidAt: paidAt,
        lineItems: lineItems,
      );
    }

    test('constructs with required fields', () {
      final invoice = createInvoice();
      expect(invoice.id, 'inv_1');
      expect(invoice.userId, 'user_1');
      expect(invoice.amount, 100.0);
      expect(invoice.currency, 'USD');
      expect(invoice.status, InvoiceStatus.pending);
      expect(invoice.paidAt, isNull);
      expect(invoice.lineItems, isEmpty);
    });

    test('fromJson creates correct model', () {
      final json = {
        'id': 'inv_1',
        'userId': 'user_1',
        'amount': 250.50,
        'currency': 'EUR',
        'status': 'paid',
        'issuedAt': '2024-01-15T00:00:00.000',
        'dueDate': '2024-02-15T00:00:00.000',
        'paidAt': '2024-01-20T00:00:00.000',
        'lineItems': [
          {'description': 'Service', 'quantity': 2, 'unitPrice': 125.25},
        ],
      };

      final invoice = InvoiceModel.fromJson(json);
      expect(invoice.amount, 250.50);
      expect(invoice.currency, 'EUR');
      expect(invoice.status, InvoiceStatus.paid);
      expect(invoice.paidAt, isNotNull);
      expect(invoice.lineItems, hasLength(1));
      expect(invoice.lineItems.first.description, 'Service');
    });

    test('fromJson handles missing optional fields', () {
      final json = {
        'id': 'inv_1',
        'userId': 'user_1',
        'amount': 100,
        'issuedAt': '2024-01-15T00:00:00.000',
        'dueDate': '2024-02-15T00:00:00.000',
      };

      final invoice = InvoiceModel.fromJson(json);
      expect(invoice.currency, 'USD');
      expect(invoice.status, InvoiceStatus.pending);
      expect(invoice.paidAt, isNull);
      expect(invoice.lineItems, isEmpty);
    });

    test('toJson produces correct map', () {
      final invoice = createInvoice(
        amount: 200.0,
        lineItems: [
          const InvoiceLineItem(
            description: 'Item',
            quantity: 2,
            unitPrice: 100.0,
          ),
        ],
      );

      final json = invoice.toJson();
      expect(json['id'], 'inv_1');
      expect(json['amount'], 200.0);
      expect(json['lineItems'], hasLength(1));
    });

    test('tax is 10% of amount', () {
      final invoice = createInvoice(amount: 100.0);
      expect(invoice.tax, 10.0);
    });

    test('totalWithTax adds tax to amount', () {
      final invoice = createInvoice(amount: 100.0);
      expect(invoice.totalWithTax, 110.0);
    });

    test('isOverdue returns true for past-due pending invoices', () {
      final overdueInvoice = InvoiceModel(
        id: 'inv_1',
        userId: 'user_1',
        amount: 100,
        issuedAt: DateTime(2020, 1, 1),
        dueDate: DateTime(2020, 2, 1),
      );
      expect(overdueInvoice.isOverdue, isTrue);
    });

    test('isOverdue returns false for paid invoices', () {
      final paidInvoice = InvoiceModel(
        id: 'inv_1',
        userId: 'user_1',
        amount: 100,
        status: InvoiceStatus.paid,
        issuedAt: DateTime(2020, 1, 1),
        dueDate: DateTime(2020, 2, 1),
      );
      expect(paidInvoice.isOverdue, isFalse);
    });

    test('markAsPaid sets status and paidAt', () {
      final invoice = createInvoice();
      final paid = invoice.markAsPaid();
      expect(paid.status, InvoiceStatus.paid);
      expect(paid.paidAt, isNotNull);
      expect(paid.id, invoice.id);
      expect(paid.amount, invoice.amount);
    });

    test('equality is based on id', () {
      final i1 = createInvoice(id: 'inv_1', amount: 100);
      final i2 = createInvoice(id: 'inv_1', amount: 200);
      final i3 = createInvoice(id: 'inv_2', amount: 100);

      expect(i1, equals(i2));
      expect(i1, isNot(equals(i3)));
    });

    test('hashCode is based on id', () {
      final i1 = createInvoice(id: 'inv_1', amount: 100);
      final i2 = createInvoice(id: 'inv_1', amount: 200);
      expect(i1.hashCode, equals(i2.hashCode));
    });
  });

  group('InvoiceLineItem', () {
    test('constructs correctly', () {
      const item = InvoiceLineItem(
        description: 'Service',
        quantity: 3,
        unitPrice: 50.0,
      );
      expect(item.description, 'Service');
      expect(item.quantity, 3);
      expect(item.unitPrice, 50.0);
    });

    test('total calculates correctly', () {
      const item = InvoiceLineItem(
        description: 'Service',
        quantity: 3,
        unitPrice: 50.0,
      );
      expect(item.total, 150.0);
    });

    test('fromJson creates correct item', () {
      final json = {
        'description': 'Hosting',
        'quantity': 1,
        'unitPrice': 9.99,
      };

      final item = InvoiceLineItem.fromJson(json);
      expect(item.description, 'Hosting');
      expect(item.quantity, 1);
      expect(item.unitPrice, 9.99);
    });

    test('toJson produces correct map', () {
      const item = InvoiceLineItem(
        description: 'Service',
        quantity: 2,
        unitPrice: 25.0,
      );

      final json = item.toJson();
      expect(json['description'], 'Service');
      expect(json['quantity'], 2);
      expect(json['unitPrice'], 25.0);
    });
  });

  group('InvoiceStatus', () {
    test('fromString parses valid statuses', () {
      expect(InvoiceStatus.fromString('pending'), InvoiceStatus.pending);
      expect(InvoiceStatus.fromString('paid'), InvoiceStatus.paid);
      expect(InvoiceStatus.fromString('overdue'), InvoiceStatus.overdue);
      expect(InvoiceStatus.fromString('cancelled'), InvoiceStatus.cancelled);
      expect(InvoiceStatus.fromString('refunded'), InvoiceStatus.refunded);
    });

    test('fromString defaults to pending for unknown', () {
      expect(InvoiceStatus.fromString('unknown'), InvoiceStatus.pending);
    });

    test('isFinalized is correct', () {
      expect(InvoiceStatus.pending.isFinalized, isFalse);
      expect(InvoiceStatus.paid.isFinalized, isTrue);
      expect(InvoiceStatus.overdue.isFinalized, isFalse);
      expect(InvoiceStatus.cancelled.isFinalized, isTrue);
      expect(InvoiceStatus.refunded.isFinalized, isTrue);
    });
  });
}
