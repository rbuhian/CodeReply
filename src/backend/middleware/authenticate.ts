/**
 * API Key Authentication Middleware
 * Validates API keys and injects subscriber context into requests
 * Author: Sheldon (Backend Engineer)
 * Date: April 3, 2026
 */

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

/**
 * Extended Request interface with subscriber context
 */
export interface AuthenticatedRequest extends Request {
  subscriber: {
    id: string;
    name: string;
    email: string;
    plan: string;
    apiKeyId: string;
  };
}

/**
 * API Key validation result from database
 */
interface ApiKeyRecord {
  id: string;
  subscriber_id: string;
  subscriber_name: string;
  subscriber_email: string;
  subscriber_plan: string;
  is_active: boolean;
  key_prefix: string;
}

/**
 * Hash an API key using SHA-256
 * This matches the hashing used when creating API keys
 */
function hashApiKey(apiKey: string): string {
  return crypto.createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Extract API key from Authorization header
 * Expected format: "Bearer cr_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
 */
function extractApiKey(authHeader: string | undefined): string | null {
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0] !== 'Bearer') {
    return null;
  }

  const apiKey = parts[1];

  // Validate format: cr_live_* or cr_test_*
  if (!apiKey.match(/^cr_(live|test)_[a-zA-Z0-9]{32}$/)) {
    return null;
  }

  return apiKey;
}

/**
 * Look up API key in database and return subscriber info
 */
async function validateApiKey(apiKey: string): Promise<ApiKeyRecord | null> {
  const keyHash = hashApiKey(apiKey);

  const query = `
    SELECT
      ak.id,
      ak.subscriber_id,
      ak.is_active,
      ak.key_prefix,
      s.name AS subscriber_name,
      s.email AS subscriber_email,
      s.plan AS subscriber_plan
    FROM api_keys ak
    INNER JOIN subscribers s ON ak.subscriber_id = s.id
    WHERE ak.key_hash = $1
  `;

  const result = await pool.query<ApiKeyRecord>(query, [keyHash]);

  if (result.rows.length === 0) {
    return null;
  }

  return result.rows[0];
}

/**
 * Update the last_used_at timestamp for the API key
 */
async function updateLastUsed(apiKeyId: string): Promise<void> {
  const query = `
    UPDATE api_keys
    SET last_used_at = NOW()
    WHERE id = $1
  `;

  await pool.query(query, [apiKeyId]);
}

/**
 * Authentication middleware
 * Validates API key and injects subscriber context
 *
 * @example
 * ```typescript
 * import { authenticate } from '../middleware/authenticate';
 *
 * router.get('/devices', authenticate, async (req: AuthenticatedRequest, res) => {
 *   const { subscriber } = req;
 *   // subscriber.id is guaranteed to exist
 *   const devices = await getDevicesBySubscriber(subscriber.id);
 *   res.json(devices);
 * });
 * ```
 */
export async function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Extract API key from Authorization header
    const apiKey = extractApiKey(req.headers.authorization);

    if (!apiKey) {
      logger.warn('Authentication failed: Missing or invalid Authorization header', {
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Missing or invalid Authorization header. Expected: Bearer cr_live_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Validate API key against database
    const apiKeyRecord = await validateApiKey(apiKey);

    if (!apiKeyRecord) {
      logger.warn('Authentication failed: Invalid API key', {
        keyPrefix: apiKey.substring(0, 12) + '...',
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Check if API key is active
    if (!apiKeyRecord.is_active) {
      logger.warn('Authentication failed: Inactive API key', {
        apiKeyId: apiKeyRecord.id,
        subscriberId: apiKeyRecord.subscriber_id,
        keyPrefix: apiKeyRecord.key_prefix,
        path: req.path,
        method: req.method,
        ip: req.ip,
      });

      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key has been revoked or deactivated',
        timestamp: new Date().toISOString(),
      });
      return;
    }

    // Inject subscriber context into request
    (req as AuthenticatedRequest).subscriber = {
      id: apiKeyRecord.subscriber_id,
      name: apiKeyRecord.subscriber_name,
      email: apiKeyRecord.subscriber_email,
      plan: apiKeyRecord.subscriber_plan,
      apiKeyId: apiKeyRecord.id,
    };

    // Update last_used_at timestamp (async, don't wait)
    updateLastUsed(apiKeyRecord.id).catch((error) => {
      logger.error('Failed to update API key last_used_at', {
        apiKeyId: apiKeyRecord.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    });

    logger.info('Authentication successful', {
      subscriberId: apiKeyRecord.subscriber_id,
      subscriberName: apiKeyRecord.subscriber_name,
      keyPrefix: apiKeyRecord.key_prefix,
      path: req.path,
      method: req.method,
    });

    // Proceed to next middleware
    next();
  } catch (error) {
    logger.error('Authentication error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
      path: req.path,
      method: req.method,
    });

    res.status(500).json({
      error: 'Internal Server Error',
      message: 'An error occurred during authentication',
      timestamp: new Date().toISOString(),
    });
  }
}

/**
 * Optional authentication middleware
 * Tries to authenticate but doesn't fail if no credentials provided
 * Useful for endpoints that have different behavior for authenticated users
 */
export async function optionalAuthenticate(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = extractApiKey(req.headers.authorization);

  if (!apiKey) {
    // No credentials provided, continue without subscriber context
    next();
    return;
  }

  // If credentials provided, validate them (same as authenticate)
  return authenticate(req, res, next);
}
