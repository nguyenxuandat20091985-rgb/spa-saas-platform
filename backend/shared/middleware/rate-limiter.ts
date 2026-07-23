import { Request, Response, NextFunction } from 'express';
import Redis from 'ioredis';
import { RateLimitError } from '../utils/errors';
import { logger } from '../utils/logger';

// ==========================================
// CẤU HÌNH RATE LIMIT
// ==========================================
export interface RateLimitConfig {
  windowMs: number; // Thời gian cửa sổ (ms)
  maxRequests: number; // Số request tối đa trong cửa sổ
  skipOnWhitelist?: boolean; // Bỏ qua rate limit nếu IP trong whitelist
  keyPrefix?: string; // Prefix cho key Redis
}

// Danh sách IP được whitelist (không bị rate limit)
const WHITELIST_IPS = new Set<string>([
  '127.0.0.1',
  '::1',
  '192.168.1.0/24', // Có thể dùng CIDR, cần thư viện hỗ trợ
  // Thêm IP của admin, CI/CD, monitoring
]);

// ==========================================
// RATE LIMITER WITH REDIS
// ==========================================
export class RateLimiter {
  private redis: Redis.Redis;
  private config: RateLimitConfig;
  private inMemoryStore: Map<string, { count: number; resetAt: number }> = new Map();

  constructor(redisClient: Redis.Redis, config: RateLimitConfig) {
    this.redis = redisClient;
    this.config = config;
  }

  // Middleware chính
  public middleware() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        // 1. Kiểm tra whitelist
        if (this.config.skipOnWhitelist && this.isWhitelisted(req.ip)) {
          return next();
        }

        // 2. Skip healthcheck endpoint
        if (req.path === '/health' || req.path === '/readiness') {
          return next();
        }

        // 3. Tạo key
        const key = this.getKey(req);
        const now = Date.now();

        // 4. Lấy thông tin từ Redis hoặc memory fallback
        let entry = await this.getEntry(key);

        if (!entry || now > entry.resetAt) {
          // Reset counter
          const resetAt = now + this.config.windowMs;
          entry = { count: 1, resetAt };
          await this.setEntry(key, entry);
          this.addRateLimitHeaders(res, 1, this.config.maxRequests - 1, resetAt);
          return next();
        }

        if (entry.count >= this.config.maxRequests) {
          // Quá giới hạn
          const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
          res.setHeader('Retry-After', retryAfter);
          this.addRateLimitHeaders(res, entry.count, 0, entry.resetAt);
          logger.warn('Rate limit exceeded', {
            ip: req.ip,
            tenantId: req.tenantId,
            path: req.path,
            count: entry.count,
            max: this.config.maxRequests,
          });
          return next(new RateLimitError());
        }

        // Tăng counter và trả về thành công
        entry.count++;
        await this.setEntry(key, entry);
        this.addRateLimitHeaders(
          res,
          entry.count,
          this.config.maxRequests - entry.count,
          entry.resetAt
        );
        next();
      } catch (error) {
        // Redis error => fallback to memory store
        logger.error('Redis rate limiter error, using memory fallback', { error });
        this.memoryFallback(req, res, next);
      }
    };
  }

  // ==========================================
  // TẠO KEY (Dựa trên IP, TenantId, Endpoint)
  // ==========================================
  private getKey(req: Request): string {
    const tenant = req.tenantId || 'anonymous';
    // Phân biệt rate limit theo endpoint group
    const endpointGroup = this.getEndpointGroup(req.path);
    const prefix = this.config.keyPrefix || 'rate-limit';
    return `${prefix}:${tenant}:${endpointGroup}:${req.ip}`;
  }

  // ==========================================
  // PHÂN LOẠI ENDPOINT ĐỂ CÓ GIỚI HẠN KHÁC NHAU
  // ==========================================
  private getEndpointGroup(path: string): string {
    if (path.startsWith('/auth/login') || path.startsWith('/auth/register')) {
      return 'auth'; // Giới hạn thấp hơn
    }
    if (path.startsWith('/admin')) {
      return 'admin';
    }
    if (path.startsWith('/api/v1/')) {
      return 'api';
    }
    return 'default';
  }

  // ==========================================
  // KIỂM TRA WHITELIST IP (ĐƠN GIẢN)
  // ==========================================
  private isWhitelisted(ip: string): boolean {
    // TODO: Có thể dùng thư viện `ip-range-check` để hỗ trợ CIDR
    return WHITELIST_IPS.has(ip);
  }

  // ==========================================
  // LẤY ENTRY TỪ REDIS
  // ==========================================
  private async getEntry(key: string): Promise<{ count: number; resetAt: number } | null> {
    const data = await this.redis.get(key);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  }

  // ==========================================
  // LƯU ENTRY VÀO REDIS (TẠO TTL TỰ ĐỘNG)
  // ==========================================
  private async setEntry(key: string, entry: { count: number; resetAt: number }): Promise<void> {
    const ttl = Math.ceil((entry.resetAt - Date.now()) / 1000);
    if (ttl > 0) {
      await this.redis.setex(key, ttl, JSON.stringify(entry));
    }
  }

  // ==========================================
  // FALLBACK KHI REDIS LỖI (DÙNG MEMORY)
  // ==========================================
  private memoryFallback(req: Request, res: Response, next: NextFunction): void {
    const key = `${req.ip}:${req.tenantId || 'anonymous'}:${this.getEndpointGroup(req.path)}`;
    const now = Date.now();
    const entry = this.inMemoryStore.get(key);

    if (!entry || now > entry.resetAt) {
      this.inMemoryStore.set(key, { count: 1, resetAt: now + this.config.windowMs });
      return next();
    }

    if (entry.count >= this.config.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.setHeader('Retry-After', retryAfter);
      logger.warn('Rate limit exceeded (memory fallback)', {
        ip: req.ip,
        tenantId: req.tenantId,
        path: req.path,
      });
      return next(new RateLimitError());
    }

    entry.count++;
    next();
  }

  // ==========================================
  // THÊM HEADERS CHO CLIENT
  // ==========================================
  private addRateLimitHeaders(
    res: Response,
    current: number,
    remaining: number,
    resetAt: number
  ): void {
    res.setHeader('X-RateLimit-Limit', this.config.maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, remaining));
    res.setHeader('X-RateLimit-Reset', Math.ceil(resetAt / 1000)); // Unix timestamp
  }
}

// ==========================================
// CLEANUP CACHE (CHO MEMORY STORE)
// ==========================================
export function startMemoryCleanup(intervalMs: number = 60000, limiter?: RateLimiter): void {
  setInterval(() => {
    const now = Date.now();
    if (limiter) {
      // Cleanup memory store nếu có
      // (Implementation chi tiết nếu cần)
    }
  }, intervalMs);
}

// ==========================================
// FACTORY: TẠO RATE LIMITER VỚI CẤU HÌNH MẶC ĐỊNH
// ==========================================
export function createRateLimiter(
  redisClient: Redis.Redis,
  customConfig?: Partial<RateLimitConfig>
): RateLimiter {
  const defaultConfig: RateLimitConfig = {
    windowMs: 60 * 1000, // 1 phút
    maxRequests: 100,
    skipOnWhitelist: true,
    keyPrefix: 'spa-rate-limit',
  };
  return new RateLimiter(redisClient, { ...defaultConfig, ...customConfig });
}

// ==========================================
// MIDDLEWARE CHO CÁC TRƯỜNG HỢP ĐẶC BIỆT
// ==========================================
export function strictRateLimiter(redisClient: Redis.Redis) {
  return createRateLimiter(redisClient, {
    windowMs: 15 * 60 * 1000, // 15 phút
    maxRequests: 5,
    keyPrefix: 'spa-strict-rate-limit',
  }).middleware();
}

export function authRateLimiter(redisClient: Redis.Redis) {
  return createRateLimiter(redisClient, {
    windowMs: 15 * 60 * 1000, // 15 phút
    maxRequests: 10,
    keyPrefix: 'spa-auth-rate-limit',
  }).middleware();
}

// ==========================================
// EXPORT
// ==========================================
export default {
  RateLimiter,
  createRateLimiter,
  strictRateLimiter,
  authRateLimiter,
  startMemoryCleanup,
};