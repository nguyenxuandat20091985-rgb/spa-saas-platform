import winston from 'winston';

const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

export const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: logFormat,
  defaultMeta: { service: process.env.SERVICE_NAME || 'spa-ecosystem' },
  transports: [
    new winston.transports.Console({
      format:
        process.env.NODE_ENV === 'production'
          ? logFormat
          : winston.format.combine(winston.format.colorize(), winston.format.simple()),
    }),
  ],
});

export function createServiceLogger(serviceName: string): winston.Logger {
  return logger.child({ service: serviceName });
}
