import { z } from 'zod';
import { isValidVietnamesePhone, slugify } from '../../../shared/utils/helpers';

// ==========================================
// CÁC SCHEMA DÙNG CHUNG
// ==========================================

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one digit')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

const emailSchema = z
  .string()
  .email('Invalid email format')
  .max(255, 'Email is too long');

const phoneSchema = z
  .string()
  .optional()
  .refine(
    (val) => !val || isValidVietnamesePhone(val),
    { message: 'Invalid Vietnamese phone number' }
  );

const fullNameSchema = z
  .string()
  .min(2, 'Name must be at least 2 characters')
  .max(100, 'Name is too long');

const tenantNameSchema = z
  .string()
  .min(2, 'Tenant name must be at least 2 characters')
  .max(100, 'Tenant name is too long')
  .optional();

const idSchema = z.string().uuid('Invalid UUID format');

// ==========================================
// 1. ĐĂNG KÝ
// ==========================================
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    fullName: fullNameSchema,
    phone: phoneSchema,
    role: z
      .enum(['tenant_owner', 'manager', 'receptionist', 'staff', 'customer'])
      .default('customer'),
    tenantId: idSchema.optional(),
    tenantName: tenantNameSchema,
  })
  .refine(
    (data) => {
      // Nếu role là tenant_owner thì phải có tenantName
      if (data.role === 'tenant_owner' && !data.tenantName) {
        return false;
      }
      return true;
    },
    {
      message: 'Tenant name is required when registering as tenant owner',
      path: ['tenantName'],
    }
  )
  .refine(
    (data) => {
      // Nếu có tenantId thì không cần tenantName (thêm user vào tenant có sẵn)
      if (data.tenantId && data.tenantName) {
        return false;
      }
      return true;
    },
    {
      message: 'Cannot provide both tenantId and tenantName',
      path: ['tenantName'],
    }
  );

// ==========================================
// 2. ĐĂNG NHẬP
// ==========================================
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
});

// ==========================================
// 3. FIREBASE LOGIN
// ==========================================
export const firebaseLoginSchema = z.object({
  firebaseToken: z.string().min(1, 'Firebase token is required'),
});

// ==========================================
// 4. REFRESH TOKEN
// ==========================================
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ==========================================
// 5. QUÊN MẬT KHẨU
// ==========================================
export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

// ==========================================
// 6. ĐẶT LẠI MẬT KHẨU
// ==========================================
export const resetPasswordSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine(
    (data) => data.newPassword === data.confirmPassword,
    {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }
  );

// ==========================================
// 7. ĐỔI MẬT KHẨU (BỔ SUNG)
// ==========================================
export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordSchema,
    confirmPassword: z.string().min(1, 'Confirm password is required'),
  })
  .refine(
    (data) => data.newPassword === data.confirmPassword,
    {
      message: 'Passwords do not match',
      path: ['confirmPassword'],
    }
  )
  .refine(
    (data) => data.currentPassword !== data.newPassword,
    {
      message: 'New password must be different from current password',
      path: ['newPassword'],
    }
  );

// ==========================================
// 8. CẬP NHẬT PROFILE (BỔ SUNG)
// ==========================================
export const updateProfileSchema = z.object({
  fullName: fullNameSchema.optional(),
  phone: phoneSchema,
  avatarUrl: z.string().url('Invalid avatar URL').optional(),
});

// ==========================================
// 9. XÁC THỰC EMAIL (BỔ SUNG)
// ==========================================
export const verifyEmailSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

// ==========================================
// 10. TẠO TENANT RIÊNG (CHO TENANT OWNER)
// ==========================================
export const createTenantSchema = z.object({
  name: tenantNameSchema,
  slug: z
    .string()
    .optional()
    .refine(
      (val) => !val || /^[a-z0-9-]+$/.test(val),
      { message: 'Slug only allows lowercase letters, numbers, and hyphens' }
    ),
  phone: phoneSchema,
  address: z.string().optional(),
});

// ==========================================
// EXPORT DTO TYPES
// ==========================================
export type RegisterDto = z.infer<typeof registerSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type FirebaseLoginDto = z.infer<typeof firebaseLoginSchema>;
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
export type ForgotPasswordDto = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type ChangePasswordDto = z.infer<typeof changePasswordSchema>;
export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type VerifyEmailDto = z.infer<typeof verifyEmailSchema>;
export type CreateTenantDto = z.infer<typeof createTenantSchema>;

// ==========================================
// EXPORT SCHEMAS (CHO SWAGGER/OPENAPI)
// ==========================================
export const AuthSchemas = {
  registerSchema,
  loginSchema,
  firebaseLoginSchema,
  refreshTokenSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  changePasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
  createTenantSchema,
};

export default AuthSchemas;