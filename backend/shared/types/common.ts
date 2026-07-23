// ==========================================
// PHÂN TRANG & TÌM KIẾM
// ==========================================
export interface PaginationParams {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: SortOrder;
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export interface SearchParams extends PaginationParams {
  search?: string;
  filters?: Record<string, string | number | boolean | string[]>;
  fromDate?: Date;
  toDate?: Date;
}

// ==========================================
// RESPONSE CHUẨN API
// ==========================================
export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface ValidationError {
  field: string;
  message: string;
  value?: any;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
    validationErrors?: ValidationError[];
  };
  meta?: Record<string, unknown>;
}

// Response cho các service nội bộ
export interface ServiceResponse<T = unknown> {
  statusCode: number;
  message: string;
  data?: T;
}

// ==========================================
// DATE RANGE
// ==========================================
export interface DateRange {
  startDate: Date;
  endDate: Date;
}

// ==========================================
// AUDIT & SOFT DELETE
// ==========================================
export type EntityStatus = 'active' | 'inactive' | 'archived' | 'deleted';

export interface AuditFields {
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
  deletedAt?: Date | null;
}

// ==========================================
// SCOPE (TENANT & BRANCH)
// ==========================================
export interface TenantScoped {
  tenantId: string;
}

export interface BranchScoped extends TenantScoped {
  branchId: string;
}

// ==========================================
// REQUEST (Dùng trong Controllers)
// ==========================================
export interface TenantRequest<T = any> extends Request {
  tenantId: string;
  user?: {
    id: string;
    role: string;
    email?: string;
  };
  body: T;
}

// ==========================================
// UTILITY: Lỗi nghiệp vụ
// ==========================================
export class BusinessError extends Error {
  constructor(
    public code: string,
    public message: string,
    public statusCode: number = 400,
    public details?: any
  ) {
    super(message);
    this.name = 'BusinessError';
  }
}