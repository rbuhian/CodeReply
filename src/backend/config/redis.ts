/**
 * Redis Configuration
 * Redis client setup for message queue and caching
 * Author: Sheldon (Backend Engineer)
 * Date: April 3, 2026
 */

import { createClient, RedisClientType } from 'redis';
import { logger } from '../utils/logger';

/**
 * Redis client configuration
 */
const redisConfig = {
  url: process.env.REDIS_URL || 'redis://localhost:6379',
  password: process.env.REDIS_PASSWORD || undefined,
  socket: {
    reconnectStrategy: (retries: number) => {
      if (retries > 10) {
        logger.error('Redis reconnection failed after 10 attempts');
        return new Error('Redis reconnection limit exceeded');
      }
      // Exponential backoff: 100ms, 200ms, 400ms, 800ms, etc.
      const delay = Math.min(retries * 100, 3000);
      logger.warn(`Redis reconnecting in ${delay}ms (attempt ${retries})`);
      return delay;
    },
    connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '10000', 10),
  },
};

/**
 * Create and export the Redis client
 */
export const redisClient: RedisClientType = createClient(redisConfig);

/**
 * Initialize Redis connection
 */
export async function initializeRedis(): Promise<boolean> {
  try {
    await redisClient.connect();

    const ping = await redisClient.ping();
    logger.info('Redis connection successful', {
      ping,
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });

    return true;
  } catch (error) {
    logger.error('Redis connection failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      url: process.env.REDIS_URL || 'redis://localhost:6379',
    });
    return false;
  }
}

/**
 * Graceful shutdown: Close Redis connection
 */
export async function closeRedisConnection(): Promise<void> {
  try {
    await redisClient.quit();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis connection', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get Redis client info
 */
export async function getRedisInfo(): Promise<Record<string, string>> {
  try {
    const info = await redisClient.info();
    const lines = info.split('\r\n');
    const result: Record<string, string> = {};

    for (const line of lines) {
      if (line && !line.startsWith('#')) {
        const [key, value] = line.split(':');
        if (key && value) {
          result[key] = value;
        }
      }
    }

    return result;
  } catch (error) {
    logger.error('Failed to get Redis info', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    return {};
  }
}

// Handle Redis errors
redisClient.on('error', (err) => {
  logger.error('Redis client error', {
    error: err.message,
    stack: err.stack,
  });
});

redisClient.on('ready', () => {
  logger.info('Redis client ready');
});

redisClient.on('reconnecting', () => {
  logger.warn('Redis client reconnecting');
});

redisClient.on('end', () => {
  logger.warn('Redis client connection ended');
});
