/**
 * Permission Checking Middleware Tests
 * Tests for permission validation and ownership checks
 * Author: Bernadette (API Engineer)
 * Date: April 3, 2026
 */

import { Request, Response } from 'express';
import {
  requirePermissions,
  requireOwnership,
  Permission,
} from '../../../middleware/requirePermissions';
import { AuthenticatedRequest } from '../../../middleware/authenticate';

// Mock dependencies
jest.mock('../../../utils/logger');

describe('requirePermissions middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      path: '/test',
      method: 'POST',
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('No Authentication', () => {
    it('should reject when no subscriber context', async () => {
      const middleware = requirePermissions(['messages:read']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Authentication required',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Starter Plan Permissions', () => {
    beforeEach(() => {
      mockReq.subscriber = {
        id: 'sub-starter',
        name: 'Starter User',
        email: 'starter@example.com',
        plan: 'starter',
        apiKeyId: 'key-123',
      };
    });

    it('should allow messages:read permission', async () => {
      const middleware = requirePermissions(['messages:read']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should allow messages:write permission', async () => {
      const middleware = requirePermissions(['messages:write']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow devices:read permission', async () => {
      const middleware = requirePermissions(['devices:read']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow devices:write permission', async () => {
      const middleware = requirePermissions(['devices:write']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject api-keys:read permission (not in starter plan)', async () => {
      const middleware = requirePermissions(['api-keys:read']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: 'Insufficient permissions to access this resource',
          required: ['api-keys:read'],
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject api-keys:write permission (not in starter plan)', async () => {
      const middleware = requirePermissions(['api-keys:write']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should allow multiple permissions when all are granted', async () => {
      const middleware = requirePermissions([
        'messages:read',
        'messages:write',
        'devices:read',
      ]);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should reject when one required permission is missing', async () => {
      const middleware = requirePermissions([
        'messages:read',
        'api-keys:read', // NOT in starter plan
      ]);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Professional Plan Permissions', () => {
    beforeEach(() => {
      mockReq.subscriber = {
        id: 'sub-pro',
        name: 'Pro User',
        email: 'pro@example.com',
        plan: 'professional',
        apiKeyId: 'key-456',
      };
    });

    it('should allow all message permissions', async () => {
      const middleware = requirePermissions(['messages:read', 'messages:write']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow all device permissions', async () => {
      const middleware = requirePermissions(['devices:read', 'devices:write']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow all api-key permissions', async () => {
      const middleware = requirePermissions(['api-keys:read', 'api-keys:write']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should allow combination of all permission types', async () => {
      const middleware = requirePermissions([
        'messages:read',
        'devices:write',
        'api-keys:read',
      ]);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('Enterprise Plan Permissions', () => {
    beforeEach(() => {
      mockReq.subscriber = {
        id: 'sub-enterprise',
        name: 'Enterprise User',
        email: 'enterprise@example.com',
        plan: 'enterprise',
        apiKeyId: 'key-789',
      };
    });

    it('should allow all permissions', async () => {
      const allPermissions: Permission[] = [
        'messages:read',
        'messages:write',
        'devices:read',
        'devices:write',
        'api-keys:read',
        'api-keys:write',
      ];

      const middleware = requirePermissions(allPermissions);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });
  });

  describe('Unknown Plan', () => {
    beforeEach(() => {
      mockReq.subscriber = {
        id: 'sub-unknown',
        name: 'Unknown User',
        email: 'unknown@example.com',
        plan: 'unknown_plan',
        apiKeyId: 'key-999',
      };
    });

    it('should default to starter plan permissions', async () => {
      // Should allow messages:read (in starter)
      const middleware1 = requirePermissions(['messages:read']);
      await middleware1(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalled();

      // Reset mocks
      jest.clearAllMocks();

      // Should reject api-keys:read (not in starter)
      const middleware2 = requirePermissions(['api-keys:read']);
      await middleware2(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('Error Handling', () => {
    it('should handle errors gracefully', async () => {
      // Create a subscriber object that throws on property access
      const errorSubscriber = new Proxy(
        {},
        {
          get() {
            throw new Error('Unexpected error');
          },
        }
      );

      mockReq.subscriber = errorSubscriber as any;

      const middleware = requirePermissions(['messages:read']);

      await middleware(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Internal Server Error',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});

describe('requireOwnership middleware', () => {
  let mockReq: Partial<AuthenticatedRequest>;
  let mockRes: Partial<Response>;
  let mockNext: jest.Mock;

  beforeEach(() => {
    mockReq = {
      path: '/subscribers/:subscriberId/devices',
      method: 'GET',
      params: {},
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };

    mockNext = jest.fn();

    jest.clearAllMocks();
  });

  describe('No Authentication', () => {
    it('should reject when no subscriber context', () => {
      requireOwnership(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Unauthorized',
          message: 'Authentication required',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Ownership Validation', () => {
    beforeEach(() => {
      mockReq.subscriber = {
        id: 'sub-123',
        name: 'Test User',
        email: 'test@example.com',
        plan: 'professional',
        apiKeyId: 'key-123',
      };
    });

    it('should allow access when subscriber ID matches', () => {
      mockReq.params = {
        subscriberId: 'sub-123', // MATCHES subscriber.id
      };

      requireOwnership(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject when subscriber ID does not match', () => {
      mockReq.params = {
        subscriberId: 'sub-999', // DOES NOT MATCH
      };

      requireOwnership(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Forbidden',
          message: 'You can only access your own resources',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass through when no subscriberId in params', () => {
      mockReq.params = {}; // No subscriberId

      requireOwnership(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should pass through when subscriberId is undefined', () => {
      mockReq.params = {
        // subscriberId intentionally omitted (undefined)
        otherParam: 'value',
      };

      requireOwnership(mockReq as AuthenticatedRequest, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });
});
