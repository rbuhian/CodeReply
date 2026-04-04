/**
 * Message Service
 * Business logic for SMS message routing and dispatch
 * Author: Sheldon (Backend Infrastructure)
 * Date: April 4, 2026
 */

import { pool } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Message status enum
 */
export type MessageStatus =
  | 'QUEUED'
  | 'DISPATCHED'
  | 'SENT'
  | 'DELIVERED'
  | 'FAILED'
  | 'EXPIRED'
  | 'CANCELLED';

/**
 * Message record from database
 */
export interface Message {
  id: string;
  subscriberId: string;
  gatewayId: string | null;
  toNumber: string;
  body: string;
  status: MessageStatus;
  retryCount: number;
  ttl: number;
  webhookUrl: string | null;
  metadata: Record<string, any> | null;
  queuedAt: Date;
  dispatchedAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  failedAt: Date | null;
  error: string | null;
}

/**
 * Options for creating a new message
 */
export interface CreateMessageOptions {
  toNumber: string;
  body: string;
  ttl?: number; // Time to live in seconds (default: 300)
  webhookUrl?: string;
  metadata?: Record<string, any>;
  preferredCarrier?: string; // Preferred SIM carrier for routing
}

/**
 * Message creation response
 */
export interface CreateMessageResponse {
  message: Message;
  deviceSelected: boolean;
  deviceId: string | null;
  deviceName: string | null;
}

/**
 * Create a new message and queue it for dispatch
 * Automatically selects the optimal device for sending
 *
 * @param subscriberId - UUID of the subscriber sending the message
 * @param options - Message options (to, body, ttl, webhook, etc.)
 * @returns Created message with device selection info
 */
export async function createMessage(
  subscriberId: string,
  options: CreateMessageOptions
): Promise<CreateMessageResponse> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const { toNumber, body, ttl = 300, webhookUrl, metadata, preferredCarrier } = options;

    // Check if subscriber has any online devices
    const availabilityCheck = await client.query(
      'SELECT check_device_availability($1) as has_devices',
      [subscriberId]
    );

    const hasDevices = availabilityCheck.rows[0]?.has_devices || false;

    if (!hasDevices) {
      // No devices available - queue message without device assignment
      const result = await client.query(
        `INSERT INTO messages (
          subscriber_id,
          gateway_id,
          to_number,
          body,
          status,
          ttl,
          webhook_url,
          metadata,
          queued_at
        ) VALUES ($1, NULL, $2, $3, 'QUEUED', $4, $5, $6, NOW())
        RETURNING *`,
        [subscriberId, toNumber, body, ttl, webhookUrl || null, metadata ? JSON.stringify(metadata) : null]
      );

      await client.query('COMMIT');

      const row = result.rows[0];

      logger.warn('Message queued without device', {
        subscriberId,
        messageId: row.id,
        toNumber,
        reason: 'No online devices available',
      });

      return {
        message: mapRowToMessage(row),
        deviceSelected: false,
        deviceId: null,
        deviceName: null,
      };
    }

    // Select optimal device for dispatch
    const deviceResult = await client.query(
      'SELECT select_optimal_device($1, $2) as device_id',
      [subscriberId, preferredCarrier || null]
    );

    const selectedDeviceId = deviceResult.rows[0]?.device_id;

    if (!selectedDeviceId) {
      throw new Error('Device selection failed despite availability check');
    }

    // Get device name for response
    const deviceInfoResult = await client.query(
      'SELECT name FROM gateway_devices WHERE id = $1',
      [selectedDeviceId]
    );

    const deviceName = deviceInfoResult.rows[0]?.name || 'Unknown Device';

    // Create message with device assignment
    const result = await client.query(
      `INSERT INTO messages (
        subscriber_id,
        gateway_id,
        to_number,
        body,
        status,
        ttl,
        webhook_url,
        metadata,
        queued_at
      ) VALUES ($1, $2, $3, $4, 'QUEUED', $5, $6, $7, NOW())
      RETURNING *`,
      [subscriberId, selectedDeviceId, toNumber, body, ttl, webhookUrl || null, metadata ? JSON.stringify(metadata) : null]
    );

    await client.query('COMMIT');

    const row = result.rows[0];

    logger.info('Message created and queued for dispatch', {
      subscriberId,
      messageId: row.id,
      deviceId: selectedDeviceId,
      deviceName,
      toNumber,
      preferredCarrier,
    });

    return {
      message: mapRowToMessage(row),
      deviceSelected: true,
      deviceId: selectedDeviceId,
      deviceName,
    };
  } catch (error) {
    await client.query('ROLLBACK');

    logger.error('Failed to create message', {
      subscriberId,
      toNumber: options.toNumber,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get message by ID
 *
 * @param messageId - UUID of the message
 * @param subscriberId - UUID of the subscriber (for ownership validation)
 * @returns Message details
 */
export async function getMessage(
  messageId: string,
  subscriberId: string
): Promise<Message> {
  try {
    const result = await pool.query(
      `SELECT * FROM messages
       WHERE id = $1`,
      [messageId]
    );

    if (result.rows.length === 0) {
      throw new Error('Message not found');
    }

    const row = result.rows[0];

    // Validate ownership
    if (row.subscriber_id !== subscriberId) {
      throw new Error('Unauthorized: Message belongs to another subscriber');
    }

    logger.info('Message retrieved', {
      messageId,
      subscriberId,
      status: row.status,
    });

    return mapRowToMessage(row);
  } catch (error) {
    logger.error('Failed to get message', {
      messageId,
      subscriberId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * List messages for a subscriber with filtering and pagination
 */
export interface ListMessagesOptions {
  status?: MessageStatus | 'ALL';
  limit?: number;
  offset?: number;
  sortBy?: 'queued_at' | 'dispatched_at' | 'sent_at' | 'delivered_at' | 'status';
  sortOrder?: 'asc' | 'desc';
}

export interface ListMessagesResponse {
  messages: Message[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * List messages for a subscriber
 *
 * @param subscriberId - UUID of the subscriber
 * @param options - Query options for filtering and pagination
 * @returns List of messages with pagination info
 */
export async function listMessages(
  subscriberId: string,
  options: ListMessagesOptions = {}
): Promise<ListMessagesResponse> {
  try {
    const {
      status = 'ALL',
      limit = 20,
      offset = 0,
      sortBy = 'queued_at',
      sortOrder = 'desc',
    } = options;

    // Build WHERE clause
    let whereClause = 'WHERE subscriber_id = $1';
    const params: any[] = [subscriberId];

    if (status !== 'ALL') {
      params.push(status);
      whereClause += ` AND status = $${params.length}`;
    }

    // Get total count
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM messages ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    // Get messages with pagination
    const validSortColumns = ['queued_at', 'dispatched_at', 'sent_at', 'delivered_at', 'status'];
    const sortColumn = validSortColumns.includes(sortBy) ? sortBy : 'queued_at';
    const validSortOrder = sortOrder === 'asc' ? 'ASC' : 'DESC';

    params.push(limit, offset);
    const messagesResult = await pool.query(
      `SELECT * FROM messages
       ${whereClause}
       ORDER BY ${sortColumn} ${validSortOrder}
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const messages: Message[] = messagesResult.rows.map(mapRowToMessage);

    logger.info('Messages listed', {
      subscriberId,
      total,
      returned: messages.length,
      filters: { status, limit, offset },
    });

    return {
      messages,
      total,
      limit,
      offset,
    };
  } catch (error) {
    logger.error('Failed to list messages', {
      subscriberId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Map database row to Message interface
 */
function mapRowToMessage(row: any): Message {
  return {
    id: row.id,
    subscriberId: row.subscriber_id,
    gatewayId: row.gateway_id,
    toNumber: row.to_number,
    body: row.body,
    status: row.status,
    retryCount: row.retry_count,
    ttl: row.ttl,
    webhookUrl: row.webhook_url,
    metadata: row.metadata,
    queuedAt: row.queued_at,
    dispatchedAt: row.dispatched_at,
    sentAt: row.sent_at,
    deliveredAt: row.delivered_at,
    failedAt: row.failed_at,
    error: row.error,
  };
}
