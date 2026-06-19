import { Router, Request, Response, NextFunction } from 'express';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { validate } from '../../../shared/middleware/validation';
import { authenticate } from '../../../shared/middleware/auth';
import { AuthService } from '../services/auth.service';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from '../validators/auth.validators';

export function createAuthRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authService = new AuthService(
    deps.config.jwt.secret,
    deps.config.jwt.expiresIn,
    deps.config.jwt.refreshExpiresIn,
  );

  // POST /api/v1/auth/register
  router.post(
    '/auth/register',
    validate(registerSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.register(req.body);
        res.status(201).json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/v1/auth/login
  router.post(
    '/auth/login',
    validate(loginSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.login(req.body);
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/v1/auth/refresh-token
  router.post(
    '/auth/refresh-token',
    validate(refreshTokenSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.refreshToken(req.body.refreshToken);
        res.json({ success: true, data: result });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/v1/auth/forgot-password
  router.post(
    '/auth/forgot-password',
    validate(forgotPasswordSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.forgotPassword(req.body.email);
        res.json({ success: true, data: { message: 'If the email exists, a reset link has been sent' } });
      } catch (error) {
        next(error);
      }
    },
  );

  // POST /api/v1/auth/reset-password
  router.post(
    '/auth/reset-password',
    validate(resetPasswordSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.resetPassword(req.body.token, req.body.newPassword);
        res.json({ success: true, data: { message: 'Password reset successful' } });
      } catch (error) {
        next(error);
      }
    },
  );

  // GET /api/v1/auth/profile
  router.get(
    '/auth/profile',
    authenticate(deps.config.jwt.secret),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const profile = await authService.getProfile(req.user!.userId);
        res.json({ success: true, data: profile });
      } catch (error) {
        next(error);
      }
    },
  );

  // DELETE /api/v1/auth/logout
  router.delete(
    '/auth/logout',
    authenticate(deps.config.jwt.secret),
    async (req: Request, res: Response) => {
      // In production: invalidate token in Redis blacklist
      res.json({ success: true, data: { message: 'Logged out successfully' } });
    },
  );

  return router;
}
