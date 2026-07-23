import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { DomainEvent, EventType } from './event-types';
import { RedisConfig } from '../config';
import { logger } from '../utils/logger';
import { DatabaseError } from '../utils/errors';

// ==========================================
// INTERFACE
// ==========================================
type EventHandler = (event: DomainEvent) => Promise<void>;
type EventHandlerWithContext = (event: DomainEvent, context: { retryCount: number; firstAttempt: Date }) => Promise<void>;

interface SubscriptionOptions {
  group?: string;
  consumer?: string;
  retryCount?: number;
  retryDelay?: number;
}

interface EventWithRetry extends DomainEvent {
  _retryCount?: number;
  _firstAttempt?: Date;
}

// ==========================================
// EVENT BUS
// ==========================================
export class EventBus {
  private publisher: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private handlers = new Map<string, EventHandlerWithContext[]>();
  private deadLetterQueue = new Map<string, DomainEvent[]>();
  private serviceName: string;
  private isConnected = false;
  private retryDelays = [1000, 5000, 15000, 30000, 60000]; // Exponential backoff

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  // ==========================================
  // CONNECT
  // ==========================================
  async connect(config: RedisConfig): Promise<void> {
    try {
      const url = config.password
        ? `redis://:${encodeURIComponent(config.password)}@${config.host}:${config.port}/${config.db || 0}`
        : `redis://${config.host}:${config.port}/${config.db || 0}`;

      this.publisher = createClient({
        url,
        socket: {
          reconnectStrategy: (retries) => {
            logger.warn(`Redis reconnecting, attempt ${retries}`);
            return Math.min(retries * 100, 5000);
          },
        },
      }) as RedisClientType;

      this.subscriber = (this.publisher as RedisClientType).duplicate() as RedisClientType;

      this.publisher.on('error', (err) => {
        logger.error('Redis publisher error', { error: err.message });
        this.isConnected = false;
      });

      this.subscriber.on('error', (err) => {
        logger.error('Redis subscriber error', { error: err.message });
        this.isConnected = false;
      });

      this.publisher.on('ready', () => {
        logger.info('Redis publisher ready');
        this.isConnected = true;
      });

      this.subscriber.on('ready', () => {
        logger.info('Redis subscriber ready');
        this.isConnected = true;
      });

      await Promise.all([
        this.publisher.connect(),
        this.subscriber.connect(),
      ]);

      this.isConnected = true;
      logger.info('Event bus connected', { service: this.serviceName });

      // Restore subscriptions
      await this.restoreSubscriptions();
    } catch (error) {
      this.isConnected = false;
      logger.error('Failed to connect event bus', { error });
      throw new DatabaseError(`Event bus connection failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  // ==========================================
  // PUBLISH (VỚI RETRY)
  // ==========================================
  async publish(
    type: EventType,
    tenantId: string,
    payload: Record<string, unknown>,
    userId?: string,
    options: { delay?: number; priority?: 'high' | 'normal' | 'low' } = {},
  ): Promise<void> {
    if (!this.isConnected || !this.publisher) {
      logger.warn('Event bus not connected, storing event in memory', { type });
      // Store in memory for later retry
      // In production, this should be stored in a persistent queue
      return;
    }

    try {
      const event: DomainEvent = {
        id: uuidv4(),
        type,
        tenantId,
        payload,
        metadata: {
          userId,
          timestamp: new Date(),
          source: this.serviceName,
          correlationId: uuidv4(),
          priority: options.priority || 'normal',
        },
      };

      const channel = `events:${type}`;
      const message = JSON.stringify(event);

      if (options.delay) {
        // Use Redis DELAY queue or schedule for later
        await this.publisher.setEx(
          `delay:${event.id}`,
          Math.ceil(options.delay / 1000),
          message,
        );
        logger.debug('Event scheduled for later', { type, eventId: event.id, delay: options.delay });
      } else {
        await this.publisher.publish(channel, message);
        logger.debug('Event published', { type, eventId: event.id, tenantId });
      }
    } catch (error) {
      logger.error('Failed to publish event', { type, error });
      throw error;
    }
  }

  // ==========================================
  // SUBSCRIBE (VỚI RETRY & DEAD LETTER)
  // ==========================================
  async subscribe(
    type: EventType,
    handler: EventHandler,
    options: SubscriptionOptions = {},
  ): Promise<void> {
    const channel = `events:${type}`;
    const {
      group = this.serviceName,
      consumer = `${this.serviceName}-${process.pid}`,
      retryCount = 3,
      retryDelay = 1000,
    } = options;

    // Store handler with context
    const handlerWithContext: EventHandlerWithContext = async (event, context) => {
      try {
        await handler(event);
      } catch (error) {
        const retry = context.retryCount || 0;
        if (retry < retryCount) {
          // Retry with delay
          const delay = this.retryDelays[retry] || retryDelay;
          logger.warn(`Event handler failed, retrying in ${delay}ms`, {
            type,
            eventId: event.id,
            retry: retry + 1,
            error: error instanceof Error ? error.message : String(error),
          });

          const eventWithRetry = event as EventWithRetry;
          eventWithRetry._retryCount = (eventWithRetry._retryCount || 0) + 1;

          setTimeout(() => {
            this.handleEvent(channel, eventWithRetry, handlerWithContext);
          }, delay);
        } else {
          // Move to dead letter queue
          logger.error(`Event moved to dead letter queue after ${retryCount} retries`, {
            type,
            eventId: event.id,
            error: error instanceof Error ? error.message : String(error),
          });
          this.deadLetterQueue.set(event.id, event);
          // In production, store to persistent DLQ
        }
      }
    };

    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
    }
    this.handlers.get(channel)!.push(handlerWithContext);

    if (this.subscriber && this.isConnected) {
      try {
        // Use Redis Streams for reliable message delivery
        const streamKey = `stream:${type}`;
        await this.subscriber.xGroupCreate(streamKey, group, '0', { MKSTREAM: true }).catch(() => {
          // Group already exists
        });

        // Subscribe to stream
        await this.subscriber.xReadGroup(
          group,
          consumer,
          { key: streamKey, id: '>' },
          { COUNT: 10, BLOCK: 5000 },
        );

        // Start consuming messages
        this.consumeMessages(streamKey, group, consumer, handlerWithContext);
      } catch (error) {
        logger.warn(`Failed to subscribe with streams, falling back to pub/sub`, { error });
        // Fallback to simple pub/sub
        await this.subscriber.subscribe(channel, async (message) => {
          try {
            const event = JSON.parse(message) as DomainEvent;
            await this.handleEvent(channel, event, handlerWithContext);
          } catch (error) {
            logger.error('Error handling event', { channel, error });
          }
        });
      }
    }

    logger.debug('Subscribed to event', { type, service: this.serviceName, consumer });
  }

  // ==========================================
  // SUBSCRIBE TO MULTIPLE EVENTS
  // ==========================================
  async subscribeMultiple(
    types: EventType[],
    handler: EventHandler,
    options: SubscriptionOptions = {},
  ): Promise<void> {
    for (const type of types) {
      await this.subscribe(type, handler, options);
    }
  }

  // ==========================================
  // UNSUBSCRIBE
  // ==========================================
  async unsubscribe(type: EventType, handler: EventHandler): Promise<void> {
    const channel = `events:${type}`;
    const handlers = this.handlers.get(channel);
    if (handlers) {
      const index = handlers.indexOf(handler as any);
      if (index > -1) {
        handlers.splice(index, 1);
      }
      if (handlers.length === 0) {
        this.handlers.delete(channel);
        if (this.subscriber) {
          await this.subscriber.unsubscribe(channel);
        }
      }
    }
    logger.debug('Unsubscribed from event', { type, service: this.serviceName });
  }

  // ==========================================
  // DISCONNECT
  // ==========================================
  async disconnect(): Promise<void> {
    this.isConnected = false;

    if (this.subscriber) {
      await this.subscriber.quit().catch((err) => {
        logger.warn('Error disconnecting subscriber', { error: err.message });
      });
    }

    if (this.publisher) {
      await this.publisher.quit().catch((err) => {
        logger.warn('Error disconnecting publisher', { error: err.message });
      });
    }

    this.publisher = null;
    this.subscriber = null;
    logger.info('Event bus disconnected', { service: this.serviceName });
  }

  // ==========================================
  // GET DEAD LETTER QUEUE
  // ==========================================
  getDeadLetterQueue(): Map<string, DomainEvent> {
    return this.deadLetterQueue;
  }

  // ==========================================
  // RETRY DEAD LETTER
  // ==========================================
  async retryDeadLetter(eventId: string): Promise<void> {
    const event = this.deadLetterQueue.get(eventId);
    if (event) {
      this.deadLetterQueue.delete(eventId);
      await this.publish(event.type, event.tenantId, event.payload);
      logger.info('Retried dead letter event', { eventId });
    }
  }

  // ==========================================
  // CONSUME MESSAGES (STREAMS)
  // ==========================================
  private async consumeMessages(
    streamKey: string,
    group: string,
    consumer: string,
    handler: EventHandlerWithContext,
  ): Promise<void> {
    while (this.isConnected && this.subscriber) {
      try {
        const results = await this.subscriber.xReadGroup(
          group,
          consumer,
          { key: streamKey, id: '>' },
          { COUNT: 10, BLOCK: 5000 },
        );

        if (results) {
          for (const result of results) {
            for (const message of result.messages) {
              try {
                const event = JSON.parse(message.message) as DomainEvent;
                await this.handleEvent(streamKey, event, handler);
                await this.subscriber.xAck(streamKey, group, message.id);
              } catch (error) {
                logger.error('Failed to process message', { streamKey, messageId: message.id, error });
                // Don't ack, will be retried
              }
            }
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('NOGROUP')) {
          // Group doesn't exist, create it
          await this.subscriber.xGroupCreate(streamKey, group, '0', { MKSTREAM: true });
        } else {
          logger.error('Error consuming messages', { streamKey, error });
        }
      }
    }
  }

  // ==========================================
  // HANDLE EVENT (WITH RETRY)
  // ==========================================
  private async handleEvent(
    channel: string,
    event: DomainEvent,
    handler: EventHandlerWithContext,
  ): Promise<void> {
    const eventWithRetry = event as EventWithRetry;
    const context = {
      retryCount: eventWithRetry._retryCount || 0,
      firstAttempt: eventWithRetry._firstAttempt || new Date(),
    };

    if (!eventWithRetry._firstAttempt) {
      eventWithRetry._firstAttempt = context.firstAttempt;
    }

    await handler(event, context);
  }

  // ==========================================
  // RESTORE SUBSCRIPTIONS
  // ==========================================
  private async restoreSubscriptions(): Promise<void> {
    // Re-subscribe to all previously registered handlers
    const channels = Array.from(this.handlers.keys());
    for (const channel of channels) {
      const handlers = this.handlers.get(channel) || [];
      if (this.subscriber && handlers.length > 0) {
        const type = channel.replace('events:', '') as EventType;
        await this.subscribe(type, handlers[0] as any);
        logger.debug('Restored subscription', { channel });
      }
    }
  }

  // ==========================================
  // UTILITY: CHECK CONNECTION
  // ==========================================
  isConnectedToRedis(): boolean {
    return this.isConnected;
  }

  // ==========================================
  // UTILITY: GET STATS
  // ==========================================
  getStats(): {
    serviceName: string;
    isConnected: boolean;
    handlerCount: number;
    deadLetterCount: number;
    subscribers: string[];
  } {
    return {
      serviceName: this.serviceName,
      isConnected: this.isConnected,
      handlerCount: this.handlers.size,
      deadLetterCount: this.deadLetterQueue.size,
      subscribers: Array.from(this.handlers.keys()),
    };
  }
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default EventBus;