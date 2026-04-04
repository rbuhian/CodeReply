/**
 * Device Routes Tests
 * Integration tests for device registration endpoints
 * Author: Bernadette (API Engineer)
 * Date: April 4, 2026
 */

import request from 'supertest';
import express, { Application } from 'express';
import deviceRoutes from '../../../routes/deviceRoutes';
import * as deviceService from '../../../services/deviceService';
import { authenticate } from '../../../middleware/authenticate';

// Mock dependencies
jest.mock('../../../services/deviceService');
jest.mock('../../../middleware/authenticate');
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Device Routes', () => {
  let app: Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/v1/devices', deviceRoutes);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authenticate middleware to inject subscriber context
    (authenticate as jest.Mock).mockImplementation((req, res, next) => {
      (req as any).subscriber = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Test Subscriber',
        email: 'test@example.com',
        plan: 'pro',
        apiKeyId: 'api-key-id',
      };
      next();
    });
  });

  describe('POST /v1/devices/registration-token', () => {
    it('should generate registration token successfully', async () => {
      const mockTokenData = {
        token: 'cr_reg_' + '0'.repeat(64),
        tokenId: 'token-uuid',
        expiresAt: new Date(Date.now() + 3600000),
        expiresIn: 3600,
      };

      const mockQuota = {
        current: 2,
        maximum: 10,
        available: 8,
      };

      (deviceService.generateRegistrationToken as jest.Mock).mockResolvedValue(mockTokenData);
      (deviceService.getDeviceQuota as jest.Mock).mockResolvedValue(mockQuota);

      const response = await request(app)
        .post('/v1/devices/registration-token')
        .send({ label: 'Test Device' })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          token: mockTokenData.token,
          tokenId: mockTokenData.tokenId,
          expiresIn: 3600,
          quota: mockQuota,
        },
      });

      expect(deviceService.generateRegistrationToken).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        'Test Device'
      );
    });

    it('should generate token without label', async () => {
      const mockTokenData = {
        token: 'cr_reg_' + '0'.repeat(64),
        tokenId: 'token-uuid',
        expiresAt: new Date(Date.now() + 3600000),
        expiresIn: 3600,
      };

      const mockQuota = { current: 0, maximum: 10, available: 10 };

      (deviceService.generateRegistrationToken as jest.Mock).mockResolvedValue(mockTokenData);
      (deviceService.getDeviceQuota as jest.Mock).mockResolvedValue(mockQuota);

      const response = await request(app)
        .post('/v1/devices/registration-token')
        .send({})
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(deviceService.generateRegistrationToken).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        undefined
      );
    });

    it('should return 403 when quota exceeded', async () => {
      (deviceService.generateRegistrationToken as jest.Mock).mockRejectedValue(
        new Error('Device quota exceeded. Current: 5, Maximum: 5')
      );

      const response = await request(app)
        .post('/v1/devices/registration-token')
        .send({})
        .expect(403);

      expect(response.body).toMatchObject({
        error: 'Quota Exceeded',
      });
    });

    it('should return 400 for invalid label', async () => {
      const response = await request(app)
        .post('/v1/devices/registration-token')
        .send({ label: 'a'.repeat(101) }) // Exceeds 100 char limit
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 500 on unexpected error', async () => {
      (deviceService.generateRegistrationToken as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/v1/devices/registration-token')
        .send({})
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
      });
    });
  });

  describe('POST /v1/devices/register', () => {
    it('should register device successfully', async () => {
      const mockDevice = {
        deviceId: 'device-uuid',
        deviceToken: 'jwt-token',
        subscriberId: 'subscriber-uuid',
        deviceName: 'Samsung Galaxy S21',
      };

      (deviceService.registerDevice as jest.Mock).mockResolvedValue(mockDevice);

      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
          deviceName: 'Samsung Galaxy S21',
          simCarrier: 'T-Mobile',
          simNumber: '+639171234567',
          androidVersion: '13.0',
          appVersion: '2.0.0',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        success: true,
        data: mockDevice,
      });

      expect(deviceService.registerDevice).toHaveBeenCalledWith(
        'cr_reg_' + '0'.repeat(64),
        {
          deviceName: 'Samsung Galaxy S21',
          simCarrier: 'T-Mobile',
          simNumber: '+639171234567',
          androidVersion: '13.0',
          appVersion: '2.0.0',
        }
      );
    });

    it('should register device with minimal data', async () => {
      const mockDevice = {
        deviceId: 'device-uuid',
        deviceToken: 'jwt-token',
        subscriberId: 'subscriber-uuid',
        deviceName: 'My Phone',
      };

      (deviceService.registerDevice as jest.Mock).mockResolvedValue(mockDevice);

      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
          deviceName: 'My Phone',
        })
        .expect(201);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 for invalid registration token format', async () => {
      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'invalid-token',
          deviceName: 'My Phone',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
      expect(response.body.errors[0].message).toContain('Invalid registration token format');
    });

    it('should return 400 for missing device name', async () => {
      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid device name characters', async () => {
      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
          deviceName: 'Phone@#$%', // Invalid characters
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid SIM number format', async () => {
      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
          deviceName: 'My Phone',
          simNumber: '123', // Invalid E.164 format
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid token', async () => {
      (deviceService.registerDevice as jest.Mock).mockRejectedValue(
        new Error('Invalid registration token')
      );

      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
          deviceName: 'My Phone',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid Token',
      });
    });

    it('should return 400 for expired token', async () => {
      (deviceService.registerDevice as jest.Mock).mockRejectedValue(
        new Error('Registration token has expired')
      );

      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
          deviceName: 'My Phone',
        })
        .expect(400);

      expect(response.body).toMatchObject({
        error: 'Invalid Token',
        message: 'Registration token has expired',
      });
    });

    it('should return 403 for quota exceeded', async () => {
      (deviceService.registerDevice as jest.Mock).mockRejectedValue(
        new Error('Device quota exceeded. Current: 5, Maximum: 5')
      );

      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
          deviceName: 'My Phone',
        })
        .expect(403);

      expect(response.body).toMatchObject({
        error: 'Quota Exceeded',
      });
    });

    it('should return 500 on unexpected error', async () => {
      (deviceService.registerDevice as jest.Mock).mockRejectedValue(
        new Error('Database connection failed')
      );

      const response = await request(app)
        .post('/v1/devices/register')
        .send({
          registrationToken: 'cr_reg_' + '0'.repeat(64),
          deviceName: 'My Phone',
        })
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
      });
    });
  });

  describe('GET /v1/devices/quota', () => {
    it('should return device quota successfully', async () => {
      const mockQuota = {
        current: 3,
        maximum: 10,
        available: 7,
      };

      (deviceService.getDeviceQuota as jest.Mock).mockResolvedValue(mockQuota);

      const response = await request(app).get('/v1/devices/quota').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: mockQuota,
      });

      expect(deviceService.getDeviceQuota).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000'
      );
    });

    it('should return 500 on error', async () => {
      (deviceService.getDeviceQuota as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/v1/devices/quota').expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
      });
    });
  });

  describe('GET /v1/devices', () => {
    it('should list all devices for authenticated subscriber', async () => {
      const mockDevices = {
        devices: [
          {
            id: 'device-1',
            subscriberId: '123e4567-e89b-12d3-a456-426614174000',
            name: 'Device 1',
            simCarrier: 'T-Mobile',
            simNumber: '+639171234567',
            androidVersion: '13.0',
            appVersion: '2.0.0',
            status: 'ONLINE',
            lastHeartbeat: new Date(),
            createdAt: new Date(),
            totalMessagesSent: 100,
            totalMessagesFailed: 5,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      (deviceService.listDevices as jest.Mock).mockResolvedValue(mockDevices);

      const response = await request(app).get('/v1/devices').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          total: 1,
          limit: 20,
          offset: 0,
        },
      });

      expect(response.body.data.devices).toHaveLength(1);
    });

    it('should apply query filters', async () => {
      const mockDevices = {
        devices: [],
        total: 0,
        limit: 10,
        offset: 5,
      };

      (deviceService.listDevices as jest.Mock).mockResolvedValue(mockDevices);

      const response = await request(app)
        .get('/v1/devices')
        .query({ status: 'ONLINE', limit: 10, offset: 5 })
        .expect(200);

      expect(deviceService.listDevices).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        expect.objectContaining({
          status: 'ONLINE',
          limit: 10,
          offset: 5,
        })
      );
    });

    it('should return 500 on error', async () => {
      (deviceService.listDevices as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app).get('/v1/devices').expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
      });
    });
  });

  describe('GET /v1/devices/:id', () => {
    const deviceId = 'device-uuid-123';

    it('should get device details', async () => {
      const mockDevice = {
        id: deviceId,
        subscriberId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'My Device',
        simCarrier: 'T-Mobile',
        simNumber: '+639171234567',
        androidVersion: '13.0',
        appVersion: '2.0.0',
        status: 'ONLINE',
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        totalMessagesSent: 100,
        totalMessagesFailed: 5,
      };

      (deviceService.getDevice as jest.Mock).mockResolvedValue(mockDevice);

      const response = await request(app).get(`/v1/devices/${deviceId}`).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: deviceId,
          name: 'My Device',
        },
      });

      expect(deviceService.getDevice).toHaveBeenCalledWith(
        deviceId,
        '123e4567-e89b-12d3-a456-426614174000'
      );
    });

    it('should return 404 if device not found', async () => {
      (deviceService.getDevice as jest.Mock).mockRejectedValue(new Error('Device not found'));

      const response = await request(app).get(`/v1/devices/${deviceId}`).expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Device not found',
      });
    });

    it('should return 403 if device belongs to another subscriber', async () => {
      (deviceService.getDevice as jest.Mock).mockRejectedValue(
        new Error('Unauthorized: Device belongs to another subscriber')
      );

      const response = await request(app).get(`/v1/devices/${deviceId}`).expect(403);

      expect(response.body).toMatchObject({
        error: 'Forbidden',
      });
    });

    it('should return 500 on unexpected error', async () => {
      (deviceService.getDevice as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app).get(`/v1/devices/${deviceId}`).expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
      });
    });
  });

  describe('PATCH /v1/devices/:id', () => {
    const deviceId = 'device-uuid-123';

    it('should update device successfully', async () => {
      const mockDevice = {
        id: deviceId,
        subscriberId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Updated Device Name',
        simCarrier: 'Verizon',
        simNumber: '+639171234567',
        androidVersion: '13.0',
        appVersion: '2.0.0',
        status: 'ONLINE',
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        totalMessagesSent: 100,
        totalMessagesFailed: 5,
      };

      (deviceService.updateDevice as jest.Mock).mockResolvedValue(mockDevice);

      const response = await request(app)
        .patch(`/v1/devices/${deviceId}`)
        .send({ name: 'Updated Device Name' })
        .expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          name: 'Updated Device Name',
        },
        message: 'Device updated successfully',
      });

      expect(deviceService.updateDevice).toHaveBeenCalledWith(
        deviceId,
        '123e4567-e89b-12d3-a456-426614174000',
        { name: 'Updated Device Name' }
      );
    });

    it('should update SIM carrier', async () => {
      const mockDevice = {
        id: deviceId,
        subscriberId: '123e4567-e89b-12d3-a456-426614174000',
        name: 'Device',
        simCarrier: 'AT&T',
        simNumber: null,
        androidVersion: null,
        appVersion: null,
        status: 'ONLINE',
        lastHeartbeat: new Date(),
        createdAt: new Date(),
        totalMessagesSent: 0,
        totalMessagesFailed: 0,
      };

      (deviceService.updateDevice as jest.Mock).mockResolvedValue(mockDevice);

      const response = await request(app)
        .patch(`/v1/devices/${deviceId}`)
        .send({ simCarrier: 'AT&T' })
        .expect(200);

      expect(response.body.data.simCarrier).toBe('AT&T');
    });

    it('should return 404 if device not found', async () => {
      (deviceService.updateDevice as jest.Mock).mockRejectedValue(new Error('Device not found'));

      const response = await request(app)
        .patch(`/v1/devices/${deviceId}`)
        .send({ name: 'New Name' })
        .expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
      });
    });

    it('should return 403 if unauthorized', async () => {
      (deviceService.updateDevice as jest.Mock).mockRejectedValue(
        new Error('Unauthorized: Device belongs to another subscriber')
      );

      const response = await request(app)
        .patch(`/v1/devices/${deviceId}`)
        .send({ name: 'New Name' })
        .expect(403);

      expect(response.body).toMatchObject({
        error: 'Forbidden',
      });
    });

    it('should return 400 for invalid data', async () => {
      const response = await request(app)
        .patch(`/v1/devices/${deviceId}`)
        .send({ name: 'a'.repeat(101) }) // Exceeds max length
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });
  });

  describe('DELETE /v1/devices/:id', () => {
    const deviceId = 'device-uuid-123';

    it('should delete device successfully', async () => {
      (deviceService.deleteDevice as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Device deleted successfully',
      });

      const response = await request(app).delete(`/v1/devices/${deviceId}`).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        message: 'Device deleted successfully',
      });

      expect(deviceService.deleteDevice).toHaveBeenCalledWith(
        deviceId,
        '123e4567-e89b-12d3-a456-426614174000'
      );
    });

    it('should accept optional confirm field', async () => {
      (deviceService.deleteDevice as jest.Mock).mockResolvedValue({
        success: true,
        message: 'Device deleted successfully',
      });

      const response = await request(app)
        .delete(`/v1/devices/${deviceId}`)
        .send({ confirm: true })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 404 if device not found', async () => {
      (deviceService.deleteDevice as jest.Mock).mockRejectedValue(new Error('Device not found'));

      const response = await request(app).delete(`/v1/devices/${deviceId}`).expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
      });
    });

    it('should return 403 if unauthorized', async () => {
      (deviceService.deleteDevice as jest.Mock).mockRejectedValue(
        new Error('Unauthorized: Device belongs to another subscriber')
      );

      const response = await request(app).delete(`/v1/devices/${deviceId}`).expect(403);

      expect(response.body).toMatchObject({
        error: 'Forbidden',
      });
    });

    it('should return 500 on unexpected error', async () => {
      (deviceService.deleteDevice as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app).delete(`/v1/devices/${deviceId}`).expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
      });
    });
  });

  describe('POST /v1/devices/:id/heartbeat', () => {
    const deviceId = 'device-uuid-123';

    it('should update heartbeat successfully', async () => {
      const mockHeartbeat = {
        deviceId,
        status: 'ONLINE' as const,
        lastHeartbeat: new Date('2026-04-04T10:00:00.000Z'),
        message: 'Heartbeat updated successfully',
      };

      (deviceService.updateHeartbeat as jest.Mock).mockResolvedValue(mockHeartbeat);

      const response = await request(app).post(`/v1/devices/${deviceId}/heartbeat`).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          deviceId,
          status: 'ONLINE',
          lastHeartbeat: '2026-04-04T10:00:00.000Z',
        },
        message: 'Heartbeat updated successfully',
      });

      expect(deviceService.updateHeartbeat).toHaveBeenCalledWith(
        deviceId,
        '123e4567-e89b-12d3-a456-426614174000'
      );
    });

    it('should return 404 if device not found', async () => {
      (deviceService.updateHeartbeat as jest.Mock).mockRejectedValue(new Error('Device not found'));

      const response = await request(app).post(`/v1/devices/${deviceId}/heartbeat`).expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Device not found',
      });
    });

    it('should return 403 if unauthorized', async () => {
      (deviceService.updateHeartbeat as jest.Mock).mockRejectedValue(
        new Error('Unauthorized: Device belongs to another subscriber')
      );

      const response = await request(app).post(`/v1/devices/${deviceId}/heartbeat`).expect(403);

      expect(response.body).toMatchObject({
        error: 'Forbidden',
        message: 'You do not have permission to update this device',
      });
    });

    it('should return 404 if device was deleted', async () => {
      (deviceService.updateHeartbeat as jest.Mock).mockRejectedValue(
        new Error('Device not found or already deleted')
      );

      const response = await request(app).post(`/v1/devices/${deviceId}/heartbeat`).expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Device not found',
      });
    });

    it('should return 500 on unexpected error', async () => {
      (deviceService.updateHeartbeat as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app).post(`/v1/devices/${deviceId}/heartbeat`).expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
        message: 'Failed to update heartbeat',
      });
    });
  });
});
