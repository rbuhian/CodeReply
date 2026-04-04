/**
 * Message Routes
 * API endpoints for SMS message sending and management
 * Author: Sheldon (Backend Infrastructure)
 * Date: April 4, 2026
 */

import { Router } from 'express';
import { authenticate, AuthenticatedRequest } from '../middleware/authenticate';
import { validate, ValidatedRequest } from '../middleware/validate';
import {
  SendMessageSchema,
  MessageQuerySchema,
  SendMessageInput,
  MessageQueryInput,
} from '../validation/messageSchemas';
import {
  createMessage,
  getMessage,
  listMessages,
} from '../services/messageService';
import { logger } from '../utils/logger';

const router = Router();

/**
 * POST /v1/messages/send
 * Send a new SMS message through subscriber-owned device
 *
 * Auth: Requires API key (subscriber authentication)
 *
 * Request Body:
 * - to: Recipient phone number (E.164 format, e.g., +639171234567)
 * - body: Message content (max 918 characters for 6 concatenated SMS)
 * - webhookUrl (optional): URL to receive delivery status callbacks
 * - metadata (optional): Custom JSON data (max 5KB)
 * - ttl (optional): Time to live in seconds (default: 300, min: 60, max: 86400)
 * - priority (optional): LOW, NORMAL, or HIGH (default: NORMAL)
 * - preferredCarrier (optional): Preferred SIM carrier for routing
 *
 * Response:
 * - message: Created message object with status
 * - deviceSelected: Boolean indicating if device was assigned
 * - deviceId: UUID of selected device (null if no device available)
 * - deviceName: Name of selected device (null if no device available)
 *
 * Note: If no devices are online, message is queued with status QUEUED and will
 * be dispatched when a device becomes available.
 */
router.post(
  '/send',
  authenticate,
  validate(SendMessageSchema, 'body'),
  async (req, res) => {
    const authenticatedReq = req as AuthenticatedRequest & ValidatedRequest<SendMessageInput>;
    const { subscriber } = authenticatedReq;
    const { to, body, webhookUrl, metadata, ttl, preferredCarrier } = authenticatedReq.validated;

    try {
      logger.info('Message send request', {
        subscriberId: subscriber.id,
        subscriberName: subscriber.name,
        to,
        bodyLength: body.length,
        hasWebhook: !!webhookUrl,
        preferredCarrier,
      });

      // Create message and select device
      const result = await createMessage(subscriber.id, {
        toNumber: to,
        body,
        ttl,
        webhookUrl,
        metadata,
        preferredCarrier,
      });

      // Return 202 Accepted if device was selected, 503 if queued without device
      const statusCode = result.deviceSelected ? 202 : 503;

      res.status(statusCode).json({
        success: true,
        data: {
          message: {
            id: result.message.id,
            to: result.message.toNumber,
            body: result.message.body,
            status: result.message.status,
            ttl: result.message.ttl,
            queuedAt: result.message.queuedAt.toISOString(),
          },
          device: result.deviceSelected
            ? {
                id: result.deviceId,
                name: result.deviceName,
              }
            : null,
        },
        message: result.deviceSelected
          ? 'Message queued for dispatch'
          : 'Message queued - no devices available. Will dispatch when device comes online.',
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      logger.error('Failed to send message', {
        subscriberId: subscriber.id,
        to,
        error: errorMessage,
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to queue message for sending',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /v1/messages
 * List messages for authenticated subscriber with filtering
 *
 * Auth: Requires API key (subscriber authentication)
 *
 * Query Parameters:
 * - status (optional): Filter by status (ALL, QUEUED, DISPATCHED, SENT, DELIVERED, FAILED)
 * - limit (optional): Number of results (default: 20, max: 100)
 * - offset (optional): Number of results to skip (default: 0)
 * - sortBy (optional): Sort field (queued_at, dispatched_at, status)
 * - sortOrder (optional): Sort order (asc, desc)
 *
 * Response:
 * - messages: Array of message objects
 * - total: Total number of messages matching filter
 * - limit: Results per page
 * - offset: Number of results skipped
 */
router.get(
  '/',
  authenticate,
  validate(MessageQuerySchema, 'query'),
  async (req, res) => {
    const authenticatedReq = req as AuthenticatedRequest & ValidatedRequest<MessageQueryInput>;
    const { subscriber } = authenticatedReq;
    const { status, limit, offset, sortBy, sortOrder } = authenticatedReq.validated;

    try {
      const result = await listMessages(subscriber.id, {
        status,
        limit,
        offset,
        sortBy,
        sortOrder,
      });

      res.json({
        success: true,
        data: {
          messages: result.messages.map((msg) => ({
            id: msg.id,
            to: msg.toNumber,
            body: msg.body,
            status: msg.status,
            deviceId: msg.gatewayId,
            queuedAt: msg.queuedAt.toISOString(),
            dispatchedAt: msg.dispatchedAt?.toISOString() || null,
            sentAt: msg.sentAt?.toISOString() || null,
            deliveredAt: msg.deliveredAt?.toISOString() || null,
            failedAt: msg.failedAt?.toISOString() || null,
            error: msg.error,
          })),
          total: result.total,
          limit: result.limit,
          offset: result.offset,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Failed to list messages', {
        subscriberId: subscriber.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'Failed to retrieve messages',
        timestamp: new Date().toISOString(),
      });
    }
  }
);

/**
 * GET /v1/messages/:id
 * Get details for a specific message
 *
 * Auth: Requires API key (subscriber authentication)
 * Ownership: Message must belong to authenticated subscriber
 *
 * Path Parameters:
 * - id: Message UUID
 *
 * Response:
 * - Message object with full details
 *
 * Errors:
 * - 404: Message not found
 * - 403: Message belongs to another subscriber
 */
router.get('/:id', authenticate, async (req, res) => {
  const authenticatedReq = req as AuthenticatedRequest;
  const { subscriber } = authenticatedReq;
  const { id: messageId } = req.params;

  try {
    const message = await getMessage(messageId, subscriber.id);

    res.json({
      success: true,
      data: {
        id: message.id,
        to: message.toNumber,
        body: message.body,
        status: message.status,
        retryCount: message.retryCount,
        ttl: message.ttl,
        webhookUrl: message.webhookUrl,
        metadata: message.metadata,
        deviceId: message.gatewayId,
        queuedAt: message.queuedAt.toISOString(),
        dispatchedAt: message.dispatchedAt?.toISOString() || null,
        sentAt: message.sentAt?.toISOString() || null,
        deliveredAt: message.deliveredAt?.toISOString() || null,
        failedAt: message.failedAt?.toISOString() || null,
        error: message.error,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    logger.error('Failed to get message', {
      subscriberId: subscriber.id,
      messageId,
      error: errorMessage,
    });

    // Handle specific error cases
    if (errorMessage === 'Message not found') {
      res.status(404).json({
        error: 'Not Found',
        message: 'Message not found',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    if (errorMessage.includes('Unauthorized')) {
      res.status(403).json({
        error: 'Forbidden',
        message: 'You do not have permission to access this message',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'Failed to retrieve message',
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
