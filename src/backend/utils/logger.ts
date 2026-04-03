/**
 * Logger Configuration
 * Winston-based logging setup for CodeReply BYOD
 * Author: Sheldon (Backend Engineer)
 * Date: April 3, 2026
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';

const LOG_LEVEL = process.env.LOG_LEVEL || 'info';
const LOG_DIR = process.env.LOG_DIR || path.join(__dirname, '../../logs');

/**
 * Custom log format for console output
 */
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...metadata }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    if (Object.keys(metadata).length > 0) {
      msg += ` ${JSON.stringify(metadata)}`;
    }

    return msg;
  })
);

/**
 * JSON format for file output
 */
const fileFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

/**
 * Create transports array
 */
const transports: winston.transport[] = [
  // Console transport (always enabled for development)
  new winston.transports.Console({
    format: consoleFormat,
    level: LOG_LEVEL,
  }),
];

// File transports (only in production or when explicitly enabled)
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true') {
  // Error logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      format: fileFormat,
      maxSize: '20m',
      maxFiles: '14d', // Keep logs for 14 days
      zippedArchive: true,
    })
  );

  // Combined logs
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      format: fileFormat,
      maxSize: '20m',
      maxFiles: '14d',
      zippedArchive: true,
    })
  );
}

/**
 * Create and export the Winston logger instance
 */
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: fileFormat,
  transports,
  exitOnError: false,
});

/**
 * Create a child logger with additional context
 *
 * @example
 * const requestLogger = createChildLogger({ requestId: '123' });
 * requestLogger.info('Processing request');
 */
export function createChildLogger(metadata: Record<string, unknown>) {
  return logger.child(metadata);
}

/**
 * Log HTTP request details
 */
export function logRequest(req: {
  method: string;
  url: string;
  ip?: string;
  headers?: Record<string, unknown>;
}) {
  logger.info('HTTP Request', {
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.headers?.['user-agent'],
  });
}

/**
 * Log HTTP response details
 */
export function logResponse(res: {
  statusCode: number;
  responseTime?: number;
}) {
  const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

  logger.log(level, 'HTTP Response', {
    statusCode: res.statusCode,
    responseTime: res.responseTime ? `${res.responseTime}ms` : undefined,
  });
}

/**
 * Log database query (use sparingly, only for debugging)
 */
export function logQuery(query: string, params?: unknown[], duration?: number) {
  if (LOG_LEVEL === 'debug') {
    logger.debug('Database Query', {
      query,
      params,
      duration: duration ? `${duration}ms` : undefined,
    });
  }
}

// Log unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', {
    reason,
    promise,
  });
});

// Log uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', {
    error: error.message,
    stack: error.stack,
  });

  // Exit process after logging
  process.exit(1);
});

// Log process warnings
process.on('warning', (warning) => {
  logger.warn('Process Warning', {
    name: warning.name,
    message: warning.message,
    stack: warning.stack,
  });
});

logger.info('Logger initialized', {
  level: LOG_LEVEL,
  environment: process.env.NODE_ENV || 'development',
  fileLogging: process.env.NODE_ENV === 'production' || process.env.ENABLE_FILE_LOGGING === 'true',
});
