import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { authenticate, requireTenant } from '../../../shared/middleware/auth';
import { validate } from '../../../shared/middleware/validation';
import { BookingService } from '../services/booking.service';
import { ServiceManagementService } from '../services/service-management.service';

const createAppointmentSchema = z.object({
  branchId: z.string().uuid(),
  customerId: z.string().uuid(),
  serviceId: z.string().uuid(),
  staffId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  startTime: z.string(),
  notes: z.string().optional(),
  source: z.enum(['app', 'phone', 'walk_in', 'website', 'social_media']).optional(),
});

const updateStatusSchema = z.object({
  status: z.enum(['pending', 'confirmed', 'in_progress', 'completed', 'cancelled', 'no_show']),
  cancellationReason: z.string().optional(),
});

const createServiceSchema = z.object({
  categoryId: z.string().uuid(),
  name: z.string().min(2).max(255),
  description: z.string().optional(),
  durationMinutes: z.number().min(15).max(480),
  price: z.number().min(0),
  discountPrice: z.number().min(0).optional(),
  procedureSteps: z.array(z.object({
    stepNumber: z.number(),
    title: z.string(),
    description: z.string(),
    durationMinutes: z.number(),
    productsUsed: z.array(z.string()).optional(),
    equipmentNeeded: z.array(z.string()).optional(),
  })).optional(),
  contraindications: z.array(z.string()).optional(),
});

const listQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  branchId: z.string().uuid().optional(),
  staffId: z.string().uuid().optional(),
  customerId: z.string().uuid().optional(),
  status: z.string().optional(),
  date: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

export function createBookingRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authMiddleware = authenticate(deps.config.jwt.secret);
  const bookingService = new BookingService(deps.eventBus);
  const serviceManagement = new ServiceManagementService();

  // === APPOINTMENTS ===

  router.get('/appointments', authMiddleware, requireTenant,
    validate(listQuerySchema, 'query'),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.listAppointments(req.tenantId!, req.query as any);
        res.json({ success: true, ...result });
      } catch (error) { next(error); }
    });

  router.get('/appointments/calendar', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, startDate, endDate } = req.query;
        const result = await bookingService.getCalendar(
          req.tenantId!, branchId as string, startDate as string, endDate as string,
        );
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.get('/appointments/:id', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.getAppointment(req.tenantId!, req.params.id);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.post('/appointments', authMiddleware, requireTenant,
    validate(createAppointmentSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.createAppointment(req.tenantId!, req.body);
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.patch('/appointments/:id/status', authMiddleware, requireTenant,
    validate(updateStatusSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await bookingService.updateStatus(
          req.tenantId!, req.params.id, req.body.status, req.body.cancellationReason,
        );
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  // === AVAILABILITY ===

  router.get('/availability/slots', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { branchId, serviceId, date, staffId } = req.query;
        const slots = await bookingService.getAvailableSlots(
          req.tenantId!, branchId as string, serviceId as string, date as string, staffId as string,
        );
        res.json({ success: true, data: slots });
      } catch (error) { next(error); }
    });

  // === SERVICES ===

  router.get('/services', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const params = { page: 1, limit: 100, ...req.query };
        const result = await serviceManagement.listServices(req.tenantId!, params as any);
        res.json({ success: true, ...result });
      } catch (error) { next(error); }
    });

  router.get('/services/:id', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.getService(req.tenantId!, req.params.id);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.post('/services', authMiddleware, requireTenant,
    validate(createServiceSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.createService(req.tenantId!, req.body);
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.put('/services/:id', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.updateService(req.tenantId!, req.params.id, req.body);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  // === SERVICE CATEGORIES ===

  router.get('/service-categories', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.listCategories(req.tenantId!);
        res.json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  router.post('/service-categories', authMiddleware, requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await serviceManagement.createCategory(
          req.tenantId!, req.body.name, req.body.description, req.body.icon,
        );
        res.status(201).json({ success: true, data: result });
      } catch (error) { next(error); }
    });

  return router;
}
