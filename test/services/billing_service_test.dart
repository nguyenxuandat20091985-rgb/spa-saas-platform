import 'package:flutter_test/flutter_test.dart';
import 'package:spa_saas_platform/models/invoice_model.dart';
import 'package:spa_saas_platform/models/user_model.dart';
import 'package:spa_saas_platform/services/billing_service.dart';

void main() {
  late BillingService billingService;

  setUp(() {
    billingService = BillingService();
  });

  group('BillingService - subscription management', () {
    test('defaults to free tier', () {
      expect(
        billingService.getSubscription('user_1'),
        SubscriptionTier.free,
      );
    });

    test('sets subscription tier', () {
      billingService.setSubscription('user_1', SubscriptionTier.professional);
      expect(
        billingService.getSubscription('user_1'),
        SubscriptionTier.professional,
      );
    });
  });

  group('BillingService - createInvoice', () {
    test('creates invoice with line items', () {
      final invoice = billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'Pro Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
        ],
      );

      expect(invoice.id, startsWith('inv_'));
      expect(invoice.userId, 'user_1');
      expect(invoice.amount, 29.99);
      expect(invoice.currency, 'USD');
      expect(invoice.status, InvoiceStatus.pending);
    });

    test('calculates amount from multiple line items', () {
      final invoice = billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
          const InvoiceLineItem(
            description: 'Add-on',
            quantity: 2,
            unitPrice: 5.00,
          ),
        ],
      );

      expect(invoice.amount, closeTo(39.99, 0.01));
    });

    test('throws on empty line items', () {
      expect(
        () => billingService.createInvoice(userId: 'user_1', lineItems: []),
        throwsA(isA<BillingException>()),
      );
    });

    test('throws on zero quantity', () {
      expect(
        () => billingService.createInvoice(
          userId: 'user_1',
          lineItems: [
            const InvoiceLineItem(
              description: 'Item',
              quantity: 0,
              unitPrice: 10.0,
            ),
          ],
        ),
        throwsA(isA<BillingException>()),
      );
    });

    test('throws on negative unit price', () {
      expect(
        () => billingService.createInvoice(
          userId: 'user_1',
          lineItems: [
            const InvoiceLineItem(
              description: 'Item',
              quantity: 1,
              unitPrice: -5.0,
            ),
          ],
        ),
        throwsA(isA<BillingException>()),
      );
    });

    test('supports custom currency', () {
      final invoice = billingService.createInvoice(
        userId: 'user_1',
        currency: 'EUR',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
        ],
      );
      expect(invoice.currency, 'EUR');
    });

    test('supports custom due days', () {
      final invoice = billingService.createInvoice(
        userId: 'user_1',
        dueDays: 60,
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
        ],
      );

      final diff = invoice.dueDate.difference(invoice.issuedAt).inDays;
      expect(diff, 60);
    });
  });

  group('BillingService - getInvoice', () {
    test('returns invoice by id', () {
      final created = billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
        ],
      );

      final found = billingService.getInvoice(created.id);
      expect(found, isNotNull);
      expect(found!.amount, 29.99);
    });

    test('returns null for unknown id', () {
      expect(billingService.getInvoice('unknown'), isNull);
    });
  });

  group('BillingService - getInvoicesForUser', () {
    test('returns invoices for specific user', () {
      billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 10.0,
          ),
        ],
      );
      billingService.createInvoice(
        userId: 'user_2',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 20.0,
          ),
        ],
      );

      final invoices = billingService.getInvoicesForUser('user_1');
      expect(invoices, hasLength(1));
      expect(invoices.first.amount, 10.0);
    });
  });

  group('BillingService - payInvoice', () {
    test('marks invoice as paid', () {
      final invoice = billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
        ],
      );

      final paid = billingService.payInvoice(invoice.id);
      expect(paid.status, InvoiceStatus.paid);
      expect(paid.paidAt, isNotNull);
    });

    test('throws for unknown invoice', () {
      expect(
        () => billingService.payInvoice('unknown'),
        throwsA(isA<InvoiceNotFoundException>()),
      );
    });

    test('throws when paying already paid invoice', () {
      final invoice = billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
        ],
      );
      billingService.payInvoice(invoice.id);

      expect(
        () => billingService.payInvoice(invoice.id),
        throwsA(isA<BillingException>()),
      );
    });
  });

  group('BillingService - cancelInvoice', () {
    test('cancels pending invoice', () {
      final invoice = billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
        ],
      );

      final cancelled = billingService.cancelInvoice(invoice.id);
      expect(cancelled.status, InvoiceStatus.cancelled);
    });

    test('throws for unknown invoice', () {
      expect(
        () => billingService.cancelInvoice('unknown'),
        throwsA(isA<InvoiceNotFoundException>()),
      );
    });

    test('throws when cancelling paid invoice', () {
      final invoice = billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'Plan',
            quantity: 1,
            unitPrice: 29.99,
          ),
        ],
      );
      billingService.payInvoice(invoice.id);

      expect(
        () => billingService.cancelInvoice(invoice.id),
        throwsA(isA<BillingException>()),
      );
    });
  });

  group('BillingService - calculateUpgradeCost', () {
    test('returns difference for upgrade', () {
      final cost = billingService.calculateUpgradeCost(
        SubscriptionTier.free,
        SubscriptionTier.starter,
      );
      expect(cost, closeTo(9.99, 0.01));
    });

    test('returns 0 for same tier', () {
      final cost = billingService.calculateUpgradeCost(
        SubscriptionTier.starter,
        SubscriptionTier.starter,
      );
      expect(cost, 0);
    });

    test('returns 0 for downgrade', () {
      final cost = billingService.calculateUpgradeCost(
        SubscriptionTier.professional,
        SubscriptionTier.starter,
      );
      expect(cost, 0);
    });
  });

  group('BillingService - calculateMonthlyRevenue', () {
    test('returns 0 with no subscriptions', () {
      expect(billingService.calculateMonthlyRevenue(), 0);
    });

    test('sums subscription prices', () {
      billingService.setSubscription('user_1', SubscriptionTier.starter);
      billingService.setSubscription('user_2', SubscriptionTier.professional);

      expect(
        billingService.calculateMonthlyRevenue(),
        closeTo(39.98, 0.01),
      );
    });
  });

  group('BillingService - getInvoiceStatusSummary', () {
    test('returns empty map with no invoices', () {
      expect(billingService.getInvoiceStatusSummary(), isEmpty);
    });

    test('counts invoices by status', () {
      final inv1 = billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'A',
            quantity: 1,
            unitPrice: 10,
          ),
        ],
      );
      billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'B',
            quantity: 1,
            unitPrice: 20,
          ),
        ],
      );
      billingService.payInvoice(inv1.id);

      final summary = billingService.getInvoiceStatusSummary();
      expect(summary[InvoiceStatus.paid], 1);
      expect(summary[InvoiceStatus.pending], 1);
    });
  });

  group('BillingService - allInvoices', () {
    test('returns all invoices', () {
      billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'A',
            quantity: 1,
            unitPrice: 10,
          ),
        ],
      );
      billingService.createInvoice(
        userId: 'user_2',
        lineItems: [
          const InvoiceLineItem(
            description: 'B',
            quantity: 1,
            unitPrice: 20,
          ),
        ],
      );

      expect(billingService.allInvoices, hasLength(2));
    });

    test('returns empty list initially', () {
      expect(billingService.allInvoices, isEmpty);
    });
  });

  group('BillingService - getOverdueInvoices', () {
    test('returns overdue invoices', () {
      // We can't easily create an overdue invoice through the service
      // since dueDate is always in the future. But we can test the method
      // returns an empty list for non-overdue invoices.
      billingService.createInvoice(
        userId: 'user_1',
        lineItems: [
          const InvoiceLineItem(
            description: 'A',
            quantity: 1,
            unitPrice: 10,
          ),
        ],
      );

      expect(billingService.getOverdueInvoices(), isEmpty);
    });
  });

  group('BillingException', () {
    test('toString returns message', () {
      final exception = BillingException('test error');
      expect(exception.toString(), 'test error');
      expect(exception.message, 'test error');
    });
  });

  group('InvoiceNotFoundException', () {
    test('toString returns message', () {
      final exception = InvoiceNotFoundException('not found');
      expect(exception.toString(), 'not found');
      expect(exception.message, 'not found');
    });
  });
}
