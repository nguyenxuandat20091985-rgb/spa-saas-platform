import { AuditFields, EntityStatus } from './common';

export type UserRole = 'super_admin' | 'tenant_owner' | 'manager' | 'receptionist' | 'staff' | 'customer';

export interface User extends AuditFields {
  id: string;
  tenantId?: string;
  firebaseUid: string;
  email: string;
  phone?: string;
  fullName: string;
  avatarUrl?: string;
  role: UserRole;
  branchId?: string;
  status: EntityStatus;
  lastLoginAt?: Date;
  permissions?: string[];
}

export interface CreateUserDto {
  email: string;
  phone?: string;
  fullName: string;
  role: UserRole;
  branchId?: string;
  firebaseUid?: string;
}

export interface UpdateUserDto {
  phone?: string;
  fullName?: string;
  avatarUrl?: string;
  role?: UserRole;
  branchId?: string;
  status?: EntityStatus;
}

export interface AuthTokenPayload {
  userId: string;
  tenantId?: string;
  role: UserRole;
  email: string;
  firebaseUid: string;
  permissions?: string[];
}

export interface StaffSchedule extends AuditFields {
  id: string;
  tenantId: string;
  staffId: string;
  branchId: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
  breakStart?: string;
  breakEnd?: string;
}
