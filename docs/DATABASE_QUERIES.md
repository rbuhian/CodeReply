# Database Query Patterns

**Project**: CodeReply BYOD v2.0
**Author**: Raj (Database Architect)
**Last Updated**: April 3, 2026

---

## Overview

This document provides standardized query patterns for the CodeReply BYOD system. All queries follow the critical principle of **subscriber isolation** to ensure security and data integrity.

## 🔒 Critical Security Principle

**EVERY database query MUST include subscriber_id filtering** to prevent cross-subscriber data access.

```sql
-- ✅ CORRECT - Always filter by subscriber_id
SELECT * FROM gateway_devices WHERE subscriber_id = $1 AND status = 'ONLINE';

-- ❌ WRONG - Missing subscriber_id filter (security violation!)
SELECT * FROM gateway_devices WHERE status = 'ONLINE';
```

---

## Table of Contents

1. [Device Queries](#device-queries)
2. [Message Queries](#message-queries)
3. [Registration Token Queries](#registration-token-queries)
4. [Quota & Limit Queries](#quota--limit-queries)
5. [Analytics Queries](#analytics-queries)
6. [Performance Optimization](#performance-optimization)

---

## Device Queries

### 1.1 Get All Devices for Subscriber

**Use Case**: List all devices in subscriber dashboard

```sql
SELECT
  id,
  name,
  status,
  sim_carrier,
  sim_number,
  last_heartbeat,
  total_messages_sent,
  total_messages_failed,
  created_at,
  updated_at
FROM gateway_devices
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND deleted_at IS NULL  -- Exclude soft-deleted devices
ORDER BY created_at DESC;
```

**Parameters**:
- `$1`: subscriber_id (UUID)

**Indexes Used**: `idx_gateway_devices_subscriber_deleted`

---

### 1.2 Get Online Devices for Message Dispatch

**Use Case**: Select devices available for sending messages

```sql
SELECT
  id,
  name,
  sim_carrier,
  last_heartbeat,
  total_messages_sent,
  total_messages_failed
FROM gateway_devices
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND status = 'ONLINE'
  AND deleted_at IS NULL
  AND last_heartbeat > NOW() - INTERVAL '5 minutes'  -- Connection freshness check
ORDER BY
  last_heartbeat DESC,
  total_messages_sent ASC  -- Least-loaded device first
LIMIT 1;
```

**Parameters**:
- `$1`: subscriber_id (UUID)

**Indexes Used**: `idx_gateway_devices_dispatch_selection`

---

### 1.3 Get Devices with Carrier Filtering

**Use Case**: Route message to device with matching carrier

```sql
SELECT id, name, sim_carrier, last_heartbeat
FROM gateway_devices
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND sim_carrier = $2
  AND status = 'ONLINE'
  AND deleted_at IS NULL
  AND last_heartbeat > NOW() - INTERVAL '5 minutes'
ORDER BY total_messages_sent ASC  -- Load balancing
LIMIT 1;
```

**Parameters**:
- `$1`: subscriber_id (UUID)
- `$2`: carrier (TEXT) e.g., 'Globe', 'Smart'

**Indexes Used**: `idx_gateway_devices_carrier`

---

### 1.4 Check Device Ownership (Security)

**Use Case**: Validate subscriber owns device before performing action

```sql
SELECT EXISTS (
  SELECT 1
  FROM gateway_devices
  WHERE id = $1
    AND subscriber_id = $2  -- CRITICAL: ownership check
    AND deleted_at IS NULL
) AS is_owner;
```

**Parameters**:
- `$1`: device_id (UUID)
- `$2`: subscriber_id (UUID)

**Returns**: `TRUE` if subscriber owns device, `FALSE` otherwise

---

### 1.5 Get Device Statistics

**Use Case**: Display device performance metrics

```sql
SELECT
  gd.id,
  gd.name,
  gd.status,
  gd.sim_carrier,
  gd.total_messages_sent,
  gd.total_messages_failed,

  -- Success rate
  CASE
    WHEN (gd.total_messages_sent + gd.total_messages_failed) = 0 THEN 100.0
    ELSE ROUND((gd.total_messages_sent::NUMERIC / (gd.total_messages_sent + gd.total_messages_failed)) * 100, 2)
  END AS success_rate,

  -- Messages today
  (
    SELECT COUNT(*)
    FROM messages m
    WHERE m.gateway_id = gd.id
      AND DATE(m.queued_at) = CURRENT_DATE
  ) AS messages_today,

  -- In-flight messages
  (
    SELECT COUNT(*)
    FROM messages m
    WHERE m.gateway_id = gd.id
      AND m.status IN ('DISPATCHED', 'SENT')
  ) AS in_flight_messages,

  gd.last_heartbeat,
  gd.created_at
FROM gateway_devices gd
WHERE gd.id = $1
  AND gd.subscriber_id = $2  -- CRITICAL: ownership check
  AND gd.deleted_at IS NULL;
```

**Parameters**:
- `$1`: device_id (UUID)
- `$2`: subscriber_id (UUID)

---

### 1.6 Soft Delete Device

**Use Case**: Remove device from subscriber's account

```sql
UPDATE gateway_devices
SET deleted_at = NOW(),
    updated_at = NOW()
WHERE id = $1
  AND subscriber_id = $2  -- CRITICAL: ownership check
  AND deleted_at IS NULL;
```

**Parameters**:
- `$1`: device_id (UUID)
- `$2`: subscriber_id (UUID)

**Note**: Trigger `trg_update_device_count` automatically decrements `subscribers.device_count`

---

### 1.7 Update Device Information

**Use Case**: Update device name or metadata

```sql
UPDATE gateway_devices
SET name = $3,
    updated_at = NOW()
WHERE id = $1
  AND subscriber_id = $2  -- CRITICAL: ownership check
  AND deleted_at IS NULL;
```

**Parameters**:
- `$1`: device_id (UUID)
- `$2`: subscriber_id (UUID)
- `$3`: new_name (TEXT)

---

## Message Queries

### 2.1 Get Messages for Subscriber

**Use Case**: Display message history in dashboard

```sql
SELECT
  id,
  to_number,
  body,
  status,
  gateway_id,
  queued_at,
  dispatched_at,
  sent_at,
  delivered_at,
  failed_at,
  error_message
FROM messages
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND queued_at >= $2      -- Date range filter
ORDER BY queued_at DESC
LIMIT $3 OFFSET $4;        -- Pagination
```

**Parameters**:
- `$1`: subscriber_id (UUID)
- `$2`: start_date (TIMESTAMPTZ)
- `$3`: limit (INT)
- `$4`: offset (INT)

**Indexes Used**: `idx_messages_subscriber_queued`

---

### 2.2 Get Message by ID (with Ownership Check)

**Use Case**: Retrieve specific message details

```sql
SELECT
  id,
  subscriber_id,
  to_number,
  body,
  status,
  gateway_id,
  queued_at,
  dispatched_at,
  sent_at,
  delivered_at,
  failed_at,
  error_message,
  webhook_url
FROM messages
WHERE id = $1
  AND subscriber_id = $2;  -- CRITICAL: ownership check
```

**Parameters**:
- `$1`: message_id (UUID)
- `$2`: subscriber_id (UUID)

---

### 2.3 Get Queued Messages for Dispatch

**Use Case**: Message queue worker retrieving messages to dispatch

```sql
SELECT
  id,
  subscriber_id,
  to_number,
  body,
  gateway_id,
  queued_at
FROM messages
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND status = 'QUEUED'
  AND queued_at <= NOW()   -- Ready to send
ORDER BY queued_at ASC
LIMIT $2
FOR UPDATE SKIP LOCKED;    -- Prevent race conditions
```

**Parameters**:
- `$1`: subscriber_id (UUID)
- `$2`: batch_size (INT)

**Indexes Used**: `idx_messages_active`

**Note**: `FOR UPDATE SKIP LOCKED` prevents multiple workers from processing the same message

---

### 2.4 Update Message Status

**Use Case**: Update message status after dispatch/delivery

```sql
UPDATE messages
SET status = $3,
    dispatched_at = CASE WHEN $3 = 'DISPATCHED' THEN NOW() ELSE dispatched_at END,
    sent_at = CASE WHEN $3 = 'SENT' THEN NOW() ELSE sent_at END,
    delivered_at = CASE WHEN $3 = 'DELIVERED' THEN NOW() ELSE delivered_at END,
    failed_at = CASE WHEN $3 = 'FAILED' THEN NOW() ELSE failed_at END,
    error_message = $4,
    updated_at = NOW()
WHERE id = $1
  AND subscriber_id = $2;  -- CRITICAL: ownership check
```

**Parameters**:
- `$1`: message_id (UUID)
- `$2`: subscriber_id (UUID)
- `$3`: new_status (TEXT)
- `$4`: error_message (TEXT, optional)

---

### 2.5 Get Daily Message Count

**Use Case**: Check quota usage

```sql
SELECT COUNT(*) AS messages_today
FROM messages
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND DATE(queued_at) = CURRENT_DATE
  AND status NOT IN ('FAILED', 'REJECTED');
```

**Parameters**:
- `$1`: subscriber_id (UUID)

**Indexes Used**: `idx_messages_daily_quota`

---

### 2.6 Get Messages by Device

**Use Case**: Device-specific message history

```sql
SELECT
  m.id,
  m.to_number,
  m.status,
  m.queued_at,
  m.sent_at,
  m.delivered_at
FROM messages m
INNER JOIN gateway_devices gd ON gd.id = m.gateway_id
WHERE m.gateway_id = $1
  AND m.subscriber_id = $2  -- CRITICAL: ownership check via subscriber
  AND gd.subscriber_id = $2 -- CRITICAL: double-check device ownership
  AND m.queued_at >= $3
ORDER BY m.queued_at DESC;
```

**Parameters**:
- `$1`: device_id (UUID)
- `$2`: subscriber_id (UUID)
- `$3`: start_date (TIMESTAMPTZ)

---

### 2.7 Search Messages by Metadata

**Use Case**: Search messages by custom metadata fields

```sql
SELECT
  id,
  to_number,
  status,
  metadata,
  queued_at
FROM messages
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND metadata @> $2      -- JSON contains query
ORDER BY queued_at DESC
LIMIT 100;
```

**Parameters**:
- `$1`: subscriber_id (UUID)
- `$2`: metadata_filter (JSONB) e.g., `'{"campaign_id": "summer2026"}'`

**Indexes Used**: `idx_messages_metadata_gin`

**Example**:
```sql
-- Find all messages for campaign_id = 'summer2026'
SELECT * FROM messages
WHERE subscriber_id = '...'
  AND metadata @> '{"campaign_id": "summer2026"}';
```

---

## Registration Token Queries

### 3.1 Generate Registration Token

**Use Case**: Subscriber creates token to register new device

```sql
INSERT INTO registration_tokens (
  subscriber_id,
  token_hash,
  expires_at,
  metadata
) VALUES (
  $1,                            -- subscriber_id
  $2,                            -- token_hash (hashed on server)
  NOW() + INTERVAL '1 hour',     -- 1-hour expiry
  $3                             -- metadata (optional)
)
RETURNING id, created_at, expires_at;
```

**Parameters**:
- `$1`: subscriber_id (UUID)
- `$2`: token_hash (TEXT) - SHA256 hash of token
- `$3`: metadata (JSONB, optional)

---

### 3.2 Validate Registration Token

**Use Case**: Android app validates token during registration

```sql
SELECT
  id,
  subscriber_id,
  used,
  expires_at,
  revoked_at
FROM registration_tokens
WHERE token_hash = $1
  AND used = FALSE
  AND expires_at > NOW()
  AND revoked_at IS NULL;
```

**Parameters**:
- `$1`: token_hash (TEXT)

**Returns**: Token record if valid, NULL if invalid/expired/used

---

### 3.3 Mark Token as Used

**Use Case**: After successful device registration

```sql
UPDATE registration_tokens
SET used = TRUE,
    used_at = NOW(),
    used_by_device = $2
WHERE token_hash = $1
  AND used = FALSE
  AND expires_at > NOW()
  AND revoked_at IS NULL;
```

**Parameters**:
- `$1`: token_hash (TEXT)
- `$2`: device_id (UUID)

---

### 3.4 List Active Tokens for Subscriber

**Use Case**: Display tokens in subscriber dashboard

```sql
SELECT
  id,
  created_at,
  expires_at,
  used,
  used_at,
  used_by_device
FROM registration_tokens
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND revoked_at IS NULL
ORDER BY created_at DESC
LIMIT 10;
```

**Parameters**:
- `$1`: subscriber_id (UUID)

---

### 3.5 Revoke Token

**Use Case**: Subscriber cancels unused token

```sql
UPDATE registration_tokens
SET revoked_at = NOW(),
    revoked_by = $2,
    revocation_reason = $3
WHERE id = $1
  AND subscriber_id = $2  -- CRITICAL: ownership check
  AND used = FALSE
  AND revoked_at IS NULL;
```

**Parameters**:
- `$1`: token_id (UUID)
- `$2`: subscriber_id (UUID)
- `$3`: reason (TEXT, optional)

---

## Quota & Limit Queries

### 4.1 Check Daily Message Quota

**Use Case**: Validate subscriber can send more messages

```sql
WITH subscriber_limits AS (
  SELECT
    id,
    COALESCE(daily_message_limit, 100) AS max_daily_messages
  FROM subscribers
  WHERE id = $1
),
messages_today AS (
  SELECT COUNT(*) AS sent_today
  FROM messages
  WHERE subscriber_id = $1
    AND DATE(queued_at) = CURRENT_DATE
    AND status NOT IN ('FAILED', 'REJECTED')
)
SELECT
  sl.max_daily_messages,
  mt.sent_today,
  (sl.max_daily_messages - mt.sent_today) AS remaining,
  (mt.sent_today < sl.max_daily_messages) AS can_send
FROM subscriber_limits sl
CROSS JOIN messages_today mt;
```

**Parameters**:
- `$1`: subscriber_id (UUID)

**Alternative**: Use function `check_daily_quota($1)` for simpler queries

---

### 4.2 Check Device Quota

**Use Case**: Validate subscriber can add more devices

```sql
SELECT
  device_count,
  max_devices,
  (device_count < max_devices) AS can_add_device,
  (max_devices - device_count) AS remaining_quota
FROM subscribers
WHERE id = $1;
```

**Parameters**:
- `$1`: subscriber_id (UUID)

---

### 4.3 Check Hourly Rate Limit

**Use Case**: Prevent burst traffic

```sql
SELECT COUNT(*) AS messages_this_hour
FROM messages
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND queued_at > NOW() - INTERVAL '1 hour'
  AND status NOT IN ('FAILED', 'REJECTED');
```

**Parameters**:
- `$1`: subscriber_id (UUID)

**Alternative**: Use function `check_rate_limit($1, $2)` for simpler queries

---

## Analytics Queries

### 5.1 Subscriber Dashboard Summary

**Use Case**: Display overview stats in dashboard

```sql
SELECT
  s.name,
  s.plan,
  s.device_count,
  s.max_devices,

  -- Devices online
  (
    SELECT COUNT(*)
    FROM gateway_devices gd
    WHERE gd.subscriber_id = s.id
      AND gd.status = 'ONLINE'
      AND gd.deleted_at IS NULL
  ) AS devices_online,

  -- Messages today
  (
    SELECT COUNT(*)
    FROM messages m
    WHERE m.subscriber_id = s.id
      AND DATE(m.queued_at) = CURRENT_DATE
  ) AS messages_today,

  -- Success rate (last 7 days)
  (
    SELECT
      CASE
        WHEN COUNT(*) = 0 THEN NULL
        ELSE ROUND((COUNT(*) FILTER (WHERE status = 'DELIVERED')::NUMERIC / COUNT(*)) * 100, 2)
      END
    FROM messages m
    WHERE m.subscriber_id = s.id
      AND m.queued_at > CURRENT_DATE - INTERVAL '7 days'
  ) AS success_rate_7_days
FROM subscribers s
WHERE s.id = $1;
```

**Parameters**:
- `$1`: subscriber_id (UUID)

**Alternative**: Use view `subscriber_performance_summary` for pre-computed stats

---

### 5.2 Daily Message Statistics

**Use Case**: Message volume chart

```sql
SELECT
  DATE(queued_at) AS date,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE status = 'DELIVERED') AS delivered,
  COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
  ROUND((COUNT(*) FILTER (WHERE status = 'DELIVERED')::NUMERIC / COUNT(*)) * 100, 2) AS success_rate
FROM messages
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND queued_at >= $2
  AND queued_at < $3
GROUP BY DATE(queued_at)
ORDER BY date DESC;
```

**Parameters**:
- `$1`: subscriber_id (UUID)
- `$2`: start_date (TIMESTAMPTZ)
- `$3`: end_date (TIMESTAMPTZ)

**Alternative**: Use view `daily_message_stats` for pre-computed stats

---

### 5.3 Device Performance Comparison

**Use Case**: Compare device performance

```sql
SELECT
  gd.id,
  gd.name,
  gd.sim_carrier,
  gd.total_messages_sent,
  gd.total_messages_failed,
  CASE
    WHEN (gd.total_messages_sent + gd.total_messages_failed) = 0 THEN 100.0
    ELSE ROUND((gd.total_messages_sent::NUMERIC / (gd.total_messages_sent + gd.total_messages_failed)) * 100, 2)
  END AS success_rate,

  -- Messages today
  (
    SELECT COUNT(*)
    FROM messages m
    WHERE m.gateway_id = gd.id
      AND DATE(m.queued_at) = CURRENT_DATE
  ) AS messages_today
FROM gateway_devices gd
WHERE gd.subscriber_id = $1  -- CRITICAL: subscriber filter
  AND gd.deleted_at IS NULL
ORDER BY gd.total_messages_sent DESC;
```

**Parameters**:
- `$1`: subscriber_id (UUID)

**Alternative**: Use view `device_performance_summary` for pre-computed stats

---

### 5.4 Carrier Performance

**Use Case**: Analyze performance by carrier

```sql
SELECT
  COALESCE(gd.sim_carrier, 'Unknown') AS carrier,
  COUNT(*) AS device_count,
  SUM(gd.total_messages_sent) AS total_sent,
  SUM(gd.total_messages_failed) AS total_failed,
  ROUND((SUM(gd.total_messages_sent)::NUMERIC / NULLIF(SUM(gd.total_messages_sent + gd.total_messages_failed), 0)) * 100, 2) AS success_rate
FROM gateway_devices gd
WHERE gd.subscriber_id = $1  -- CRITICAL: subscriber filter
  AND gd.deleted_at IS NULL
GROUP BY gd.sim_carrier
ORDER BY device_count DESC;
```

**Parameters**:
- `$1`: subscriber_id (UUID)

**Alternative**: Use view `carrier_performance` or function `get_carrier_distribution($1)`

---

## Performance Optimization

### 6.1 Query Performance Best Practices

1. **Always use prepared statements** to prevent SQL injection and improve performance
2. **Always filter by subscriber_id first** - uses the most selective index
3. **Use LIMIT** when possible to reduce result set size
4. **Use indexes** - check query plans with `EXPLAIN ANALYZE`
5. **Use materialized views** for expensive analytics queries
6. **Use connection pooling** - reduce connection overhead

---

### 6.2 Index Usage Guidelines

**When to use which index:**

| Query Pattern | Index Used | Example |
|---------------|------------|---------|
| Device by subscriber + status | `idx_gateway_devices_subscriber_status` | Get online devices |
| Device by subscriber + deleted_at | `idx_gateway_devices_subscriber_deleted` | List active devices |
| Device selection for dispatch | `idx_gateway_devices_dispatch_selection` | Message routing |
| Messages by subscriber + status | `idx_messages_subscriber_status` | Filter by status |
| Messages by subscriber + date | `idx_messages_subscriber_queued` | Recent messages |
| Active message queue | `idx_messages_active` | Queue worker |
| Daily quota check | `idx_messages_daily_quota` | Quota validation |
| Token lookup | `idx_registration_tokens_token_hash` | Token validation |

---

### 6.3 Analyzing Query Performance

```sql
-- Check query execution plan
EXPLAIN ANALYZE
SELECT * FROM gateway_devices
WHERE subscriber_id = '550e8400-e29b-41d4-a716-446655440000'
  AND status = 'ONLINE'
  AND deleted_at IS NULL;

-- Check index usage statistics
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND tablename IN ('gateway_devices', 'messages', 'registration_tokens')
ORDER BY idx_scan DESC;

-- Find slow queries (requires pg_stat_statements extension)
SELECT
  query,
  calls,
  ROUND(total_exec_time::NUMERIC, 2) AS total_time_ms,
  ROUND(mean_exec_time::NUMERIC, 2) AS avg_time_ms,
  ROUND((100 * total_exec_time / SUM(total_exec_time) OVER ())::NUMERIC, 2) AS percentage
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;
```

---

### 6.4 Query Optimization Tips

**Slow query: Get devices with message count**
```sql
-- ❌ SLOW - Correlated subquery in SELECT
SELECT
  gd.id,
  gd.name,
  (SELECT COUNT(*) FROM messages WHERE gateway_id = gd.id) AS message_count
FROM gateway_devices gd
WHERE gd.subscriber_id = $1;

-- ✅ FAST - Use JOIN with GROUP BY
SELECT
  gd.id,
  gd.name,
  COUNT(m.id) AS message_count
FROM gateway_devices gd
LEFT JOIN messages m ON m.gateway_id = gd.id
WHERE gd.subscriber_id = $1
GROUP BY gd.id, gd.name;
```

---

## Common Query Examples

### Get Subscriber Overview (Dashboard)

```sql
-- Use pre-built view for best performance
SELECT * FROM subscriber_performance_summary
WHERE subscriber_id = '550e8400-e29b-41d4-a716-446655440000';
```

### Dispatch Message to Optimal Device

```sql
-- Use device selection function
SELECT select_optimal_device(
  '550e8400-e29b-41d4-a716-446655440000',  -- subscriber_id
  'Globe'                                   -- preferred_carrier (optional)
);
```

### Check if Subscriber Can Send Message

```sql
-- Use quota check function
SELECT can_send_message('550e8400-e29b-41d4-a716-446655440000');
```

### Get Monthly Usage Report

```sql
-- Use monthly summary materialized view
SELECT * FROM subscriber_monthly_summary
WHERE subscriber_id = '550e8400-e29b-41d4-a716-446655440000'
  AND year = 2026
  AND month = 4;
```

---

## Security Checklist

Before deploying any query to production:

- [ ] Query includes `subscriber_id` filter (if applicable)
- [ ] Ownership checks are performed for resource access
- [ ] Query uses parameterized inputs (no string concatenation)
- [ ] Query has appropriate indexes
- [ ] Query has been tested with `EXPLAIN ANALYZE`
- [ ] Query handles NULL values appropriately
- [ ] Query uses proper error handling in application code

---

## Additional Resources

- **Database Functions**: `/src/backend/database/functions/`
- **Database Views**: `/src/backend/database/views/`
- **Migration Guide**: `/docs/DATABASE_MIGRATIONS.md`
- **BYOD Architecture**: `/docs/BYOD_ARCHITECTURE.md`

---

**Maintained by**: Raj (Database Architect)
**Questions**: Contact @raj or review query examples in database function files
