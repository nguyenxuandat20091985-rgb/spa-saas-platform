import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { query, transaction } from '../../../shared/database/connection';
import { AuthTokenPayload, UserRole } from '../../../shared/types/user';
import { AuthenticationError, ConflictError, NotFoundError, ValidationError } from '../../../shared/utils/errors';
import { rowToCamelCase, slugify } from '../../../shared/utils/helpers';
import { createServiceLogger } from '../../../shared/utils/logger';
import { RegisterDto, LoginDto } from '../validators/auth.validators';

const logger = createServiceLogger('auth-service');
const SALT_ROUNDS = 12;

interface AuthResult {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    fullName: string;
    role: UserRole;
    tenantId?: string;
    avatarUrl?: string;
  };
}

export class AuthService {
  private jwtSecret: string;
  private jwtExpiresIn: string;
  private refreshExpiresIn: string;

  constructor(jwtSecret: string, jwtExpiresIn = '24h', refreshExpiresIn = '30d') {
    this.jwtSecret = jwtSecret;
    this.jwtExpiresIn = jwtExpiresIn;
    this.refreshExpiresIn = refreshExpiresIn;
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    // Check existing user
    const existing = await query('SELECT id FROM users WHERE email = $1', [dto.email]);
    if (existing.rows.length > 0) {
      throw new ConflictError('A user with this email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, SALT_ROUNDS);
    const userId = uuidv4();

    return transaction(async (client) => {
      let tenantId: string | undefined = dto.tenantId;

      // If registering as tenant_owner, create tenant
      if (dto.role === 'tenant_owner' && dto.tenantName) {
        const tenantSlug = slugify(dto.tenantName);
        const existingTenant = await client.query('SELECT id FROM tenants WHERE slug = $1', [tenantSlug]);
        if (existingTenant.rows.length > 0) {
          throw new ConflictError('A spa with this name already exists');
        }

        const tenantResult = await client.query(
          `INSERT INTO tenants (id, name, slug, owner_id, subscription_plan, status, settings, branding)
           VALUES (uuid_generate_v4(), $1, $2, $3, 'free', 'trial',
             '{"timezone":"Asia/Ho_Chi_Minh","currency":"VND","language":"vi","bookingAdvanceDays":30,"cancellationPolicyHours":24,"autoConfirmBooking":false,"enableOnlinePayment":true,"enableMembership":true,"enableLoyalty":true,"enableAiFeatures":false}',
             '{"primaryColor":"#1E3A5F","secondaryColor":"#E8B931"}')
           RETURNING id`,
          [dto.tenantName, tenantSlug, userId],
        );
        tenantId = tenantResult.rows[0].id;

        // Create default branch
        await client.query(
          `INSERT INTO branches (tenant_id, name, address, phone, working_hours)
           VALUES ($1, $2, '', $3,
             '{"monday":{"open":"09:00","close":"21:00","isOpen":true},"tuesday":{"open":"09:00","close":"21:00","isOpen":true},"wednesday":{"open":"09:00","close":"21:00","isOpen":true},"thursday":{"open":"09:00","close":"21:00","isOpen":true},"friday":{"open":"09:00","close":"21:00","isOpen":true},"saturday":{"open":"09:00","close":"21:00","isOpen":true},"sunday":{"open":"09:00","close":"21:00","isOpen":false}}')`,
          [tenantId, `${dto.tenantName} - Chi nhánh chính`, dto.phone || ''],
        );
      }

      // Create user
      await client.query(
        `INSERT INTO users (id, tenant_id, email, phone, full_name, role, status)
         VALUES ($1, $2, $3, $4, $5, $6, 'active')`,
        [userId, tenantId, dto.email, dto.phone, dto.fullName, dto.role],
      );

      // Store password hash (using a separate table for security)
      await client.query(
        `CREATE TABLE IF NOT EXISTS user_credentials (
           user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
           password_hash VARCHAR(255) NOT NULL,
           reset_token VARCHAR(255),
           reset_token_expires TIMESTAMPTZ,
           created_at TIMESTAMPTZ DEFAULT NOW(),
           updated_at TIMESTAMPTZ DEFAULT NOW()
         )`,
      );
      await client.query(
        'INSERT INTO user_credentials (user_id, password_hash) VALUES ($1, $2)',
        [userId, passwordHash],
      );

      // If tenant owner, create default membership tiers
      if (dto.role === 'tenant_owner' && tenantId) {
        await this.createDefaultMembershipTiers(client, tenantId);
      }

      logger.info('User registered', { userId, role: dto.role, tenantId });

      return this.generateTokens({
        userId,
        tenantId,
        role: dto.role,
        email: dto.email,
        fullName: dto.fullName,
      });
    });
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const result = await query(
      `SELECT u.id, u.tenant_id, u.email, u.full_name, u.role, u.avatar_url, u.status,
              uc.password_hash
       FROM users u
       JOIN user_credentials uc ON uc.user_id = u.id
       WHERE u.email = $1`,
      [dto.email],
    );

    if (result.rows.length === 0) {
      throw new AuthenticationError('Invalid email or password');
    }

    const user = result.rows[0];

    if (user.status !== 'active') {
      throw new AuthenticationError('Account is not active');
    }

    const validPassword = await bcrypt.compare(dto.password, String(user.password_hash));
    if (!validPassword) {
      throw new AuthenticationError('Invalid email or password');
    }

    // Update last login
    await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);

    logger.info('User logged in', { userId: user.id });

    return this.generateTokens({
      userId: String(user.id),
      tenantId: user.tenant_id ? String(user.tenant_id) : undefined,
      role: String(user.role) as UserRole,
      email: String(user.email),
      fullName: String(user.full_name),
      avatarUrl: user.avatar_url ? String(user.avatar_url) : undefined,
    });
  }

  async refreshToken(refreshToken: string): Promise<AuthResult> {
    try {
      const decoded = jwt.verify(refreshToken, this.jwtSecret) as AuthTokenPayload & { type: string };
      if (decoded.type !== 'refresh') {
        throw new AuthenticationError('Invalid refresh token');
      }

      const result = await query(
        'SELECT id, tenant_id, email, full_name, role, avatar_url, status FROM users WHERE id = $1',
        [decoded.userId],
      );

      if (result.rows.length === 0 || result.rows[0].status !== 'active') {
        throw new AuthenticationError('User not found or inactive');
      }

      const user = result.rows[0];

      return this.generateTokens({
        userId: String(user.id),
        tenantId: user.tenant_id ? String(user.tenant_id) : undefined,
        role: String(user.role) as UserRole,
        email: String(user.email),
        fullName: String(user.full_name),
        avatarUrl: user.avatar_url ? String(user.avatar_url) : undefined,
      });
    } catch (error) {
      if (error instanceof AuthenticationError) throw error;
      throw new AuthenticationError('Invalid refresh token');
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const result = await query('SELECT id FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      // Don't reveal whether user exists
      return;
    }

    const resetToken = uuidv4();
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await query(
      `UPDATE user_credentials SET reset_token = $1, reset_token_expires = $2, updated_at = NOW()
       WHERE user_id = $3`,
      [resetToken, expires, result.rows[0].id],
    );

    // In production: send email with reset link
    logger.info('Password reset requested', { email, resetToken });
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const result = await query(
      `SELECT uc.user_id FROM user_credentials uc
       WHERE uc.reset_token = $1 AND uc.reset_token_expires > NOW()`,
      [token],
    );

    if (result.rows.length === 0) {
      throw new ValidationError('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await query(
      `UPDATE user_credentials
       SET password_hash = $1, reset_token = NULL, reset_token_expires = NULL, updated_at = NOW()
       WHERE user_id = $2`,
      [passwordHash, result.rows[0].user_id],
    );

    logger.info('Password reset completed', { userId: result.rows[0].user_id });
  }

  async getProfile(userId: string): Promise<Record<string, unknown>> {
    const result = await query(
      `SELECT id, tenant_id, email, phone, full_name, avatar_url, role, branch_id,
              status, last_login_at, created_at
       FROM users WHERE id = $1`,
      [userId],
    );

    if (result.rows.length === 0) {
      throw new NotFoundError('User', userId);
    }

    return rowToCamelCase(result.rows[0]);
  }

  private generateTokens(user: {
    userId: string;
    tenantId?: string;
    role: UserRole;
    email: string;
    fullName: string;
    avatarUrl?: string;
  }): AuthResult {
    const payload: AuthTokenPayload = {
      userId: user.userId,
      tenantId: user.tenantId,
      role: user.role,
      email: user.email,
      firebaseUid: '',
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn,
    } as jwt.SignOptions);

    const refreshPayload = { ...payload, type: 'refresh' };
    const refreshToken = jwt.sign(refreshPayload, this.jwtSecret, {
      expiresIn: this.refreshExpiresIn,
    } as jwt.SignOptions);

    return {
      accessToken,
      refreshToken,
      user: {
        id: user.userId,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        tenantId: user.tenantId,
        avatarUrl: user.avatarUrl,
      },
    };
  }

  private async createDefaultMembershipTiers(client: import('pg').PoolClient, tenantId: string): Promise<void> {
    const tiers = [
      { name: 'Silver', level: 1, minPoints: 0, discount: 5, color: '#C0C0C0' },
      { name: 'Gold', level: 2, minPoints: 5000, discount: 10, color: '#FFD700' },
      { name: 'Platinum', level: 3, minPoints: 15000, discount: 15, color: '#E5E4E2' },
      { name: 'Diamond', level: 4, minPoints: 30000, discount: 20, color: '#B9F2FF' },
    ];

    for (const tier of tiers) {
      await client.query(
        `INSERT INTO membership_tiers (tenant_id, name, level, min_points, discount_percentage, color, benefits)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          tenantId,
          tier.name,
          tier.level,
          tier.minPoints,
          tier.discount,
          tier.color,
          JSON.stringify([
            { type: 'discount', description: `Giảm ${tier.discount}% tất cả dịch vụ`, value: tier.discount },
            { type: 'points_multiplier', description: `Tích điểm x${tier.level}`, value: tier.level },
          ]),
        ],
      );
    }
  }
}
