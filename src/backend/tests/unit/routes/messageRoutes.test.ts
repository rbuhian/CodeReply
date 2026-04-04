/**
 * Message Routes Tests
 * Integration tests for message API endpoints
 * Author: Sheldon (Backend Infrastructure)
 * Date: April 4, 2026
 */

import request from 'supertest';
import express, { Application } from 'express';
import messageRoutes from '../../../routes/messageRoutes';
import * as messageService from '../../../services/messageService';
import { authenticate } from '../../../middleware/authenticate';

// Mock dependencies
jest.mock('../../../services/messageService');
jest.mock('../../../middleware/authenticate');
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

describe('Message Routes', () => {
  let app: Application;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use('/v1/messages', messageRoutes);
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

  describe('POST /v1/messages/send', () => {
    it('should send message successfully with device selected (202)', async () => {
      const mockResponse = {
        message: {
          id: 'msg-uuid-123',
          subscriberId: '123e4567-e89b-12d3-a456-426614174000',
          gatewayId: 'device-uuid-123',
          toNumber: '+639171234567',
          body: 'Test message',
          status: 'QUEUED' as const,
          retryCount: 0,
          ttl: 300,
          webhookUrl: null,
          metadata: null,
          queuedAt: new Date('2026-04-04T10:00:00Z'),
          dispatchedAt: null,
          sentAt: null,
          deliveredAt: null,
          failedAt: null,
          error: null,
        },
        deviceSelected: true,
        deviceId: 'device-uuid-123',
        deviceName: 'Samsung Galaxy S21',
      };

      (messageService.createMessage as jest.Mock).mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/messages/send')
        .send({
          to: '+639171234567',
          body: 'Test message',
        })
        .expect(202);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          message: {
            id: 'msg-uuid-123',
            to: '+639171234567',
            status: 'QUEUED',
          },
          device: {
            id: 'device-uuid-123',
            name: 'Samsung Galaxy S21',
          },
        },
        message: 'Message queued for dispatch',
      });

      expect(messageService.createMessage).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        expect.objectContaining({
          toNumber: '+639171234567',
          body: 'Test message',
        })
      );
    });

    it('should queue message without device when none available (503)', async () => {
      const mockResponse = {
        message: {
          id: 'msg-uuid-123',
          subscriberId: '123e4567-e89b-12d3-a456-426614174000',
          gatewayId: null,
          toNumber: '+639171234567',
          body: 'Test message',
          status: 'QUEUED' as const,
          retryCount: 0,
          ttl: 300,
          webhookUrl: null,
          metadata: null,
          queuedAt: new Date(),
          dispatchedAt: null,
          sentAt: null,
          deliveredAt: null,
          failedAt: null,
          error: null,
        },
        deviceSelected: false,
        deviceId: null,
        deviceName: null,
      };

      (messageService.createMessage as jest.Mock).mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/messages/send')
        .send({
          to: '+639171234567',
          body: 'Test message',
        })
        .expect(503);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          device: null,
        },
        message: expect.stringContaining('no devices available'),
      });
    });

    it('should send message with optional parameters', async () => {
      const mockResponse = {
        message: {
          id: 'msg-uuid-123',
          subscriberId: '123e4567-e89b-12d3-a456-426614174000',
          gatewayId: 'device-uuid-123',
          toNumber: '+639171234567',
          body: 'Test',
          status: 'QUEUED' as const,
          retryCount: 0,
          ttl: 600,
          webhookUrl: 'https://example.com/webhook',
          metadata: { orderId: '12345' },
          queuedAt: new Date(),
          dispatchedAt: null,
          sentAt: null,
          deliveredAt: null,
          failedAt: null,
          error: null,
        },
        deviceSelected: true,
        deviceId: 'device-uuid-123',
        deviceName: 'Device',
      };

      (messageService.createMessage as jest.Mock).mockResolvedValue(mockResponse);

      const response = await request(app)
        .post('/v1/messages/send')
        .send({
          to: '+639171234567',
          body: 'Test',
          ttl: 600,
          webhookUrl: 'https://example.com/webhook',
          metadata: { orderId: '12345' },
          preferredCarrier: 'Globe',
        })
        .expect(202);

      expect(messageService.createMessage).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        expect.objectContaining({
          ttl: 600,
          webhookUrl: 'https://example.com/webhook',
          metadata: { orderId: '12345' },
          preferredCarrier: 'Globe',
        })
      );
    });

    it('should return 400 for missing phone number', async () => {
      const response = await request(app)
        .post('/v1/messages/send')
        .send({
          body: 'Test message',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 400 for invalid phone number format', async () => {
      const response = await request(app)
        .post('/v1/messages/send')
        .send({
          to: '1234567', // Invalid E.164 format
          body: 'Test message',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 400 for missing message body', async () => {
      const response = await request(app)
        .post('/v1/messages/send')
        .send({
          to: '+639171234567',
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 400 for message body too long', async () => {
      const response = await request(app)
        .post('/v1/messages/send')
        .send({
          to: '+639171234567',
          body: 'a'.repeat(1000), // Exceeds 918 character limit
        })
        .expect(400);

      expect(response.body.error).toBe('Validation Error');
    });

    it('should return 500 on service error', async () => {
      (messageService.createMessage as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app)
        .post('/v1/messages/send')
        .send({
          to: '+639171234567',
          body: 'Test',
        })
        .expect(500);

      expect(response.body).toMatchObject({
        error: 'Internal Server Error',
      });
    });
  });

  describe('GET /v1/messages', () => {
    it('should list all messages for authenticated subscriber', async () => {
      const mockResponse = {
        messages: [
          {
            id: 'msg-1',
            subscriberId: '123e4567-e89b-12d3-a456-426614174000',
            gatewayId: 'device-1',
            toNumber: '+639171234567',
            body: 'Message 1',
            status: 'SENT' as const,
            retryCount: 0,
            ttl: 300,
            webhookUrl: null,
            metadata: null,
            queuedAt: new Date('2026-04-04T10:00:00Z'),
            dispatchedAt: new Date('2026-04-04T10:00:05Z'),
            sentAt: new Date('2026-04-04T10:00:10Z'),
            deliveredAt: null,
            failedAt: null,
            error: null,
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      (messageService.listMessages as jest.Mock).mockResolvedValue(mockResponse);

      const response = await request(app).get('/v1/messages').expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          messages: expect.arrayContaining([
            expect.objectContaining({
              id: 'msg-1',
              to: '+639171234567',
              status: 'SENT',
            }),
          ]),
          total: 1,
        },
      });

      expect(messageService.listMessages).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        expect.any(Object)
      );
    });

    it('should apply query filters', async () => {
      const mockResponse = {
        messages: [],
        total: 0,
        limit: 10,
        offset: 20,
      };

      (messageService.listMessages as jest.Mock).mockResolvedValue(mockResponse);

      await request(app)
        .get('/v1/messages?status=SENT&limit=10&offset=20')
        .expect(200);

      expect(messageService.listMessages).toHaveBeenCalledWith(
        '123e4567-e89b-12d3-a456-426614174000',
        expect.objectContaining({
          status: 'SENT',
          limit: 10,
          offset: 20,
        })
      );
    });

    it('should return 500 on service error', async () => {
      (messageService.listMessages as jest.Mock).mockRejectedValue(
        new Error('Database error')
      );

      const response = await request(app).get('/v1/messages').expect(500);

      expect(response.body.error).toBe('Internal Server Error');
    });
  });

  describe('GET /v1/messages/:id', () => {
    const messageId = 'msg-uuid-123';

    it('should get message details', async () => {
      const mockMessage = {
        id: messageId,
        subscriberId: '123e4567-e89b-12d3-a456-426614174000',
        gatewayId: 'device-uuid',
        toNumber: '+639171234567',
        body: 'Test message',
        status: 'DELIVERED' as const,
        retryCount: 0,
        ttl: 300,
        webhookUrl: null,
        metadata: null,
        queuedAt: new Date('2026-04-04T10:00:00Z'),
        dispatchedAt: new Date('2026-04-04T10:00:05Z'),
        sentAt: new Date('2026-04-04T10:00:10Z'),
        deliveredAt: new Date('2026-04-04T10:00:15Z'),
        failedAt: null,
        error: null,
      };

      (messageService.getMessage as jest.Mock).mockResolvedValue(mockMessage);

      const response = await request(app).get(`/v1/messages/${messageId}`).expect(200);

      expect(response.body).toMatchObject({
        success: true,
        data: {
          id: messageId,
          to: '+639171234567',
          status: 'DELIVERED',
        },
      });
    });

    it('should return 404 if message not found', async () => {
      (messageService.getMessage as jest.Mock).mockRejectedValue(new Error('Message not found'));

      const response = await request(app).get(`/v1/messages/${messageId}`).expect(404);

      expect(response.body).toMatchObject({
        error: 'Not Found',
        message: 'Message not found',
      });
    });

    it('should return 403 if unauthorized', async () => {
      (messageService.getMessage as jest.Mock).mockRejectedValue(
        new Error('Unauthorized: Message belongs to another subscriber')
      );

      const response = await request(app).get(`/v1/messages/${messageId}`).expect(403);

      expect(response.body).toMatchObject({
        error: 'Forbidden',
        message: expect.stringContaining('permission'),
      });
    });

    it('should return 500 on unexpected error', async () => {
      (messageService.getMessage as jest.Mock).mockRejectedValue(new Error('Database error'));

      const response = await request(app).get(`/v1/messages/${messageId}`).expect(500);

      expect(response.body.error).toBe('Internal Server Error');
    });
  });
});
