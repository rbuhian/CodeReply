/**
 * Webhook Service
 * Handles HTTP webhook delivery with retries and error handling
 * Author: Bernadette (API Development)
 * Date: April 4, 2026
 */

import axios, { AxiosError } from 'axios';
import { logger } from '../utils/logger';
import { pool } from '../config/database';

/**
 * Webhook delivery payload structure
 */
export interface WebhookPayload {
  messageId: string;
  status: string;
  timestamp: string;
  deviceId: string | null;
  toNumber: string;
  error?: string;
  retryCount?: number;
}

/**
 * Webhook delivery options
 */
export interface WebhookDeliveryOptions {
  maxRetries?: number;
  timeoutMs?: number;
  retryDelayMs?: number;
}

/**
 * Webhook delivery result
 */
export interface WebhookDeliveryResult {
  success: boolean;
  statusCode?: number;
  attempts: number;
  error?: string;
  duration: number;
}

/**
 * Default webhook delivery configuration
 */
const DEFAULT_OPTIONS: Required<WebhookDeliveryOptions> = {
  maxRetries: 3,
  timeoutMs: 10000, // 10 seconds
  retryDelayMs: 1000, // Start with 1 second, exponential backoff
};

/**
 * Deliver webhook notification with automatic retries
 *
 * @param webhookUrl - The subscriber's webhook URL
 * @param payload - The webhook payload data
 * @param options - Delivery options (retries, timeout, etc.)
 * @returns Delivery result with success status and metadata
 */
export async function deliverWebhook(
  webhookUrl: string,
  payload: WebhookPayload,
  options: WebhookDeliveryOptions = {}
): Promise<WebhookDeliveryResult> {
  const config = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let lastError: string | undefined;
  let lastStatusCode: number | undefined;

  logger.info('Webhook delivery initiated', {
    url: webhookUrl,
    messageId: payload.messageId,
    status: payload.status,
    maxRetries: config.maxRetries,
  });

  for (let attempt = 1; attempt <= config.maxRetries; attempt++) {
    try {
      // Add exponential backoff delay for retries (not on first attempt)
      if (attempt > 1) {
        const delay = config.retryDelayMs * Math.pow(2, attempt - 2);
        logger.info('Webhook retry delay', {
          messageId: payload.messageId,
          attempt,
          delayMs: delay,
        });
        await sleep(delay);
      }

      // Attempt webhook delivery
      const response = await axios.post(webhookUrl, payload, {
        timeout: config.timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'CodeReply-BYOD/1.0',
          'X-Webhook-Attempt': attempt.toString(),
          'X-Message-Id': payload.messageId,
        },
        validateStatus: (status) => status >= 200 && status < 300,
      });

      lastStatusCode = response.status;

      // Success!
      const duration = Date.now() - startTime;
      logger.info('Webhook delivered successfully', {
        url: webhookUrl,
        messageId: payload.messageId,
        statusCode: response.status,
        attempts: attempt,
        durationMs: duration,
      });

      // Record successful delivery
      await recordWebhookDelivery(
        payload.messageId,
        webhookUrl,
        true,
        attempt,
        response.status,
        null,
        duration
      );

      return {
        success: true,
        statusCode: response.status,
        attempts: attempt,
        duration,
      };
    } catch (error) {
      const axiosError = error as AxiosError;
      lastStatusCode = axiosError.response?.status;
      lastError = axiosError.message;

      logger.warn('Webhook delivery attempt failed', {
        url: webhookUrl,
        messageId: payload.messageId,
        attempt,
        maxRetries: config.maxRetries,
        error: lastError,
        statusCode: lastStatusCode,
      });

      // Don't retry on certain status codes (client errors)
      if (lastStatusCode && lastStatusCode >= 400 && lastStatusCode < 500) {
        logger.error('Webhook delivery failed with client error, not retrying', {
          url: webhookUrl,
          messageId: payload.messageId,
          statusCode: lastStatusCode,
        });
        break;
      }

      // Continue to next retry attempt
      if (attempt < config.maxRetries) {
        continue;
      }
    }
  }

  // All retries failed
  const duration = Date.now() - startTime;
  logger.error('Webhook delivery failed after all retries', {
    url: webhookUrl,
    messageId: payload.messageId,
    attempts: config.maxRetries,
    lastError,
    lastStatusCode,
    durationMs: duration,
  });

  // Record failed delivery
  await recordWebhookDelivery(
    payload.messageId,
    webhookUrl,
    false,
    config.maxRetries,
    lastStatusCode,
    lastError,
    duration
  );

  return {
    success: false,
    statusCode: lastStatusCode,
    attempts: config.maxRetries,
    error: lastError,
    duration,
  };
}

/**
 * Send message status update webhook
 *
 * @param messageId - UUID of the message
 * @param status - New message status
 * @param error - Optional error message
 */
export async function sendMessageStatusWebhook(
  messageId: string,
  status: string,
  error?: string
): Promise<void> {
  try {
    // Get message and webhook URL
    const result = await pool.query(
      `SELECT m.id, m.webhook_url, m.gateway_id, m.to_number, m.retry_count
       FROM messages m
       WHERE m.id = $1`,
      [messageId]
    );

    if (result.rows.length === 0) {
      logger.warn('Message not found for webhook delivery', { messageId });
      return;
    }

    const message = result.rows[0];

    // No webhook URL configured
    if (!message.webhook_url) {
      logger.debug('No webhook URL configured for message', { messageId });
      return;
    }

    // Prepare webhook payload
    const payload: WebhookPayload = {
      messageId: message.id,
      status,
      timestamp: new Date().toISOString(),
      deviceId: message.gateway_id,
      toNumber: message.to_number,
      retryCount: message.retry_count,
    };

    if (error) {
      payload.error = error;
    }

    // Deliver webhook (async, don't wait)
    deliverWebhook(message.webhook_url, payload).catch((err) => {
      logger.error('Webhook delivery exception', {
        messageId,
        error: err.message,
      });
    });

    logger.info('Webhook delivery queued', {
      messageId,
      status,
      webhookUrl: message.webhook_url,
    });
  } catch (error) {
    logger.error('Failed to send webhook', {
      messageId,
      status,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Record webhook delivery attempt in database
 */
async function recordWebhookDelivery(
  messageId: string,
  webhookUrl: string,
  success: boolean,
  attempts: number,
  statusCode: number | undefined,
  error: string | null | undefined,
  durationMs: number
): Promise<void> {
  try {
    await pool.query(
      `INSERT INTO webhook_deliveries (
        message_id,
        webhook_url,
        success,
        attempts,
        status_code,
        error,
        duration_ms,
        delivered_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        messageId,
        webhookUrl,
        success,
        attempts,
        statusCode || null,
        error || null,
        durationMs,
      ]
    );

    logger.debug('Webhook delivery recorded', {
      messageId,
      success,
      attempts,
    });
  } catch (err) {
    logger.error('Failed to record webhook delivery', {
      messageId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}

/**
 * Sleep utility for retry delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
