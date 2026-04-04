/**
 * Message Service Tests
 * Unit tests for message creation and routing
 * Author: Sheldon (Backend Infrastructure)
 * Date: April 4, 2026
 */

import {
  createMessage,
  getMessage,
  listMessages,
} from '../../../services/messageService';
import { pool } from '../../../config/database';

// Mock the database pool
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

// Mock the logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('MessageService', () => {
  let mockClient: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock database client with transaction support
    mockClient = {
      query: jest.fn(),
      release: jest.fn(),
    };

    (pool.connect as jest.Mock).mockResolvedValue(mockClient);
  });

  describe('createMessage', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';
    const messageId = 'msg-uuid-123';
    const deviceId = 'device-uuid-123';

    it('should create message with device selected', async () => {
      // Mock transaction BEGIN
      mockClient.query.mockResolvedValueOnce({});

      // Mock availability check - has devices
      mockClient.query.mockResolvedValueOnce({
        rows: [{ has_devices: true }],
      });

      // Mock device selection
      mockClient.query.mockResolvedValueOnce({
        rows: [{ device_id: deviceId }],
      });

      // Mock device name lookup
      mockClient.query.mockResolvedValueOnce({
        rows: [{ name: 'Samsung Galaxy S21' }],
      });

      // Mock message insertion
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            subscriber_id: subscriberId,
            gateway_id: deviceId,
            to_number: '+639171234567',
            body: 'Test message',
            status: 'QUEUED',
            retry_count: 0,
            ttl: 300,
            webhook_url: null,
            metadata: null,
            queued_at: new Date(),
            dispatched_at: null,
            sent_at: null,
            delivered_at: null,
            failed_at: null,
            error: null,
          },
        ],
      });

      // Mock COMMIT
      mockClient.query.mockResolvedValueOnce({});

      const result = await createMessage(subscriberId, {
        toNumber: '+639171234567',
        body: 'Test message',
      });

      expect(result.deviceSelected).toBe(true);
      expect(result.deviceId).toBe(deviceId);
      expect(result.deviceName).toBe('Samsung Galaxy S21');
      expect(result.message.id).toBe(messageId);
      expect(result.message.status).toBe('QUEUED');

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should queue message without device when no devices available', async () => {
      // Mock transaction BEGIN
      mockClient.query.mockResolvedValueOnce({});

      // Mock availability check - no devices
      mockClient.query.mockResolvedValueOnce({
        rows: [{ has_devices: false }],
      });

      // Mock message insertion without device
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            subscriber_id: subscriberId,
            gateway_id: null,
            to_number: '+639171234567',
            body: 'Test message',
            status: 'QUEUED',
            retry_count: 0,
            ttl: 300,
            webhook_url: null,
            metadata: null,
            queued_at: new Date(),
            dispatched_at: null,
            sent_at: null,
            delivered_at: null,
            failed_at: null,
            error: null,
          },
        ],
      });

      // Mock COMMIT
      mockClient.query.mockResolvedValueOnce({});

      const result = await createMessage(subscriberId, {
        toNumber: '+639171234567',
        body: 'Test message',
      });

      expect(result.deviceSelected).toBe(false);
      expect(result.deviceId).toBeNull();
      expect(result.deviceName).toBeNull();
      expect(result.message.gatewayId).toBeNull();

      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should create message with preferred carrier', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [{ has_devices: true }] });
      mockClient.query.mockResolvedValueOnce({ rows: [{ device_id: deviceId }] });
      mockClient.query.mockResolvedValueOnce({ rows: [{ name: 'Globe SIM Device' }] });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            subscriber_id: subscriberId,
            gateway_id: deviceId,
            to_number: '+639171234567',
            body: 'Test message',
            status: 'QUEUED',
            retry_count: 0,
            ttl: 300,
            webhook_url: null,
            metadata: null,
            queued_at: new Date(),
            dispatched_at: null,
            sent_at: null,
            delivered_at: null,
            failed_at: null,
            error: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({}); // COMMIT

      const result = await createMessage(subscriberId, {
        toNumber: '+639171234567',
        body: 'Test message',
        preferredCarrier: 'Globe',
      });

      expect(result.deviceSelected).toBe(true);
      expect(result.deviceName).toBe('Globe SIM Device');

      // Verify device selection was called with carrier
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT select_optimal_device($1, $2) as device_id',
        [subscriberId, 'Globe']
      );
    });

    it('should create message with webhook URL and metadata', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [{ has_devices: true }] });
      mockClient.query.mockResolvedValueOnce({ rows: [{ device_id: deviceId }] });
      mockClient.query.mockResolvedValueOnce({ rows: [{ name: 'Device' }] });
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            subscriber_id: subscriberId,
            gateway_id: deviceId,
            to_number: '+639171234567',
            body: 'Test',
            status: 'QUEUED',
            retry_count: 0,
            ttl: 600,
            webhook_url: 'https://example.com/webhook',
            metadata: { orderId: '12345' },
            queued_at: new Date(),
            dispatched_at: null,
            sent_at: null,
            delivered_at: null,
            failed_at: null,
            error: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({}); // COMMIT

      const result = await createMessage(subscriberId, {
        toNumber: '+639171234567',
        body: 'Test',
        ttl: 600,
        webhookUrl: 'https://example.com/webhook',
        metadata: { orderId: '12345' },
      });

      expect(result.message.webhookUrl).toBe('https://example.com/webhook');
      expect(result.message.metadata).toEqual({ orderId: '12345' });
      expect(result.message.ttl).toBe(600);
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [{ has_devices: true }] });
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        createMessage(subscriberId, {
          toNumber: '+639171234567',
          body: 'Test',
        })
      ).rejects.toThrow('Database error');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error if device selection fails despite availability', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [{ has_devices: true }] });
      // Device selection returns null
      mockClient.query.mockResolvedValueOnce({ rows: [{ device_id: null }] });
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        createMessage(subscriberId, {
          toNumber: '+639171234567',
          body: 'Test',
        })
      ).rejects.toThrow('Device selection failed despite availability check');

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    });
  });

  describe('getMessage', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';
    const messageId = 'msg-uuid-123';

    it('should retrieve message by ID', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            subscriber_id: subscriberId,
            gateway_id: 'device-uuid',
            to_number: '+639171234567',
            body: 'Test message',
            status: 'SENT',
            retry_count: 0,
            ttl: 300,
            webhook_url: null,
            metadata: null,
            queued_at: new Date(),
            dispatched_at: new Date(),
            sent_at: new Date(),
            delivered_at: null,
            failed_at: null,
            error: null,
          },
        ],
      });

      const result = await getMessage(messageId, subscriberId);

      expect(result.id).toBe(messageId);
      expect(result.subscriberId).toBe(subscriberId);
      expect(result.status).toBe('SENT');
    });

    it('should throw error if message not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await expect(getMessage(messageId, subscriberId)).rejects.toThrow('Message not found');
    });

    it('should throw error if message belongs to another subscriber', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            subscriber_id: 'different-subscriber-id',
            gateway_id: null,
            to_number: '+639171234567',
            body: 'Test',
            status: 'QUEUED',
            retry_count: 0,
            ttl: 300,
            webhook_url: null,
            metadata: null,
            queued_at: new Date(),
            dispatched_at: null,
            sent_at: null,
            delivered_at: null,
            failed_at: null,
            error: null,
          },
        ],
      });

      await expect(getMessage(messageId, subscriberId)).rejects.toThrow('Unauthorized');
    });
  });

  describe('listMessages', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';

    it('should list all messages for a subscriber', async () => {
      // Mock count query
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '2' }],
      });

      // Mock messages query
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'msg-1',
            subscriber_id: subscriberId,
            gateway_id: 'device-1',
            to_number: '+639171234567',
            body: 'Message 1',
            status: 'SENT',
            retry_count: 0,
            ttl: 300,
            webhook_url: null,
            metadata: null,
            queued_at: new Date('2026-04-04T10:00:00Z'),
            dispatched_at: new Date(),
            sent_at: new Date(),
            delivered_at: null,
            failed_at: null,
            error: null,
          },
          {
            id: 'msg-2',
            subscriber_id: subscriberId,
            gateway_id: 'device-2',
            to_number: '+639179876543',
            body: 'Message 2',
            status: 'QUEUED',
            retry_count: 0,
            ttl: 300,
            webhook_url: null,
            metadata: null,
            queued_at: new Date('2026-04-04T11:00:00Z'),
            dispatched_at: null,
            sent_at: null,
            delivered_at: null,
            failed_at: null,
            error: null,
          },
        ],
      });

      const result = await listMessages(subscriberId);

      expect(result.messages).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should filter messages by status', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '1' }],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'msg-1',
            subscriber_id: subscriberId,
            gateway_id: 'device-1',
            to_number: '+639171234567',
            body: 'Message 1',
            status: 'SENT',
            retry_count: 0,
            ttl: 300,
            webhook_url: null,
            metadata: null,
            queued_at: new Date(),
            dispatched_at: new Date(),
            sent_at: new Date(),
            delivered_at: null,
            failed_at: null,
            error: null,
          },
        ],
      });

      const result = await listMessages(subscriberId, { status: 'SENT' });

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].status).toBe('SENT');
      expect(result.total).toBe(1);
    });

    it('should apply pagination', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '100' }],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await listMessages(subscriberId, {
        limit: 10,
        offset: 20,
      });

      expect(result.total).toBe(100);
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
    });

    it('should handle empty result set', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '0' }],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await listMessages(subscriberId);

      expect(result.messages).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });
});
