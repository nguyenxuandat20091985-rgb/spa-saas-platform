import express, { Express, Router, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { ServiceConfig } from '../config';
import { errorHandler } from '../middleware/error-handler';
import { rateLimiter } from '../middleware/rate-limiter';
import { createPool, healthCheck, closePool } from '../database/connection';
import { EventBus } from '../events/event-bus';
import { logger, createServiceLogger, runWithLogContext, logApiCall } from './logger';
import { authenticate, requireTenant } from '../middleware/auth';

// ==========================================
// TẠO REQUEST ID (KHÔNG DÙNG UUID)
// ==========================================
let counter = 0;
function generateRequestId(): string {
  const timestamp = Date.now().toString(36);
  const count = (counter++).toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `${timestamp}-${count}-${random}`;
}

// ==========================================
// INTERFACE
// ==========================================
export interface ServiceDependencies {
  config: ServiceConfig;
  app: Express;
  eventBus: EventBus;
  redisClient?: any;
}

export interface ServerInstance {
  app: Express;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  isReady: boolean;
  isAlive: boolean;
}

// ==========================================
// TẠO SERVER
// ==========================================
export async function createServer(
  config: ServiceConfig,
  registerRoutes: (deps: ServiceDependencies) => Router,
  options: {
    enableAuth?: boolean;
    enableTenant?: boolean;
    enableRequestLogging?: boolean;
    shutdownTimeout?: number;
  } = {},
): Promise<ServerInstance> {
  const {
    enableAuth = false,
    enableTenant = false,
    enableRequestLogging = true,
    shutdownTimeout = 30000,
  } = options;

  const log = createServiceLogger(config.serviceName);
  const app = express();
  let server: any = null;
  let isShuttingDown = false;
  let isReady = false;
  let isAlive = true;

  // ==========================================
  // MIDDLEWARE: REQUEST CONTEXT & TRACE
  // ==========================================
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers['x-request-id'] as string || generateRequestId();
    req.headers['x-request-id'] = requestId;
    res.setHeader('x-request-id', requestId);

    const context = {
      requestId,
      ip: req.ip,
      path: req.path,
      method: req.method,
      userAgent: req.headers['user-agent'],
    };

    runWithLogContext(context, () => {
      next();
    });
  });

  // ==========================================
  // MIDDLEWARE: LOGGING REQUEST
  // ==========================================
  if (enableRequestLogging) {
    app.use((req: Request, res: Response, next: NextFunction) => {
      const startTime = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - startTime;
        logApiCall(req, res, duration);
      });
      next();
    });
  }

  // ==========================================
  // MIDDLEWARE: SECURITY & PARSER
  // ==========================================
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
      },
    },
  }));
  app.use(compression());
  app.use(cors({
    origin: config.cors.origins,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-tenant-id'],
  }));
  app.use(express.json({ limit: config.bodyLimit || '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // ==========================================
  // MIDDLEWARE: RATE LIMIT
  // ==========================================
  if (config.rateLimit) {
    app.use(rateLimiter(config.rateLimit.windowMs, config.rateLimit.maxRequests));
  }

  // ==========================================
  // MIDDLEWARE: AUTH (TÙY CHỌN)
  // ==========================================
  if (enableAuth && config.jwtSecret) {
    app.use(authenticate(config.jwtSecret));
    if (enableTenant) {
      app.use(requireTenant);
    }
  }

  // ==========================================
  // HEALTH CHECK
  // ==========================================
  app.get('/health', async (_req: Request, res: Response) => {
    const dbHealthy = await healthCheck();
    const status = dbHealthy ? 200 : 503;
    res.status(status).json({
      service: config.serviceName,
      status: dbHealthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    });
  });

  // ==========================================
  // READINESS PROBE
  // ==========================================
  app.get('/ready', (_req: Request, res: Response) => {
    if (isReady && !isShuttingDown) {
      res.status(200).json({ status: 'ready' });
    } else {
      res.status(503).json({ status: 'not ready' });
    }
  });

  // ==========================================
  // LIVENESS PROBE
  // ==========================================
  app.get('/live', (_req: Request, res: Response) => {
    if (isAlive && !isShuttingDown) {
      res.status(200).json({ status: 'alive' });
    } else {
      res.status(503).json({ status: 'dead' });
    }
  });

  // ==========================================
  // EVENT BUS
  // ==========================================
  const eventBus = new EventBus(config.serviceName);

  // ==========================================
  // REGISTER ROUTES
  // ==========================================
  const router = registerRoutes({ config, app, eventBus });
  app.use('/api/v1', router);

  // ==========================================
  // 404 HANDLER
  // ==========================================
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Endpoint not found',
      },
    });
  });

  // ==========================================
  // ERROR HANDLER
  // ==========================================
  app.use(errorHandler);

  // ==========================================
  // START FUNCTION
  // ==========================================
  const start = async (): Promise<void> => {
    try {
      await createPool(config.database);
      log.info('Database pool created');

      if (config.redis) {
        try {
          await eventBus.connect(config.redis);
          log.info('Event bus connected');
        } catch (error) {
          log.warn('Event bus connection failed, running without events', { error });
        }
      }

      isReady = true;
      isAlive = true;

      server = app.listen(config.port, () => {
        log.info(`${config.serviceName} running on port ${config.port}`);
        log.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
      });

      server.on('error', (error: Error) => {
        log.error('Server error', { error });
        isAlive = false;
      });

    } catch (error) {
      log.error('Failed to start service', { error });
      throw error;
    }
  };

  // ==========================================
  // STOP FUNCTION
  // ==========================================
  const stop = async (): Promise<void> => {
    if (isShuttingDown) {
      log.warn('Shutdown already in progress');
      return;
    }

    isShuttingDown = true;
    isReady = false;
    isAlive = false;

    log.info('Starting graceful shutdown...');

    if (server) {
      server.close(() => {
        log.info('HTTP server closed');
      });
    }

    try {
      await eventBus.disconnect();
      log.info('Event bus disconnected');
    } catch (error) {
      log.warn('Error disconnecting event bus', { error });
    }

    try {
      await closePool();
      log.info('Database pool closed');
    } catch (error) {
      log.warn('Error closing database pool', { error });
    }

    isShuttingDown = false;
    log.info(`${config.serviceName} stopped successfully`);
  };

  // ==========================================
  // HANDLE PROCESS SIGNALS
  // ==========================================
  const setupGracefulShutdown = (): void => {
    const signals: NodeJS.Signals[] = ['SIGTERM', 'SIGINT', 'SIGQUIT'];

    signals.forEach((signal) => {
      process.on(signal, async () => {
        log.info(`Received ${signal}, starting graceful shutdown...`);
        try {
          await stop();
          process.exit(0);
        } catch (error) {
          log.error('Error during shutdown', { error });
          process.exit(1);
        }
      });
    });

    process.on('uncaughtException', (error) => {
      log.error('Uncaught exception', { error });
    });

    process.on('unhandledRejection', (reason) => {
      log.error('Unhandled rejection', { reason });
    });
  };

  setupGracefulShutdown();

  return {
    app,
    start,
    stop,
    get isReady() { return isReady; },
    get isAlive() { return isAlive; },
  };
}

export default createServer;