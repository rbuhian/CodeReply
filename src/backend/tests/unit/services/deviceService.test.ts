/**
 * Device Service Tests
 * Unit tests for device registration and management
 * Author: Bernadette (API Engineer)
 * Date: April 4, 2026
 */

import {
  generateRegistrationToken,
  registerDevice,
  getDeviceQuota,
  listDevices,
  getDevice,
  updateDevice,
  deleteDevice,
} from '../../../services/deviceService';
import { pool } from '../../../config/database';
import jwt from 'jsonwebtoken';

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

// Mock JWT
jest.mock('jsonwebtoken');

describe('DeviceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateRegistrationToken', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';

    it('should generate a registration token successfully', async () => {
      // Mock quota check
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_count: 0, max_devices: 5 }],
      });

      // Mock token insertion
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid',
            expires_at: new Date(Date.now() + 3600000),
          },
        ],
      });

      const result = await generateRegistrationToken(subscriberId, 'Test Device');

      expect(result).toHaveProperty('token');
      expect(result.token).toMatch(/^cr_reg_[a-f0-9]{64}$/);
      expect(result).toHaveProperty('tokenId', 'token-uuid');
      expect(result).toHaveProperty('expiresAt');
      expect(result).toHaveProperty('expiresIn', 3600);

      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('should throw error if subscriber not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await expect(generateRegistrationToken(subscriberId)).rejects.toThrow(
        'Subscriber not found'
      );
    });

    it('should throw error if device quota exceeded', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_count: 5, max_devices: 5 }],
      });

      await expect(generateRegistrationToken(subscriberId)).rejects.toThrow(
        'Device quota exceeded'
      );
    });

    it('should include optional label in metadata', async () => {
      const label = 'Office Phone';

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_count: 0, max_devices: 5 }],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid',
            expires_at: new Date(Date.now() + 3600000),
          },
        ],
      });

      await generateRegistrationToken(subscriberId, label);

      // Check that the label was included in the metadata JSON
      const insertCall = (pool.query as jest.Mock).mock.calls[1];
      const metadata = insertCall[1][3];
      expect(metadata).toContain(label);
    });
  });

  describe('registerDevice', () => {
    const registrationToken = 'cr_reg_' + '0'.repeat(64);
    const deviceData = {
      deviceName: 'Samsung Galaxy S21',
      simCarrier: 'T-Mobile',
      simNumber: '+639171234567',
      androidVersion: '13.0',
      appVersion: '2.0.0',
    };

    let mockClient: any;

    beforeEach(() => {
      mockClient = {
        query: jest.fn(),
        release: jest.fn(),
      };
      (pool.connect as jest.Mock).mockResolvedValue(mockClient);
    });

    it('should register a device successfully', async () => {
      const subscriberId = '123e4567-e89b-12d3-a456-426614174000';
      const deviceId = '987e6543-e21b-12d3-a456-426614174999';

      // Mock BEGIN transaction
      mockClient.query.mockResolvedValueOnce({});

      // Mock token validation
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid',
            subscriber_id: subscriberId,
            used: false,
            expires_at: new Date(Date.now() + 3600000),
            revoked_at: null,
          },
        ],
      });

      // Mock quota check
      mockClient.query.mockResolvedValueOnce({
        rows: [{ device_count: 0, max_devices: 5 }],
      });

      // Mock device insertion
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriberId,
            name: deviceData.deviceName,
          },
        ],
      });

      // Mock token update
      mockClient.query.mockResolvedValueOnce({});

      // Mock COMMIT transaction
      mockClient.query.mockResolvedValueOnce({});

      // Mock JWT signing
      (jwt.sign as jest.Mock).mockReturnValue('mock-jwt-token');

      const result = await registerDevice(registrationToken, deviceData);

      expect(result).toEqual({
        deviceId,
        deviceToken: 'mock-jwt-token',
        subscriberId,
        deviceName: deviceData.deviceName,
      });

      expect(mockClient.query).toHaveBeenCalledWith('BEGIN');
      expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error for invalid token', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({ rows: [] }); // Token lookup
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      await expect(registerDevice(registrationToken, deviceData)).rejects.toThrow(
        'Invalid registration token'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    it('should throw error for already used token', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid',
            subscriber_id: '123',
            used: true, // Already used
            expires_at: new Date(Date.now() + 3600000),
            revoked_at: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      await expect(registerDevice(registrationToken, deviceData)).rejects.toThrow(
        'already been used'
      );
    });

    it('should throw error for expired token', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid',
            subscriber_id: '123',
            used: false,
            expires_at: new Date(Date.now() - 3600000), // Expired
            revoked_at: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      await expect(registerDevice(registrationToken, deviceData)).rejects.toThrow(
        'expired'
      );
    });

    it('should throw error for revoked token', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid',
            subscriber_id: '123',
            used: false,
            expires_at: new Date(Date.now() + 3600000),
            revoked_at: new Date(), // Revoked
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      await expect(registerDevice(registrationToken, deviceData)).rejects.toThrow(
        'revoked'
      );
    });

    it('should throw error if quota exceeded during registration', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockResolvedValueOnce({
        rows: [
          {
            id: 'token-uuid',
            subscriber_id: '123',
            used: false,
            expires_at: new Date(Date.now() + 3600000),
            revoked_at: null,
          },
        ],
      });
      mockClient.query.mockResolvedValueOnce({
        rows: [{ device_count: 5, max_devices: 5 }], // Quota exceeded
      });
      mockClient.query.mockResolvedValueOnce({}); // ROLLBACK

      await expect(registerDevice(registrationToken, deviceData)).rejects.toThrow(
        'quota exceeded'
      );
    });

    it('should rollback transaction on error', async () => {
      mockClient.query.mockResolvedValueOnce({}); // BEGIN
      mockClient.query.mockRejectedValueOnce(new Error('Database error'));

      await expect(registerDevice(registrationToken, deviceData)).rejects.toThrow(
        'Database error'
      );

      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });
  });

  describe('getDeviceQuota', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';

    it('should return device quota information', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_count: 3, max_devices: 10 }],
      });

      const result = await getDeviceQuota(subscriberId);

      expect(result).toEqual({
        current: 3,
        maximum: 10,
        available: 7,
      });
    });

    it('should throw error if subscriber not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await expect(getDeviceQuota(subscriberId)).rejects.toThrow('Subscriber not found');
    });

    it('should return 0 available if quota is full', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_count: 5, max_devices: 5 }],
      });

      const result = await getDeviceQuota(subscriberId);

      expect(result).toEqual({
        current: 5,
        maximum: 5,
        available: 0,
      });
    });

    it('should not return negative available count', async () => {
      // Edge case: device_count somehow exceeds max_devices
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ device_count: 6, max_devices: 5 }],
      });

      const result = await getDeviceQuota(subscriberId);

      expect(result.available).toBe(0);
      expect(result.available).toBeGreaterThanOrEqual(0);
    });
  });

  describe('listDevices', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';

    it('should list all devices for a subscriber', async () => {
      // Mock count query
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '2' }],
      });

      // Mock devices query
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'device-1',
            subscriber_id: subscriberId,
            name: 'Device 1',
            sim_carrier: 'T-Mobile',
            sim_number: '+639171234567',
            android_version: '13.0',
            app_version: '2.0.0',
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 100,
            total_messages_failed: 5,
          },
          {
            id: 'device-2',
            subscriber_id: subscriberId,
            name: 'Device 2',
            sim_carrier: 'Verizon',
            sim_number: null,
            android_version: '12.0',
            app_version: '1.9.0',
            status: 'OFFLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 50,
            total_messages_failed: 2,
          },
        ],
      });

      const result = await listDevices(subscriberId);

      expect(result.devices).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.limit).toBe(20);
      expect(result.offset).toBe(0);
    });

    it('should filter by status', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '1' }],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'device-1',
            subscriber_id: subscriberId,
            name: 'Device 1',
            sim_carrier: null,
            sim_number: null,
            android_version: null,
            app_version: null,
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 0,
            total_messages_failed: 0,
          },
        ],
      });

      const result = await listDevices(subscriberId, { status: 'ONLINE' });

      expect(result.devices).toHaveLength(1);
      expect(result.devices[0].status).toBe('ONLINE');
    });

    it('should apply pagination', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ total: '100' }],
      });

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      const result = await listDevices(subscriberId, { limit: 10, offset: 20 });

      expect(result.limit).toBe(10);
      expect(result.offset).toBe(20);
      expect(result.total).toBe(100);
    });
  });

  describe('getDevice', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';
    const deviceId = 'device-uuid';

    it('should get device by ID', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriberId,
            name: 'My Device',
            sim_carrier: 'T-Mobile',
            sim_number: '+639171234567',
            android_version: '13.0',
            app_version: '2.0.0',
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 100,
            total_messages_failed: 5,
          },
        ],
      });

      const result = await getDevice(deviceId, subscriberId);

      expect(result.id).toBe(deviceId);
      expect(result.subscriberId).toBe(subscriberId);
      expect(result.name).toBe('My Device');
    });

    it('should throw error if device not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await expect(getDevice(deviceId, subscriberId)).rejects.toThrow('Device not found');
    });

    it('should throw error if device belongs to another subscriber', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: 'different-subscriber-id',
            name: 'My Device',
            sim_carrier: null,
            sim_number: null,
            android_version: null,
            app_version: null,
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 0,
            total_messages_failed: 0,
          },
        ],
      });

      await expect(getDevice(deviceId, subscriberId)).rejects.toThrow('Unauthorized');
    });
  });

  describe('updateDevice', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';
    const deviceId = 'device-uuid';

    it('should update device name', async () => {
      // Mock getDevice (ownership check)
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriberId,
            name: 'Old Name',
            sim_carrier: null,
            sim_number: null,
            android_version: null,
            app_version: null,
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 0,
            total_messages_failed: 0,
          },
        ],
      });

      // Mock update query
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriberId,
            name: 'New Name',
            sim_carrier: null,
            sim_number: null,
            android_version: null,
            app_version: null,
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 0,
            total_messages_failed: 0,
          },
        ],
      });

      const result = await updateDevice(deviceId, subscriberId, { name: 'New Name' });

      expect(result.name).toBe('New Name');
    });

    it('should return existing device if no fields to update', async () => {
      // Mock getDevice
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriberId,
            name: 'Device Name',
            sim_carrier: null,
            sim_number: null,
            android_version: null,
            app_version: null,
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 0,
            total_messages_failed: 0,
          },
        ],
      });

      const result = await updateDevice(deviceId, subscriberId, {});

      expect(result.name).toBe('Device Name');
      // Should only call getDevice, not update
      expect(pool.query).toHaveBeenCalledTimes(1);
    });

    it('should throw error if device not found during ownership check', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await expect(updateDevice(deviceId, subscriberId, { name: 'New Name' })).rejects.toThrow(
        'Device not found'
      );
    });
  });

  describe('deleteDevice', () => {
    const subscriberId = '123e4567-e89b-12d3-a456-426614174000';
    const deviceId = 'device-uuid';

    it('should soft delete device', async () => {
      // Mock getDevice (ownership check)
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: subscriberId,
            name: 'Device Name',
            sim_carrier: null,
            sim_number: null,
            android_version: null,
            app_version: null,
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 0,
            total_messages_failed: 0,
          },
        ],
      });

      // Mock delete query
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [{ id: deviceId }],
      });

      const result = await deleteDevice(deviceId, subscriberId);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Device deleted successfully');
    });

    it('should throw error if device not found', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await expect(deleteDevice(deviceId, subscriberId)).rejects.toThrow('Device not found');
    });

    it('should throw error if device belongs to another subscriber', async () => {
      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: deviceId,
            subscriber_id: 'different-subscriber-id',
            name: 'Device Name',
            sim_carrier: null,
            sim_number: null,
            android_version: null,
            app_version: null,
            status: 'ONLINE',
            last_heartbeat: new Date(),
            created_at: new Date(),
            total_messages_sent: 0,
            total_messages_failed: 0,
          },
        ],
      });

      await expect(deleteDevice(deviceId, subscriberId)).rejects.toThrow('Unauthorized');
    });
  });
});
