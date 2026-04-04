/**
 * Authentication Validation Schemas
 * Zod schemas for API key management and authentication
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import { z } from 'zod';

/**
 * Schema for API key format validation
 * Used by authentication middleware to validate Authorization header
 */
export const ApiKeySchema = z
  .string()
  .regex(/^cr_(live|test)_[a-zA-Z0-9]{32}$/, {
    message: 'API key must be in format cr_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX or cr_test_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
  });

/**
 * Schema for creating a new API key
 * POST /api/v1/auth/api-keys
 */
export const CreateApiKeySchema = z.object({
  label: z
    .string()
    .min(1, 'API key label is required')
    .max(100, 'API key label must be 100 characters or less')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, {
      message: 'API key label can only contain letters, numbers, spaces, hyphens, and underscores',
    }),

  environment: z.enum(['live', 'test'], {
    errorMap: () => ({ message: 'Environment must be live or test' }),
  }),

  permissions: z
    .array(
      z.enum([
        'messages:read',
        'messages:write',
        'devices:read',
        'devices:write',
        'api-keys:read',
        'api-keys:write',
      ])
    )
    .min(1, 'At least one permission is required')
    .max(10, 'Maximum 10 permissions allowed')
    .optional()
    .default(['messages:read', 'messages:write']),

  expiresAt: z.coerce
    .date()
    .refine(
      (date) => date > new Date(),
      {
        message: 'Expiration date must be in the future',
      }
    )
    .optional(),
});

/**
 * Schema for updating an API key
 * PATCH /api/v1/auth/api-keys/:keyId
 */
export const UpdateApiKeySchema = z.object({
  label: z
    .string()
    .min(1, 'API key label is required')
    .max(100, 'API key label must be 100 characters or less')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, {
      message: 'API key label can only contain letters, numbers, spaces, hyphens, and underscores',
    })
    .optional(),

  isActive: z.boolean().optional(),

  permissions: z
    .array(
      z.enum([
        'messages:read',
        'messages:write',
        'devices:read',
        'devices:write',
        'api-keys:read',
        'api-keys:write',
      ])
    )
    .min(1, 'At least one permission is required')
    .max(10, 'Maximum 10 permissions allowed')
    .optional(),

  expiresAt: z.coerce
    .date()
    .refine(
      (date) => date > new Date(),
      {
        message: 'Expiration date must be in the future',
      }
    )
    .optional()
    .nullable(),
});

/**
 * Schema for revoking an API key
 * DELETE /api/v1/auth/api-keys/:keyId
 */
export const RevokeApiKeySchema = z.object({
  confirm: z.boolean().optional(),
});

/**
 * Schema for API key query parameters
 * GET /api/v1/auth/api-keys?environment=live&isActive=true
 */
export const ApiKeyQuerySchema = z.object({
  environment: z.enum(['live', 'test', 'all']).optional().default('all'),

  isActive: z
    .enum(['true', 'false', 'all'])
    .transform((val) => {
      if (val === 'true') return true;
      if (val === 'false') return false;
      return undefined;
    })
    .optional(),

  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),

  sortBy: z
    .enum(['created_at', 'label', 'last_used_at', 'expires_at'])
    .optional()
    .default('created_at'),

  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Schema for login request (username/password authentication)
 * POST /api/v1/auth/login
 */
export const LoginSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be 255 characters or less'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or less'),

  rememberMe: z.boolean().optional().default(false),
});

/**
 * Schema for registration request (new subscriber signup)
 * POST /api/v1/auth/register
 */
export const RegisterSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be 255 characters or less'),

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or less')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),

  confirmPassword: z.string(),

  companyName: z
    .string()
    .min(1, 'Company name is required')
    .max(100, 'Company name must be 100 characters or less'),

  fullName: z
    .string()
    .min(1, 'Full name is required')
    .max(100, 'Full name must be 100 characters or less'),

  phoneNumber: z
    .string()
    .regex(/^\+?[1-9]\d{1,14}$/, {
      message: 'Phone number must be in E.164 format (e.g., +639171234567)',
    })
    .optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

/**
 * Schema for password reset request
 * POST /api/v1/auth/password-reset/request
 */
export const PasswordResetRequestSchema = z.object({
  email: z
    .string()
    .email('Invalid email address')
    .max(255, 'Email must be 255 characters or less'),
});

/**
 * Schema for password reset confirmation
 * POST /api/v1/auth/password-reset/confirm
 */
export const PasswordResetConfirmSchema = z.object({
  token: z
    .string()
    .min(1, 'Reset token is required')
    .max(255, 'Reset token is invalid'),

  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be 128 characters or less')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
      message: 'Password must contain at least one uppercase letter, one lowercase letter, and one number',
    }),

  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

/**
 * Schema for refresh token request
 * POST /api/v1/auth/refresh
 */
export const RefreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'Refresh token is required')
    .max(500, 'Refresh token is invalid'),
});

/**
 * Type exports for TypeScript usage
 */
export type ApiKeyInput = z.infer<typeof ApiKeySchema>;
export type CreateApiKeyInput = z.infer<typeof CreateApiKeySchema>;
export type UpdateApiKeyInput = z.infer<typeof UpdateApiKeySchema>;
export type RevokeApiKeyInput = z.infer<typeof RevokeApiKeySchema>;
export type ApiKeyQueryInput = z.infer<typeof ApiKeyQuerySchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RegisterInput = z.infer<typeof RegisterSchema>;
export type PasswordResetRequestInput = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirmInput = z.infer<typeof PasswordResetConfirmSchema>;
export type RefreshTokenInput = z.infer<typeof RefreshTokenSchema>;
