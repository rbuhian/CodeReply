/**
 * Rate Limiting Middleware
 * Prevents API abuse by limiting requests per API key
 * Author: Sheldon (Backend Engineer)
 * Date: April 3, 2026
 */

import { Response, NextFunction } from 'express';
import { AuthenticatedRequest } from './authenticate';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  /**
   * Maximum number of requests allowed in the window
   */
  maxRequests: number;

  /**
   * Time window in seconds
   */
  windowSeconds: number;

  /**
   * Optional: Custom key prefix for Redis
   */
  keyPrefix?: string;
}

/**
 * Default rate limits by plan
 */
const PLAN_RATE_LIMITS: Record<string, RateLimitConfig> = {
  starter: {
    maxRequests: 100,
    windowSeconds: 60, // 100 requests per minute
  },
  professional: {
    maxRequests: 1000,
    windowSeconds: 60, // 1000 requests per minute
  },
  enterprise: {
    maxRequests: 10000,
    windowSeconds: 60, // 10000 requests per minute
  },
};

/**
 * Get rate limit config for a plan
 */
function getRateLimitForPlan(plan: string): RateLimitConfig {
  return PLAN_RATE_LIMITS[plan] || PLAN_RATE_LIMITS.starter;
}

/**
 * Rate limiting middleware using Redis
 * Uses sliding window algorithm for accurate rate limiting
 *
 * @param config - Optional rate limit configuration (defaults to plan-based limits)
 * @returns Express middleware function
 *
 * @example
 * ```typescript
 * import { authenticate } from '../middleware/authenticate';
 * import { rateLimit } from '../middleware/rateLimit';
 *
 * // Use plan-based rate limits
 * router.post('/messages', authenticate, rateLimit(), async (req, res) => {
 *   // Rate limited based on subscriber's plan
 * });
 *
 * // Use custom rate limits
 * router.post(
 *   '/expensive-operation',
 *   authenticate,
 *   rateLimit({ maxRequests: 10, windowSeconds: 60 }),
 *   async (req, res) => {
 *     // Limited to 10 requests per minute
 *   }
 * );
 * ```
 */
export function rateLimit(customConfig?: RateLimitConfig) {
  return async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      // Check if user is authenticated
      if (!req.subscriber) {
        // No rate limiting for unauthenticated requests
        // (They should be rejected by authenticate middleware anyway)
        next();
        return;
      }

      // Get rate limit config
      const config = customConfig || getRateLimitForPlan(req.subscriber.plan);
      const keyPrefix = config.keyPrefix || 'ratelimit';

      // Create Redis key: ratelimit:apiKeyId:timestamp_window
      const now = Math.floor(Date.now() / 1000);
      const windowStart = now - (now % config.windowSeconds);
      const redisKey = `${keyPrefix}:${req.subscriber.apiKeyId}:${windowStart}`;

      // Increment request count
      const count = await redisClient.incr(redisKey);

      // Set expiry on first request in window
      if (count === 1) {
        await redisClient.expire(redisKey, config.windowSeconds * 2);
      }

      // Check if limit exceeded
      if (count > config.maxRequests) {
        const resetTime = windowStart + config.windowSeconds;
        const retryAfter = resetTime - now;

        logger.warn('Rate limit exceeded', {
          subscriberId: req.subscriber.id,
          apiKeyId: req.subscriber.apiKeyId,
          plan: req.subscriber.plan,
          count,
          limit: config.maxRequests,
          windowSeconds: config.windowSeconds,
          path: req.path,
          method: req.method,
        });

        res.status(429)
          .set({
            'X-RateLimit-Limit': config.maxRequests.toString(),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': resetTime.toString(),
            'Retry-After': retryAfter.toString(),
          })
          .json({
            error: 'Too Many Requests',
            message: `Rate limit exceeded. Maximum ${config.maxRequests} requests per ${config.windowSeconds} seconds.`,
            limit: config.maxRequests,
            windowSeconds: config.windowSeconds,
            retryAfter,
            timestamp: new Date().toISOString(),
          });
        return;
      }

      // Set rate limit headers
      const remaining = Math.max(0, config.maxRequests - count);
      const resetTime = windowStart + config.windowSeconds;

      res.set({
        'X-RateLimit-Limit': config.maxRequests.toString(),
        'X-RateLimit-Remaining': remaining.toString(),
        'X-RateLimit-Reset': resetTime.toString(),
      });

      logger.debug('Rate limit check passed', {
        subscriberId: req.subscriber.id,
        count,
        limit: config.maxRequests,
        remaining,
      });

      // Allow request
      next();
    } catch (error) {
      // If Redis is down, log error but don't block requests
      logger.error('Rate limit error (allowing request)', {
        error: error instanceof Error ? error.message : 'Unknown error',
        subscriberId: req.subscriber?.id,
        path: req.path,
        method: req.method,
      });

      // Allow request to proceed even if rate limiting fails
      next();
    }
  };
}

/**
 * Middleware to check if subscriber has exceeded their daily quota
 * This is different from rate limiting - it checks total usage vs plan limits
 *
 * @example
 * ```typescript
 * router.post(
 *   '/messages',
 *   authenticate,
 *   checkDailyQuota,
 *   async (req, res) => {
 *     // Subscriber hasn't exceeded daily message quota
 *   }
 * );
 * ```
 */
export async function checkDailyQuota(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.subscriber) {
      next();
      return;
    }

    // TODO: Implement daily quota checking when we have usage tracking
    // For now, just pass through
    next();
  } catch (error) {
    logger.error('Daily quota check error', {
      error: error instanceof Error ? error.message : 'Unknown error',
      subscriberId: req.subscriber?.id,
    });

    // Allow request even if check fails
    next();
  }
}
