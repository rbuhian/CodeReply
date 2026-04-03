/**
 * Database Configuration
 * PostgreSQL connection pool setup for CodeReply BYOD
 * Author: Sheldon (Backend Engineer)
 * Date: April 3, 2026
 */

import { Pool, PoolConfig } from 'pg';
import { logger } from '../utils/logger';

/**
 * PostgreSQL connection pool configuration
 */
const poolConfig: PoolConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'codereply',
  user: process.env.DB_USER || 'codereply',
  password: process.env.DB_PASSWORD || 'codereply_dev_password',

  // Connection pool settings
  max: parseInt(process.env.DB_POOL_MAX || '20', 10), // Maximum number of clients in the pool
  min: parseInt(process.env.DB_POOL_MIN || '5', 10),  // Minimum number of clients in the pool
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10), // Close idle clients after 30 seconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT || '10000', 10), // Return an error after 10 seconds if connection cannot be established

  // Statement timeout (prevent long-running queries)
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10), // 30 seconds

  // Application name for debugging
  application_name: 'codereply-backend',
};

/**
 * Create and export the PostgreSQL connection pool
 */
export const pool = new Pool(poolConfig);

/**
 * Test database connection on startup
 */
export async function testDatabaseConnection(): Promise<boolean> {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as current_time, version() as pg_version');

    logger.info('Database connection successful', {
      timestamp: result.rows[0].current_time,
      version: result.rows[0].pg_version.split(' ')[1], // Extract version number
      host: poolConfig.host,
      database: poolConfig.database,
      pool: {
        max: poolConfig.max,
        min: poolConfig.min,
      },
    });

    client.release();
    return true;
  } catch (error) {
    logger.error('Database connection failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      host: poolConfig.host,
      database: poolConfig.database,
    });
    return false;
  }
}

/**
 * Graceful shutdown: Close all database connections
 */
export async function closeDatabaseConnection(): Promise<void> {
  try {
    await pool.end();
    logger.info('Database connection pool closed');
  } catch (error) {
    logger.error('Error closing database connection pool', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

/**
 * Get current pool statistics
 */
export function getPoolStats() {
  return {
    totalCount: pool.totalCount,
    idleCount: pool.idleCount,
    waitingCount: pool.waitingCount,
  };
}

// Handle pool errors
pool.on('error', (err) => {
  logger.error('Unexpected database pool error', {
    error: err.message,
    stack: err.stack,
  });
});

pool.on('connect', () => {
  logger.debug('New database client connected to pool');
});

pool.on('remove', () => {
  logger.debug('Database client removed from pool');
});
