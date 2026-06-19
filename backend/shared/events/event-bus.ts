import { createClient, RedisClientType } from 'redis';
import { v4 as uuidv4 } from 'uuid';
import { DomainEvent, EventType } from './event-types';
import { RedisConfig } from '../config';
import { logger } from '../utils/logger';

type EventHandler = (event: DomainEvent) => Promise<void>;

export class EventBus {
  private publisher: RedisClientType | null = null;
  private subscriber: RedisClientType | null = null;
  private handlers = new Map<string, EventHandler[]>();
  private serviceName: string;

  constructor(serviceName: string) {
    this.serviceName = serviceName;
  }

  async connect(config: RedisConfig): Promise<void> {
    const url = config.password
      ? `redis://:${config.password}@${config.host}:${config.port}/${config.db}`
      : `redis://${config.host}:${config.port}/${config.db}`;

    this.publisher = createClient({ url }) as RedisClientType;
    this.subscriber = (this.publisher as RedisClientType).duplicate() as RedisClientType;

    this.publisher.on('error', (err) => logger.error('Redis publisher error', { error: err.message }));
    this.subscriber.on('error', (err) => logger.error('Redis subscriber error', { error: err.message }));

    await this.publisher.connect();
    await this.subscriber.connect();

    logger.info('Event bus connected', { service: this.serviceName });
  }

  async publish(type: EventType, tenantId: string, payload: Record<string, unknown>, userId?: string): Promise<void> {
    if (!this.publisher) {
      logger.warn('Event bus not connected, event not published', { type });
      return;
    }

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
      },
    };

    const channel = `events:${type}`;
    await this.publisher.publish(channel, JSON.stringify(event));
    logger.debug('Event published', { type, eventId: event.id });
  }

  async subscribe(type: EventType, handler: EventHandler): Promise<void> {
    const channel = `events:${type}`;

    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, []);
    }
    this.handlers.get(channel)!.push(handler);

    if (this.subscriber) {
      await this.subscriber.subscribe(channel, async (message) => {
        try {
          const event = JSON.parse(message) as DomainEvent;
          const handlers = this.handlers.get(channel) || [];
          for (const h of handlers) {
            await h(event);
          }
        } catch (error) {
          logger.error('Error handling event', { channel, error });
        }
      });
    }

    logger.debug('Subscribed to event', { type, service: this.serviceName });
  }

  async disconnect(): Promise<void> {
    if (this.subscriber) {
      await this.subscriber.quit();
    }
    if (this.publisher) {
      await this.publisher.quit();
    }
    logger.info('Event bus disconnected');
  }
}
