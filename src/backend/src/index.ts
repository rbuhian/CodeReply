/**
 * CodeReply Backend API Server
 * Main entry point for the Express application
 * Author: Sheldon (Backend Engineer)
 * Date: April 3, 2026
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';

import { logger } from '../utils/logger';
import { pool, testDatabaseConnection, closeDatabaseConnection, getPoolStats } from '../config/database';
import { redisClient, initializeRedis, closeRedisConnection, getRedisInfo } from '../config/redis';

// Load environment variables
dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Create Express application
 */
const app: Application = express();

/**
 * Middleware Configuration
 */

// Security middleware
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  credentials: true,
}));

// Body parsing middleware
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// HTTP request logging
if (NODE_ENV === 'development') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

/**
 * Health Check Endpoints
 */

// Basic health check
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '2.0.0',
  });
});

// Detailed health check (database + redis)
app.get('/health/detailed', async (req: Request, res: Response) => {
  try {
    // Test database connection
    let dbStatus = 'disconnected';
    let dbInfo = {};
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      dbStatus = 'connected';
      dbInfo = getPoolStats();
    } catch (error) {
      dbStatus = 'error';
      dbInfo = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    // Test Redis connection
    let redisStatus = 'disconnected';
    let redisInfoData = {};
    try {
      await redisClient.ping();
      redisStatus = 'connected';
      redisInfoData = await getRedisInfo();
    } catch (error) {
      redisStatus = 'error';
      redisInfoData = { error: error instanceof Error ? error.message : 'Unknown error' };
    }

    const isHealthy = dbStatus === 'connected' && redisStatus === 'connected';

    res.status(isHealthy ? 200 : 503).json({
      status: isHealthy ? 'ok' : 'degraded',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: NODE_ENV,
      version: process.env.npm_package_version || '2.0.0',
      services: {
        database: {
          status: dbStatus,
          info: dbInfo,
        },
        redis: {
          status: redisStatus,
          info: redisInfoData,
        },
      },
      memory: {
        used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
        total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
        rss: Math.round(process.memoryUsage().rss / 1024 / 1024),
      },
    });
  } catch (error) {
    logger.error('Health check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Test Endpoints (Development/Testing Only)
 */

// Test database connection with a simple query
app.get('/test/database', async (req: Request, res: Response) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as pg_version');

    res.json({
      success: true,
      current_time: result.rows[0].current_time,
      postgresql_version: result.rows[0].pg_version.split(' ')[1],
      pool: getPoolStats(),
    });
  } catch (error) {
    logger.error('Database test failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Test Redis connection with set/get operations
app.get('/test/redis', async (req: Request, res: Response) => {
  try {
    const testKey = 'test_key_' + Date.now();
    const testValue = 'Hello from Redis at ' + new Date().toISOString();

    // Set a value
    await redisClient.set(testKey, testValue);

    // Get the value back
    const retrievedValue = await redisClient.get(testKey);

    // Clean up - delete the test key
    await redisClient.del(testKey);

    res.json({
      success: true,
      test_key: testKey,
      set_value: testValue,
      retrieved_value: retrievedValue,
      match: testValue === retrievedValue,
      redis_info: await getRedisInfo(),
    });
  } catch (error) {
    logger.error('Redis test failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * API Routes
 */

import deviceRoutes from '../routes/deviceRoutes';

app.use('/v1/devices', deviceRoutes);
// app.use('/v1/messages', messageRoutes);
// app.use('/v1/auth', authRoutes);

/**
 * 404 Handler
 */
app.use((req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `Cannot ${req.method} ${req.path}`,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Global Error Handler
 */
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    method: req.method,
    url: req.url,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    message: NODE_ENV === 'development' ? err.message : 'An unexpected error occurred',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Server Startup
 */
async function startServer() {
  try {
    // Test database connection
    logger.info('Testing database connection...');
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
      logger.error('Failed to connect to database. Exiting...');
      process.exit(1);
    }

    // Initialize Redis
    logger.info('Initializing Redis connection...');
    const redisConnected = await initializeRedis();
    if (!redisConnected) {
      logger.warn('Failed to connect to Redis. Some features may not work.');
    }

    // Start HTTP server
    const server = app.listen(PORT, () => {
      logger.info('Server started successfully', {
        port: PORT,
        environment: NODE_ENV,
        database: 'connected',
        redis: redisConnected ? 'connected' : 'disconnected',
      });

      console.log('');
      console.log('========================================');
      console.log('  CodeReply Backend API Server');
      console.log('========================================');
      console.log(`  Environment: ${NODE_ENV}`);
      console.log(`  Server:      http://localhost:${PORT}`);
      console.log(`  Health:      http://localhost:${PORT}/health`);
      console.log(`  Detailed:    http://localhost:${PORT}/health/detailed`);
      console.log('========================================');
      console.log('');
    });

    // Graceful shutdown
    const gracefulShutdown = async (signal: string) => {
      logger.info(`Received ${signal}, starting graceful shutdown...`);

      server.close(async () => {
        logger.info('HTTP server closed');

        await closeDatabaseConnection();
        await closeRedisConnection();

        logger.info('Graceful shutdown complete');
        process.exit(0);
      });

      // Force shutdown after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined,
    });
    process.exit(1);
  }
}

// Start the server
startServer();

export default app;
