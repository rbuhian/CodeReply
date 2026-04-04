# Monitoring and Observability Guide

**Status**: ✅ Production Ready
**Last Updated**: April 5, 2026

## Overview

This guide covers logging, monitoring, error tracking, and observability for the CodeReply BYOD platform. Proper monitoring ensures system reliability, quick issue detection, and informed decision-making.

---

## Table of Contents

1. [Logging](#logging)
2. [Health Checks](#health-checks)
3. [Error Tracking](#error-tracking)
4. [Performance Monitoring](#performance-monitoring)
5. [Metrics and Analytics](#metrics-and-analytics)
6. [Alerting](#alerting)
7. [Dashboard Setup](#dashboard-setup)

---

## Logging

### Winston Logger Setup

CodeReply uses Winston for structured logging with daily log rotation.

**Location**: `src/backend/utils/logger.ts`

**Log Levels**:
- `error`: Application errors, exceptions
- `warn`: Warnings, deprecated features
- `info`: General application flow (default)
- `http`: HTTP request/response logging
- `debug`: Detailed debugging information
- `verbose`: Very detailed diagnostic information

**Configuration** (`.env`):
```env
LOG_LEVEL=info                    # Minimum log level
LOG_DIR=./logs                    # Log file directory
ENABLE_FILE_LOGGING=true          # Enable file-based logging
```

### Using the Logger

**Basic logging**:
```typescript
import { logger } from './utils/logger';

logger.info('Message sent successfully', { messageId: 'msg-123' });
logger.warn('Device offline', { deviceId: 'dev-456' });
logger.error('Failed to deliver webhook', { error: err.message });
```

**Child logger with context**:
```typescript
import { createChildLogger } from './utils/logger';

const requestLogger = createChildLogger({
  requestId: req.id,
  subscriberId: req.subscriber.id,
});

requestLogger.info('Processing message send request');
```

**HTTP request/response logging**:
```typescript
import { logRequest, logResponse } from './utils/logger';

logRequest({
  method: req.method,
  url: req.url,
  ip: req.ip,
  headers: req.headers,
});

logResponse({
  statusCode: res.statusCode,
  responseTime: Date.now() - startTime,
});
```

**Database query logging** (debug only):
```typescript
import { logQuery } from './utils/logger';

logQuery('SELECT * FROM messages WHERE id = $1', [messageId], 15);
```

### Log File Structure

**Production logs**:
```
logs/
├── combined-2026-04-05.log      # All logs
├── error-2026-04-05.log         # Error logs only
├── combined-2026-04-04.log.gz   # Archived logs
└── error-2026-04-04.log.gz      # Archived errors
```

**Retention**: 14 days (configurable via `maxFiles`)
**Rotation**: Daily at midnight
**Compression**: Gzip for archived logs

---

## Health Checks

### Health Check Endpoint

**Endpoint**: `GET /health`

**Response** (Healthy):
```json
{
  "status": "healthy",
  "timestamp": "2026-04-05T10:30:00.000Z",
  "uptime": 86400,
  "version": "1.0.0",
  "services": {
    "database": "healthy",
    "redis": "healthy"
  }
}
```

**Response** (Unhealthy):
```json
{
  "status": "unhealthy",
  "timestamp": "2026-04-05T10:30:00.000Z",
  "services": {
    "database": "unhealthy",
    "redis": "healthy"
  },
  "errors": ["Database connection failed"]
}
```

### Implementing Health Checks

**Create health check route** (`src/backend/routes/healthRoutes.ts`):
```typescript
import { Router } from 'express';
import { pool } from '../config/database';

const router = Router();

router.get('/health', async (req, res) => {
  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'unknown',
      redis: 'unknown',
    },
  };

  // Check database
  try {
    await pool.query('SELECT 1');
    health.services.database = 'healthy';
  } catch (error) {
    health.services.database = 'unhealthy';
    health.status = 'unhealthy';
  }

  // Check Redis (if applicable)
  // try {
  //   await redis.ping();
  //   health.services.redis = 'healthy';
  // } catch (error) {
  //   health.services.redis = 'unhealthy';
  //   health.status = 'unhealthy';
  // }

  const statusCode = health.status === 'healthy' ? 200 : 503;
  res.status(statusCode).json(health);
});

router.get('/ready', async (req, res) => {
  // Readiness check for Kubernetes
  try {
    await pool.query('SELECT 1');
    res.status(200).json({ ready: true });
  } catch (error) {
    res.status(503).json({ ready: false });
  }
});

router.get('/live', (req, res) => {
  // Liveness check for Kubernetes
  res.status(200).json({ alive: true });
});

export default router;
```

---

## Error Tracking

### Sentry Integration

**Install Sentry**:
```bash
npm install @sentry/node @sentry/profiling-node
```

**Initialize Sentry** (`src/backend/config/sentry.ts`):
```typescript
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

export function initSentry() {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    release: process.env.npm_package_version,
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
    profilesSampleRate: 0.1,
    integrations: [
      new ProfilingIntegration(),
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app: expressApp }),
    ],
  });
}
```

**Add to Express app** (`src/backend/src/index.ts`):
```typescript
import * as Sentry from '@sentry/node';
import { initSentry } from './config/sentry';

// Initialize Sentry before anything else
initSentry();

const app = express();

// Sentry request handler (must be first middleware)
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());

// ... your routes ...

// Sentry error handler (must be before other error handlers)
app.use(Sentry.Handlers.errorHandler());
```

**Manual error reporting**:
```typescript
import * as Sentry from '@sentry/node';

try {
  await sendMessage(messageId);
} catch (error) {
  Sentry.captureException(error, {
    tags: { messageId, subscriberId },
    extra: { messageData },
  });
  throw error;
}
```

**Environment variables**:
```env
SENTRY_DSN=https://your-key@sentry.io/your-project
SENTRY_ENVIRONMENT=production
```

---

## Performance Monitoring

### APM with Datadog

**Install Datadog**:
```bash
npm install dd-trace
```

**Initialize Datadog** (at the very top of `index.ts`):
```typescript
import tracer from 'dd-trace';

tracer.init({
  hostname: process.env.DD_AGENT_HOST || 'localhost',
  port: parseInt(process.env.DD_TRACE_AGENT_PORT || '8126'),
  env: process.env.NODE_ENV || 'development',
  service: 'codereply-backend',
  version: process.env.npm_package_version,
  logInjection: true,
});
```

**Environment variables**:
```env
DD_AGENT_HOST=localhost
DD_TRACE_AGENT_PORT=8126
DD_ENV=production
DD_SERVICE=codereply-backend
DD_VERSION=1.0.0
```

### Custom Metrics

**Track custom metrics**:
```typescript
import tracer from 'dd-trace';

// Increment counter
tracer.dogstatsd.increment('messages.sent', 1, {
  subscriberId,
  carrier,
});

// Record histogram
tracer.dogstatsd.histogram('message.processing_time', duration, {
  status: 'success',
});

// Set gauge
tracer.dogstatsd.gauge('devices.online', onlineCount);
```

---

## Metrics and Analytics

### Key Metrics to Track

**System Metrics**:
- CPU usage
- Memory usage
- Disk I/O
- Network I/O

**Application Metrics**:
- Request rate (req/sec)
- Error rate (%)
- Response time (p50, p95, p99)
- Database query time

**Business Metrics**:
- Messages sent (total, per subscriber)
- Message delivery rate (%)
- Device online count
- Webhook delivery success rate
- API quota usage

### Prometheus Metrics

**Install Prometheus client**:
```bash
npm install prom-client
```

**Create metrics** (`src/backend/utils/metrics.ts`):
```typescript
import { Counter, Histogram, Gauge, register } from 'prom-client';

// Messages sent counter
export const messagesSent = new Counter({
  name: 'messages_sent_total',
  help: 'Total number of messages sent',
  labelNames: ['subscriber_id', 'status'],
});

// Message processing time
export const messageProcessingTime = new Histogram({
  name: 'message_processing_seconds',
  help: 'Message processing time in seconds',
  buckets: [0.1, 0.5, 1, 2, 5],
});

// Active devices gauge
export const activeDevices = new Gauge({
  name: 'devices_online',
  help: 'Number of online devices',
});

// Expose metrics endpoint
export function metricsHandler(req, res) {
  res.set('Content-Type', register.contentType);
  res.send(register.metrics());
}
```

**Add metrics endpoint**:
```typescript
import { metricsHandler } from './utils/metrics';

app.get('/metrics', metricsHandler);
```

---

## Alerting

### Alert Rules

**Critical Alerts** (PagerDuty/OpsGenie):
- Database connection failures
- Redis connection failures
- Error rate > 5%
- Response time p99 > 5s
- All devices offline for a subscriber

**Warning Alerts** (Slack/Email):
- Error rate > 1%
- Response time p95 > 2s
- Disk usage > 80%
- Memory usage > 85%
- Webhook delivery failure rate > 10%

### Slack Notifications

**Install Slack webhook**:
```bash
npm install @slack/webhook
```

**Send alerts** (`src/backend/utils/alerts.ts`):
```typescript
import { IncomingWebhook } from '@slack/webhook';

const webhook = new IncomingWebhook(process.env.SLACK_WEBHOOK_URL);

export async function sendAlert(message: string, level: 'info' | 'warn' | 'error') {
  const emoji = level === 'error' ? ':red_circle:' : level === 'warn' ? ':warning:' : ':white_check_mark:';

  await webhook.send({
    text: `${emoji} *CodeReply Alert*`,
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message,
        },
      },
    ],
  });
}
```

---

## Dashboard Setup

### Grafana Dashboard

**Key Panels**:

1. **System Overview**
   - CPU, Memory, Disk usage
   - Request rate, Error rate
   - Active users/devices

2. **Message Metrics**
   - Messages sent (per minute)
   - Message delivery rate
   - Average processing time
   - Queue depth

3. **Device Metrics**
   - Online devices count
   - Devices by carrier
   - Heartbeat frequency
   - Device registration rate

4. **Webhook Metrics**
   - Webhook success rate
   - Webhook retry count
   - Webhook response time

5. **Database Metrics**
   - Connection pool usage
   - Query performance
   - Slow queries

### Sample Grafana Query

**Messages sent per minute**:
```promql
rate(messages_sent_total[1m])
```

**Error rate**:
```promql
rate(http_requests_total{status=~"5.."}[5m]) / rate(http_requests_total[5m])
```

**P95 response time**:
```promql
histogram_quantile(0.95, rate(http_request_duration_seconds_bucket[5m]))
```

---

## Best Practices

### Logging Best Practices

1. **Use structured logging** (JSON format in production)
2. **Include context** (requestId, subscriberId, messageId)
3. **Don't log sensitive data** (passwords, API keys, phone numbers)
4. **Use appropriate log levels**
5. **Implement log aggregation** (ELK stack, Datadog, CloudWatch)

### Monitoring Best Practices

1. **Set up health checks** for all dependencies
2. **Monitor key business metrics** not just system metrics
3. **Establish SLOs** (Service Level Objectives)
4. **Create runbooks** for common alerts
5. **Test alerting** regularly

### Performance Best Practices

1. **Track slow queries** (> 1 second)
2. **Monitor memory leaks** (heap size over time)
3. **Set up distributed tracing** for complex flows
4. **Profile CPU usage** regularly
5. **Load test** before major releases

---

## Troubleshooting

### Common Issues

**High error rate**:
1. Check database connection
2. Verify Redis connectivity
3. Review recent deployments
4. Check error logs for patterns

**Slow response times**:
1. Identify slow database queries
2. Check connection pool exhaustion
3. Review API rate limiting
4. Analyze CPU/memory usage

**Webhook failures**:
1. Verify webhook URLs are reachable
2. Check webhook timeout settings
3. Review retry logic
4. Monitor webhook delivery logs

---

## Production Checklist

Before deploying to production:

- [ ] Sentry configured and tested
- [ ] Health check endpoints implemented
- [ ] Log aggregation setup (ELK/Datadog)
- [ ] Metrics exported to Prometheus/Datadog
- [ ] Grafana dashboards created
- [ ] Alert rules configured
- [ ] Slack/PagerDuty notifications setup
- [ ] Runbooks documented
- [ ] SLOs defined
- [ ] On-call rotation established

---

## Related Documentation

- **Logger Implementation**: `src/backend/utils/logger.ts`
- **Environment Configuration**: `src/backend/.env.example`
- **Deployment Guide**: `docs/DEPLOYMENT.md`
- **Security Testing**: `src/backend/tests/SECURITY_TESTING.md`

---

**Last Updated**: April 5, 2026
**Status**: ✅ Production Ready
**Maintained by**: @sheldon, @howard
