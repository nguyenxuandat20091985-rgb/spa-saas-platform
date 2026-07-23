import { Router, Request, Response, NextFunction } from 'express';
import { ServiceDependencies } from '../../../shared/utils/base-server';
import { validate, validateBody } from '../../../shared/middleware/validation';
import { authenticate, optionalAuth, requireTenant, validateTenantMatch } from '../../../shared/middleware/auth';
import { rateLimiter, authRateLimiter } from '../../../shared/middleware/rate-limiter';
import { AuthService } from '../services/auth.service';
import { logger } from '../../../shared/utils/logger';
import {
  registerSchema,
  loginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '../validators/auth.validators';

export function createAuthRouter(deps: ServiceDependencies): Router {
  const router = Router();
  const authService = new AuthService(
    deps.config.jwt.secret,
    deps.config.jwt.expiresIn,
    deps.config.jwt.refreshExpiresIn,
  );

  // ==========================================
  // LOGGING MIDDLEWARE (CHO AUTH ROUTES)
  // ==========================================
  router.use((req: Request, _res: Response, next: NextFunction) => {
    logger.debug('Auth route accessed', {
      path: req.path,
      method: req.method,
      ip: req.ip,
    });
    next();
  });

  // ==========================================
  // 1. ĐĂNG KÝ (RATE LIMIT THẤP ĐỂ TRÁNH SPAM)
  // ==========================================
  router.post(
    '/auth/register',
    authRateLimiter(deps.redisClient),
    validateBody(registerSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.register(req.body);
        logger.info('User registered successfully', {
          email: req.body.email,
          tenantId: result.tenantId,
        });
        res.status(201).json({
          success: true,
          data: result,
          message: 'Registration successful. Please verify your email.',
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 2. ĐĂNG NHẬP (RATE LIMIT THẤP ĐỂ CHỐNG BRUTE FORCE)
  // ==========================================
  router.post(
    '/auth/login',
    authRateLimiter(deps.redisClient),
    validateBody(loginSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.login(req.body);
        logger.info('User logged in', {
          email: req.body.email,
          userId: result.user.id,
          tenantId: result.user.tenantId,
        });
        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 3. REFRESH TOKEN
  // ==========================================
  router.post(
    '/auth/refresh-token',
    validateBody(refreshTokenSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const result = await authService.refreshToken(req.body.refreshToken);
        logger.info('Token refreshed', {
          userId: result.user?.id,
        });
        res.json({
          success: true,
          data: result,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 4. XÁC THỰC EMAIL
  // ==========================================
  router.post(
    '/auth/verify-email',
    validateBody(verifyEmailSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.verifyEmail(req.body.token);
        res.json({
          success: true,
          data: { message: 'Email verified successfully' },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 5. QUÊN MẬT KHẨU (RATE LIMIT THẤP)
  // ==========================================
  router.post(
    '/auth/forgot-password',
    authRateLimiter(deps.redisClient),
    validateBody(forgotPasswordSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.forgotPassword(req.body.email);
        // Luôn trả về success để không lộ email tồn tại
        res.json({
          success: true,
          data: {
            message: 'If the email exists, a reset link has been sent',
          },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 6. ĐẶT LẠI MẬT KHẨU
  // ==========================================
  router.post(
    '/auth/reset-password',
    validateBody(resetPasswordSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.resetPassword(req.body.token, req.body.newPassword);
        logger.info('Password reset successful', {
          token: req.body.token.substring(0, 10) + '...',
        });
        res.json({
          success: true,
          data: { message: 'Password reset successful' },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 7. LẤY PROFILE (YÊU CẦU XÁC THỰC)
  // ==========================================
  router.get(
    '/auth/profile',
    authenticate(deps.config.jwt.secret),
    requireTenant,
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const profile = await authService.getProfile(req.user!.userId);
        res.json({
          success: true,
          data: profile,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 8. CẬP NHẬT PROFILE
  // ==========================================
  router.put(
    '/auth/profile',
    authenticate(deps.config.jwt.secret),
    requireTenant,
    validateBody(updateProfileSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const profile = await authService.updateProfile(req.user!.userId, req.body);
        logger.info('Profile updated', {
          userId: req.user!.userId,
          fields: Object.keys(req.body),
        });
        res.json({
          success: true,
          data: profile,
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 9. ĐỔI MẬT KHẨU
  // ==========================================
  router.post(
    '/auth/change-password',
    authenticate(deps.config.jwt.secret),
    requireTenant,
    validateBody(changePasswordSchema),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        await authService.changePassword(
          req.user!.userId,
          req.body.currentPassword,
          req.body.newPassword,
        );
        logger.info('Password changed', {
          userId: req.user!.userId,
        });
        res.json({
          success: true,
          data: { message: 'Password changed successfully' },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 10. LOGOUT (VÔ HIỆU TOKEN - CẦN REDIS BLACKLIST)
  // ==========================================
  router.delete(
    '/auth/logout',
    authenticate(deps.config.jwt.secret),
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const token = req.headers.authorization?.split(' ')[1];
        if (token && deps.redisClient) {
          // Thêm token vào blacklist với thời gian hết hạn của token
          const decoded = await authService.decodeToken(token);
          if (decoded?.exp) {
            const ttl = decoded.exp - Math.floor(Date.now() / 1000);
            if (ttl > 0) {
              await deps.redisClient.setex(
                `blacklist:${token}`,
                ttl,
                '1',
              );
              logger.info('Token blacklisted', {
                userId: req.user?.userId,
                ttl,
              });
            }
          }
        }
        res.json({
          success: true,
          data: { message: 'Logged out successfully' },
        });
      } catch (error) {
        next(error);
      }
    },
  );

  // ==========================================
  // 11. KIỂM TRA TOKEN (CHO CÁC SERVICE KHÁC)
  // ==========================================
  router.get(
    '/auth/verify',
    optionalAuth(deps.config.jwt.secret),
    async (req: Request, res: Response) => {
      if (req.user) {
        res.json({
          success: true,
          data: {
            valid: true,
            user: req.user,
          },
        });
      } else {
        res.json({
          success: false,
          data: {
            valid: false,
          },
        });
      }
    },
  );

  return router;
}

export default createAuthRouter;