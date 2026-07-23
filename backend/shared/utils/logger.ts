import winston from 'winston';
import { AsyncLocalStorage } from 'async_hooks';

// ==========================================
// CONTEXT STORAGE (Request Context)
// ==========================================
export interface LogContext {
  requestId?: string;
  userId?: string;
  tenantId?: string;
  branchId?: string;
  ip?: string;
  path?: string;
  method?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<LogContext>();

export function getLogContext(): LogContext {
  return asyncLocalStorage.getStore() || {};
}

export function runWithLogContext<T>(context: LogContext, fn: () => T): T {
  return asyncLocalStorage.run(context, fn);
}

// ==========================================
// CẤU HÌNH LOG FORMAT (Giữ nguyên như cũ)
// ==========================================
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Format log cơ bản
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Format cho development (màu sắc, dễ đọc)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, context, stack, ...meta }) => {
    let log = `${timestamp} [${service}] ${level}: ${message}`;
    if (context && Object.keys(context).length > 0) {
      log += `\n  Context: ${JSON.stringify(context)}`;
    }
    if (Object.keys(meta).length > 0 && !meta.metadata) {
      log += `\n  Meta: ${JSON.stringify(meta)}`;
    }
    if (stack) {
      log += `\n  Stack: ${stack}`;
    }
    return log;
  }),
);

// ==========================================
// TẠO LOGGER
// ==========================================
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: logFormat,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'spa-ecosystem',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: [
    new winston.transports.Console({
      format: isProduction ? logFormat : devFormat,
      silent: isTest,
    }),
  ],
  exitOnError: false,
});

// ==========================================
// HELPER: LOG VỚI CONTEXT
// ==========================================
function getContextMeta(): LogContext {
  const context = getLogContext();
  const filtered: LogContext = {};
  if (context.requestId) filtered.requestId = context.requestId;
  if (context.userId) filtered.userId = context.userId;
  if (context.tenantId) filtered.tenantId = context.tenantId;
  if (context.branchId) filtered.branchId = context.branchId;
  if (context.ip) filtered.ip = context.ip;
  if (context.path) filtered.path = context.path;
  if (context.method) filtered.method = context.method;
  return filtered;
}

// ==========================================
// HELPER LOG FUNCTIONS
// ==========================================
export function logError(message: string, error?: Error, meta?: Record<string, any>): void {
  logger.error(message, {
    ...meta,
    context: getContextMeta(),
    stack: error?.stack,
    error: error?.message,
  });
}

export function logApiCall(req: any, res: any, duration: number): void {
  logger.info('API call completed', {
    context: getContextMeta(),
    method: req.method,
    path: req.path,
    statusCode: res.statusCode,
    duration: `${duration}ms`,
  });
}

export function logDbQuery(query: string, duration?: number): void {
  logger.debug('Database query', {
    context: getContextMeta(),
    query: query.substring(0, 500),
    duration: duration ? `${duration}ms` : undefined,
  });
}

// ==========================================
// CREATE SERVICE LOGGER
// ==========================================
export function createServiceLogger(serviceName: string): winston.Logger {
  return logger.child({ service: serviceName });
}

// ==========================================
// EXPORT
// ==========================================
export default {
  logger,
  createServiceLogger,
  getLogContext,
  runWithLogContext,
  logError,
  logApiCall,
  logDbQuery,
};