import { v4 as uuidv4 } from 'uuid';
import { withTenantContext } from '../../../shared/database/tenant-context';
import {
  Appointment,
  CreateAppointmentDto,
  UpdateAppointmentDto,
  TimeSlot,
  AppointmentStatus,
} from '../../../shared/types/booking';
import { PaginationParams, PaginatedResponse } from '../../../shared/types/common';
import {
  NotFoundError,
  ValidationError,
  ConflictError,
  BusinessError,
} from '../../../shared/utils/errors';
import { rowToCamelCase, rowsToCamelCase, isBusinessHours } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { EventBus } from '../../../shared/events/event-bus';
import { EventType } from '../../../shared/events/event-types';

const logger = createServiceLogger('booking-service');

// ==========================================
// INTERFACE
// ==========================================
interface AppointmentWithDetails extends Appointment {
  serviceName: string;
  customerName: string;
  staffName?: string;
  roomName?: string;
}

// ==========================================
// BOOKING SERVICE
// ==========================================
export class BookingService {
  constructor(private eventBus: EventBus) {}

  // ==========================================
  // 1. TẠO LỊCH HẸN
  // ==========================================
  async createAppointment(tenantId: string, dto: CreateAppointmentDto): Promise<Appointment> {
    return withTenantContext(tenantId, async (client) => {
      // Validate service
      const serviceResult = await client.query(
        `SELECT id, name, duration_minutes, price, max_bookings_per_day
         FROM services WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
        [dto.serviceId, tenantId],
      );
      if (serviceResult.rows.length === 0) {
        throw new NotFoundError('Service', dto.serviceId);
      }
      const service = serviceResult.rows[0];

      // Validate customer
      const customerResult = await client.query(
        `SELECT id, full_name, email, phone, status
         FROM customers WHERE id = $1 AND tenant_id = $2`,
        [dto.customerId, tenantId],
      );
      if (customerResult.rows.length === 0) {
        throw new NotFoundError('Customer', dto.customerId);
      }
      const customer = customerResult.rows[0];

      if (customer.status === 'blocked') {
        throw new BusinessError('Customer is blocked and cannot book appointments');
      }

      // Validate branch
      const branchResult = await client.query(
        `SELECT id, name, working_hours FROM branches
         WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
        [dto.branchId, tenantId],
      );
      if (branchResult.rows.length === 0) {
        throw new NotFoundError('Branch', dto.branchId);
      }
      const branch = branchResult.rows[0];

      // Calculate times
      const startTime = new Date(dto.startTime);
      if (startTime < new Date()) {
        throw new ValidationError('Cannot book in the past');
      }

      // Check if within business hours
      const workingHours = branch.working_hours;
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][startTime.getDay()];
      if (!workingHours[dayOfWeek]?.isOpen) {
        throw new BusinessError(`Branch is closed on ${dayOfWeek}`);
      }

      const isInHours = isBusinessHours(
        startTime,
        workingHours[dayOfWeek].open,
        workingHours[dayOfWeek].close,
      );
      if (!isInHours) {
        throw new BusinessError('Appointment time is outside business hours');
      }

      const endTime = new Date(startTime.getTime() + service.duration_minutes * 60000);

      // Check customer has no overlapping appointments
      const customerConflict = await client.query(
        `SELECT id FROM appointments
         WHERE tenant_id = $1 AND customer_id = $2
           AND status NOT IN ('cancelled', 'no_show')
           AND start_time < $3 AND end_time > $4`,
        [tenantId, dto.customerId, endTime, startTime],
      );
      if (customerConflict.rows.length > 0) {
        throw new ConflictError('Customer has another appointment at this time');
      }

      // Check staff availability
      if (dto.staffId) {
        const staffResult = await client.query(
          `SELECT id, full_name FROM users
           WHERE id = $1 AND tenant_id = $2 AND role IN ('staff', 'manager')`,
          [dto.staffId, tenantId],
        );
        if (staffResult.rows.length === 0) {
          throw new NotFoundError('Staff', dto.staffId);
        }

        const staffConflict = await client.query(
          `SELECT id FROM appointments
           WHERE tenant_id = $1 AND staff_id = $2
             AND status NOT IN ('cancelled', 'no_show')
             AND start_time < $3 AND end_time > $4`,
          [tenantId, dto.staffId, endTime, startTime],
        );
        if (staffConflict.rows.length > 0) {
          throw new ConflictError('Staff member is not available at this time');
        }

        // Check staff schedule for the day
        const staffSchedule = await client.query(
          `SELECT start_time, end_time, break_start, break_end
           FROM staff_schedules
           WHERE tenant_id = $1 AND branch_id = $2 AND staff_id = $3 AND day_of_week = $4 AND is_available = true`,
          [tenantId, dto.branchId, dto.staffId, dayOfWeek],
        );
        if (staffSchedule.rows.length === 0) {
          throw new BusinessError('Staff not scheduled for this day');
        }
      }

      // Check room availability
      if (dto.roomId) {
        const roomResult = await client.query(
          `SELECT id, name FROM rooms
           WHERE id = $1 AND tenant_id = $2 AND status = 'available'`,
          [dto.roomId, tenantId],
        );
        if (roomResult.rows.length === 0) {
          throw new NotFoundError('Room', dto.roomId);
        }

        const roomConflict = await client.query(
          `SELECT id FROM appointments
           WHERE tenant_id = $1 AND room_id = $2
             AND status NOT IN ('cancelled', 'no_show')
             AND start_time < $3 AND end_time > $4`,
          [tenantId, dto.roomId, endTime, startTime],
        );
        if (roomConflict.rows.length > 0) {
          throw new ConflictError('Room is not available at this time');
        }
      }

      // Calculate total price (with discount if any)
      let totalPrice = service.price;
      if (dto.discountAmount) {
        totalPrice = Math.max(0, totalPrice - dto.discountAmount);
      }

      const id = uuidv4();
      const result = await client.query(
        `INSERT INTO appointments (id, tenant_id, branch_id, customer_id, service_id, staff_id, room_id,
          start_time, end_time, status, notes, source, total_price, discount_amount, discount_reason)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending', $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          id,
          tenantId,
          dto.branchId,
          dto.customerId,
          dto.serviceId,
          dto.staffId,
          dto.roomId,
          startTime,
          endTime,
          dto.notes || '',
          dto.source || 'app',
          totalPrice,
          dto.discountAmount || 0,
          dto.discountReason || '',
        ],
      );

      // Update service booking count
      await client.query(
        'UPDATE services SET booking_count = booking_count + 1, updated_at = NOW() WHERE id = $1',
        [dto.serviceId],
      );

      // Update customer last booking
      await client.query(
        `UPDATE customers SET last_booking_at = NOW(), updated_at = NOW() WHERE id = $1`,
        [dto.customerId],
      );

      const appointment = rowToCamelCase<Appointment>(result.rows[0]);

      // Publish event
      await this.eventBus.publish(EventType.BOOKING_CREATED, tenantId, {
        appointmentId: id,
        customerId: dto.customerId,
        customerEmail: customer.email,
        customerName: customer.full_name,
        serviceId: dto.serviceId,
        serviceName: service.name,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        staffId: dto.staffId,
        branchId: dto.branchId,
      });

      logger.info('Appointment created', {
        tenantId,
        appointmentId: id,
        customerId: dto.customerId,
        serviceId: dto.serviceId,
        staffId: dto.staffId,
      });

      return appointment;
    });
  }

  // ==========================================
  // 2. CẬP NHẬT LỊCH HẸN
  // ==========================================
  async updateAppointment(
    tenantId: string,
    appointmentId: string,
    dto: UpdateAppointmentDto,
  ): Promise<Appointment> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        `SELECT * FROM appointments WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      // Build update query dynamically
      const updates: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (dto.status) {
        updates.push(`status = $${paramIndex++}`);
        values.push(dto.status);
        if (dto.status === 'confirmed') {
          updates.push(`confirmed_at = NOW()`);
        }
        if (dto.status === 'cancelled') {
          updates.push(`cancelled_at = NOW()`);
          updates.push(`cancellation_reason = $${paramIndex++}`);
          values.push(dto.cancellationReason || '');
        }
      }

      if (dto.startTime) {
        const startTime = new Date(dto.startTime);
        if (startTime < new Date()) {
          throw new ValidationError('Cannot update to a past time');
        }
        updates.push(`start_time = $${paramIndex++}`);
        values.push(startTime);
      }

      if (dto.serviceId) {
        const serviceResult = await client.query(
          `SELECT duration_minutes, price FROM services
           WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
          [dto.serviceId, tenantId],
        );
        if (serviceResult.rows.length === 0) {
          throw new NotFoundError('Service', dto.serviceId);
        }
        updates.push(`service_id = $${paramIndex++}`);
        values.push(dto.serviceId);
        updates.push(`end_time = start_time + INTERVAL '${serviceResult.rows[0].duration_minutes} minutes'`);
        updates.push(`total_price = $${paramIndex++}`);
        values.push(serviceResult.rows[0].price);
      }

      if (dto.staffId) {
        updates.push(`staff_id = $${paramIndex++}`);
        values.push(dto.staffId);
      }

      if (dto.notes !== undefined) {
        updates.push(`notes = $${paramIndex++}`);
        values.push(dto.notes);
      }

      if (updates.length === 0) {
        throw new ValidationError('No fields to update');
      }

      updates.push(`updated_at = NOW()`);

      values.push(appointmentId, tenantId);
      const result = await client.query(
        `UPDATE appointments SET ${updates.join(', ')}
         WHERE id = $${paramIndex} AND tenant_id = $${paramIndex + 1}
         RETURNING *`,
        [...values, appointmentId, tenantId],
      );

      const appointment = rowToCamelCase<Appointment>(result.rows[0]);

      await this.eventBus.publish(EventType.BOOKING_UPDATED, tenantId, {
        appointmentId,
        updatedFields: Object.keys(dto),
      });

      logger.info('Appointment updated', {
        tenantId,
        appointmentId,
        updatedFields: Object.keys(dto),
      });

      return appointment;
    });
  }

  // ==========================================
  // 3. LẤY CHI TIẾT LỊCH HẸN
  // ==========================================
  async getAppointment(tenantId: string, appointmentId: string): Promise<AppointmentWithDetails> {
    return withTenantContext(tenantId, async (client) => {
      const result = await client.query(
        `SELECT a.*,
                s.name as service_name, s.duration_minutes, s.price as service_price,
                c.full_name as customer_name, c.email as customer_email, c.phone as customer_phone,
                u.full_name as staff_name,
                r.name as room_name,
                b.name as branch_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN rooms r ON r.id = a.room_id
         LEFT JOIN branches b ON b.id = a.branch_id
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, tenantId],
      );

      if (result.rows.length === 0) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      return rowToCamelCase<AppointmentWithDetails>(result.rows[0]);
    });
  }

  // ==========================================
  // 4. DANH SÁCH LỊCH HẸN (PHÂN TRANG + LỌC)
  // ==========================================
  async listAppointments(
    tenantId: string,
    params: PaginationParams & {
      branchId?: string;
      staffId?: string;
      customerId?: string;
      status?: AppointmentStatus;
      date?: string;
      startDate?: string;
      endDate?: string;
      search?: string;
    },
  ): Promise<PaginatedResponse<Appointment>> {
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
        conditions.push(`DATE(a.start_time) >= $${paramIndex++}`);
        values.push(params.startDate);
      }
      if (params.endDate) {
        conditions.push(`DATE(a.start_time) <= $${paramIndex++}`);
        values.push(params.endDate);
      }
      if (params.search) {
        conditions.push(`(c.full_name ILIKE $${paramIndex} OR c.email ILIKE $${paramIndex} OR c.phone ILIKE $${paramIndex})`);
        values.push(`%${params.search}%`);
        paramIndex++;
      }

      const where = conditions.join(' AND ');
      const offset = (params.page - 1) * params.limit;

      const countResult = await client.query(
        `SELECT COUNT(*) FROM appointments a
         JOIN customers c ON c.id = a.customer_id
         WHERE ${where}`,
        values,
      );
      const total = parseInt(countResult.rows[0].count, 10);

      const dataResult = await client.query(
        `SELECT a.*, s.name as service_name, c.full_name as customer_name,
                u.full_name as staff_name, r.name as room_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN rooms r ON r.id = a.room_id
         WHERE ${where}
         ORDER BY a.start_time ${params.sortOrder || 'asc'}
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...values, params.limit, offset],
      );

      return {
        data: rowsToCamelCase<Appointment>(dataResult.rows),
        pagination: {
          page: params.page,
          limit: params.limit,
          total,
          totalPages: Math.ceil(total / params.limit),
        },
      };
    });
  }

  // ==========================================
  // 5. CẬP NHẬT TRẠNG THÁI LỊCH HẸN
  // ==========================================
  async updateStatus(
    tenantId: string,
    appointmentId: string,
    status: AppointmentStatus,
    reason?: string,
    sendNotification: boolean = true,
  ): Promise<Appointment> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        `SELECT a.*, c.full_name as customer_name, c.email as customer_email,
                s.name as service_name, u.full_name as staff_name
         FROM appointments a
         JOIN customers c ON c.id = a.customer_id
         JOIN services s ON s.id = a.service_id
         LEFT JOIN users u ON u.id = a.staff_id
         WHERE a.id = $1 AND a.tenant_id = $2`,
        [appointmentId, tenantId],
      );

      if (existing.rows.length === 0) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      const appointment = existing.rows[0];

      // Validate status transition
      const validTransitions: Record<string, string[]> = {
        pending: ['confirmed', 'cancelled'],
        confirmed: ['in_progress', 'cancelled', 'completed'],
        in_progress: ['completed', 'cancelled'],
        completed: [],
        cancelled: [],
        no_show: [],
      };

      if (validTransitions[appointment.status]?.includes(status) === false) {
        throw new BusinessError(
          `Cannot transition from ${appointment.status} to ${status}`,
        );
      }

      const updates: string[] = ['status = $1', 'updated_at = NOW()'];
      const values: unknown[] = [status];
      let paramIndex = 2;

      if (status === 'confirmed') {
        updates.push('confirmed_at = NOW()');
      }
      if (status === 'in_progress') {
        updates.push('started_at = NOW()');
      }
      if (status === 'completed') {
        updates.push('completed_at = NOW()');
      }
      if (status === 'cancelled') {
        updates.push('cancelled_at = NOW()');
        if (reason) {
          updates.push(`cancellation_reason = $${paramIndex++}`);
          values.push(reason);
        }
      }
      if (status === 'no_show') {
        updates.push(`cancellation_reason = $${paramIndex++}`);
        values.push('Customer did not show up');
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
          `UPDATE customers
           SET visit_count = visit_count + 1,
               last_visit_at = NOW(),
               total_spent = total_spent + $1,
               updated_at = NOW()
           WHERE id = $2`,
          [appointment.total_price, appointment.customer_id],
        );

        // Calculate loyalty points
        const points = Math.floor(appointment.total_price / 1000);
        if (points > 0) {
          await client.query(
            `INSERT INTO loyalty_transactions (id, tenant_id, customer_id, points, type, description)
             VALUES (uuid_generate_v4(), $1, $2, $3, 'earn', $4)`,
            [tenantId, appointment.customer_id, points, `Hoàn thành dịch vụ ${appointment.service_name}`],
          );
        }

        await this.eventBus.publish(EventType.BOOKING_COMPLETED, tenantId, {
          appointmentId,
          customerId: appointment.customer_id,
          customerEmail: appointment.customer_email,
          customerName: appointment.customer_name,
          serviceName: appointment.service_name,
          totalPrice: appointment.total_price,
          points,
        });
      }

      if (status === 'cancelled') {
        await this.eventBus.publish(EventType.BOOKING_CANCELLED, tenantId, {
          appointmentId,
          customerId: appointment.customer_id,
          customerEmail: appointment.customer_email,
          customerName: appointment.customer_name,
          reason: reason || 'No reason provided',
        });
      }

      if (status === 'confirmed') {
        await this.eventBus.publish(EventType.BOOKING_CONFIRMED, tenantId, {
          appointmentId,
          customerId: appointment.customer_id,
          customerEmail: appointment.customer_email,
          customerName: appointment.customer_name,
          serviceName: appointment.service_name,
          startTime: appointment.start_time,
          staffName: appointment.staff_name,
        });
      }

      logger.info('Appointment status updated', {
        tenantId,
        appointmentId,
        oldStatus: appointment.status,
        newStatus: status,
      });

      return rowToCamelCase<Appointment>(result.rows[0]);
    });
  }

  // ==========================================
  // 6. XÓA LỊCH HẸN (SOFT DELETE)
  // ==========================================
  async deleteAppointment(tenantId: string, appointmentId: string): Promise<void> {
    return withTenantContext(tenantId, async (client) => {
      const existing = await client.query(
        `SELECT status FROM appointments
         WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId],
      );
      if (existing.rows.length === 0) {
        throw new NotFoundError('Appointment', appointmentId);
      }

      await client.query(
        `UPDATE appointments SET status = 'cancelled', cancelled_at = NOW(), deleted_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [appointmentId, tenantId],
      );

      logger.info('Appointment soft deleted', {
        tenantId,
        appointmentId,
      });
    });
  }

  // ==========================================
  // 7. LẤY THỜI GIAN TRỐNG
  // ==========================================
  async getAvailableSlots(
    tenantId: string,
    branchId: string,
    serviceId: string,
    date: string,
    staffId?: string,
  ): Promise<TimeSlot[]> {
    return withTenantContext(tenantId, async (client) => {
      // Get service duration
      const serviceResult = await client.query(
        `SELECT duration_minutes FROM services
         WHERE id = $1 AND tenant_id = $2 AND status = 'active'`,
        [serviceId, tenantId],
      );
      if (serviceResult.rows.length === 0) {
        throw new NotFoundError('Service', serviceId);
      }
      const duration = serviceResult.rows[0].duration_minutes;

      // Get branch working hours
      const branchResult = await client.query(
        `SELECT working_hours FROM branches
         WHERE id = $1 AND tenant_id = $2`,
        [branchId, tenantId],
      );
      if (branchResult.rows.length === 0) {
        throw new NotFoundError('Branch', branchId);
      }

      const workingHours = branchResult.rows[0].working_hours;
      const dayOfWeek = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date(date).getDay()];
      const daySchedule = workingHours[dayOfWeek];

      if (!daySchedule?.isOpen) {
        return [];
      }

      const [openHour, openMin] = daySchedule.open.split(':').map(Number);
      const [closeHour, closeMin] = daySchedule.close.split(':').map(Number);
      const dayStart = openHour * 60 + openMin;
      const dayEnd = closeHour * 60 + closeMin;

      // Get staff schedules
      const staffCondition = staffId ? 'AND ss.staff_id = $4' : '';
      const staffValues = staffId
        ? [tenantId, branchId, dayOfWeek, staffId]
        : [tenantId, branchId, dayOfWeek];

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
           AND status NOT IN ('cancelled', 'no_show')`,
        [tenantId, branchId, date],
      );

      const existingAppointments = appointmentsResult.rows;
      const slots: TimeSlot[] = [];

      for (const schedule of schedulesResult.rows) {
        const [startHour, startMin] = schedule.start_time.split(':').map(Number);
        const [endHour, endMin] = schedule.end_time.split(':').map(Number);
        const [breakStartHour, breakStartMin] = schedule.break_start ? schedule.break_start.split(':').map(Number) : [0, 0];
        const [breakEndHour, breakEndMin] = schedule.break_end ? schedule.break_end.split(':').map(Number) : [0, 0];

        let currentMinutes = Math.max(dayStart, startHour * 60 + startMin);
        const endMinutes = Math.min(dayEnd, endHour * 60 + endMin);
        const breakStart = breakStartHour * 60 + breakStartMin;
        const breakEnd = breakEndHour * 60 + breakEndMin;

        while (currentMinutes + duration <= endMinutes) {
          // Skip break time
          if (schedule.break_start && schedule.break_end) {
            if (currentMinutes < breakEnd && currentMinutes + duration > breakStart) {
              currentMinutes = breakEnd;
              continue;
            }
          }

          const slotStartTime = new Date(`${date}T${this.minutesToTime(currentMinutes)}:00`);
          const slotEndTime = new Date(`${date}T${this.minutesToTime(currentMinutes + duration)}:00`);

          // Check conflicts
          const hasConflict = existingAppointments.some((appt: Record<string, unknown>) =>
            appt.staff_id === schedule.staff_id &&
            new Date(appt.start_time as string) < slotEndTime &&
            new Date(appt.end_time as string) > slotStartTime,
          );

          if (!hasConflict) {
            slots.push({
              startTime: this.minutesToTime(currentMinutes),
              endTime: this.minutesToTime(currentMinutes + duration),
              available: true,
              staffId: schedule.staff_id,
              staffName: schedule.staff_name,
            });
          }

          currentMinutes += 30; // 30-minute intervals
        }
      }

      return slots;
    });
  }

  // ==========================================
  // 8. LẤY LỊCH DẠNG CALENDAR
  // ==========================================
  async getCalendar(
    tenantId: string,
    branchId: string,
    startDate: string,
    endDate: string,
    staffId?: string,
  ): Promise<Appointment[]> {
    return withTenantContext(tenantId, async (client) => {
      let query = `
        SELECT a.*, s.name as service_name, c.full_name as customer_name,
                u.full_name as staff_name, r.name as room_name
         FROM appointments a
         JOIN services s ON s.id = a.service_id
         JOIN customers c ON c.id = a.customer_id
         LEFT JOIN users u ON u.id = a.staff_id
         LEFT JOIN rooms r ON r.id = a.room_id
         WHERE a.tenant_id = $1 AND a.branch_id = $2
           AND DATE(a.start_time) >= $3 AND DATE(a.start_time) <= $4
           AND a.status NOT IN ('cancelled', 'no_show')
      `;

      const values: any[] = [tenantId, branchId, startDate, endDate];
      let paramIndex = 5;

      if (staffId) {
        query += ` AND a.staff_id = $${paramIndex++}`;
        values.push(staffId);
      }

      query += ` ORDER BY a.start_time`;

      const result = await client.query(query, values);
      return rowsToCamelCase<Appointment>(result.rows);
    });
  }

  // ==========================================
  // 9. UTILITY: MINUTES TO TIME STRING
  // ==========================================
  private minutesToTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
  }
}