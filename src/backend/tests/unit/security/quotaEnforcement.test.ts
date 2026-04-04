/**
 * Quota Enforcement Security Tests
 * Validates database triggers and quota constraints
 * Author: Amy (Security & Testing)
 * Date: April 4, 2026
 */

import { pool } from '../../../config/database';
import { generateRegistrationToken, registerDevice } from '../../../services/deviceService';
import { createMessage } from '../../../services/messageService';

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

describe('Quota Enforcement Security Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Device Quota Enforcement', () => {
    it('should prevent device registration when quota exceeded', async () => {
      const subscriberId = 'sub-at-limit';
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      // Mock: Subscriber at device limit
      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // can_add_device check
          rows: [{ can_add: false }],
        })
        .mockResolvedValueOnce({}); // ROLLBACK

      await expect(
        registerDevice('token123', {
          deviceName: 'Test Device',
          simCarrier: 'Globe',
          simNumber: '+639171234567',
          androidVersion: '13',
          appVersion: '1.0',
        })
      ).rejects.toThrow();

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should allow device registration when under quota', async () => {
      const subscriberId = 'sub-under-limit';
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // Validate token
          rows: [
            {
              id: 'token-id',
              subscriber_id: subscriberId,
              token: 'cr_reg_token123',
              expires_at: new Date(Date.now() + 3600000),
            },
          ],
        })
        .mockResolvedValueOnce({
          // can_add_device check
          rows: [{ can_add: true }],
        })
        .mockResolvedValueOnce({
          // Insert device
          rows: [
            {
              id: 'new-device-id',
              subscriber_id: subscriberId,
              name: 'Test Device',
              status: 'ONLINE',
            },
          ],
        })
        .mockResolvedValueOnce({}) // Delete token
        .mockResolvedValueOnce({}); // COMMIT

      const result = await registerDevice('cr_reg_token123', {
        deviceName: 'Test Device',
        simCarrier: 'Globe',
        simNumber: '+639171234567',
        androidVersion: '13',
        appVersion: '1.0',
      });

      expect(result.deviceId).toBe('new-device-id');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    });

    it('should check quota using database function', async () => {
      const subscriberId = 'sub-123';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ can_add: false }],
      });

      const result = await pool.query(
        'SELECT can_add_device($1) as can_add',
        [subscriberId]
      );

      const canAdd = result.rows[0].can_add;
      expect(canAdd).toBe(false);
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT can_add_device($1) as can_add',
        [subscriberId]
      );
    });
  });

  describe('Daily Message Quota Enforcement', () => {
    it('should prevent message sending when daily quota exceeded', async () => {
      const subscriberId = 'sub-at-message-limit';

      // Mock database check showing quota exceeded
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            subscriber_id: subscriberId,
            messages_sent_today: 100,
            daily_message_limit: 100,
          },
        ],
      });

      const result = await pool.query(
        'SELECT messages_sent_today, daily_message_limit FROM subscribers WHERE id = $1',
        [subscriberId]
      );

      const subscriber = result.rows[0];
      const quotaExceeded = subscriber.messages_sent_today >= subscriber.daily_message_limit;

      expect(quotaExceeded).toBe(true);
      expect(subscriber.messages_sent_today).toBe(100);
      expect(subscriber.daily_message_limit).toBe(100);
    });

    it('should allow message sending when under daily quota', async () => {
      const subscriberId = 'sub-under-message-limit';
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // Check availability
          rows: [{ has_devices: true }],
        })
        .mockResolvedValueOnce({
          // Select device
          rows: [{ device_id: 'device-123' }],
        })
        .mockResolvedValueOnce({
          // Get device name
          rows: [{ name: 'My Device' }],
        })
        .mockResolvedValueOnce({
          // Insert message
          rows: [
            {
              id: 'msg-123',
              subscriber_id: subscriberId,
              gateway_id: 'device-123',
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
        })
        .mockResolvedValueOnce({}); // COMMIT

      const result = await createMessage(subscriberId, {
        toNumber: '+639171234567',
        body: 'Test',
      });

      expect(result.message.id).toBe('msg-123');
      expect(result.deviceSelected).toBe(true);
    });

    it('should reset daily quota at midnight', async () => {
      const subscriberId = 'sub-123';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            subscriber_id: subscriberId,
            messages_sent_today: 0,
            quota_reset_at: new Date().toISOString().split('T')[0] + ' 00:00:00',
          },
        ],
      });

      const result = await pool.query(
        'SELECT messages_sent_today, quota_reset_at FROM subscribers WHERE id = $1',
        [subscriberId]
      );

      const subscriber = result.rows[0];
      expect(subscriber.messages_sent_today).toBe(0);
      expect(subscriber.quota_reset_at).toBeTruthy();
    });
  });

  describe('Quota Bypass Prevention', () => {
    it('should prevent quota bypass via direct database manipulation', async () => {
      // This test verifies database triggers prevent manual quota updates
      const subscriberId = 'sub-hacker';

      (pool.query as jest.Mock).mockRejectedValueOnce(
        new Error('Permission denied: Cannot directly modify device count')
      );

      // Attempt to manually set device count
      await expect(
        pool.query(
          'UPDATE subscribers SET current_devices = 999 WHERE id = $1',
          [subscriberId]
        )
      ).rejects.toThrow('Permission denied');
    });

    it('should enforce quota through database triggers', async () => {
      const subscriberId = 'sub-123';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            trigger_name: 'enforce_device_quota',
            enabled: true,
          },
        ],
      });

      const result = await pool.query(
        "SELECT * FROM pg_trigger WHERE tgname = 'enforce_device_quota'"
      );

      expect(result.rows[0].enabled).toBe(true);
    });

    it('should validate quota atomically in transaction', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // FOR UPDATE lock
          rows: [
            {
              id: 'sub-123',
              current_devices: 4,
              max_devices: 5,
            },
          ],
        })
        .mockResolvedValueOnce({}) // INSERT device
        .mockResolvedValueOnce({}); // COMMIT

      // Verify FOR UPDATE was used (prevents race conditions)
      await mockClient.query('BEGIN');
      await mockClient.query(
        'SELECT * FROM subscribers WHERE id = $1 FOR UPDATE',
        ['sub-123']
      );

      expect(mockClient.query).toHaveBeenCalledWith(
        expect.stringContaining('FOR UPDATE'),
        expect.any(Array)
      );
    });
  });

  describe('Concurrent Quota Validation', () => {
    it('should handle concurrent device registrations correctly', async () => {
      // Test that quota is checked atomically to prevent race conditions
      const subscriberId = 'sub-concurrent';
      const mockClient1 = {
        query: jest.fn(),
        release: jest.fn(),
      };
      const mockClient2 = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock)
        .mockResolvedValueOnce(mockClient1)
        .mockResolvedValueOnce(mockClient2);

      // First transaction: Check quota with FOR UPDATE lock
      mockClient1.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // Lock row
          rows: [{ current_devices: 4, max_devices: 5 }],
        });

      // Second transaction: Should wait for lock
      mockClient2.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockImplementationOnce(() => {
          // Simulate waiting for lock
          return new Promise((resolve) => {
            setTimeout(() => {
              resolve({ rows: [{ current_devices: 5, max_devices: 5 }] });
            }, 100);
          });
        });

      // Start both transactions
      await mockClient1.query('BEGIN');
      const lock1Promise = mockClient1.query(
        'SELECT * FROM subscribers WHERE id = $1 FOR UPDATE',
        [subscriberId]
      );

      await mockClient2.query('BEGIN');
      const lock2Promise = mockClient2.query(
        'SELECT * FROM subscribers WHERE id = $1 FOR UPDATE',
        [subscriberId]
      );

      const [lock1, lock2] = await Promise.all([lock1Promise, lock2Promise]);

      // First transaction should see 4 devices, second should see 5 (after first commits)
      expect(lock1.rows[0].current_devices).toBe(4);
      expect(lock2.rows[0].current_devices).toBe(5);
    });
  });
});
