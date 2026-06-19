import { AuditFields } from './common';
import { SubscriptionPlanTier } from './tenant';

export type SubscriptionStatus = 'active' | 'trial' | 'past_due' | 'cancelled' | 'suspended';
export type PlatformInvoiceStatus = 'pending' | 'paid' | 'overdue' | 'cancelled' | 'refunded';

export interface SubscriptionPlan extends AuditFields {
  id: string;
  name: string;
  slug: string;
  tier: SubscriptionPlanTier;
  monthlyPrice: number;
  yearlyPrice: number;
  maxBranches: number;
  maxStaff: number;
  maxCustomers: number;
  maxProducts: number;
  maxServices: number;
  storageGb: number;
  features: PlanFeatures;
  aiFeatures: AiPlanFeatures;
  status: 'active' | 'inactive';
}

export interface PlanFeatures {
  booking: boolean;
  pos: boolean;
  inventory: boolean;
  crm: boolean;
  membership: boolean;
  loyalty: boolean;
  marketing: boolean;
  analytics: boolean;
  multiBranch: boolean;
  api: boolean;
  customBranding: boolean;
  prioritySupport: boolean;
}

export interface AiPlanFeatures {
  aiChat: boolean;
  aiSalesConsultant: boolean;
  aiClosingAgent: boolean;
  aiCustomerSuccess: boolean;
  aiMarketing: boolean;
  aiSkinAnalysis: boolean;
  aiPrediction: boolean;
  aiVoiceReceptionist: boolean;
  aiCallCenter: boolean;
  monthlyAiTokens: number;
}

export interface TenantSubscription extends AuditFields {
  id: string;
  tenantId: string;
  planId: string;
  status: SubscriptionStatus;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  trialEndsAt?: Date;
  cancelledAt?: Date;
  billingCycle: 'monthly' | 'yearly';
}

export interface PlatformInvoice extends AuditFields {
  id: string;
  tenantId: string;
  subscriptionId: string;
  invoiceNumber: string;
  amount: number;
  currency: string;
  status: PlatformInvoiceStatus;
  dueDate: Date;
  paidAt?: Date;
  paymentMethod?: string;
  description: string;
}

export interface CreateSubscriptionDto {
  tenantId: string;
  planId: string;
  billingCycle: 'monthly' | 'yearly';
}

export interface ChangePlanDto {
  planId: string;
  billingCycle?: 'monthly' | 'yearly';
}
