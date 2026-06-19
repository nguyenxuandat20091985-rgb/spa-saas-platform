import { Request, Response, NextFunction } from 'express';
import { RateLimitError } from '../utils/errors';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

export function rateLimiter(windowMs: number, maxRequests: number) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const key = `${req.ip}:${req.tenantId || 'anonymous'}`;
    const now = Date.now();

    const entry = store.get(key);

    if (!entry || now > entry.resetAt) {
      store.set(key, { count: 1, resetAt: now + windowMs });
      next();
      return;
    }

    if (entry.count >= maxRequests) {
      next(new RateLimitError());
      return;
    }

    entry.count++;
    next();
  };
}

// Cleanup expired entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now > entry.resetAt) {
      store.delete(key);
    }
  }
}, 60000);
