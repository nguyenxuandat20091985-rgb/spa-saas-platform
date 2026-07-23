import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError, z } from 'zod';
import { ValidationError } from '../utils/errors';
import { logger } from '../utils/logger';

// ==========================================
// CẤU HÌNH VALIDATION
// ==========================================
export interface ValidationOptions {
  source?: 'body' | 'query' | 'params' | 'all';
  sanitize?: boolean; // Tự động trim string
  allowUnknown?: boolean; // Cho phép field không khai báo
  stripUnknown?: boolean; // Loại bỏ field không khai báo
  tenantId?: {
    fromToken: boolean; // Lấy tenantId từ token
    override: boolean; // Cho phép ghi đè từ body/query
  };
}

// ==========================================
// MIDDLEWARE VALIDATE CHÍNH
// ==========================================
export function validate<T>(
  schema: ZodSchema<T>,
  options: ValidationOptions = {}
): (req: Request, res: Response, next: NextFunction) => void {
  const {
    source = 'body',
    sanitize = true,
    allowUnknown = false,
    stripUnknown = false,
    tenantId = { fromToken: false, override: false },
  } = options;

  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      let data: any = {};

      // Lấy dữ liệu từ các source
      if (source === 'all') {
        data = { ...req.body, ...req.query, ...req.params };
      } else {
        data = req[source];
      }

      // Sanitize: trim string
      if (sanitize && data && typeof data === 'object') {
        data = sanitizeData(data);
      }

      // Thêm tenantId từ token nếu yêu cầu
      if (tenantId.fromToken && req.tenantId) {
        if (source === 'body' || source === 'all') {
          if (tenantId.override || !data.tenantId) {
            data.tenantId = req.tenantId;
          }
        }
      }

      // Parse với Zod
      const parsed = schema.parse(data) as T;

      // Gán lại vào request
      if (source === 'all') {
        req.body = { ...req.body, ...parsed };
        req.query = { ...req.query, ...parsed };
        req.params = { ...req.params, ...parsed };
      } else {
        req[source] = parsed;
      }

      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details = formatZodError(error);
        logger.warn('Validation failed', {
          path: req.path,
          source,
          errors: details,
          body: req.body,
        });
        next(new ValidationError('Validation failed', details));
        return;
      }
      next(error);
    }
  };
}

// ==========================================
// FORMAT LỖI ZOD (CHUẨN HÓA)
// ==========================================
export function formatZodError(error: ZodError): Array<{
  field: string;
  message: string;
  code: string;
  expected?: any;
  received?: any;
  path: string[];
}> {
  return error.errors.map((e) => ({
    field: e.path.join('.') || 'root',
    message: e.message,
    code: e.code,
    expected: e.expected,
    received: e.received,
    path: e.path,
  }));
}

// ==========================================
// SANITIZE DATA (LÀM SẠCH)
// ==========================================
export function sanitizeData(data: any): any {
  if (typeof data === 'string') {
    return data.trim();
  }

  if (Array.isArray(data)) {
    return data.map(item => sanitizeData(item));
  }

  if (data && typeof data === 'object') {
    const result: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        result[key] = sanitizeData(data[key]);
      }
    }
    return result;
  }

  return data;
}

// ==========================================
// VALIDATE FILE UPLOAD
// ==========================================
export const FileValidationSchema = z.object({
  fieldname: z.string(),
  originalname: z.string(),
  encoding: z.string(),
  mimetype: z.string(),
  size: z.number().positive(),
  buffer: z.instanceof(Buffer).optional(),
});

export const SingleFileSchema = z.object({
  file: FileValidationSchema,
});

export const MultipleFilesSchema = z.object({
  files: z.array(FileValidationSchema).min(1).max(10),
});

export const ImageFileSchema = FileValidationSchema.extend({
  mimetype: z.enum(['image/jpeg', 'image/png', 'image/gif', 'image/webp']),
  size: z.number().max(5 * 1024 * 1024, 'File size must be less than 5MB'),
});

// ==========================================
// SCHEMA DÙNG CHUNG (COMMON)
// ==========================================
export const CommonSchemas = {
  // ID
  id: z.string().min(1, 'ID is required'),
  uuid: z.string().uuid('Invalid UUID format'),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
    sortBy: z.string().optional(),
    sortOrder: z.enum(['asc', 'desc']).default('asc'),
  }),

  // Date
  dateString: z.string().datetime({ offset: true }).or(z.date()),
  dateRange: z.object({
    startDate: z.string().datetime({ offset: true }).or(z.date()),
    endDate: z.string().datetime({ offset: true }).or(z.date()),
  }),

  // Email
  email: z.string().email('Invalid email format').max(255),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
  phone: z.string().regex(/^[0-9+\-\s()]+$/, 'Invalid phone number'),

  // Tenant
  tenantId: z.string().min(1, 'Tenant ID is required'),
  slug: z.string().min(3, 'Slug must be at least 3 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug only allows lowercase letters, numbers, and hyphens'),

  // Search
  search: z.object({
    search: z.string().optional(),
    filters: z.record(z.any()).optional(),
  }),

  // Status
  status: z.enum(['active', 'inactive', 'archived', 'deleted']).default('active'),
};

// ==========================================
// WRAPPER: TẠO MIDDLEWARE NHANH
// ==========================================
export function validateBody<T>(schema: ZodSchema<T>, options?: Omit<ValidationOptions, 'source'>) {
  return validate(schema, { ...options, source: 'body' });
}

export function validateQuery<T>(schema: ZodSchema<T>, options?: Omit<ValidationOptions, 'source'>) {
  return validate(schema, { ...options, source: 'query' });
}

export function validateParams<T>(schema: ZodSchema<T>, options?: Omit<ValidationOptions, 'source'>) {
  return validate(schema, { ...options, source: 'params' });
}

export function validateAll<T>(schema: ZodSchema<T>, options?: Omit<ValidationOptions, 'source'>) {
  return validate(schema, { ...options, source: 'all' });
}

// ==========================================
// EXPORT DEFAULT
// ==========================================
export default {
  validate,
  validateBody,
  validateQuery,
  validateParams,
  validateAll,
  formatZodError,
  sanitizeData,
  CommonSchemas,
  FileValidationSchema,
  SingleFileSchema,
  MultipleFilesSchema,
  ImageFileSchema,
};