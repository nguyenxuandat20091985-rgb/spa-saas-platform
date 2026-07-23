import { AuditFields, EntityStatus } from './common';

// ==========================================
// TENANT CHÍNH
// ==========================================
export interface Tenant extends AuditFields {
  id: string;
  name: string;
  slug: string;
  ownerId: string;
  defaultBranchId?: string; // Chi nhánh mặc định
  subscriptionPlan: SubscriptionPlanTier;
  status: TenantStatus;
  settings: TenantSettings;
  branding: TenantBranding;
  deletedAt?: Date | null; // Hỗ trợ xóa mềm
}

// ==========================================
// ENUM & TYPE
// ==========================================
export type TenantStatus = 'active' | 'suspended' | 'trial' | 'cancelled';
export type SubscriptionPlanTier = 'free' | 'basic' | 'pro' | 'enterprise' | 'ai_vip';

// ==========================================
// CẤU HÌNH TENANT
// ==========================================
export interface TenantSettings {
  // Thời gian & địa phương
  timezone: string;
  currency: string;
  language: string;

  // Chính sách đặt lịch
  bookingAdvanceDays: number;
  cancellationPolicyHours: number;
  autoConfirmBooking: boolean;

  // Tính năng
  enableOnlinePayment: boolean;
  enableMembership: boolean;
  enableLoyalty: boolean;
  enableAiFeatures: boolean;

  // Giờ làm việc
  workingHours: WorkingHours;

  // ---------- BỔ SUNG ----------
  // AI & Quota
  aiQuota: {
    monthlyTokenLimit: number;
    usedThisMonth: number;
    resetDate: Date;
  };
  customAiPrompt?: string; // Prompt tùy chỉnh cho spa

  // Cổng thanh toán
  paymentGateway: {
    provider: 'vnpay' | 'momo' | 'stripe' | 'offline';
    config: Record<string, string>; // Lưu config mã hóa (VD: merchant_id, secret_key)
  };

  // Webhook & Integration
  webhookUrl?: string;
  enableWebhook: boolean;
}

// ==========================================
// GIỜ LÀM VIỆC
// ==========================================
export interface WorkingHours {
  [day: string]: {
    open: string; // Format HH:mm
    close: string; // Format HH:mm
    isOpen: boolean;
    breakStart?: string; // Thêm giờ nghỉ trưa
    breakEnd?: string;
  };
}

// ==========================================
// THƯƠNG HIỆU (BRANDING)
// ==========================================
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

// ==========================================
// CHI NHÁNH (BRANCH)
// ==========================================
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
  managerId?: string; // Quản lý chi nhánh
}

// ==========================================
// DTO (DATA TRANSFER OBJECTS)
// ==========================================
export interface CreateTenantDto {
  name: string;
  slug: string;
  ownerEmail: string;
  ownerName: string;
  ownerPhone: string;
  plan?: SubscriptionPlanTier;
  defaultBranch?: Omit<Branch, 'id' | 'tenantId' | 'status' | 'createdAt' | 'updatedAt'>;
}

export interface UpdateTenantDto {
  name?: string;
  settings?: Partial<TenantSettings>;
  branding?: Partial<TenantBranding>;
  status?: TenantStatus;
  defaultBranchId?: string;
}

export interface UpgradeTenantPlanDto {
  plan: SubscriptionPlanTier;
  paymentMethod: 'credit_card' | 'bank_transfer' | 'crypto';
  promoCode?: string;
}

// ==========================================
// RESPONSE (CHO API)
// ==========================================
export interface TenantResponse extends Tenant {
  branches?: Branch[];
  owner?: {
    id: string;
    email: string;
    name: string;
  };
}