/**
 * Permission Checking Middleware
 * Validates that authenticated subscribers have required permissions
 * Author: Sheldon (Backend Engineer)
 * Date: April 3, 2026
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { logger } from '../utils/logger';

/**
 * Permission types
 */
export type Permission =
  | 'messages:read'
  | 'messages:write'
  | 'devices:read'
  | 'devices:write'
  | 'api-keys:read'
  | 'api-keys:write';

/**
 * Plan-based default permissions
 * TODO: Move this to database when we add permissions column to api_keys table
 */
const PLAN_PERMISSIONS: Record<string, Permission[]> = {
  starter: [
    'messages:read',
    'messages:write',
    'devices:read',
    'devices:write',
  ],
  professional: [
    'messages:read',
    'messages:write',
    'devices:read',
    'devices:write',
    'api-keys:read',
    'api-keys:write',
  ],
  enterprise: [
    'messages:read',
    'messages:write',
    'devices:read',
    'devices:write',
    'api-keys:read',
    'api-keys:write',
  ],
};

/**
 * Get permissions for a subscriber based on their plan
 * TODO: Query api_keys.permissions column when available
 */
function getPermissionsForPlan(plan: string): Permission[] {
  return PLAN_PERMISSIONS[plan] || PLAN_PERMISSIONS.starter;
}

/**
 * Check if subscriber has required permissions
 */
function hasPermissions(
  userPermissions: Permission[],
  requiredPermissions: Permission[]
): boolean {
  return requiredPermissions.every((required) =>
    userPermissions.includes(required)
  );
}

/**
 * Middleware factory to require specific permissions
 *
 * @param requiredPermissions - Array of permissions required to access the route
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { authenticate } from '../middleware/authenticate';
 * import { requirePermissions } from '../middleware/requirePermissions';
 *
 * // Require both messages:read and messages:write
 * router.post(
 *   '/messages',
 *   authenticate,
 *   requirePermissions(['messages:write']),
 *   async (req, res) => {
 *     // User has messages:write permission
 *   }
 * );
 *
 * // Require multiple permissions
 * router.post(
 *   '/api-keys',
 *   authenticate,
 *   requirePermissions(['api-keys:write']),
 *   async (req, res) => {
 *     // User has api-keys:write permission
 *   }
 * );
 * ```
 */
export function requirePermissions(requiredPermissions: Permission[]) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Check if user is authenticated
      if (!req.subscriber) {
        logger.warn('Permission check failed: No subscriber context', {
          path: req.path,
          method: req.method,
          requiredPermissions,
        });

        res.status(401).json({
          error: 'Unauthorized',
          message: 'Authentication required',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Get user's permissions based on their plan
      // TODO: Query from api_keys.permissions when column is added
      const userPermissions = getPermissionsForPlan(req.subscriber.plan);

      // Check if user has all required permissions
      if (!hasPermissions(userPermissions, requiredPermissions)) {
        logger.warn('Permission check failed: Insufficient permissions', {
          subscriberId: req.subscriber.id,
          subscriberPlan: req.subscriber.plan,
          userPermissions,
          requiredPermissions,
          path: req.path,
          method: req.method,
        });

        res.status(403).json({
          error: 'Forbidden',
          message: 'Insufficient permissions to access this resource',
          required: requiredPermissions,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      logger.debug('Permission check passed', {
        subscriberId: req.subscriber.id,
        requiredPermissions,
        userPermissions,
        path: req.path,
        method: req.method,
      });

      // User has required permissions
      next();
    } catch (error) {
      logger.error('Permission check error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        path: req.path,
        method: req.method,
      });

      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An error occurred during permission check',
        timestamp: new Date().toISOString(),
      });
    }
  };
}

/**
 * Middleware to require subscriber ownership of a resource
 * Validates that req.params.subscriberId matches authenticated subscriber
 *
 * @example
 * ```typescript
 * router.get(
 *   '/subscribers/:subscriberId/devices',
 *   authenticate,
 *   requireOwnership,
 *   async (req, res) => {
 *     // Subscriber can only access their own devices
 *   }
 * );
 * ```
 */
export function requireOwnership(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void {
  if (!req.subscriber) {
    res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  const resourceSubscriberId = req.params.subscriberId;

  if (!resourceSubscriberId) {
    // No subscriberId in params, skip check
    next();
    return;
  }

  if (resourceSubscriberId !== req.subscriber.id) {
    logger.warn('Ownership check failed: Subscriber ID mismatch', {
      authenticatedSubscriberId: req.subscriber.id,
      requestedSubscriberId: resourceSubscriberId,
      path: req.path,
      method: req.method,
    });

    res.status(403).json({
      error: 'Forbidden',
      message: 'You can only access your own resources',
      timestamp: new Date().toISOString(),
    });
    return;
  }

  next();
}
