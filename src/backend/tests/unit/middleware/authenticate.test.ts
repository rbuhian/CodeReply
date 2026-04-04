/**
 * Authentication Middleware Tests
 * Comprehensive tests for API key authentication
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import { Request, Response } from 'express';
import { authenticate, optionalAuthenticate, AuthenticatedRequest } from '../../../middleware/authenticate';
import { pool } from '../../../config/database';
import crypto from 'crypto';

// Mock dependencies
jest.mock('../../../config/database');
jest.mock('../../../utils/logger');

describe('authenticate middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      headers: {},
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    // Reset mocks
    jest.clearAllMocks();
  });

  describe('Valid API Keys', () => {
    it('should authenticate with valid live API key', async () => {
      const apiKey = 'cr_live_' + 'a'.repeat(32);
      const keyHash = crypto.createHash('sha256').update(apiKey).digest('hex');

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'api-key-123',
            subscriber_id: 'sub-123',
            is_active: true,
            key_prefix: 'cr_live_xxxx',
            subscriber_name: 'Test Subscriber',
            subscriber_email: 'test@example.com',
            subscriber_plan: 'professional',
          },
        ],
      });

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
      expect((mockReq as AuthenticatedRequest).subscriber).toEqual({
        id: 'sub-123',
        name: 'Test Subscriber',
        email: 'test@example.com',
        plan: 'professional',
        apiKeyId: 'api-key-123',
      });
    });

    it('should authenticate with valid test API key', async () => {
      const apiKey = 'cr_test_' + 'b'.repeat(32);

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'api-key-456',
            subscriber_id: 'sub-456',
            is_active: true,
            key_prefix: 'cr_test_xxxx',
            subscriber_name: 'Test User',
            subscriber_email: 'user@test.com',
            subscriber_plan: 'starter',
          },
        ],
      });

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect((mockReq as AuthenticatedRequest).subscriber.plan).toBe('starter');
    });

    it('should update last_used_at timestamp', async () => {
      const apiKey = 'cr_live_' + 'c'.repeat(32);

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock)
        .mockResolvedValueOnce({
          rows: [
            {
              id: 'api-key-789',
              subscriber_id: 'sub-789',
              is_active: true,
              key_prefix: 'cr_live_xxxx',
              subscriber_name: 'Active Subscriber',
              subscriber_email: 'active@example.com',
              subscriber_plan: 'enterprise',
            },
          ],
        })
        .mockResolvedValueOnce({}); // UPDATE query

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      // Wait for async update to complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(pool.query).toHaveBeenCalledTimes(2);
      expect((pool.query as jest.Mock).mock.calls[1][0]).toContain(
        'UPDATE api_keys'
      );
    });
  });

  describe('Missing or Invalid Authorization Header', () => {
    it('should reject request with missing Authorization header', async () => {
      mockReq.headers = {};

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: expect.stringContaining('Missing or invalid Authorization header'),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with invalid Authorization format (no Bearer)', async () => {
      mockReq.headers = {
        authorization: 'cr_live_' + 'a'.repeat(32),
      };

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with wrong bearer scheme', async () => {
      mockReq.headers = {
        authorization: 'Basic cr_live_' + 'a'.repeat(32),
      };

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with malformed API key (wrong prefix)', async () => {
      mockReq.headers = {
        authorization: 'Bearer cr_prod_' + 'a'.repeat(32),
      };

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with malformed API key (wrong length)', async () => {
      mockReq.headers = {
        authorization: 'Bearer cr_live_abc123',
      };

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with malformed API key (invalid characters)', async () => {
      mockReq.headers = {
        authorization: 'Bearer cr_live_' + '@#$%'.repeat(8),
      };

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Invalid API Keys', () => {
    it('should reject request with API key not found in database', async () => {
      const apiKey = 'cr_live_' + 'd'.repeat(32);

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Invalid API key',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject request with inactive API key', async () => {
      const apiKey = 'cr_live_' + 'e'.repeat(32);

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [
          {
            id: 'api-key-inactive',
            subscriber_id: 'sub-123',
            is_active: false, // INACTIVE
            key_prefix: 'cr_live_xxxx',
            subscriber_name: 'Test Subscriber',
            subscriber_email: 'test@example.com',
            subscriber_plan: 'professional',
          },
        ],
      });

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: expect.stringContaining('revoked or deactivated'),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Database Errors', () => {
    it('should handle database errors gracefully', async () => {
      const apiKey = 'cr_live_' + 'f'.repeat(32);

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock).mockRejectedValueOnce(
        new Error('Database connection failed')
      );

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
          message: expect.stringContaining('error occurred during authentication'),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle database query timeout', async () => {
      const apiKey = 'cr_live_' + 'g'.repeat(32);

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock).mockRejectedValueOnce(
        new Error('Query timeout')
      );

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Security', () => {
    it('should hash API key before database lookup', async () => {
      const apiKey = 'cr_live_' + 'h'.repeat(32);
      const expectedHash = crypto
        .createHash('sha256')
        .update(apiKey)
        .digest('hex');

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      expect(pool.query).toHaveBeenCalledWith(
        expect.any(String),
        [expectedHash]
      );
    });

    it('should not expose API key in error messages', async () => {
      const apiKey = 'cr_live_' + 'i'.repeat(32);

      mockReq.headers = {
        authorization: `Bearer ${apiKey}`,
      };

      (pool.query as jest.Mock).mockResolvedValueOnce({
        rows: [],
      });

      await authenticate(mockReq as Request, mockRes as Response, mockNext);

      const jsonCall = (mockRes.json as jest.Mock).mock.calls[0][0];
      expect(JSON.stringify(jsonCall)).not.toContain(apiKey);
    });
  });
});

describe('optionalAuthenticate middleware', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      headers: {},
      path: '/test',
      method: 'GET',
      ip: '127.0.0.1',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  it('should pass through when no Authorization header provided', async () => {
    mockReq.headers = {};

    await optionalAuthenticate(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect(mockRes.status).not.toHaveBeenCalled();
    expect((mockReq as AuthenticatedRequest).subscriber).toBeUndefined();
  });

  it('should authenticate when valid Authorization header provided', async () => {
    const apiKey = 'cr_live_' + 'j'.repeat(32);

    mockReq.headers = {
      authorization: `Bearer ${apiKey}`,
    };

    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [
        {
          id: 'api-key-123',
          subscriber_id: 'sub-123',
          is_active: true,
          key_prefix: 'cr_live_xxxx',
          subscriber_name: 'Test Subscriber',
          subscriber_email: 'test@example.com',
          subscriber_plan: 'professional',
        },
      ],
    });

    await optionalAuthenticate(mockReq as Request, mockRes as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockReq as AuthenticatedRequest).subscriber).toBeDefined();
  });

  it('should reject when invalid API key provided', async () => {
    const apiKey = 'cr_live_' + 'k'.repeat(32);

    mockReq.headers = {
      authorization: `Bearer ${apiKey}`,
    };

    (pool.query as jest.Mock).mockResolvedValueOnce({
      rows: [],
    });

    await optionalAuthenticate(mockReq as Request, mockRes as Response, mockNext);

    expect(mockRes.status).toHaveBeenCalledWith(401);
    expect(mockNext).not.toHaveBeenCalled();
  });
});
