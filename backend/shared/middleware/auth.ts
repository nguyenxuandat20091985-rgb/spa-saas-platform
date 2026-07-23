import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthTokenPayload, UserRole } from '../types/user';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';

// ==========================================
// MỞ RỘNG EXPRESS REQUEST
// ==========================================
declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      tenantId?: string;
      branchId?: string;
    }
  }
}

// ==========================================
// XÁC THỰC JWT (BẮT BUỘC)
// ==========================================
export function authenticate(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Missing authorization header', { path: req.path });
        throw new AuthenticationError('Missing or invalid authorization header');
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, jwtSecret) as AuthTokenPayload;

      // Kiểm tra payload cơ bản
      if (!decoded.userId || !decoded.tenantId) {
        throw new AuthenticationError('Invalid token payload');
      }

      req.user = decoded;
      req.tenantId = decoded.tenantId;
      req.branchId = decoded.branchId;

      logger.info('Authentication successful', {
        userId: decoded.userId,
        tenantId: decoded.tenantId,
        role: decoded.role,
        path: req.path,
      });

      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        next(error);
        return;
      }
      if (error instanceof jwt.JsonWebTokenError) {
        logger.warn('Invalid JWT token', { path: req.path, error: error.message });
        next(new AuthenticationError('Invalid token'));
        return;
      }
      if (error instanceof jwt.TokenExpiredError) {
        logger.warn('JWT token expired', { path: req.path });
        next(new AuthenticationError('Token expired, please refresh'));
        return;
      }
      next(error);
    }
  };
}

// ==========================================
// XÁC THỰC JWT (TÙY CHỌN)
// ==========================================
export function optionalAuth(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, jwtSecret) as AuthTokenPayload;
        req.user = decoded;
        req.tenantId = decoded.tenantId;
        req.branchId = decoded.branchId;

        logger.debug('Optional authentication successful', {
          userId: decoded.userId,
          tenantId: decoded.tenantId,
        });
      }
    } catch (error) {
      // Token invalid but auth is optional
      logger.debug('Optional authentication failed', { path: req.path });
    }
    next();
  };
}

// ==========================================
// PHÂN QUYỀN (ROLE-BASED)
// ==========================================
export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      logger.warn('Authorization failed', {
        userId: req.user.userId,
        role: req.user.role,
        requiredRoles: roles,
        path: req.path,
      });
      next(new AuthorizationError(`Insufficient permissions. Required: ${roles.join(', ')}`));
      return;
    }

    logger.debug('Authorization successful', {
      userId: req.user.userId,
      role: req.user.role,
    });
    next();
  };
}

// ==========================================
// PHÂN QUYỀN DỰA TRÊN PERMISSION (NÂNG CAO)
// ==========================================
export function requirePermissions(...permissions: string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError('Authentication required'));
      return;
    }

    const userPermissions = req.user.permissions || [];
    const hasAllPermissions = permissions.every(p => userPermissions.includes(p));

    if (!hasAllPermissions) {
      logger.warn('Permission denied', {
        userId: req.user.userId,
        required: permissions,
        userPermissions: userPermissions,
        path: req.path,
      });
      next(new AuthorizationError('Insufficient permissions'));
      return;
    }

    next();
  };
}

// ==========================================
// KIỂM TRA TENANT CONTEXT
// ==========================================
export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    logger.warn('Tenant context missing', { path: req.path });
    next(new AuthenticationError('Tenant context required'));
    return;
  }
  next();
}

// ==========================================
// KIỂM TRA TENANT KHỚP VỚI URL
// ==========================================
export function validateTenantMatch(req: Request, _res: Response, next: NextFunction): void {
  const tenantIdFromUrl = req.params.tenantId || req.query.tenantId || req.body?.tenantId;
  
  if (tenantIdFromUrl && req.tenantId && tenantIdFromUrl !== req.tenantId) {
    logger.warn('Tenant mismatch', {
      userTenantId: req.tenantId,
      urlTenantId: tenantIdFromUrl,
      path: req.path,
    });
    next(new AuthorizationError('Tenant mismatch'));
    return;
  }
  next();
}

// ==========================================
// REFRESH TOKEN (HÀM TIỆN ÍCH)
// ==========================================
export function refreshToken(jwtSecret: string, refreshSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    // Thực tế sẽ kiểm tra refresh token trong DB hoặc Redis
    // Đây là middleware placeholder
    const { refreshToken: rt } = req.body;
    if (!rt) {
      next(new AuthenticationError('Refresh token required'));
      return;
    }
    // ... logic refresh (cần gọi service)
    next();
  };
}

// ==========================================
// LOGOUT (VÔ HIỆU TOKEN)
// ==========================================
// Note: JWT stateless, cần dùng Redis blacklist hoặc refresh token revoke
export function logout(req: Request, _res: Response, next: NextFunction): void {
  // Logic logout thường do controller xử lý
  // Middleware này đánh dấu để logging
  logger.info('User logged out', { userId: req.user?.userId });
  next();
}

// ==========================================
// EXPORT TẤT CẢ
// ==========================================
export default {
  authenticate,
  optionalAuth,
  authorize,
  requirePermissions,
  requireTenant,
  validateTenantMatch,
  refreshToken,
  logout,
};