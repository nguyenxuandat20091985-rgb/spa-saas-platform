import { AuditFields, TenantScoped, EntityStatus } from './common';

export type LoyaltyTransactionType = 'earn' | 'redeem' | 'expire' | 'adjust' | 'bonus';
export type VoucherType = 'percentage' | 'fixed_amount' | 'free_service' | 'free_product';
export type VoucherStatus = 'active' | 'inactive' | 'expired' | 'depleted';

export interface MembershipTier extends AuditFields, TenantScoped {
  id: string;
  name: string;
  level: number;
  minPoints: number;
  discountPercentage: number;
  benefits: MembershipBenefit[];
  color: string;
  icon?: string;
}

export interface MembershipBenefit {
  type: 'discount' | 'free_service' | 'priority_booking' | 'birthday_bonus' | 'points_multiplier' | 'exclusive_access';
  description: string;
  value?: number;
}

export interface MembershipCard extends AuditFields, TenantScoped {
  id: string;
  customerId: string;
  tierId: string;
  cardNumber: string;
  pointsBalance: number;
  totalPointsEarned: number;
  activatedAt: Date;
  expiresAt?: Date;
  status: EntityStatus;
}

export interface LoyaltyTransaction extends AuditFields, TenantScoped {
  id: string;
  customerId: string;
  type: LoyaltyTransactionType;
  points: number;
  referenceId?: string;
  referenceType?: string;
  description: string;
}

export interface Voucher extends AuditFields, TenantScoped {
  id: string;
  code: string;
  type: VoucherType;
  value: number;
  minOrderAmount?: number;
  maxUses: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  applicableServiceIds: string[];
  applicableProductIds: string[];
  applicableCustomerIds: string[];
  status: VoucherStatus;
}

export interface CustomerVoucher extends AuditFields, TenantScoped {
  id: string;
  customerId: string;
  voucherId: string;
  usedAt?: Date;
  orderId?: string;
}

export interface CreateMembershipTierDto {
  name: string;
  level: number;
  minPoints: number;
  discountPercentage: number;
  benefits: MembershipBenefit[];
  color: string;
  icon?: string;
}

export interface CreateVoucherDto {
  code: string;
  type: VoucherType;
  value: number;
  minOrderAmount?: number;
  maxUses: number;
  validFrom: string;
  validUntil: string;
  applicableServiceIds?: string[];
  applicableProductIds?: string[];
  applicableCustomerIds?: string[];
}
