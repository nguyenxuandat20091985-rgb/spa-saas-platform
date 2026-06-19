export enum EventType {
  // Booking events
  BOOKING_CREATED = 'booking.created',
  BOOKING_CONFIRMED = 'booking.confirmed',
  BOOKING_CANCELLED = 'booking.cancelled',
  BOOKING_COMPLETED = 'booking.completed',
  BOOKING_REMINDER = 'booking.reminder',
  BOOKING_NO_SHOW = 'booking.no_show',

  // Customer events
  CUSTOMER_CREATED = 'customer.created',
  CUSTOMER_UPDATED = 'customer.updated',
  CUSTOMER_VISIT = 'customer.visit',
  CUSTOMER_BIRTHDAY = 'customer.birthday',

  // Payment events
  PAYMENT_COMPLETED = 'payment.completed',
  PAYMENT_FAILED = 'payment.failed',
  PAYMENT_REFUNDED = 'payment.refunded',

  // Order events
  ORDER_CREATED = 'order.created',
  ORDER_COMPLETED = 'order.completed',

  // Membership events
  MEMBERSHIP_UPGRADED = 'membership.upgraded',
  MEMBERSHIP_POINTS_EARNED = 'membership.points_earned',
  MEMBERSHIP_POINTS_REDEEMED = 'membership.points_redeemed',

  // Inventory events
  INVENTORY_LOW_STOCK = 'inventory.low_stock',
  INVENTORY_OUT_OF_STOCK = 'inventory.out_of_stock',
  INVENTORY_RECEIVED = 'inventory.received',

  // AI events
  AI_CONVERSATION_STARTED = 'ai.conversation.started',
  AI_CONVERSATION_ENDED = 'ai.conversation.ended',
  AI_SKIN_ANALYSIS_COMPLETED = 'ai.skin_analysis.completed',
  AI_RECOMMENDATION_GENERATED = 'ai.recommendation.generated',

  // Marketing events
  CAMPAIGN_SENT = 'campaign.sent',
  CAMPAIGN_OPENED = 'campaign.opened',
  CAMPAIGN_CLICKED = 'campaign.clicked',

  // Tenant events
  TENANT_CREATED = 'tenant.created',
  TENANT_SUBSCRIPTION_CHANGED = 'tenant.subscription.changed',
  TENANT_LIMIT_REACHED = 'tenant.limit.reached',
}

export interface DomainEvent {
  id: string;
  type: EventType;
  tenantId: string;
  payload: Record<string, unknown>;
  metadata: {
    userId?: string;
    timestamp: Date;
    source: string;
    correlationId?: string;
  };
}
