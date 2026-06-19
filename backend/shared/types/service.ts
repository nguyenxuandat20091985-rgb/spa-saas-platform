import { AuditFields, EntityStatus, TenantScoped } from './common';

export interface ServiceCategory extends AuditFields, TenantScoped {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  sortOrder: number;
  status: EntityStatus;
}

export interface SpaService extends AuditFields, TenantScoped {
  id: string;
  categoryId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  discountPrice?: number;
  imageUrl?: string;
  procedureSteps: ProcedureStep[];
  contraindications: string[];
  isPopular: boolean;
  bookingCount: number;
  status: EntityStatus;
}

export interface ProcedureStep {
  stepNumber: number;
  title: string;
  description: string;
  durationMinutes: number;
  productsUsed?: string[];
  equipmentNeeded?: string[];
}

export interface CreateServiceDto {
  categoryId: string;
  name: string;
  description?: string;
  durationMinutes: number;
  price: number;
  discountPrice?: number;
  procedureSteps?: ProcedureStep[];
  contraindications?: string[];
}

export interface UpdateServiceDto {
  categoryId?: string;
  name?: string;
  description?: string;
  durationMinutes?: number;
  price?: number;
  discountPrice?: number;
  imageUrl?: string;
  procedureSteps?: ProcedureStep[];
  contraindications?: string[];
  isPopular?: boolean;
  status?: EntityStatus;
}
