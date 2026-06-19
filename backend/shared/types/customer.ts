import { AuditFields, EntityStatus, TenantScoped } from './common';

export type MembershipTierName = 'silver' | 'gold' | 'platinum' | 'diamond';
export type Gender = 'male' | 'female' | 'other';
export type SkinType = 'oily' | 'dry' | 'combination' | 'sensitive' | 'normal';
export type AcquisitionSource = 'walk_in' | 'referral' | 'social_media' | 'website' | 'advertising' | 'other';

export interface Customer extends AuditFields, TenantScoped {
  id: string;
  userId?: string;
  fullName: string;
  phone: string;
  email?: string;
  gender?: Gender;
  dateOfBirth?: Date;
  avatarUrl?: string;
  skinType?: SkinType;
  skinConcerns: string[];
  allergyNotes?: string;
  membershipTier?: MembershipTierName;
  loyaltyPoints: number;
  totalSpent: number;
  visitCount: number;
  lastVisitAt?: Date;
  acquisitionSource?: AcquisitionSource;
  tags: string[];
  aiProfile?: CustomerAiProfile;
  notes?: string;
  status: EntityStatus;
}

export interface CustomerAiProfile {
  preferences: string[];
  budgetRange?: { min: number; max: number };
  treatmentGoals: string[];
  communicationStyle?: string;
  visitFrequency?: string;
  churnRisk?: number;
  lifetimeValuePrediction?: number;
  lastAnalysisAt?: Date;
}

export interface CustomerInteraction extends AuditFields, TenantScoped {
  id: string;
  customerId: string;
  type: InteractionType;
  channel: InteractionChannel;
  content: string;
  staffId?: string;
  metadata?: Record<string, unknown>;
}

export type InteractionType = 'note' | 'call' | 'message' | 'visit' | 'complaint' | 'feedback' | 'ai_consultation';
export type InteractionChannel = 'in_person' | 'phone' | 'sms' | 'zalo' | 'facebook' | 'email' | 'app' | 'ai_chat';

export interface CustomerSkinRecord extends AuditFields, TenantScoped {
  id: string;
  customerId: string;
  imageUrl: string;
  analysisResult?: SkinAnalysisResult;
  notes?: string;
  recordedBy?: string;
}

export interface SkinAnalysisResult {
  overallScore: number;
  acne: { severity: number; areas: string[] };
  pigmentation: { severity: number; type: string };
  wrinkles: { severity: number; areas: string[] };
  oiliness: { level: number; tZone: number };
  hydration: { level: number };
  pores: { severity: number; areas: string[] };
  recommendations: string[];
  suggestedServices: string[];
  suggestedProducts: string[];
  analyzedAt: Date;
}

export interface CreateCustomerDto {
  fullName: string;
  phone: string;
  email?: string;
  gender?: Gender;
  dateOfBirth?: string;
  skinType?: SkinType;
  skinConcerns?: string[];
  allergyNotes?: string;
  acquisitionSource?: AcquisitionSource;
  tags?: string[];
  notes?: string;
}

export interface UpdateCustomerDto {
  fullName?: string;
  phone?: string;
  email?: string;
  gender?: Gender;
  dateOfBirth?: string;
  avatarUrl?: string;
  skinType?: SkinType;
  skinConcerns?: string[];
  allergyNotes?: string;
  tags?: string[];
  notes?: string;
}
