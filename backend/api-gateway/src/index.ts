import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { createProxyMiddleware, Options as ProxyOptions } from 'http-proxy-middleware';
import { loadConfig } from '../../shared/config';
import { authenticate, optionalAuth } from '../../shared/middleware/auth';
import { errorHandler } from '../../shared/middleware/error-handler';
import { rateLimiter } from '../../shared/middleware/rate-limiter';
import { createServiceLogger } from '../../shared/utils/logger';

const config = loadConfig('api-gateway', 3000);
const logger = createServiceLogger('api-gateway');

const app = express();

// Global middleware
app.use(helmet());
app.use(compression());
app.use(cors({ origin: config.cors.origins, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(rateLimiter(config.rateLimit.windowMs, config.rateLimit.maxRequests));

// Health check
app.get('/health', (_req, res) => {
  res.json({ service: 'api-gateway', status: 'healthy', timestamp: new Date().toISOString() });
});

// Service routing configuration
interface ServiceRoute {
  path: string;
  target: string;
  auth: boolean;
  pathRewrite?: Record<string, string>;
}

const services: ServiceRoute[] = [
  { path: '/api/v1/auth', target: `http://localhost:3001`, auth: false },
  { path: '/api/v1/users', target: `http://localhost:3002`, auth: true },
  { path: '/api/v1/staff', target: `http://localhost:3002`, auth: true },
  { path: '/api/v1/customers', target: `http://localhost:3006`, auth: true },
  { path: '/api/v1/appointments', target: `http://localhost:3003`, auth: true },
  { path: '/api/v1/availability', target: `http://localhost:3003`, auth: true },
  { path: '/api/v1/orders', target: `http://localhost:3004`, auth: true },
  { path: '/api/v1/invoices', target: `http://localhost:3004`, auth: true },
  { path: '/api/v1/installments', target: `http://localhost:3004`, auth: true },
  { path: '/api/v1/inventory', target: `http://localhost:3005`, auth: true },
  { path: '/api/v1/products', target: `http://localhost:3005`, auth: true },
  { path: '/api/v1/services', target: `http://localhost:3003`, auth: true },
  { path: '/api/v1/service-categories', target: `http://localhost:3003`, auth: true },
  { path: '/api/v1/notifications', target: `http://localhost:3007`, auth: true },
  { path: '/api/v1/billing', target: `http://localhost:3008`, auth: true },
  { path: '/api/v1/subscriptions', target: `http://localhost:3008`, auth: true },
  { path: '/api/v1/membership', target: `http://localhost:3009`, auth: true },
  { path: '/api/v1/loyalty', target: `http://localhost:3009`, auth: true },
  { path: '/api/v1/vouchers', target: `http://localhost:3009`, auth: true },
  { path: '/api/v1/ai', target: `http://localhost:3010`, auth: true },
  { path: '/api/v1/analytics', target: `http://localhost:3013`, auth: true },
  { path: '/api/v1/dashboard', target: `http://localhost:3013`, auth: true },
  { path: '/api/v1/campaigns', target: `http://localhost:3007`, auth: true },
  { path: '/api/v1/automations', target: `http://localhost:3007`, auth: true },
  { path: '/api/v1/media', target: `http://localhost:3014`, auth: true },
  { path: '/api/v1/admin', target: `http://localhost:3015`, auth: true },
  { path: '/api/v1/me', target: `http://localhost:3006`, auth: true },
  { path: '/api/v1/spa', target: `http://localhost:3006`, auth: false },
];

// Register proxy routes
for (const service of services) {
  const proxyOptions: ProxyOptions = {
    target: service.target,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req) => {
        logger.debug('Proxying request', {
          method: req.method,
          path: req.url,
          target: service.target,
        });
      },
      error: (err, _req, res) => {
        logger.error('Proxy error', { error: err.message, target: service.target });
        if ('writeHead' in res && typeof res.writeHead === 'function') {
          (res as express.Response).status(503).json({
            success: false,
            error: { code: 'SERVICE_UNAVAILABLE', message: `Service at ${service.path} is unavailable` },
          });
        }
      },
    },
  };

  if (service.auth) {
    app.use(service.path, authenticate(config.jwt.secret), createProxyMiddleware(proxyOptions));
  } else {
    app.use(service.path, optionalAuth(config.jwt.secret), createProxyMiddleware(proxyOptions));
  }
}

// Error handler
app.use(errorHandler);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Endpoint not found' },
  });
});

// Start server
app.listen(config.port, () => {
  logger.info(`API Gateway running on port ${config.port}`);
  logger.info(`Registered ${services.length} service routes`);
});

export default app;
