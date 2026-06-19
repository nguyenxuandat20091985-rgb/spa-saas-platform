import { AuditFields, TenantScoped, BranchScoped } from './common';

export type AppointmentStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export type BookingSource = 'app' | 'phone' | 'walk_in' | 'website' | 'social_media';

export interface Appointment extends AuditFields, BranchScoped {
  id: string;
  customerId: string;
  serviceId: string;
  staffId?: string;
  roomId?: string;
  equipmentId?: string;
  startTime: Date;
  endTime: Date;
  status: AppointmentStatus;
  notes?: string;
  source: BookingSource;
  reminderSent: boolean;
  confirmedAt?: Date;
  cancelledAt?: Date;
  cancellationReason?: string;
  totalPrice: number;
  depositAmount?: number;
  depositPaid: boolean;
}

export interface Room extends AuditFields, BranchScoped {
  id: string;
  name: string;
  capacity: number;
  equipment: string[];
  status: 'available' | 'occupied' | 'maintenance' | 'inactive';
}

export interface Equipment extends AuditFields, BranchScoped {
  id: string;
  name: string;
  type: string;
  serialNumber?: string;
  maintenanceSchedule?: MaintenanceSchedule;
  status: 'available' | 'in_use' | 'maintenance' | 'broken';
  lastMaintenanceAt?: Date;
}

export interface MaintenanceSchedule {
  intervalDays: number;
  lastDate?: Date;
  nextDate?: Date;
  notes?: string;
}

export interface TimeSlot {
  startTime: string;
  endTime: string;
  available: boolean;
  staffId?: string;
  staffName?: string;
}

export interface CreateAppointmentDto {
  branchId: string;
  customerId: string;
  serviceId: string;
  staffId?: string;
  roomId?: string;
  startTime: string;
  notes?: string;
  source?: BookingSource;
}

export interface UpdateAppointmentDto {
  staffId?: string;
  roomId?: string;
  startTime?: string;
  notes?: string;
  status?: AppointmentStatus;
  cancellationReason?: string;
}

export interface AvailabilityQuery {
  branchId: string;
  serviceId: string;
  date: string;
  staffId?: string;
}
