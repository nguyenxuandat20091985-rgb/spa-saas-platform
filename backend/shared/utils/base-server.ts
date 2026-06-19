import express, { Express, Router } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { ServiceConfig } from '../config';
import { errorHandler } from '../middleware/error-handler';
import { rateLimiter } from '../middleware/rate-limiter';
import { createPool, healthCheck, closePool } from '../database/connection';
import { EventBus } from '../events/event-bus';
import { createServiceLogger } from './logger';

export interface ServiceDependencies {
  config: ServiceConfig;
  app: Express;
  eventBus: EventBus;
}

export async function createServer(
  config: ServiceConfig,
  registerRoutes: (deps: ServiceDependencies) => Router,
): Promise<{ app: Express; start: () => Promise<void>; stop: () => Promise<void> }> {
  const log = createServiceLogger(config.serviceName);
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(compression());
  app.use(cors({ origin: config.cors.origins, credentials: config.cors.credentials }));
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(rateLimiter(config.rateLimit.windowMs, config.rateLimit.maxRequests));

  // Health check
  app.get('/health', async (_req, res) => {
    const dbHealthy = await healthCheck();
    res.status(dbHealthy ? 200 : 503).json({
      service: config.serviceName,
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
    });
  });

  // Event bus
  const eventBus = new EventBus(config.serviceName);

  // Routes
  const router = registerRoutes({ config, app, eventBus });
  app.use('/api/v1', router);

  // Error handler
  app.use(errorHandler);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Endpoint not found' } });
  });

  const start = async (): Promise<void> => {
    // Connect to database
    createPool(config.database);
    log.info('Database pool created');

    // Connect to event bus
    try {
      await eventBus.connect(config.redis);
      log.info('Event bus connected');
    } catch (error) {
      log.warn('Event bus connection failed, running without events', { error });
    }

    // Start server
    app.listen(config.port, () => {
      log.info(`${config.serviceName} running on port ${config.port}`);
    });
  };

  const stop = async (): Promise<void> => {
    await eventBus.disconnect();
    await closePool();
    log.info(`${config.serviceName} stopped`);
  };

  return { app, start, stop };
}
