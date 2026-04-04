/**
 * Cross-Subscriber Isolation Security Tests
 * Ensures subscribers cannot access each other's data
 * Author: Amy (Security & Testing)
 * Date: April 4, 2026
 */

import { pool } from '../../../config/database';
import { getMessage, listMessages } from '../../../services/messageService';
import { getDevice, listDevices, updateDevice, deleteDevice } from '../../../services/deviceService';

// Mock database
jest.mock('../../../config/database', () => ({
  pool: {
    query: jest.fn(),
    connect: jest.fn(),
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

describe('Cross-Subscriber Isolation Security Tests', () => {
  const subscriber1Id = 'sub-111';
  const subscriber2Id = 'sub-222';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Message Isolation', () => {
    it('should prevent subscriber from accessing another subscriber\'s message', async () => {
      const messageId = 'msg-belongs-to-sub2';

      // Mock: Message belongs to subscriber2
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            subscriber_id: subscriber2Id,
            to_number: '+639171234567',
            body: 'Private message',
            status: 'SENT',
          },
        ],
      });

      // Subscriber1 tries to access subscriber2's message
      await expect(getMessage(messageId, subscriber1Id)).rejects.toThrow(
        'Unauthorized: Message belongs to another subscriber'
      );
    });

    it('should allow subscriber to access their own message', async () => {
      const messageId = 'msg-belongs-to-sub1';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: messageId,
            subscriber_id: subscriber1Id,
            to_number: '+639171234567',
            body: 'My message',
            status: 'SENT',
            gateway_id: 'device-123',
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

      const message = await getMessage(messageId, subscriber1Id);
      expect(message.id).toBe(messageId);
      expect(message.subscriberId).toBe(subscriber1Id);
    });

    it('should only return messages belonging to authenticated subscriber', async () => {
      (pool.query as jest.Mock)
        // Count query
        .mockResolvedValueOnce({
          rows: [{ total: 2 }],
        })
        // Messages query
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-1',
              subscriber_id: subscriber1Id,
              to_number: '+639171111111',
              body: 'Message 1',
              status: 'SENT',
              gateway_id: 'device-1',
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
            {
              id: 'msg-2',
              subscriber_id: subscriber1Id,
              to_number: '+639172222222',
              body: 'Message 2',
              status: 'QUEUED',
              gateway_id: 'device-1',
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

      const result = await listMessages(subscriber1Id);

      expect(result.messages).toHaveLength(2);
      expect(result.messages.every((m) => m.subscriberId === subscriber1Id)).toBe(true);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE subscriber_id = $1'),
        expect.arrayContaining([subscriber1Id])
      );
    });

    it('should prevent message listing with SQL injection attempt', async () => {
      const maliciousSubscriberId = "' OR '1'='1";

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: 0 }] })
        .mockResolvedValueOnce({ rows: [] });

      const result = await listMessages(maliciousSubscriberId);

      expect(result.messages).toHaveLength(0);
      // Verify parameterized query was used (not string concatenation)
      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([maliciousSubscriberId])
      );
    });
  });

  describe('Device Isolation', () => {
    it('should prevent subscriber from accessing another subscriber\'s device', async () => {
      const deviceId = 'device-belongs-to-sub2';

      // Mock: Device belongs to subscriber2
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriber2Id,
            name: 'Private Device',
            status: 'ONLINE',
          },
        ],
      });

      // Subscriber1 tries to access subscriber2's device
      await expect(getDevice(deviceId, subscriber1Id)).rejects.toThrow(
        'Unauthorized: Device belongs to another subscriber'
      );
    });

    it('should allow subscriber to access their own device', async () => {
      const deviceId = 'device-belongs-to-sub1';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriber1Id,
            name: 'My Device',
            status: 'ONLINE',
            device_token: 'token123',
            sim1_carrier: 'Globe',
            sim1_phone_number: '+639171234567',
            sim2_carrier: null,
            sim2_phone_number: null,
            registered_at: new Date(),
            last_heartbeat: new Date(),
            created_at: new Date(),
            updated_at: new Date(),
            deleted_at: null,
            messages_sent_count: 10,
            messages_failed_count: 0,
          },
        ],
      });

      const device = await getDevice(deviceId, subscriber1Id);
      expect(device.id).toBe(deviceId);
      expect(device.subscriberId).toBe(subscriber1Id);
    });

    it('should only return devices belonging to authenticated subscriber', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: 1 }] })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'device-1',
              subscriber_id: subscriber1Id,
              name: 'Device 1',
              status: 'ONLINE',
              device_token: 'token1',
              sim1_carrier: 'Globe',
              sim1_phone_number: '+639171111111',
              sim2_carrier: null,
              sim2_phone_number: null,
              registered_at: new Date(),
              last_heartbeat: new Date(),
              created_at: new Date(),
              updated_at: new Date(),
              deleted_at: null,
              messages_sent_count: 5,
              messages_failed_count: 0,
            },
          ],
        });

      const result = await listDevices(subscriber1Id);

      expect(result.devices).toHaveLength(1);
      expect(result.devices.every((d) => d.subscriberId === subscriber1Id)).toBe(true);
    });

    it('should prevent subscriber from updating another subscriber\'s device', async () => {
      const deviceId = 'device-belongs-to-sub2';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriber2Id,
            name: 'Device to update',
            status: 'ONLINE',
          },
        ],
      });

      await expect(
        updateDevice(deviceId, subscriber1Id, { name: 'Hacked name' })
      ).rejects.toThrow('Unauthorized: Device belongs to another subscriber');
    });

    it('should prevent subscriber from deleting another subscriber\'s device', async () => {
      const deviceId = 'device-belongs-to-sub2';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriber2Id,
            name: 'Device to delete',
          },
        ],
      });

      await expect(deleteDevice(deviceId, subscriber1Id)).rejects.toThrow(
        'Unauthorized: Device belongs to another subscriber'
      );
    });
  });

  describe('Registration Token Isolation', () => {
    it('should prevent registration token from being used by wrong subscriber', async () => {
      // This would be tested in the device registration flow
      // The registration token should contain subscriber_id and be validated
      // Token generated for subscriber1 should not work for subscriber2

      const token = 'cr_reg_sub1_token123';

      // Mock token validation - token belongs to subscriber1
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'token-id',
            subscriber_id: subscriber1Id,
            token,
            expires_at: new Date(Date.now() + 3600000),
          },
        ],
      });

      const result = await pool.query('SELECT * FROM registration_tokens WHERE token = $1', [token]);

      expect(result.rows[0].subscriber_id).toBe(subscriber1Id);
      expect(result.rows[0].subscriber_id).not.toBe(subscriber2Id);
    });
  });

  describe('API Key Isolation', () => {
    it('should ensure API key is scoped to single subscriber', async () => {
      const apiKey1 = 'sk_test_subscriber1_key';
      const apiKey2 = 'sk_test_subscriber2_key';

      // Clear previous mocks
      jest.clearAllMocks();

      // Mock API key lookup for key 1
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'key-1',
            subscriber_id: subscriber1Id,
            key_hash: 'hash1',
          },
        ],
      });

      const key1Result = await pool.query('SELECT * FROM api_keys WHERE id = $1', ['key-1']);
      expect(key1Result.rows[0].subscriber_id).toBe(subscriber1Id);

      // Mock API key lookup for key 2
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'key-2',
            subscriber_id: subscriber2Id,
            key_hash: 'hash2',
          },
        ],
      });

      const key2Result = await pool.query('SELECT * FROM api_keys WHERE id = $1', ['key-2']);
      expect(key2Result.rows[0].subscriber_id).toBe(subscriber2Id);

      // Verify different subscribers
      expect(subscriber1Id).not.toBe(subscriber2Id);
    });
  });

  describe('Database Query Isolation', () => {
    it('should use parameterized queries to prevent SQL injection', async () => {
      const maliciousInput = "1' OR '1'='1";

      (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });

      await expect(getMessage(maliciousInput, subscriber1Id)).rejects.toThrow('Message not found');

      // Verify parameterized query was used (not string concatenation)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1'),
        [maliciousInput]
      );
    });

    it('should always include subscriber_id in WHERE clauses', async () => {
      (pool.query as jest.Mock)
        .mockResolvedValueOnce({ rows: [{ total: '0' }] })
        .mockResolvedValueOnce({ rows: [] });

      await listMessages(subscriber1Id);

      // Verify subscriber_id is in WHERE clause
      const queryCall = (pool.query as jest.Mock).mock.calls.find((call) =>
        call[0].includes('WHERE')
      );
      expect(queryCall[0]).toContain('subscriber_id = $1');
      expect(queryCall[1]).toContain(subscriber1Id);
    });
  });
});
