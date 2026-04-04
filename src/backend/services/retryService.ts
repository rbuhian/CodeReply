/**
 * Retry Service
 * Handles automatic retry of failed message sends with exponential backoff
 * Author: Bernadette (API Development)
 * Date: April 4, 2026
 */

import { pool } from '../config/database';
import { logger } from '../utils/logger';
import { sendMessageStatusWebhook } from './webhookService';

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  retryDelays: number[]; // Delays in seconds for each retry attempt
}

/**
 * Default retry configuration
 * Retry delays: 30s, 60s, 120s (exponential backoff)
 */
const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  retryDelays: [30, 60, 120],
};

/**
 * Message retry result
 */
export interface RetryResult {
  messageId: string;
  retried: boolean;
  newStatus: string;
  retryCount: number;
  reason?: string;
}

/**
 * Check if a message should be retried
 *
 * @param messageId - UUID of the message
 * @returns Whether the message should be retried
 */
export async function shouldRetryMessage(messageId: string): Promise<boolean> {
  try {
    const result = await pool.query(
      `SELECT
        id,
        status,
        retry_count,
        queued_at,
        ttl
       FROM messages
       WHERE id = $1`,
      [messageId]
    );

    if (result.rows.length === 0) {
      logger.warn('Message not found for retry check', { messageId });
      return false;
    }

    const message = result.rows[0];

    // Only retry FAILED messages
    if (message.status !== 'FAILED') {
      return false;
    }

    // Check if retry limit exceeded
    if (message.retry_count >= DEFAULT_RETRY_CONFIG.maxRetries) {
      logger.info('Message exceeded max retries', {
        messageId,
        retryCount: message.retry_count,
        maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
      });
      return false;
    }

    // Check if message has expired (TTL)
    const queuedAt = new Date(message.queued_at);
    const expiresAt = new Date(queuedAt.getTime() + message.ttl * 1000);
    const now = new Date();

    if (now > expiresAt) {
      logger.info('Message expired, not retrying', {
        messageId,
        queuedAt: queuedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
        ttl: message.ttl,
      });

      // Update status to EXPIRED
      await pool.query(
        `UPDATE messages
         SET status = 'EXPIRED', error = 'Message expired before retry'
         WHERE id = $1`,
        [messageId]
      );

      // Send webhook notification
      await sendMessageStatusWebhook(messageId, 'EXPIRED', 'Message expired before retry');

      return false;
    }

    return true;
  } catch (error) {
    logger.error('Failed to check if message should retry', {
      messageId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return false;
  }
}

/**
 * Retry a failed message
 *
 * @param messageId - UUID of the message to retry
 * @returns Retry result with updated status
 */
export async function retryMessage(messageId: string): Promise<RetryResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Get message details
    const messageResult = await client.query(
      `SELECT
        id,
        subscriber_id,
        status,
        retry_count,
        to_number,
        body
       FROM messages
       WHERE id = $1
       FOR UPDATE`,
      [messageId]
    );

    if (messageResult.rows.length === 0) {
      throw new Error('Message not found');
    }

    const message = messageResult.rows[0];

    // Verify message should be retried
    if (message.status !== 'FAILED') {
      await client.query('ROLLBACK');
      return {
        messageId,
        retried: false,
        newStatus: message.status,
        retryCount: message.retry_count,
        reason: `Message status is ${message.status}, not FAILED`,
      };
    }

    if (message.retry_count >= DEFAULT_RETRY_CONFIG.maxRetries) {
      await client.query('ROLLBACK');
      return {
        messageId,
        retried: false,
        newStatus: 'FAILED',
        retryCount: message.retry_count,
        reason: 'Maximum retries exceeded',
      };
    }

    // Increment retry count
    const newRetryCount = message.retry_count + 1;

    // Try to select a new device for retry
    const deviceResult = await client.query(
      'SELECT select_optimal_device($1, NULL) as device_id',
      [message.subscriber_id]
    );

    const selectedDeviceId = deviceResult.rows[0]?.device_id;

    if (!selectedDeviceId) {
      // No device available, keep as QUEUED
      await client.query(
        `UPDATE messages
         SET
           status = 'QUEUED',
           retry_count = $2,
           error = 'Retry queued - no devices available',
           gateway_id = NULL
         WHERE id = $1`,
        [messageId, newRetryCount]
      );

      await client.query('COMMIT');

      logger.info('Message retry queued - no devices available', {
        messageId,
        retryCount: newRetryCount,
        toNumber: message.to_number,
      });

      // Send webhook notification
      await sendMessageStatusWebhook(
        messageId,
        'QUEUED',
        'Retry queued - no devices available'
      );

      return {
        messageId,
        retried: true,
        newStatus: 'QUEUED',
        retryCount: newRetryCount,
        reason: 'No devices available, queued for later',
      };
    }

    // Device found, queue for dispatch
    await client.query(
      `UPDATE messages
       SET
         status = 'QUEUED',
         retry_count = $2,
         gateway_id = $3,
         error = NULL,
         failed_at = NULL
       WHERE id = $1`,
      [messageId, newRetryCount, selectedDeviceId]
    );

    await client.query('COMMIT');

    logger.info('Message retry successful', {
      messageId,
      retryCount: newRetryCount,
      deviceId: selectedDeviceId,
      toNumber: message.to_number,
    });

    // Send webhook notification
    await sendMessageStatusWebhook(messageId, 'QUEUED', undefined);

    return {
      messageId,
      retried: true,
      newStatus: 'QUEUED',
      retryCount: newRetryCount,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    logger.error('Failed to retry message', {
      messageId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Find and retry all eligible failed messages
 *
 * @returns Array of retry results
 */
export async function retryAllFailedMessages(): Promise<RetryResult[]> {
  try {
    // Find all FAILED messages that can be retried
    const result = await pool.query(
      `SELECT id, retry_count, queued_at, ttl
       FROM messages
       WHERE status = 'FAILED'
         AND retry_count < $1
       ORDER BY queued_at ASC
       LIMIT 100`,
      [DEFAULT_RETRY_CONFIG.maxRetries]
    );

    const messages = result.rows;

    logger.info('Found failed messages for retry', {
      count: messages.length,
      maxRetries: DEFAULT_RETRY_CONFIG.maxRetries,
    });

    const results: RetryResult[] = [];

    for (const message of messages) {
      // Check if message is still eligible (not expired)
      const shouldRetry = await shouldRetryMessage(message.id);

      if (!shouldRetry) {
        continue;
      }

      // Calculate delay based on retry count
      const retryDelaySeconds =
        DEFAULT_RETRY_CONFIG.retryDelays[message.retry_count] || 120;

      const queuedAt = new Date(message.queued_at);
      const nextRetryAt = new Date(queuedAt.getTime() + retryDelaySeconds * 1000);
      const now = new Date();

      // Check if enough time has passed since last failure
      if (now < nextRetryAt) {
        logger.debug('Message not ready for retry yet', {
          messageId: message.id,
          retryCount: message.retry_count,
          nextRetryAt: nextRetryAt.toISOString(),
        });
        continue;
      }

      // Retry the message
      try {
        const retryResult = await retryMessage(message.id);
        results.push(retryResult);
      } catch (error) {
        logger.error('Error retrying message', {
          messageId: message.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });

        results.push({
          messageId: message.id,
          retried: false,
          newStatus: 'FAILED',
          retryCount: message.retry_count,
          reason: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    logger.info('Completed retry batch', {
      total: messages.length,
      retried: results.filter((r) => r.retried).length,
      failed: results.filter((r) => !r.retried).length,
    });

    return results;
  } catch (error) {
    logger.error('Failed to retry failed messages', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    return [];
  }
}

/**
 * Mark a message as failed
 *
 * @param messageId - UUID of the message
 * @param error - Error message
 */
export async function markMessageFailed(
  messageId: string,
  error: string
): Promise<void> {
  try {
    await pool.query(
      `UPDATE messages
       SET
         status = 'FAILED',
         error = $2,
         failed_at = NOW()
       WHERE id = $1`,
      [messageId, error]
    );

    logger.warn('Message marked as failed', {
      messageId,
      error,
    });

    // Send webhook notification
    await sendMessageStatusWebhook(messageId, 'FAILED', error);

    // Check if message should be retried automatically
    const shouldRetry = await shouldRetryMessage(messageId);

    if (shouldRetry) {
      logger.info('Message will be retried automatically', { messageId });
    }
  } catch (err) {
    logger.error('Failed to mark message as failed', {
      messageId,
      error: err instanceof Error ? err.message : 'Unknown error',
    });
  }
}
