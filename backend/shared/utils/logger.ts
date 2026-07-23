import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
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
// CẤU HÌNH LOG FORMAT
// ==========================================
const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// Format cho production (JSON)
const jsonFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.metadata({
    fillExcept: ['timestamp', 'level', 'message', 'service', 'context'],
  }),
  winston.format((info) => {
    // Sanitize sensitive data
    if (info.metadata) {
      const sensitiveFields = ['password', 'token', 'secret', 'apiKey', 'creditCard'];
      const sanitize = (obj: any): any => {
        if (!obj || typeof obj !== 'object') return obj;
        const result: any = {};
        for (const [key, value] of Object.entries(obj)) {
          if (sensitiveFields.some(f => key.toLowerCase().includes(f))) {
            result[key] = '[REDACTED]';
          } else if (typeof value === 'object') {
            result[key] = sanitize(value);
          } else {
            result[key] = value;
          }
        }
        return result;
      };
      info.metadata = sanitize(info.metadata);
    }
    return info;
  })(),
  winston.format.json(),
);

// Format cho development (colorize + readable)
const devFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize({ all: true }),
  winston.format.printf(({ timestamp, level, message, service, context, stack, ...meta }) => {
    let log = `${timestamp} [${service}] ${level}: ${message}`;
    if (context && Object.keys(context).length > 0) {
      log += `\n  Context: ${JSON.stringify(context, null, 2)}`;
    }
    if (Object.keys(meta).length > 0 && !meta.metadata) {
      log += `\n  Meta: ${JSON.stringify(meta, null, 2)}`;
    }
    if (stack) {
      log += `\n  Stack: ${stack}`;
    }
    return log;
  }),
);

// ==========================================
// LOG TRANSPORTS
// ==========================================
const transports: winston.transport[] = [];

// Console transport
transports.push(
  new winston.transports.Console({
    format: isProduction ? jsonFormat : devFormat,
    silent: isTest,
  }),
);

// File transport với rotation (production only)
if (isProduction) {
  // Error log file
  transports.push(
    new DailyRotateFile({
      filename: 'logs/error-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d',
      format: jsonFormat,
    }),
  );

  // Combined log file
  transports.push(
    new DailyRotateFile({
      filename: 'logs/combined-%DATE%.log',
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d',
      format: jsonFormat,
    }),
  );
}

// ==========================================
// MAIN LOGGER
// ==========================================
export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || (isProduction ? 'info' : 'debug'),
  format: jsonFormat,
  defaultMeta: {
    service: process.env.SERVICE_NAME || 'spa-ecosystem',
    environment: process.env.NODE_ENV || 'development',
  },
  transports,
  // Exit on error = false để không crash app khi log lỗi
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
    userAgent: req.headers?.['user-agent'],
    contentLength: res.getHeader?.('content-length'),
  });
}

export function logDbQuery(query: string, params?: any[], duration?: number): void {
  logger.debug('Database query', {
    context: getContextMeta(),
    query: query.substring(0, 500), // Limit query length
    params: params?.slice(0, 10), // Limit params
    duration: duration ? `${duration}ms` : undefined,
  });
}

export function logAiCall(provider: string, model: string, duration: number, tokens: any): void {
  logger.info('AI call completed', {
    context: getContextMeta(),
    provider,
    model,
    duration: `${duration}ms`,
    tokens,
  });
}

// ==========================================
// CREATE SERVICE LOGGER
// ==========================================
export function createServiceLogger(serviceName: string): winston.Logger {
  return logger.child({ service: serviceName });
}

// ==========================================
// RESET LOGGER (FOR TESTING)
// ==========================================
export function resetLogger(): void {
  logger.clear();
  // Re-add transports for testing
  if (!isTest) {
    logger.add(new winston.transports.Console({ format: devFormat }));
  }
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default {
  logger,
  createServiceLogger,
  getLogContext,
  runWithLogContext,
  logError,
  logApiCall,
  logDbQuery,
  logAiCall,
  resetLogger,
};