/**
 * Retry Service Tests
 * Test suite for message retry logic with exponential backoff
 * Author: Bernadette (API Development)
 * Date: April 4, 2026
 */

import {
  shouldRetryMessage,
  retryMessage,
  retryAllFailedMessages,
  markMessageFailed,
} from '../../../services/retryService';
import { pool } from '../../../config/database';
import * as webhookService from '../../../services/webhookService';

// Mock database
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

// Mock webhook service
jest.mock('../../../services/webhookService', () => ({
  sendMessageStatusWebhook: jest.fn(),
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('RetryService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('shouldRetryMessage', () => {
    it('should return true for FAILED message under retry limit', async () => {
      const messageId = 'msg-123';
      const queuedAt = new Date(Date.now() - 60000); // 1 minute ago

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            status: 'FAILED',
            retry_count: 1,
            queued_at: queuedAt,
            ttl: 3600, // 1 hour TTL
          },
        ],
      });

      const result = await shouldRetryMessage(messageId);

      expect(result).toBe(true);
    });

    it('should return false for message that exceeded max retries', async () => {
      const messageId = 'msg-maxed';
      const queuedAt = new Date(Date.now() - 60000);

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            status: 'FAILED',
            retry_count: 3, // Max retries reached
            queued_at: queuedAt,
            ttl: 3600,
          },
        ],
      });

      const result = await shouldRetryMessage(messageId);

      expect(result).toBe(false);
    });

    it('should return false for non-FAILED messages', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'msg-sent',
            status: 'SENT',
            retry_count: 0,
            queued_at: new Date(),
            ttl: 300,
          },
        ],
      });

      const result = await shouldRetryMessage('msg-sent');

      expect(result).toBe(false);
    });

    it('should mark message as EXPIRED if TTL exceeded', async () => {
      const messageId = 'msg-expired';
      const queuedAt = new Date(Date.now() - 7200000); // 2 hours ago

      (pool.query as jest.Mock)
        // First query: get message
        .mockResolvedValueOnce({
          rows: [
            {
              id: messageId,
              status: 'FAILED',
              retry_count: 1,
              queued_at: queuedAt,
              ttl: 3600, // 1 hour TTL (expired)
            },
          ],
        })
        // Second query: update to EXPIRED
        .mockResolvedValueOnce({ rows: [] });

      const result = await shouldRetryMessage(messageId);

      expect(result).toBe(false);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET status = 'EXPIRED'"),
        [messageId]
      );
      expect(webhookService.sendMessageStatusWebhook).toHaveBeenCalledWith(
        messageId,
        'EXPIRED',
        'Message expired before retry'
      );
    });

    it('should return false for non-existent message', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await shouldRetryMessage('non-existent');

      expect(result).toBe(false);
    });
  });

  describe('retryMessage', () => {
    const mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    beforeEach(() => {
      (pool.connect as jest.Mock).mockResolvedValue(mockClient);
      mockClient.query.mockClear();
      mockClient.release.mockClear();
    });

    it('should retry FAILED message with available device', async () => {
      const messageId = 'msg-retry';
      const subscriberId = 'sub-123';
      const deviceId = 'device-456';

      mockClient.query
        // BEGIN
        .mockResolvedValueOnce({})
        // Get message
        .mockResolvedValueOnce({
          rows: [
            {
              id: messageId,
              subscriber_id: subscriberId,
              status: 'FAILED',
              retry_count: 1,
              to_number: '+639171234567',
              body: 'Test message',
            },
          ],
        })
        // Select device
        .mockResolvedValueOnce({
          rows: [{ device_id: deviceId }],
        })
        // Update message
        .mockResolvedValueOnce({})
        // COMMIT
        .mockResolvedValueOnce({});

      const result = await retryMessage(messageId);

      expect(result.retried).toBe(true);
      expect(result.newStatus).toBe('QUEUED');
      expect(result.retryCount).toBe(2);
      expect(result.messageId).toBe(messageId);

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining("SET"),
        [messageId, 2, deviceId]
      );

      expect(webhookService.sendMessageStatusWebhook).toHaveBeenCalledWith(
        messageId,
        'QUEUED',
        undefined
      );

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should queue message without device if none available', async () => {
      const messageId = 'msg-no-device';
      const subscriberId = 'sub-123';

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: messageId,
              subscriber_id: subscriberId,
              status: 'FAILED',
              retry_count: 0,
              to_number: '+639171234567',
              body: 'Test',
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [{ device_id: null }], // No device available
        })
        .mockResolvedValueOnce({}) // UPDATE
        .mockResolvedValueOnce({}); // COMMIT

      const result = await retryMessage(messageId);

      expect(result.retried).toBe(true);
      expect(result.newStatus).toBe('QUEUED');
      expect(result.retryCount).toBe(1);
      expect(result.reason).toBe('No devices available, queued for later');

      expect(webhookService.sendMessageStatusWebhook).toHaveBeenCalledWith(
        messageId,
        'QUEUED',
        'Retry queued - no devices available'
      );
    });

    it('should not retry message that is not FAILED', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-sent',
              subscriber_id: 'sub-123',
              status: 'SENT',
              retry_count: 0,
              to_number: '+639171234567',
              body: 'Test',
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await retryMessage('msg-sent');

      expect(result.retried).toBe(false);
      expect(result.newStatus).toBe('SENT');
      expect(result.reason).toContain('not FAILED');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });

    it('should not retry if max retries exceeded', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-maxed',
              subscriber_id: 'sub-123',
              status: 'FAILED',
              retry_count: 3,
              to_number: '+639171234567',
              body: 'Test',
            },
          ],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      const result = await retryMessage('msg-maxed');

      expect(result.retried).toBe(false);
      expect(result.reason).toBe('Maximum retries exceeded');
    });

    it('should rollback on error', async () => {
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockRejectedValueOnce(new Error('Database error'));

      await expect(retryMessage('msg-error')).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('retryAllFailedMessages', () => {
    it('should retry all eligible failed messages', async () => {
      const now = Date.now();
      const queuedAt = new Date(now - 120000); // 2 minutes ago

      (pool.query as jest.Mock)
        // Find failed messages
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              retry_count: 0,
              queued_at: queuedAt,
              ttl: 3600,
            },
            {
              id: 'msg-2',
              retry_count: 1,
              queued_at: queuedAt,
              ttl: 3600,
            },
          ],
        })
        // shouldRetryMessage calls for msg-1
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              status: 'FAILED',
              retry_count: 0,
              queued_at: queuedAt,
              ttl: 3600,
            },
          ],
        })
        // shouldRetryMessage calls for msg-2
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-2',
              status: 'FAILED',
              retry_count: 1,
              queued_at: queuedAt,
              ttl: 3600,
            },
          ],
        });

      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      // Mock retryMessage success for both
      mockClient.query
        // msg-1
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              subscriber_id: 'sub-1',
              status: 'FAILED',
              retry_count: 0,
              to_number: '+639171234567',
              body: 'Test 1',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ device_id: 'dev-1' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}) // COMMIT
        // msg-2
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-2',
              subscriber_id: 'sub-2',
              status: 'FAILED',
              retry_count: 1,
              to_number: '+639179999999',
              body: 'Test 2',
            },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ device_id: 'dev-2' }] })
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({}); // COMMIT

      const results = await retryAllFailedMessages();

      expect(results).toHaveLength(2);
      expect(results[0].retried).toBe(true);
      expect(results[1].retried).toBe(true);
    });

    it('should skip messages not ready for retry', async () => {
      const recentFailure = new Date(Date.now() - 10000); // 10 seconds ago

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-recent',
              retry_count: 0,
              queued_at: recentFailure,
              ttl: 3600,
            },
          ],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-recent',
              status: 'FAILED',
              retry_count: 0,
              queued_at: recentFailure,
              ttl: 3600,
            },
          ],
        });

      const results = await retryAllFailedMessages();

      expect(results).toHaveLength(0);
    });

    it('should handle empty failed messages list', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const results = await retryAllFailedMessages();

      expect(results).toHaveLength(0);
    });
  });

  describe('markMessageFailed', () => {
    it('should mark message as FAILED and send webhook', async () => {
      const messageId = 'msg-fail';
      const error = 'Device offline';

      (pool.query as jest.Mock)
        // Update message to FAILED
        .mockResolvedValueOnce({})
        // shouldRetryMessage check
        .mockResolvedValueOnce({
          rows: [
            {
              id: messageId,
              status: 'FAILED',
              retry_count: 0,
              queued_at: new Date(),
              ttl: 300,
            },
          ],
        });

      await markMessageFailed(messageId, error);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining("SET"),
        [messageId, error]
      );

      expect(webhookService.sendMessageStatusWebhook).toHaveBeenCalledWith(
        messageId,
        'FAILED',
        error
      );
    });

    it('should check if message should be retried after marking failed', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-retry-eligible',
              status: 'FAILED',
              retry_count: 1,
              queued_at: new Date(),
              ttl: 600,
            },
          ],
        });

      await markMessageFailed('msg-retry-eligible', 'Temporary error');

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        ['msg-retry-eligible']
      );
    });
  });
});
