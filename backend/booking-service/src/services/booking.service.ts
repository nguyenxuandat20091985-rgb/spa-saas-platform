import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import { Appointment, CreateAppointmentDto, UpdateAppointmentDto, TimeSlot, AppointmentStatus } from '../../../shared/types/booking';
import { PaginationParams, PaginatedResponse } from '../../../shared/types/common';
import { NotFoundError, ValidationError, ConflictError } from '../../../shared/utils/errors';
import { rowToCamelCase, rowsToCamelCase } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('booking-service');

export class BookingService {
  constructor(private eventBus: EventBus) {}

  async createAppointment(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    return withTenantContext(tenantId, async (client) => {
      // Validate service exists and get duration
      const serviceResult = await client.query(
        'SELECT id, name, duration_minutes, price FROM services WHERE id = $1 AND tenant_id = $2 AND status = $3',
        [dto.serviceId, tenantId, 'active'],
      );
      if (serviceResult.rows.length === 0) {
        throw new NotFoundError('Service', dto.serviceId);
      }
      const service = serviceResult.rows[0];

      // Validate customer
      const customerResult = await client.query(
        'SELECT id FROM customers WHERE id = $1 AND tenant_id = $2',
        [dto.customerId, tenantId],
      );
      if (customerResult.rows.length === 0) {
        throw new NotFoundError('Customer', dto.customerId);
      }

      // Validate branch
      const branchResult = await client.query(
        'SELECT id FROM branches WHERE id = $1 AND tenant_id = $2',
        [dto.branchId, tenantId],
      );
      if (branchResult.rows.length === 0) {
        throw new NotFoundError('Branch', dto.branchId);
      }

      // Calculate end time
      const startTime = new Date(dto.startTime);
      if (startTime < new Date()) {
        throw new ValidationError('Cannot book in the past');
      }

      const endTime = new Date(startTime.getTime() + service.duration_minutes * 60000);

      // Check staff availability if specified
      if (dto.staffId) {
        const staffConflict = await client.query(
          `SELECT id FROM appointments
           WHERE tenant_id = $1 AND staff_id = $2
             AND status NOT IN ('cancelled')
             AND start_time < $3 AND end_time > $4`,
          [tenantId, dto.staffId, endTime, startTime],
        );
        if (staffConflict.rows.length > 0) {
          throw new ConflictError('Staff member is not available at this time');
        }
      }

      // Check room availability if specified
      if (dto.roomId) {
        const roomConflict = await client.query(
          `SELECT id FROM appointments
           WHERE tenant_id = $1 AND room_id = $2
             AND status NOT IN ('cancelled')
             AND start_time < $3 AND end_time > $4`,
          [tenantId, dto.roomId, endTime, startTime],
        );
        if (roomConflict.rows.length > 0) {
          throw new ConflictError('Room is not available at this time');
        }
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO appointments (id, tenant_id, branch_id, customer_id, service_id, staff_id, room_id,
          start_time, end_time, status, notes, source, total_price)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, $12)
         RETURNING *`,
        [id, tenantId, dto.branchId, dto.customerId, dto.serviceId, dto.staffId, dto.roomId,
         startTime, endTime, dto.notes, dto.source || 'app', service.price],
      );

      // Update service booking count
      await client.query(
        'UPDATE services SET booking_count = booking_count + 1 WHERE id = $1',
        [dto.serviceId],
      );

      const appointment = rowToCamelCase<Appointment>(result.rows[0]);

      await this.eventBus.publish(EventType.BOOKING_CREATED, tenantId, {
        appointmentId: id,
        customerId: dto.customerId,
        serviceId: dto.serviceId,
        startTime: startTime.toISOString(),
      });

      logger.info('Appointment created', { tenantId, appointmentId: id });
      return appointment;
    });
  }

  async getAppointment(tenantId: string, appointmentId: string): Promise<Appointment> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT a.*, s.name as service_name, c.full_name as customer_name,
                u.full_name as staff_name, r.name as room_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN rooms r ON r.id = a.room_id
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      return rowToCamelCase<Appointment>(result.rows[0]);
    });
  }

  async listAppointments(tenantId: string, params: PaginationParams & {
    branchId?: string;
    staffId?: string;
    customerId?: string;
    status?: AppointmentStatus;
    date?: string;
    startDate?: string;
    endDate?: string;
  }): Promise<PaginatedResponse<Appointment>> {
    return withTenantContext(tenantId, async (client) => {
      const conditions: string[] = ['a.tenant_id = $1'];
      const values: unknown[] = [tenantId];
      let paramIndex = 2;

      if (params.branchId) {
        conditions.push(`a.branch_id = $${paramIndex++}`);
        values.push(params.branchId);
      }
      if (params.staffId) {
        conditions.push(`a.staff_id = $${paramIndex++}`);
        values.push(params.staffId);
      }
      if (params.customerId) {
        conditions.push(`a.customer_id = $${paramIndex++}`);
        values.push(params.customerId);
      }
      if (params.status) {
        conditions.push(`a.status = $${paramIndex++}`);
        values.push(params.status);
      }
      if (params.date) {
        conditions.push(`DATE(a.start_time) = $${paramIndex++}`);
        values.push(params.date);
      }
      if (params.startDate) {
        conditions.push(`a.start_time >= $${paramIndex++}`);
        values.push(params.startDate);
      }
      if (params.endDate) {
        conditions.push(`a.start_time <= $${paramIndex++}`);
        values.push(params.endDate);
      }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM appointments a WHERE ${where}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT a.*, s.name as service_name, c.full_name as customer_name,
                u.full_name as staff_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         WHERE ${where}
         ORDER BY a.start_time ${params.sortOrder || 'asc'}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<Appointment>(dataResult.rows),
        pagination: { page: params.page, limit: params.limit, total, totalPages: Math.ceil(total / params.limit) },
      };
    });
  }

  async updateStatus(tenantId: string, appointmentId: string, status: AppointmentStatus, reason?: string): Promise<Appointment> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        'SELECT * FROM appointments WHERE id = $1 AND tenant_id = $2',
        [appointmentId, tenantId],
      );

      if (existing.rows.length === 0) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      const updates: string[] = ['status = $1', 'updated_at = NOW()'];
      const values: unknown[] = [status];
      let paramIndex = 2;

      if (status === 'confirmed') {
        updates.push(`confirmed_at = NOW()`);
      }
      if (status === 'cancelled') {
        updates.push(`cancelled_at = NOW()`);
        if (reason) {
          updates.push(`cancellation_reason = $${paramIndex++}`);
          values.push(reason);
        }
      }

      const result = await client.query(
        `UPDATE appointments SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        [...values, appointmentId, tenantId],
      );

      // Update customer visit count if completed
      if (status === 'completed') {
        await client.query(
          `UPDATE customers SET visit_count = visit_count + 1, last_visit_at = NOW(), updated_at = NOW()
           WHERE id = $1`,
          [existing.rows[0].customer_id],
        );

        await this.eventBus.publish(EventType.BOOKING_COMPLETED, tenantId, {
          appointmentId,
          customerId: existing.rows[0].customer_id,
        });
      }

      if (status === 'cancelled') {
        await this.eventBus.publish(EventType.BOOKING_CANCELLED, tenantId, {
          appointmentId,
          customerId: existing.rows[0].customer_id,
          reason,
        });
      }

      if (status === 'confirmed') {
        await this.eventBus.publish(EventType.BOOKING_CONFIRMED, tenantId, {
          appointmentId,
          customerId: existing.rows[0].customer_id,
        });
      }

      return rowToCamelCase<Appointment>(result.rows[0]);
    });
  }

  async getAvailableSlots(tenantId: string, branchId: string, serviceId: string, date: string, staffId?: string): Promise<TimeSlot[]> {
    return withTenantContext(tenantId, async (client) => {
      // Get service duration
      const serviceResult = await client.query(
        'SELECT duration_minutes FROM services WHERE id = $1 AND tenant_id = $2',
        [serviceId, tenantId],
      );
      if (serviceResult.rows.length === 0) {
        throw new NotFoundError('Service', serviceId);
      }
      const duration = serviceResult.rows[0].duration_minutes;

      // Get staff schedules for the day
      const dayOfWeek = new Date(date).getDay();
      const staffCondition = staffId ? 'AND ss.staff_id = $4' : '';
      const staffValues = staffId ? [tenantId, branchId, dayOfWeek, staffId] : [tenantId, branchId, dayOfWeek];

      const schedulesResult = await client.query(
        `SELECT ss.*, u.full_name as staff_name
         FROM staff_schedules ss
         JOIN users u ON u.id = ss.staff_id
         WHERE ss.tenant_id = $1 AND ss.branch_id = $2 AND ss.day_of_week = $3
           AND ss.is_available = true ${staffCondition}`,
        staffValues,
      );

      // Get existing appointments for the day
      const appointmentsResult = await client.query(
        `SELECT staff_id, start_time, end_time
         FROM appointments
         WHERE tenant_id = $1 AND branch_id = $2
           AND DATE(start_time) = $3
           AND status NOT IN ('cancelled')`,
        [tenantId, branchId, date],
      );

      const existingAppointments = appointmentsResult.rows;
      const slots: TimeSlot[] = [];

      for (const schedule of schedulesResult.rows) {
        const startHour = parseInt(schedule.start_time.split(':')[0], 10);
        const startMin = parseInt(schedule.start_time.split(':')[1], 10);
        const endHour = parseInt(schedule.end_time.split(':')[0], 10);
        const endMin = parseInt(schedule.end_time.split(':')[1], 10);

        let currentMinutes = startHour * 60 + startMin;
        const endMinutes = endHour * 60 + endMin;

        while (currentMinutes + duration <= endMinutes) {
          const slotStart = `${Math.floor(currentMinutes / 60).toString().padStart(2, '0')}:${(currentMinutes % 60).toString().padStart(2, '0')}`;
          const slotEndMinutes = currentMinutes + duration;
          const slotEnd = `${Math.floor(slotEndMinutes / 60).toString().padStart(2, '0')}:${(slotEndMinutes % 60).toString().padStart(2, '0')}`;

          // Skip break time
          if (schedule.break_start && schedule.break_end) {
            const breakStart = parseInt(schedule.break_start.split(':')[0], 10) * 60 + parseInt(schedule.break_start.split(':')[1], 10);
            const breakEnd = parseInt(schedule.break_end.split(':')[0], 10) * 60 + parseInt(schedule.break_end.split(':')[1], 10);
            if (currentMinutes < breakEnd && slotEndMinutes > breakStart) {
              currentMinutes = breakEnd;
              continue;
            }
          }

          // Check conflicts
          const slotStartTime = new Date(`${date}T${slotStart}:00`);
          const slotEndTime = new Date(`${date}T${slotEnd}:00`);

          const hasConflict = existingAppointments.some((appt: Record<string, unknown>) =>
            appt.staff_id === schedule.staff_id &&
            new Date(appt.start_time as string) < slotEndTime &&
            new Date(appt.end_time as string) > slotStartTime,
          );

          slots.push({
            startTime: slotStart,
            endTime: slotEnd,
            available: !hasConflict,
            staffId: schedule.staff_id,
            staffName: schedule.staff_name,
          });

          currentMinutes += 30; // 30-minute intervals
        }
      }

      return slots;
    });
  }

  async getCalendar(tenantId: string, branchId: string, startDate: string, endDate: string): Promise<Appointment[]> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT a.*, s.name as service_name, c.full_name as customer_name,
                u.full_name as staff_name, r.name as room_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN rooms r ON r.id = a.room_id
         WHERE a.tenant_id = $1 AND a.branch_id = $2
           AND a.start_time >= $3 AND a.start_time <= $4
           AND a.status != 'cancelled'
         ORDER BY a.start_time`,
        [tenantId, branchId, startDate, endDate],
      );

      return rowsToCamelCase<Appointment>(result.rows);
    });
  }
}
