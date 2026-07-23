import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  RateLimitError,
  NotFoundError,
  ConflictError,
} from '../utils/errors';
import { logger } from '../utils/logger';
import { ApiResponse } from '../types/common';

// ==========================================
// CẤU HÌNH ERROR HANDLER
// ==========================================
const isProduction = process.env.NODE_ENV === 'production';

// Map error code sang HTTP status
const ERROR_STATUS_MAP: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  RATE_LIMIT_EXCEEDED: 429,
  INTERNAL_ERROR: 500,
  DATABASE_ERROR: 500,
};

// ==========================================
// HÀM TẠO RESPONSE LỖI
// ==========================================
function createErrorResponse(
  code: string,
  message: string,
  details?: unknown,
  stack?: string
): ApiResponse {
  const response: ApiResponse = {
    success: false,
    error: {
      code,
      message,
      details: isProduction ? undefined : details, // Ẩn details trong production
    },
  };

  // Chỉ thêm stack trace trong development
  if (!isProduction && stack) {
    response.error = {
      ...response.error,
      stack,
    };
  }

  return response;
}

// ==========================================
// MIDDLEWARE CHÍNH
// ==========================================
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  // 1. XỬ LÝ LỖI APP ERROR
  if (err instanceof AppError) {
    const statusCode = err.statusCode || ERROR_STATUS_MAP[err.code] || 500;
    const response = createErrorResponse(
      err.code,
      err.message,
      err.details,
      err.stack
    );

    if (statusCode >= 500) {
      logger.error('Server error', {
        error: err.message,
        code: err.code,
        statusCode,
        stack: err.stack,
        path: req.path,
        method: req.method,
        ip: req.ip,
        userId: (req as any).user?.userId,
        tenantId: (req as any).tenantId,
      });
    } else {
      logger.warn('Client error', {
        error: err.message,
        code: err.code,
        statusCode,
        path: req.path,
        method: req.method,
        userId: (req as any).user?.userId,
        tenantId: (req as any).tenantId,
      });
    }

    res.status(statusCode).json(response);
    return;
  }

  // 2. XỬ LÝ LỖI ZOD
  if (err instanceof ZodError) {
    const details = err.errors.map((e) => ({
      field: e.path.join('.') || 'root',
      message: e.message,
      code: e.code,
    }));

    const response = createErrorResponse(
      'VALIDATION_ERROR',
      'Validation failed',
      details,
      err.stack
    );

    logger.warn('Zod validation error', {
      path: req.path,
      details,
      body: req.body,
    });

    res.status(400).json(response);
    return;
  }

  // 3. XỬ LÝ LỖI PRISMA (DATABASE)
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const prismaError = handlePrismaError(err);
    const response = createErrorResponse(
      prismaError.code,
      prismaError.message,
      prismaError.details,
      err.stack
    );

    logger.error('Database error', {
      error: err.message,
      code: err.code,
      meta: err.meta,
      path: req.path,
    });

    res.status(prismaError.statusCode).json(response);
    return;
  }

  // 4. XỬ LÝ LỖI PRISMA VALIDATION
  if (err instanceof Prisma.PrismaClientValidationError) {
    const response = createErrorResponse(
      'VALIDATION_ERROR',
      'Invalid data format',
      err.message,
      err.stack
    );

    logger.error('Prisma validation error', {
      error: err.message,
      path: req.path,
    });

    res.status(400).json(response);
    return;
  }

  // 5. XỬ LÝ CÁC LỖI THÔNG DỤNG
  const commonError = handleCommonError(err);
  if (commonError) {
    const response = createErrorResponse(
      commonError.code,
      commonError.message,
      commonError.details,
      err.stack
    );

    res.status(commonError.statusCode).json(response);
    return;
  }

  // 6. LỖI KHÔNG XÁC ĐỊNH (FALLBACK)
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path,
    method: req.method,
    name: err.name,
  });

  const response = createErrorResponse(
    'INTERNAL_ERROR',
    isProduction ? 'An unexpected error occurred' : err.message,
    isProduction ? undefined : err.stack,
    err.stack
  );

  res.status(500).json(response);
}

// ==========================================
// XỬ LÝ LỖI PRISMA
// ==========================================
function handlePrismaError(err: Prisma.PrismaClientKnownRequestError): {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
} {
  switch (err.code) {
    case 'P2002':
      return {
        code: 'DUPLICATE_ERROR',
        message: 'A record with this value already exists',
        details: err.meta?.target,
        statusCode: 409,
      };
    case 'P2025':
      return {
        code: 'NOT_FOUND',
        message: 'Record not found',
        statusCode: 404,
      };
    case 'P2003':
      return {
        code: 'FOREIGN_KEY_ERROR',
        message: 'Referenced record does not exist',
        details: err.meta?.field_name,
        statusCode: 400,
      };
    case 'P2016':
      return {
        code: 'QUERY_ERROR',
        message: 'Invalid query',
        statusCode: 400,
      };
    case 'P2020':
      return {
        code: 'VALUE_TOO_LONG',
        message: 'Value is too long for the column',
        statusCode: 400,
      };
    case 'P2000':
      return {
        code: 'VALUE_TOO_LONG',
        message: 'Value is too long for the column',
        statusCode: 400,
      };
    default:
      return {
        code: 'DATABASE_ERROR',
        message: 'Database operation failed',
        statusCode: 500,
      };
  }
}

// ==========================================
// XỬ LÝ CÁC LỖI THÔNG DỤNG (NODE.JS)
// ==========================================
function handleCommonError(err: Error): {
  code: string;
  message: string;
  details?: any;
  statusCode: number;
} | null {
  // JSON parse error
  if (err instanceof SyntaxError && 'body' in err) {
    return {
      code: 'INVALID_JSON',
      message: 'Invalid JSON payload',
      statusCode: 400,
    };
  }

  // URI malformed
  if (err instanceof URIError) {
    return {
      code: 'INVALID_URI',
      message: 'Invalid URI',
      statusCode: 400,
    };
  }

  // TypeError (có thể là lỗi logic)
  if (err instanceof TypeError) {
    return {
      code: 'TYPE_ERROR',
      message: err.message,
      statusCode: 500,
    };
  }

  return null;
}

// ==========================================
// ASYNC WRAPPER (CHO CONTROLLER)
// ==========================================
export function asyncHandler<T>(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<T>
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

// ==========================================
// NOT FOUND MIDDLEWARE
// ==========================================
export function notFoundHandler(req: Request, res: Response, next: NextFunction): void {
  next(new NotFoundError(`Route not found: ${req.method} ${req.path}`));
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default {
  errorHandler,
  asyncHandler,
  notFoundHandler,
};