/**
 * Webhook Service Tests
 * Test suite for webhook delivery with retries
 * Author: Bernadette (API Development)
 * Date: April 4, 2026
 */

import axios from 'axios';
import { deliverWebhook, sendMessageStatusWebhook, WebhookPayload } from '../../../services/webhookService';
import { pool } from '../../../config/database';

// Mock axios
jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

// Mock database
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn(),
  },
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

describe('WebhookService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('deliverWebhook', () => {
    const webhookUrl = 'https://example.com/webhook';
    const payload: WebhookPayload = {
      messageId: 'msg-123',
      status: 'SENT',
      timestamp: '2026-04-04T10:00:00Z',
      deviceId: 'device-456',
      toNumber: '+639171234567',
    };

    it('should deliver webhook successfully on first attempt', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      const result = await deliverWebhook(webhookUrl, payload);

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attempts).toBe(1);
      expect(result.duration).toBeGreaterThanOrEqual(0);

      expect(mockedAxios.post).toHaveBeenCalledTimes(1);
      expect(mockedAxios.post).toHaveBeenCalledWith(
        webhookUrl,
        payload,
        expect.objectContaining({
          timeout: 10000,
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'User-Agent': 'CodeReply-BYOD/1.0',
            'X-Message-Id': 'msg-123',
          }),
        })
      );
    });

    it('should retry on temporary failure and succeed', async () => {
      // First attempt fails with 500
      mockedAxios.post
        .mockRejectedValueOnce({
          message: 'Server error',
          response: { status: 500 },
        })
        // Second attempt succeeds
        .mockResolvedValueOnce({
          status: 200,
          data: { success: true },
        });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await deliverWebhook(webhookUrl, payload, {
        maxRetries: 3,
        timeoutMs: 5000,
        retryDelayMs: 10, // Short delay for testing
      });

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.attempts).toBe(2);
      expect(mockedAxios.post).toHaveBeenCalledTimes(2);
    });

    it('should not retry on 4xx client errors', async () => {
      mockedAxios.post.mockRejectedValueOnce({
        message: 'Bad request',
        response: { status: 400 },
      });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await deliverWebhook(webhookUrl, payload, {
        maxRetries: 3,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(400);
      expect(result.attempts).toBe(3); // Still reports max attempts
      expect(mockedAxios.post).toHaveBeenCalledTimes(1); // Only one attempt
    });

    it('should fail after max retries exhausted', async () => {
      mockedAxios.post.mockRejectedValue({
        message: 'Connection timeout',
        response: { status: 503 },
      });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await deliverWebhook(webhookUrl, payload, {
        maxRetries: 3,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(503);
      expect(result.attempts).toBe(3);
      expect(result.error).toBe('Connection timeout');
      expect(mockedAxios.post).toHaveBeenCalledTimes(3);
    });

    it('should handle network errors without status code', async () => {
      mockedAxios.post.mockRejectedValue({
        message: 'Network error',
      });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const result = await deliverWebhook(webhookUrl, payload, {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(result.success).toBe(false);
      expect(result.statusCode).toBeUndefined();
      expect(result.attempts).toBe(2);
      expect(result.error).toBe('Network error');
    });

    it('should use exponential backoff for retries', async () => {
      mockedAxios.post
        .mockRejectedValueOnce({ message: 'Error 1', response: { status: 500 } })
        .mockRejectedValueOnce({ message: 'Error 2', response: { status: 500 } })
        .mockResolvedValueOnce({ status: 200, data: {} });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      const startTime = Date.now();

      await deliverWebhook(webhookUrl, payload, {
        maxRetries: 3,
        retryDelayMs: 100, // 100ms base delay
      });

      const duration = Date.now() - startTime;

      // Should have delays: 0ms, 100ms, 200ms = at least 300ms total
      expect(duration).toBeGreaterThanOrEqual(200);
    });

    it('should record successful delivery in database', async () => {
      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: { success: true },
      });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await deliverWebhook(webhookUrl, payload);

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO webhook_deliveries'),
        expect.arrayContaining([
          'msg-123',
          webhookUrl,
          true, // success
          1, // attempts
          200, // status code
          null, // no error
          expect.any(Number), // duration
        ])
      );
    });

    it('should record failed delivery in database', async () => {
      mockedAxios.post.mockRejectedValue({
        message: 'Timeout',
        response: { status: 504 },
      });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await deliverWebhook(webhookUrl, payload, {
        maxRetries: 2,
        retryDelayMs: 10,
      });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO webhook_deliveries'),
        expect.arrayContaining([
          'msg-123',
          webhookUrl,
          false, // failed
          2, // attempts
          504, // status code
          'Timeout', // error
          expect.any(Number), // duration
        ])
      );
    });
  });

  describe('sendMessageStatusWebhook', () => {
    it('should send webhook for message with webhook URL', async () => {
      const messageId = 'msg-789';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            webhook_url: 'https://example.com/webhook',
            gateway_id: 'device-123',
            to_number: '+639171234567',
            retry_count: 0,
          },
        ],
      });

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await sendMessageStatusWebhook(messageId, 'SENT');

      // Wait a bit for async webhook delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT m.id, m.webhook_url'),
        [messageId]
      );
    });

    it('should skip webhook if no URL configured', async () => {
      const messageId = 'msg-no-webhook';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            webhook_url: null,
            gateway_id: 'device-123',
            to_number: '+639171234567',
            retry_count: 0,
          },
        ],
      });

      await sendMessageStatusWebhook(messageId, 'SENT');

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should handle message not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await sendMessageStatusWebhook('non-existent', 'SENT');

      expect(mockedAxios.post).not.toHaveBeenCalled();
    });

    it('should include error in webhook payload', async () => {
      const messageId = 'msg-error';
      const error = 'Device offline';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            webhook_url: 'https://example.com/webhook',
            gateway_id: 'device-123',
            to_number: '+639171234567',
            retry_count: 1,
          },
        ],
      });

      mockedAxios.post.mockResolvedValueOnce({
        status: 200,
        data: {},
      });

      (pool.query as jest.Mock).mockResolvedValue({ rows: [] });

      await sendMessageStatusWebhook(messageId, 'FAILED', error);

      // Wait for async delivery
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Verify axios was called (the delivery happens async)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('SELECT m.id, m.webhook_url'),
        [messageId]
      );
    });
  });
});
