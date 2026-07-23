import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant, validateTenantMatch } from '../../../shared/middleware/auth';
import { validate, validateBody, validateQuery } from '../../../shared/middleware/validation';
import { rateLimiter } from '../../../shared/middleware/rate-limiter';
import { BookingService } from '../services/booking.service';
import { ServiceManagementService } from '../services/service-management.service';
import { logger } from '../../../shared/utils/logger';

// ==========================================
// VALIDATION SCHEMAS (CÓ THỂ CHUYỂN SANG FILE RIÊNG)
// ==========================================

const createAppointmentSchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  customerId: z.string().uuid('Invalid customer ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  staffId: z.string().uuid('Invalid staff ID').optional(),
  roomId: z.string().uuid('Invalid room ID').optional(),
  startTime: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)),
  notes: z.string().max(1000, 'Notes too long').optional(),
  source: z.enum(['app', 'phone', 'walk_in', 'website', 'social_media']).default('app'),
  sendReminder: z.boolean().default(true),
});

const updateAppointmentSchema = createAppointmentSchema.partial();

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  cancellationReason: z.string().max(500, 'Reason too long').optional(),
  sendNotification: z.boolean().default(true),
});

const createServiceSchema = z.object({
  categoryId: z.string().uuid('Invalid category ID'),
  name: z.string().min(2, 'Name must be at least 2 characters').max(255, 'Name too long'),
  description: z.string().max(2000, 'Description too long').optional(),
  durationMinutes: z.number().min(15, 'Duration must be at least 15 minutes').max(480, 'Duration must be less than 8 hours'),
  price: z.number().min(0, 'Price cannot be negative'),
  discountPrice: z.number().min(0).optional(),
  procedureSteps: z.array(z.object({
    stepNumber: z.number().positive(),
    title: z.string().min(1).max(100),
    description: z.string().max(500).optional(),
    durationMinutes: z.number().positive(),
    productsUsed: z.array(z.string()).optional(),
    equipmentNeeded: z.array(z.string()).optional(),
  })).optional(),
  contraindications: z.array(z.string()).optional(),
  imageUrl: z.string().url('Invalid image URL').optional(),
  isActive: z.boolean().default(true),
});

const updateServiceSchema = createServiceSchema.partial();

const createCategorySchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(500).optional(),
  icon: z.string().emoji('Invalid emoji').optional(),
  sortOrder: z.number().int().min(0).default(0),
});

const listQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  branchId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']).optional(),
  date: z.string().date().optional(),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  sortBy: z.enum(['createdAt', 'startTime', 'status', 'customerName']).default('startTime'),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  search: z.string().max(100).optional(),
});

const calendarQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID').optional(),
  startDate: z.string().date('Invalid date format'),
  endDate: z.string().date('Invalid date format'),
  staffId: z.string().uuid('Invalid staff ID').optional(),
});

const availabilityQuerySchema = z.object({
  branchId: z.string().uuid('Invalid branch ID'),
  serviceId: z.string().uuid('Invalid service ID'),
  date: z.string().date('Invalid date format'),
  staffId: z.string().uuid('Invalid staff ID').optional(),
});

// ==========================================
// ROUTES
// ==========================================

export function createBookingRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const bookingService = new BookingService(deps.eventBus);
  const serviceManagement = new ServiceManagementService();

  // ==========================================
  // LOGGING MIDDLEWARE
  // ==========================================
  router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('Booking route accessed', {
      path: req.path,
      method: req.method,
      tenantId: (req as any).tenantId,
    });
    next();
  });

  // ==========================================
  // APPOINTMENTS
  // ==========================================

  // 1. Lấy danh sách lịch hẹn (có phân trang và lọc)
  router.get(
    '/appointments',
    authMiddleware,
    requireTenant,
    validate(listQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.listAppointments(req.tenantId!, req.query as any);
        logger.info('Appointments listed', {
          tenantId: req.tenantId,
          count: result.data?.length || 0,
          page: req.query.page,
        });
        res.json({ success: true, ...result });
      } catch (error) { next(error); }
    }
  );

  // 2. Lấy lịch dạng calendar (cho frontend)
  router.get(
    '/appointments/calendar',
    authMiddleware,
    requireTenant,
    validate(calendarQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, startDate, endDate, staffId } = req.query;
        const result = await bookingService.getCalendar(
          req.tenantId!,
          branchId as string,
          startDate as string,
          endDate as string,
          staffId as string,
        );
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  // 3. Lấy chi tiết một lịch hẹn
  router.get(
    '/appointments/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid appointment ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.getAppointment(req.tenantId!, req.params.id);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  // 4. Tạo lịch hẹn mới
  router.post(
    '/appointments',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 10), // Giới hạn 10 request/phút
    validateBody(createAppointmentSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.createAppointment(req.tenantId!, req.body);
        logger.info('Appointment created', {
          tenantId: req.tenantId,
          appointmentId: result.id,
          customerId: req.body.customerId,
          serviceId: req.body.serviceId,
        });
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  // 5. Cập nhật lịch hẹn
  router.put(
    '/appointments/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid appointment ID') }), 'params'),
    validateBody(updateAppointmentSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.updateAppointment(
          req.tenantId!,
          req.params.id,
          req.body,
        );
        logger.info('Appointment updated', {
          tenantId: req.tenantId,
          appointmentId: req.params.id,
          fields: Object.keys(req.body),
        });
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  // 6. Cập nhật trạng thái lịch hẹn
  router.patch(
    '/appointments/:id/status',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid appointment ID') }), 'params'),
    validateBody(updateStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.updateStatus(
          req.tenantId!,
          req.params.id,
          req.body.status,
          req.body.cancellationReason,
          req.body.sendNotification,
        );
        logger.info('Appointment status updated', {
          tenantId: req.tenantId,
          appointmentId: req.params.id,
          status: req.body.status,
        });
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  // 7. Xóa lịch hẹn (soft delete)
  router.delete(
    '/appointments/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid appointment ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await bookingService.deleteAppointment(req.tenantId!, req.params.id);
        logger.info('Appointment deleted', {
          tenantId: req.tenantId,
          appointmentId: req.params.id,
        });
        res.json({ success: true, data: { message: 'Appointment deleted successfully' } });
      } catch (error) { next(error); }
    }
  );

  // ==========================================
  // AVAILABILITY (THỜI GIAN TRỐNG)
  // ==========================================

  router.get(
    '/availability/slots',
    authMiddleware,
    requireTenant,
    validate(availabilityQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, serviceId, date, staffId } = req.query;
        const slots = await bookingService.getAvailableSlots(
          req.tenantId!,
          branchId as string,
          serviceId as string,
          date as string,
          staffId as string,
        );
        res.json({ success: true, data: slots });
      } catch (error) { next(error); }
    }
  );

  // ==========================================
  // SERVICES (QUẢN LÝ DỊCH VỤ)
  // ==========================================

  router.get(
    '/services',
    authMiddleware,
    requireTenant,
    validate(listQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = { page: 1, limit: 100, ...req.query };
        const result = await serviceManagement.listServices(req.tenantId!, params as any);
        res.json({ success: true, ...result });
      } catch (error) { next(error); }
    }
  );

  router.get(
    '/services/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid service ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.getService(req.tenantId!, req.params.id);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  router.post(
    '/services',
    authMiddleware,
    requireTenant,
    rateLimiter(60 * 1000, 20),
    validateBody(createServiceSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.createService(req.tenantId!, req.body);
        logger.info('Service created', {
          tenantId: req.tenantId,
          serviceId: result.id,
          name: req.body.name,
        });
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  router.put(
    '/services/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid service ID') }), 'params'),
    validateBody(updateServiceSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.updateService(
          req.tenantId!,
          req.params.id,
          req.body,
        );
        logger.info('Service updated', {
          tenantId: req.tenantId,
          serviceId: req.params.id,
          fields: Object.keys(req.body),
        });
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  router.delete(
    '/services/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid service ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await serviceManagement.deleteService(req.tenantId!, req.params.id);
        logger.info('Service deleted', {
          tenantId: req.tenantId,
          serviceId: req.params.id,
        });
        res.json({ success: true, data: { message: 'Service deleted successfully' } });
      } catch (error) { next(error); }
    }
  );

  // ==========================================
  // SERVICE CATEGORIES (DANH MỤC DỊCH VỤ)
  // ==========================================

  router.get(
    '/service-categories',
    authMiddleware,
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.listCategories(req.tenantId!);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  router.post(
    '/service-categories',
    authMiddleware,
    requireTenant,
    validateBody(createCategorySchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.createCategory(
          req.tenantId!,
          req.body.name,
          req.body.description,
          req.body.icon,
          req.body.sortOrder,
        );
        logger.info('Category created', {
          tenantId: req.tenantId,
          categoryId: result.id,
          name: req.body.name,
        });
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  router.put(
    '/service-categories/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid category ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.updateCategory(
          req.tenantId!,
          req.params.id,
          req.body,
        );
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    }
  );

  router.delete(
    '/service-categories/:id',
    authMiddleware,
    requireTenant,
    validate(z.object({ id: z.string().uuid('Invalid category ID') }), 'params'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await serviceManagement.deleteCategory(req.tenantId!, req.params.id);
        res.json({ success: true, data: { message: 'Category deleted successfully' } });
      } catch (error) { next(error); }
    }
  );

  return router;
}

export default createBookingRouter;