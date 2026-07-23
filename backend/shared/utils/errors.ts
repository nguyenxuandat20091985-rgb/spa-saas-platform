// ==========================================
// ERROR CODES
// ==========================================
export enum ErrorCode {
  // 4xx Client Errors
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  AUTHORIZATION_ERROR = 'AUTHORIZATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  TENANT_LIMIT = 'TENANT_LIMIT',
  BUSINESS_ERROR = 'BUSINESS_ERROR',
  INVALID_JSON = 'INVALID_JSON',
  INVALID_URI = 'INVALID_URI',

  // 5xx Server Errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  AI_ERROR = 'AI_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  SERVICE_UNAVAILABLE = 'SERVICE_UNAVAILABLE',
}

// ==========================================
// APP ERROR (BASE)
// ==========================================
export class AppError extends Error {
  public readonly isOperational: boolean;

  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown,
    isOperational: boolean = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.isOperational = isOperational;

    // Maintains proper stack trace for where the error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  // Serialize error for response
  toJSON(): {
    code: string;
    message: string;
    details?: unknown;
  } {
    return {
      code: this.code,
      message: this.message,
      details: this.details,
    };
  }

  // Kiểm tra lỗi có phải do client hay không
  isClientError(): boolean {
    return this.statusCode >= 400 && this.statusCode < 500;
  }

  // Kiểm tra lỗi có phải do server hay không
  isServerError(): boolean {
    return this.statusCode >= 500;
  }
}

// ==========================================
// 4xx CLIENT ERRORS
// ==========================================

// 400 Bad Request
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, ErrorCode.VALIDATION_ERROR, message, details);
    this.name = 'ValidationError';
  }
}

// 401 Unauthorized
export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super(401, ErrorCode.AUTHENTICATION_ERROR, message);
    this.name = 'AuthenticationError';
  }
}

// 403 Forbidden
export class AuthorizationError extends AppError {
  constructor(message: string = 'Insufficient permissions') {
    super(403, ErrorCode.AUTHORIZATION_ERROR, message);
    this.name = 'AuthorizationError';
  }
}

// 404 Not Found
export class NotFoundError extends AppError {
  constructor(entity: string, id?: string) {
    const message = id
      ? `${entity} with id '${id}' not found`
      : `${entity} not found`;
    super(404, ErrorCode.NOT_FOUND, message);
    this.name = 'NotFoundError';
  }
}

// 409 Conflict
export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, ErrorCode.CONFLICT, message, details);
    this.name = 'ConflictError';
  }
}

// 429 Too Many Requests
export class RateLimitError extends AppError {
  constructor(message: string = 'Too many requests, please try again later') {
    super(429, ErrorCode.RATE_LIMIT_EXCEEDED, message);
    this.name = 'RateLimitError';
  }
}

// 403 Forbidden - Tenant Limit
export class TenantLimitError extends AppError {
  constructor(resource: string, limit: number) {
    super(
      403,
      ErrorCode.TENANT_LIMIT,
      `${resource} limit (${limit}) reached for your subscription plan`,
    );
    this.name = 'TenantLimitError';
  }
}

// 400 Bad Request - Business Logic
export class BusinessError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, ErrorCode.BUSINESS_ERROR, message, details);
    this.name = 'BusinessError';
  }
}

// ==========================================
// 5xx SERVER ERRORS
// ==========================================

// 500 Internal Server Error
export class InternalError extends AppError {
  constructor(message: string = 'Internal server error', details?: unknown) {
    super(500, ErrorCode.INTERNAL_ERROR, message, details, false);
    this.name = 'InternalError';
  }
}

// 500 - Database Error
export class DatabaseError extends AppError {
  constructor(message: string, details?: unknown) {
    super(500, ErrorCode.DATABASE_ERROR, message, details, false);
    this.name = 'DatabaseError';
  }
}

// 500 - AI Service Error
export class AiError extends AppError {
  constructor(message: string, details?: unknown) {
    super(500, ErrorCode.AI_ERROR, message, details, false);
    this.name = 'AiError';
  }
}

// 500 - Timeout Error
export class TimeoutError extends AppError {
  constructor(service: string, timeout: number) {
    super(
      500,
      ErrorCode.TIMEOUT_ERROR,
      `Service '${service}' timed out after ${timeout}ms`,
      { service, timeout },
      false,
    );
    this.name = 'TimeoutError';
  }
}

// 503 Service Unavailable
export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(
      503,
      ErrorCode.SERVICE_UNAVAILABLE,
      `Service '${service}' is currently unavailable`,
      { service },
      false,
    );
    this.name = 'ServiceUnavailableError';
  }
}

// ==========================================
// UTILITY: MAP ERROR CODE TO STATUS
// ==========================================
export function getStatusFromCode(code: ErrorCode): number {
  const statusMap: Record<ErrorCode, number> = {
    [ErrorCode.VALIDATION_ERROR]: 400,
    [ErrorCode.AUTHENTICATION_ERROR]: 401,
    [ErrorCode.AUTHORIZATION_ERROR]: 403,
    [ErrorCode.NOT_FOUND]: 404,
    [ErrorCode.CONFLICT]: 409,
    [ErrorCode.RATE_LIMIT_EXCEEDED]: 429,
    [ErrorCode.TENANT_LIMIT]: 403,
    [ErrorCode.BUSINESS_ERROR]: 400,
    [ErrorCode.INVALID_JSON]: 400,
    [ErrorCode.INVALID_URI]: 400,
    [ErrorCode.INTERNAL_ERROR]: 500,
    [ErrorCode.DATABASE_ERROR]: 500,
    [ErrorCode.AI_ERROR]: 500,
    [ErrorCode.TIMEOUT_ERROR]: 500,
    [ErrorCode.SERVICE_UNAVAILABLE]: 503,
  };
  return statusMap[code] || 500;
}

// ==========================================
// UTILITY: KIỂM TRA LỖI
// ==========================================
export function isAppError(err: unknown): err is AppError {
  return err instanceof AppError;
}

export function isClientError(err: unknown): boolean {
  return isAppError(err) && err.isClientError();
}

export function isServerError(err: unknown): boolean {
  return isAppError(err) && err.isServerError();
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default {
  // Classes
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  RateLimitError,
  TenantLimitError,
  BusinessError,
  InternalError,
  DatabaseError,
  AiError,
  TimeoutError,
  ServiceUnavailableError,

  // Enums
  ErrorCode,

  // Utilities
  getStatusFromCode,
  isAppError,
  isClientError,
  isServerError,
};