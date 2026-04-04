/**
 * Device Validation Schemas
 * Zod schemas for device registration and management
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import { z } from 'zod';

/**
 * Schema for creating a registration token
 * POST /api/v1/registration/tokens
 */
export const CreateRegistrationTokenSchema = z.object({
  // No body parameters needed - subscriber extracted from API key
  // Optional label for tracking which device this token is for
  label: z.string().max(100).optional(),
});

/**
 * Schema for device registration
 * POST /api/v1/devices/register
 */
export const RegisterDeviceSchema = z.object({
  registrationToken: z
    .string()
    .regex(/^cr_reg_[a-f0-9]{64}$/, {
      message: 'Invalid registration token format. Must be cr_reg_ followed by 64 hexadecimal characters',
    }),

  deviceName: z
    .string()
    .min(1, 'Device name is required')
    .max(100, 'Device name must be 100 characters or less')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, {
      message: 'Device name can only contain letters, numbers, spaces, hyphens, and underscores',
    }),

  simCarrier: z
    .string()
    .max(50, 'SIM carrier name must be 50 characters or less')
    .optional(),

  simNumber: z
    .string()
    .regex(/^\+?[1-9]\d{6,14}$/, {
      message: 'SIM number must be in E.164 format with at least 7 digits (e.g., +639171234567)',
    })
    .optional(),

  androidVersion: z
    .string()
    .regex(/^\d+(\.\d+)*$/, {
      message: 'Android version must be in format X.Y.Z (e.g., 13.0)',
    })
    .optional(),

  appVersion: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, {
      message: 'App version must be in semantic versioning format (e.g., 1.0.0)',
    })
    .optional(),
});

/**
 * Schema for device heartbeat (keep-alive)
 * POST /api/v1/devices/:deviceId/heartbeat
 */
export const DeviceHeartbeatSchema = z.object({
  status: z.enum(['ONLINE', 'OFFLINE', 'DEGRADED'], {
    errorMap: () => ({ message: 'Status must be ONLINE, OFFLINE, or DEGRADED' }),
  }),

  batteryLevel: z
    .number()
    .int()
    .min(0, 'Battery level must be between 0 and 100')
    .max(100, 'Battery level must be between 0 and 100')
    .optional(),

  signalStrength: z
    .number()
    .int()
    .min(0, 'Signal strength must be between 0 and 100')
    .max(100, 'Signal strength must be between 0 and 100')
    .optional(),

  lastError: z.string().max(500).optional(),
});

/**
 * Schema for updating device settings
 * PATCH /api/v1/devices/:deviceId
 */
export const UpdateDeviceSchema = z.object({
  name: z
    .string()
    .min(1, 'Device name is required')
    .max(100, 'Device name must be 100 characters or less')
    .regex(/^[a-zA-Z0-9\s\-_]+$/, {
      message: 'Device name can only contain letters, numbers, spaces, hyphens, and underscores',
    })
    .optional(),

  simCarrier: z
    .string()
    .max(50, 'SIM carrier name must be 50 characters or less')
    .optional(),

  simNumber: z
    .string()
    .regex(/^\+?[1-9]\d{6,14}$/, {
      message: 'SIM number must be in E.164 format with at least 7 digits (e.g., +639171234567)',
    })
    .optional()
    .nullable(),
});

/**
 * Schema for soft-deleting a device
 * DELETE /api/v1/devices/:deviceId
 */
export const DeleteDeviceSchema = z.object({
  // Optional confirmation flag
  confirm: z.boolean().optional(),
});

/**
 * Schema for device query parameters
 * GET /api/v1/devices?status=ONLINE&limit=10
 */
export const DeviceQuerySchema = z.object({
  status: z.enum(['ONLINE', 'OFFLINE', 'DEGRADED', 'ALL']).optional(),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),
  sortBy: z.enum(['created_at', 'name', 'last_heartbeat', 'status']).optional().default('created_at'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

/**
 * Type exports for TypeScript usage
 */
export type CreateRegistrationTokenInput = z.infer<typeof CreateRegistrationTokenSchema>;
export type RegisterDeviceInput = z.infer<typeof RegisterDeviceSchema>;
export type DeviceHeartbeatInput = z.infer<typeof DeviceHeartbeatSchema>;
export type UpdateDeviceInput = z.infer<typeof UpdateDeviceSchema>;
export type DeleteDeviceInput = z.infer<typeof DeleteDeviceSchema>;
export type DeviceQueryInput = z.infer<typeof DeviceQuerySchema>;
