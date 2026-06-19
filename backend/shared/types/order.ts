import { AuditFields, BranchScoped } from './common';

export type PaymentMethod = 'cash' | 'card' | 'qr' | 'transfer' | 'installment';
export type PaymentStatus = 'pending' | 'paid' | 'partial' | 'refunded' | 'failed';
export type OrderItemType = 'service' | 'product';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export interface Order extends AuditFields, BranchScoped {
  id: string;
  customerId: string;
  staffId: string;
  orderNumber: string;
  items: OrderItem[];
  subtotal: number;
  discountAmount: number;
  taxAmount: number;
  totalAmount: number;
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  paymentReference?: string;
  voucherId?: string;
  loyaltyPointsUsed: number;
  loyaltyPointsEarned: number;
  notes?: string;
}

export interface OrderItem {
  id: string;
  orderId: string;
  itemType: OrderItemType;
  itemId: string;
  itemName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  total: number;
  notes?: string;
}

export interface Invoice extends AuditFields {
  id: string;
  tenantId: string;
  orderId: string;
  customerId: string;
  invoiceNumber: string;
  amount: number;
  tax: number;
  total: number;
  status: InvoiceStatus;
  dueDate: Date;
  paidAt?: Date;
}

export interface Installment extends AuditFields {
  id: string;
  tenantId: string;
  invoiceId: string;
  customerId: string;
  totalAmount: number;
  installmentCount: number;
  paidCount: number;
  nextDueDate: Date;
  amountPerInstallment: number;
  status: 'active' | 'completed' | 'defaulted';
}

export interface CreateOrderDto {
  branchId: string;
  customerId: string;
  staffId: string;
  items: CreateOrderItemDto[];
  paymentMethod?: PaymentMethod;
  voucherId?: string;
  loyaltyPointsUsed?: number;
  notes?: string;
}

export interface CreateOrderItemDto {
  itemType: OrderItemType;
  itemId: string;
  quantity: number;
  discount?: number;
  notes?: string;
}

export interface ProcessPaymentDto {
  paymentMethod: PaymentMethod;
  paymentReference?: string;
  amount: number;
}
