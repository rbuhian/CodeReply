/**
 * Message Validation Schemas
 * Zod schemas for SMS message sending and management
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import { z } from 'zod';
import { parsePhoneNumber, isValidPhoneNumber } from 'libphonenumber-js';

/**
 * Custom Zod validator for E.164 phone numbers
 */
const e164PhoneNumber = z
  .string()
  .min(1, 'Phone number is required')
  .refine(
    (phone) => {
      // Must start with + for E.164 format
      if (!phone.startsWith('+')) {
        return false;
      }
      // Validate using libphonenumber-js
      return isValidPhoneNumber(phone);
    },
    {
      message: 'Phone number must be in E.164 format (e.g., +639171234567)',
    }
  );

/**
 * Schema for sending a message
 * POST /api/v1/messages
 */
export const SendMessageSchema = z.object({
  to: e164PhoneNumber,

  body: z
    .string()
    .min(1, 'Message body is required')
    .max(918, 'Message body must be 918 characters or less (6 concatenated SMS segments)'),

  webhookUrl: z
    .string()
    .url('Webhook URL must be a valid URL')
    .max(500, 'Webhook URL must be 500 characters or less')
    .optional(),

  metadata: z
    .record(z.any())
    .refine(
      (meta) => {
        // Ensure metadata is not too large (max 5KB when JSON stringified)
        const jsonString = JSON.stringify(meta);
        return jsonString.length <= 5000;
      },
      {
        message: 'Metadata must be 5KB or less when JSON stringified',
      }
    )
    .optional(),

  ttl: z
    .number()
    .int()
    .min(60, 'TTL must be at least 60 seconds')
    .max(86400, 'TTL must be at most 24 hours (86400 seconds)')
    .optional()
    .default(300), // 5 minutes default

  priority: z
    .enum(['LOW', 'NORMAL', 'HIGH'], {
      errorMap: () => ({ message: 'Priority must be LOW, NORMAL, or HIGH' }),
    })
    .optional()
    .default('NORMAL'),

  preferredCarrier: z
    .string()
    .max(50, 'Carrier name must be 50 characters or less')
    .optional(),
});

/**
 * Schema for batch message sending
 * POST /api/v1/messages/batch
 */
export const SendBatchMessagesSchema = z.object({
  messages: z
    .array(
      z.object({
        to: e164PhoneNumber,
        body: z
          .string()
          .min(1, 'Message body is required')
          .max(918, 'Message body must be 918 characters or less'),
        metadata: z.record(z.any()).optional(),
      })
    )
    .min(1, 'At least one message is required')
    .max(100, 'Maximum 100 messages per batch'),

  webhookUrl: z
    .string()
    .url('Webhook URL must be a valid URL')
    .optional(),

  ttl: z
    .number()
    .int()
    .min(60)
    .max(86400)
    .optional()
    .default(300),

  priority: z
    .enum(['LOW', 'NORMAL', 'HIGH'])
    .optional()
    .default('NORMAL'),
});

/**
 * Schema for message query parameters
 * GET /api/v1/messages?status=SENT&limit=50
 */
export const MessageQuerySchema = z.object({
  status: z
    .enum([
      'ALL',
      'QUEUED',
      'DISPATCHED',
      'SENT',
      'DELIVERED',
      'FAILED',
    ])
    .optional()
    .default('ALL'),

  to: z.string().optional(), // Filter by recipient phone number

  from: z.coerce.date().optional(), // Start date for time range filter
  to_date: z.coerce.date().optional(), // End date for time range filter

  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  offset: z.coerce.number().int().min(0).optional().default(0),

  sortBy: z
    .enum(['queued_at', 'sent_at', 'delivered_at', 'status'])
    .optional()
    .default('queued_at'),

  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
}).refine(
  (data) => {
    // If both from and to_date are provided, ensure from is before to_date
    if (data.from && data.to_date) {
      return data.from <= data.to_date;
    }
    return true;
  },
  {
    message: 'Start date (from) must be before or equal to end date (to_date)',
  }
);

/**
 * Schema for message update (retry, cancel)
 * PATCH /api/v1/messages/:messageId
 */
export const UpdateMessageSchema = z.object({
  action: z.enum(['RETRY', 'CANCEL'], {
    errorMap: () => ({ message: 'Action must be RETRY or CANCEL' }),
  }),
});

/**
 * Schema for webhook delivery confirmation
 * POST /api/v1/webhooks/delivery (internal use)
 */
export const WebhookDeliverySchema = z.object({
  messageId: z.string().uuid('Message ID must be a valid UUID'),

  status: z.enum(['SENT', 'DELIVERED', 'FAILED'], {
    errorMap: () => ({ message: 'Status must be SENT, DELIVERED, or FAILED' }),
  }),

  error: z.string().max(500).optional(),

  timestamp: z.coerce.date(),
});

/**
 * Type exports for TypeScript usage
 */
export type SendMessageInput = z.infer<typeof SendMessageSchema>;
export type SendBatchMessagesInput = z.infer<typeof SendBatchMessagesSchema>;
export type MessageQueryInput = z.infer<typeof MessageQuerySchema>;
export type UpdateMessageInput = z.infer<typeof UpdateMessageSchema>;
export type WebhookDeliveryInput = z.infer<typeof WebhookDeliverySchema>;
