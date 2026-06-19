import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthTokenPayload, UserRole } from '../types/user';
import { AuthenticationError, AuthorizationError } from '../utils/errors';
import { logger } from '../utils/logger';

declare global {
  namespace Express {
    interface Request {
      user?: AuthTokenPayload;
      tenantId?: string;
    }
  }
}

export function authenticate(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new AuthenticationError('Missing or invalid authorization header');
      }

      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, jwtSecret) as AuthTokenPayload;

      req.user = decoded;
      req.tenantId = decoded.tenantId;

      next();
    } catch (error) {
      if (error instanceof AuthenticationError) {
        next(error);
        return;
      }
      if (error instanceof jwt.JsonWebTokenError) {
        next(new AuthenticationError('Invalid token'));
        return;
      }
      if (error instanceof jwt.TokenExpiredError) {
        next(new AuthenticationError('Token expired'));
        return;
      }
      next(error);
    }
  };
}

export function authorize(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(new AuthenticationError());
      return;
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      logger.warn('Authorization failed', {
        userId: req.user.userId,
        role: req.user.role,
        requiredRoles: roles,
      });
      next(new AuthorizationError());
      return;
    }

    next();
  };
}

export function requireTenant(req: Request, _res: Response, next: NextFunction): void {
  if (!req.tenantId) {
    next(new AuthenticationError('Tenant context required'));
    return;
  }
  next();
}

export function optionalAuth(jwtSecret: string) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    try {
      const authHeader = req.headers.authorization;
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        req.user = jwt.verify(token, jwtSecret) as AuthTokenPayload;
        req.tenantId = req.user.tenantId;
      }
    } catch {
      // Token invalid but auth is optional
    }
    next();
  };
}
