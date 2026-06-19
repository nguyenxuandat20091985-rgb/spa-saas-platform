import { AuditFields, TenantScoped } from './common';

export type AiProvider = 'gemini' | 'openai' | 'claude' | 'deepseek';
export type AiModelType = 'chat' | 'embedding' | 'vision' | 'audio';
export type ConversationContextType = 'customer_chat' | 'sales_consult' | 'skin_analysis' | 'marketing' | 'closing' | 'customer_success';
export type EmbeddingStatus = 'pending' | 'processing' | 'completed' | 'failed';

export interface AiProviderConfig {
  provider: AiProvider;
  apiKey: string;
  models: {
    chat: string;
    embedding: string;
    vision?: string;
  };
  maxTokens: number;
  temperature: number;
  isDefault: boolean;
  isActive: boolean;
}

export interface AiConversation extends AuditFields, TenantScoped {
  id: string;
  customerId?: string;
  userId?: string;
  sessionId: string;
  contextType: ConversationContextType;
  startedAt: Date;
  endedAt?: Date;
  messageCount: number;
  tokensUsed: number;
  satisfactionScore?: number;
}

export interface AiMessage extends AuditFields {
  id: string;
  conversationId: string;
  role: 'system' | 'user' | 'assistant';
  content: string;
  tokensUsed: number;
  modelUsed: string;
  metadata?: Record<string, unknown>;
}

export interface AiKnowledgeDocument extends AuditFields, TenantScoped {
  id: string;
  title: string;
  type: 'pdf' | 'docx' | 'xlsx' | 'text' | 'image' | 'url';
  fileUrl?: string;
  contentText?: string;
  chunkCount: number;
  embeddingStatus: EmbeddingStatus;
  uploadedBy: string;
}

export interface AiKnowledgeChunk extends AuditFields, TenantScoped {
  id: string;
  documentId: string;
  chunkIndex: number;
  content: string;
  embeddingId?: string;
  metadata?: Record<string, unknown>;
}

export interface AiProductKnowledge extends AuditFields, TenantScoped {
  id: string;
  productId: string;
  enhancedDescription?: string;
  benefitsSummary?: string;
  usageGuide?: string;
  faq: Array<{ question: string; answer: string }>;
  embeddingId?: string;
}

export interface AiServiceKnowledge extends AuditFields, TenantScoped {
  id: string;
  serviceId: string;
  enhancedDescription?: string;
  procedureDetail?: string;
  aftercareGuide?: string;
  faq: Array<{ question: string; answer: string }>;
  embeddingId?: string;
}

export interface ChatRequest {
  message: string;
  conversationId?: string;
  contextType?: ConversationContextType;
  customerId?: string;
  attachments?: Array<{ type: string; url: string }>;
}

export interface ChatResponse {
  conversationId: string;
  messageId: string;
  content: string;
  tokensUsed: number;
  suggestions?: string[];
  relatedProducts?: string[];
  relatedServices?: string[];
}

export interface SkinAnalysisRequest {
  imageUrl: string;
  customerId?: string;
  notes?: string;
}

export interface SkinAnalysisResponse {
  analysisId: string;
  overallScore: number;
  details: {
    acne: { severity: number; areas: string[]; description: string };
    pigmentation: { severity: number; type: string; description: string };
    wrinkles: { severity: number; areas: string[]; description: string };
    oiliness: { level: number; description: string };
    hydration: { level: number; description: string };
    pores: { severity: number; areas: string[]; description: string };
  };
  recommendations: string[];
  suggestedServices: Array<{ id: string; name: string; reason: string }>;
  suggestedProducts: Array<{ id: string; name: string; reason: string }>;
  treatmentPlan?: string;
}

export interface AiSalesConsultRequest {
  customerId: string;
  context?: string;
}

export interface AiSalesConsultResponse {
  recommendations: Array<{
    type: 'upsell' | 'cross_sell' | 'combo' | 'membership';
    itemId?: string;
    itemName: string;
    reason: string;
    suggestedScript: string;
    estimatedValue: number;
  }>;
  customerInsights: {
    segment: string;
    temperature: 'hot' | 'warm' | 'cold';
    churnRisk: number;
    lifetimeValue: number;
  };
}

export interface AiMarketingRequest {
  channel: 'facebook' | 'tiktok' | 'zalo' | 'sms' | 'email';
  objective: 'awareness' | 'engagement' | 'conversion' | 'retention';
  targetSegment?: string;
  theme?: string;
}

export interface AiMarketingResponse {
  campaignName: string;
  headline: string;
  body: string;
  callToAction: string;
  hashtags?: string[];
  targetAudience: string;
  suggestedSchedule: string;
  estimatedReach?: number;
}

export interface AiPrediction {
  type: 'churn' | 'revenue' | 'trending_service' | 'vip_potential';
  entityId?: string;
  entityType?: string;
  prediction: number;
  confidence: number;
  factors: string[];
  recommendedActions: string[];
  predictedAt: Date;
}

export interface AiUsageStats {
  tenantId: string;
  period: string;
  totalTokens: number;
  totalConversations: number;
  totalMessages: number;
  tokensByModel: Record<string, number>;
  tokensByFeature: Record<string, number>;
  estimatedCost: number;
}
