import { AuditFields, EntityStatus } from './common';

export interface Tenant extends AuditFields {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  subscriptionPlan: SubscriptionPlanTier;
  status: TenantStatus;
  settings: TenantSettings;
  branding: TenantBranding;
}

export type TenantStatus = 'active' | 'suspended' | 'trial' | 'cancelled';
export type SubscriptionPlanTier = 'free' | 'basic' | 'pro' | 'enterprise' | 'ai_vip';

export interface TenantSettings {
  timezone: string;
  currency: string;
  language: string;
  bookingAdvanceDays: number;
  cancellationPolicyHours: number;
  autoConfirmBooking: boolean;
  enableOnlinePayment: boolean;
  enableMembership: boolean;
  enableLoyalty: boolean;
  enableAiFeatures: boolean;
  workingHours: WorkingHours;
}

export interface WorkingHours {
  [day: string]: { open: string; close: string; isOpen: boolean };
}

export interface TenantBranding {
  logoUrl?: string;
  primaryColor: string;
  secondaryColor: string;
  coverImageUrl?: string;
  description?: string;
  tagline?: string;
  socialLinks?: {
    facebook?: string;
    instagram?: string;
    tiktok?: string;
    zalo?: string;
    website?: string;
  };
}

export interface Branch extends AuditFields {
  id: string;
  tenantId: string;
  name: string;
  address: string;
  phone: string;
  email?: string;
  workingHours: WorkingHours;
  latitude?: number;
  longitude?: number;
  status: EntityStatus;
}

export interface CreateTenantDto {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPhone: string;
  plan?: SubscriptionPlanTier;
}

export interface UpdateTenantDto {
  name?: string;
  settings?: Partial<TenantSettings>;
  branding?: Partial<TenantBranding>;
  status?: TenantStatus;
}
