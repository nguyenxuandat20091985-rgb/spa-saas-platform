import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createProxyMiddleware, Options as ProxyOptions, RequestHandler } from 'http-proxy-middleware';
import { loadConfig } from '../../shared/config';
import { authenticate, optionalAuth } from '../../shared/middleware/auth';
import { errorHandler } from '../../shared/middleware/error-handler';
import { rateLimiter, createRateLimiter } from '../../shared/middleware/rate-limiter';
import { createServiceLogger, runWithLogContext } from '../../shared/utils/logger';
import { v4 as uuidv4 } from 'uuid';

const config = loadConfig('api-gateway', 3000);
const logger = createServiceLogger('api-gateway');

const app = express();

// ==========================================
// GLOBAL MIDDLEWARE
// ==========================================

// Request ID và logging context
app.use((req: Request, res: Response, next: NextFunction) => {
  const requestId = req.headers['x-request-id'] as string || uuidv4();
  req.headers['x-request-id'] = requestId;
  res.setHeader('x-request-id', requestId);

  runWithLogContext({ requestId, path: req.path, method: req.method, ip: req.ip }, () => {
    next();
  });
});

// Security
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
  origin: config.cors.origins || '*',
  credentials: config.cors.credentials !== false,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'x-tenant-id'],
}));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// RATE LIMITING (PER IP)
// ==========================================
const gatewayRateLimiter = rateLimiter(config.rateLimit?.windowMs || 60 * 1000, config.rateLimit?.maxRequests || 100);
app.use(gatewayRateLimiter);

// ==========================================
// LOGGING REQUEST
// ==========================================
app.use((req: Request, res: Response, next: NextFunction) => {
  const startTime = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info('Request processed', {
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });
  });
  next();
});

// ==========================================
// HEALTH CHECK
// ==========================================
app.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'api-gateway',
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

app.get('/ready', (_req: Request, res: Response) => {
  res.json({ status: 'ready' });
});

app.get('/live', (_req: Request, res: Response) => {
  res.json({ status: 'alive' });
});

// ==========================================
// SERVICE ROUTING CONFIGURATION
// ==========================================

interface ServiceRoute {
  path: string;
  target: string;
  auth: boolean;
  pathRewrite?: Record<string, string>;
  rateLimit?: { windowMs: number; maxRequests: number };
  timeout?: number;
  retries?: number;
}

const services: ServiceRoute[] = [
  // Auth Service
  { path: '/api/v1/auth', target: `http://auth-service:3001`, auth: false, rateLimit: { windowMs: 15 * 60 * 1000, maxRequests: 20 } },
  { path: '/api/v1/users', target: `http://auth-service:3001`, auth: true },
  { path: '/api/v1/staff', target: `http://auth-service:3001`, auth: true },

  // Booking Service
  { path: '/api/v1/appointments', target: `http://booking-service:3003`, auth: true },
  { path: '/api/v1/availability', target: `http://booking-service:3003`, auth: true },
  { path: '/api/v1/services', target: `http://booking-service:3003`, auth: true },
  { path: '/api/v1/service-categories', target: `http://booking-service:3003`, auth: true },

  // POS Service
  { path: '/api/v1/orders', target: `http://pos-service:3004`, auth: true },
  { path: '/api/v1/invoices', target: `http://pos-service:3004`, auth: true },
  { path: '/api/v1/installments', target: `http://pos-service:3004`, auth: true },

  // Inventory Service
  { path: '/api/v1/inventory', target: `http://inventory-service:3005`, auth: true },
  { path: '/api/v1/products', target: `http://inventory-service:3005`, auth: true },

  // CRM Service
  { path: '/api/v1/customers', target: `http://crm-service:3006`, auth: true },
  { path: '/api/v1/me', target: `http://crm-service:3006`, auth: true },
  { path: '/api/v1/spa', target: `http://crm-service:3006`, auth: false },

  // Notification Service (nếu có)
  { path: '/api/v1/notifications', target: `http://notification-service:3007`, auth: true },
  { path: '/api/v1/campaigns', target: `http://notification-service:3007`, auth: true },
  { path: '/api/v1/automations', target: `http://notification-service:3007`, auth: true },

  // Billing Service (nếu có)
  { path: '/api/v1/billing', target: `http://billing-service:3008`, auth: true },
  { path: '/api/v1/subscriptions', target: `http://billing-service:3008`, auth: true },

  // Loyalty Service (nếu có)
  { path: '/api/v1/membership', target: `http://loyalty-service:3009`, auth: true },
  { path: '/api/v1/loyalty', target: `http://loyalty-service:3009`, auth: true },
  { path: '/api/v1/vouchers', target: `http://loyalty-service:3009`, auth: true },

  // AI Gateway
  { path: '/api/v1/ai', target: `http://ai-gateway:3010`, auth: true },

  // Analytics Service
  { path: '/api/v1/analytics', target: `http://analytics-service:3013`, auth: true },
  { path: '/api/v1/dashboard', target: `http://analytics-service:3013`, auth: true },

  // Media Service (nếu có)
  { path: '/api/v1/media', target: `http://media-service:3014`, auth: true },

  // Admin Service
  { path: '/api/v1/admin', target: `http://admin-service:3015`, auth: true },
];

// ==========================================
// REGISTER PROXY ROUTES
// ==========================================

for (const service of services) {
  const proxyOptions: ProxyOptions = {
    target: service.target,
    changeOrigin: true,
    proxyTimeout: service.timeout || 30000,
    timeout: service.timeout || 30000,
    retries: service.retries || 3,
    followRedirects: false,
    on: {
      proxyReq: (proxyReq, req: Request, _res) => {
        // Forward request ID
        const requestId = req.headers['x-request-id'];
        if (requestId) {
          proxyReq.setHeader('x-request-id', requestId);
        }

        // Forward tenant ID if present
        const tenantId = (req as any).tenantId;
        if (tenantId) {
          proxyReq.setHeader('x-tenant-id', tenantId);
        }

        logger.debug('Proxying request', {
          method: req.method,
          path: req.url,
          target: service.target,
          requestId,
          tenantId,
        });
      },
      proxyRes: (proxyRes, _req, _res) => {
        // Log response status
        logger.debug('Proxy response', {
          statusCode: proxyRes.statusCode,
          target: service.target,
        });
      },
      error: (err: Error, _req: Request, res: Response) => {
        logger.error('Proxy error', {
          error: err.message,
          target: service.target,
          stack: err.stack,
        });
        if (!res.headersSent) {
          res.status(503).json({
            success: false,
            error: {
              code: 'SERVICE_UNAVAILABLE',
              message: `Service at ${service.path} is temporarily unavailable`,
            },
          });
        }
      },
    },
    pathRewrite: service.pathRewrite,
  };

  // Apply rate limiting per route if configured
  let middleware: RequestHandler[] = [];
  if (service.auth) {
    middleware.push(authenticate(config.jwt.secret));
  } else {
    middleware.push(optionalAuth(config.jwt.secret));
  }

  // Per-route rate limiting
  if (service.rateLimit) {
    const routeLimiter = createRateLimiter(
      config.redisClient,
      {
        windowMs: service.rateLimit.windowMs,
        maxRequests: service.rateLimit.maxRequests,
        keyPrefix: `gateway:${service.path}`,
      }
    ).middleware();
    middleware.push(routeLimiter);
  }

  // Add proxy middleware
  middleware.push(createProxyMiddleware(proxyOptions));

  // Register route
  app.use(service.path, ...middleware);
}

// ==========================================
// API VERSION INFO
// ==========================================
app.get('/api', (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      version: 'v1',
      services: services.map(s => ({
        path: s.path,
        target: s.target,
        auth: s.auth,
      })),
    },
  });
});

// ==========================================
// ERROR HANDLER
// ==========================================
app.use(errorHandler);

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
// START SERVER
// ==========================================
const server = app.listen(config.port, () => {
  logger.info(`API Gateway running on port ${config.port}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Registered ${services.length} service routes`);
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================
const shutdown = async () => {
  logger.info('Shutting down API Gateway...');
  server.close(() => {
    logger.info('API Gateway stopped');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export default app;