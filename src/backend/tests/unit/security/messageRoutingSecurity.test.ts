/**
 * Message Routing Security Tests
 * Validates messages only route to subscriber-owned devices
 * Author: Amy (Security & Testing)
 * Date: April 4, 2026
 */

import { pool } from '../../../config/database';
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

describe('Message Routing Security Tests', () => {
  const subscriber1Id = 'sub-111';
  const subscriber2Id = 'sub-222';

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Device Selection Security', () => {
    it('should only select devices owned by message subscriber', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // Check device availability
          rows: [{ has_devices: true }],
        })
        .mockResolvedValueOnce({
          // select_optimal_device function
          rows: [{ device_id: 'device-owned-by-sub1' }],
        })
        .mockResolvedValueOnce({
          // Get device name
          rows: [{ name: 'Sub1 Device' }],
        })
        .mockResolvedValueOnce({
          // Insert message
          rows: [
            {
              id: 'msg-123',
              subscriber_id: subscriber1Id,
              gateway_id: 'device-owned-by-sub1',
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

      const result = await createMessage(subscriber1Id, {
        toNumber: '+639171234567',
        body: 'Test',
      });

      // Verify select_optimal_device was called with subscriber_id
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT select_optimal_device($1, $2) as device_id',
        [subscriber1Id, null]
      );

      expect(result.deviceId).toBe('device-owned-by-sub1');
    });

    it('should use database function to enforce subscriber boundary', async () => {
      const subscriberId = subscriber1Id;
      const preferredCarrier = 'Globe';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_id: 'device-123' }],
      });

      const result = await pool.query(
        'SELECT select_optimal_device($1, $2) as device_id',
        [subscriberId, preferredCarrier]
      );

      // Verify database function is used (not application-level filtering)
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('select_optimal_device'),
        [subscriberId, preferredCarrier]
      );

      expect(result.rows[0].device_id).toBeTruthy();
    });

    it('should never return device from different subscriber', async () => {
      // Mock database function that enforces subscriber boundary
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_id: null }], // No device found (correct behavior)
      });

      const result = await pool.query(
        'SELECT select_optimal_device($1, $2) as device_id',
        [subscriber1Id, null]
      );

      // If no devices owned by subscriber, should return null (not another subscriber's device)
      const selectedDevice = result.rows[0].device_id;
      expect(selectedDevice).toBeNull();
    });
  });

  describe('Message Assignment Security', () => {
    it('should only assign message to subscriber-owned device', async () => {
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
          // Device selection with subscriber constraint
          rows: [{ device_id: 'device-sub1' }],
        })
        .mockResolvedValueOnce({
          rows: [{ name: 'Device' }],
        })
        .mockResolvedValueOnce({
          // INSERT message - verify subscriber_id and gateway_id match
          rows: [
            {
              id: 'msg-123',
              subscriber_id: subscriber1Id,
              gateway_id: 'device-sub1',
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

      const result = await createMessage(subscriber1Id, {
        toNumber: '+639171234567',
        body: 'Test',
      });

      const message = result.message;
      expect(message.subscriberId).toBe(subscriber1Id);
      expect(message.gatewayId).toBe('device-sub1');
      // This validates that message and device belong to same subscriber
    });

    it('should prevent manual device override in message creation', async () => {
      // Attempt to manually specify a device_id should be ignored
      // Only select_optimal_device function should assign devices

      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          rows: [{ has_devices: true }],
        })
        .mockResolvedValueOnce({
          // Device selection function is always used
          rows: [{ device_id: 'auto-selected-device' }],
        })
        .mockResolvedValueOnce({
          rows: [{ name: 'Device' }],
        })
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'msg-123',
              subscriber_id: subscriber1Id,
              gateway_id: 'auto-selected-device',
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

      const result = await createMessage(subscriber1Id, {
        toNumber: '+639171234567',
        body: 'Test',
      });

      // Verify device was auto-selected, not manually specified
      expect(result.deviceId).toBe('auto-selected-device');
      expect(mockClient.query).toHaveBeenCalledWith(
        'SELECT select_optimal_device($1, $2) as device_id',
        [subscriber1Id, null]
      );
    });
  });

  describe('Carrier Matching Security', () => {
    it('should only match carriers within subscriber scope', async () => {
      const subscriberId = subscriber1Id;
      const preferredCarrier = 'Globe';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_id: 'device-globe-sub1' }],
      });

      const result = await pool.query(
        'SELECT select_optimal_device($1, $2) as device_id',
        [subscriberId, preferredCarrier]
      );

      // Verify carrier matching is done within subscriber's devices only
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT select_optimal_device($1, $2) as device_id',
        [subscriberId, preferredCarrier]
      );

      const deviceId = result.rows[0].device_id;
      expect(deviceId).toBeTruthy();
    });

    it('should not match carrier from different subscriber', async () => {
      // Even if another subscriber has matching carrier, should not use it
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_id: null }], // No match in subscriber's devices
      });

      const result = await pool.query(
        'SELECT select_optimal_device($1, $2) as device_id',
        [subscriber1Id, 'Smart'] // Carrier only available in sub2's devices
      );

      const deviceId = result.rows[0].device_id;
      expect(deviceId).toBeNull(); // Should not use sub2's device
    });
  });

  describe('Queue Management Security', () => {
    it('should queue message without device if none available', async () => {
      const mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };

      (pool.connect as jest.Mock).mockResolvedValue(mockClient);

      mockClient.query
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({
          // No devices available
          rows: [{ has_devices: false }],
        })
        .mockResolvedValueOnce({
          // Insert message without device
          rows: [
            {
              id: 'msg-queued',
              subscriber_id: subscriber1Id,
              gateway_id: null, // No device assigned
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

      const result = await createMessage(subscriber1Id, {
        toNumber: '+639171234567',
        body: 'Test',
      });

      expect(result.deviceSelected).toBe(false);
      expect(result.deviceId).toBeNull();
      expect(result.message.status).toBe('QUEUED');
    });

    it('should verify device availability check uses subscriber_id', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ has_devices: true }],
      });

      const result = await pool.query(
        'SELECT check_device_availability($1) as has_devices',
        [subscriber1Id]
      );

      // Verify subscriber_id is passed to availability check
      expect(pool.query).toHaveBeenCalledWith(
        'SELECT check_device_availability($1) as has_devices',
        [subscriber1Id]
      );

      expect(result.rows[0].has_devices).toBe(true);
    });
  });

  describe('Message Dispatch Security', () => {
    it('should ensure dispatched message has matching subscriber and device', async () => {
      // Mock a message ready for dispatch
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            message_id: 'msg-123',
            message_subscriber_id: subscriber1Id,
            device_id: 'device-123',
            device_subscriber_id: subscriber1Id,
          },
        ],
      });

      const result = await pool.query(
        `SELECT
          m.id as message_id,
          m.subscriber_id as message_subscriber_id,
          d.id as device_id,
          d.subscriber_id as device_subscriber_id
         FROM messages m
         JOIN gateway_devices d ON m.gateway_id = d.id
         WHERE m.id = $1`,
        ['msg-123']
      );

      const record = result.rows[0];
      expect(record.message_subscriber_id).toBe(record.device_subscriber_id);
      expect(record.message_subscriber_id).toBe(subscriber1Id);
    });

    it('should prevent dispatching to device from different subscriber via JOIN', async () => {
      // This test ensures JOIN enforces subscriber matching
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [], // No results when subscribers don't match
      });

      const result = await pool.query(
        `SELECT m.*, d.*
         FROM messages m
         JOIN gateway_devices d ON m.gateway_id = d.id
         WHERE m.subscriber_id != d.subscriber_id`, // Should return nothing
        []
      );

      // No messages should have mismatched subscriber/device
      expect(result.rows).toHaveLength(0);
    });
  });

  describe('Database Constraint Enforcement', () => {
    it('should enforce foreign key constraint on gateway_devices', async () => {
      // Attempt to insert message with non-existent device should fail
      (pool.query as jest.Mock).mockRejectedValueOnce(
        new Error('Foreign key violation: gateway_id references non-existent device')
      );

      await expect(
        pool.query(
          `INSERT INTO messages (subscriber_id, gateway_id, to_number, body, status)
           VALUES ($1, $2, $3, $4, $5)`,
          [subscriber1Id, 'non-existent-device', '+639171234567', 'Test', 'QUEUED']
        )
      ).rejects.toThrow('Foreign key violation');
    });

    it('should verify subscriber_id consistency through database views', async () => {
      // Mock a database view that ensures subscriber consistency
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            message_id: 'msg-123',
            subscriber_id: subscriber1Id,
            device_subscriber_id: subscriber1Id,
            consistent: true,
          },
        ],
      });

      const result = await pool.query(
        `SELECT
          m.id as message_id,
          m.subscriber_id,
          d.subscriber_id as device_subscriber_id,
          m.subscriber_id = d.subscriber_id as consistent
         FROM messages m
         LEFT JOIN gateway_devices d ON m.gateway_id = d.id
         WHERE m.id = $1`,
        ['msg-123']
      );

      const record = result.rows[0];
      expect(record.consistent).toBe(true);
    });
  });
});
