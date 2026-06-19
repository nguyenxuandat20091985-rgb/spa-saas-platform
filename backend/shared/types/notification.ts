import { AuditFields, TenantScoped } from './common';

export type NotificationType = 'booking_reminder' | 'booking_confirmation' | 'booking_cancellation' |
  'payment_received' | 'payment_due' | 'membership_upgrade' | 'loyalty_points' |
  'promotion' | 'birthday' | 'follow_up' | 'survey' | 'system' | 'ai_recommendation';

export type NotificationChannel = 'push' | 'sms' | 'email' | 'zalo' | 'in_app';
export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'read' | 'failed';

export interface Notification extends AuditFields, TenantScoped {
  id: string;
  userId: string;
  customerId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  status: NotificationStatus;
  sentAt?: Date;
  readAt?: Date;
  scheduledAt?: Date;
}

export interface NotificationTemplate extends AuditFields, TenantScoped {
  id: string;
  type: NotificationType;
  channel: NotificationChannel;
  titleTemplate: string;
  bodyTemplate: string;
  variables: string[];
  isActive: boolean;
}

export interface SendNotificationDto {
  userId?: string;
  customerId?: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  scheduledAt?: string;
}

export interface Campaign extends AuditFields, TenantScoped {
  id: string;
  name: string;
  type: 'one_time' | 'recurring' | 'triggered';
  channel: NotificationChannel;
  targetSegment: CampaignTargetSegment;
  content: CampaignContent;
  scheduleAt?: Date;
  sentAt?: Date;
  status: 'draft' | 'scheduled' | 'sending' | 'sent' | 'cancelled';
  reachCount: number;
  openCount: number;
  clickCount: number;
  conversionCount: number;
}

export interface CampaignTargetSegment {
  filters: Array<{
    field: string;
    operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in' | 'not_in';
    value: unknown;
  }>;
  estimatedSize?: number;
}

export interface CampaignContent {
  title: string;
  body: string;
  imageUrl?: string;
  callToAction?: string;
  callToActionUrl?: string;
}

export interface AutomationRule extends AuditFields, TenantScoped {
  id: string;
  name: string;
  triggerEvent: string;
  conditions: AutomationCondition[];
  actions: AutomationAction[];
  isActive: boolean;
  lastTriggeredAt?: Date;
  triggerCount: number;
}

export interface AutomationCondition {
  field: string;
  operator: string;
  value: unknown;
}

export interface AutomationAction {
  type: 'send_notification' | 'send_email' | 'send_sms' | 'add_points' | 'assign_voucher' | 'update_tag' | 'ai_follow_up';
  params: Record<string, unknown>;
  delayMinutes?: number;
}
