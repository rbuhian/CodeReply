# CodeReply Database Schema Documentation

**Version:** 2.0 - BYOD (Bring Your Own Device)
**Date:** April 2, 2026
**Database:** PostgreSQL 15+
**Author:** Raj (Database Architect)

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture Principles](#architecture-principles)
3. [Schema Diagram](#schema-diagram)
4. [Table Definitions](#table-definitions)
5. [Relationships & Foreign Keys](#relationships--foreign-keys)
6. [Indexes](#indexes)
7. [Triggers & Automation](#triggers--automation)
8. [Views & Functions](#views--functions)
9. [Query Patterns](#query-patterns)
10. [Security Considerations](#security-considerations)
11. [Performance Optimization](#performance-optimization)
12. [Migration Scripts](#migration-scripts)

---

## Overview

CodeReply's database implements a **subscriber-owned device model (BYOD)** where each subscriber manages their own Android gateway devices for SMS message delivery. This architecture ensures complete device isolation and secure multi-tenancy.

### Key Characteristics

- **Multi-tenant Architecture**: Complete data isolation between subscribers
- **Device Ownership**: Each device belongs to exactly one subscriber
- **Message Routing**: Messages only route to devices owned by the same subscriber
- **Quota Management**: Per-subscriber device and message quotas
- **Soft Deletes**: Devices can be soft-deleted for recovery purposes
- **Audit Trails**: Comprehensive timestamp and counter tracking

---

## Architecture Principles

### 1. Subscriber Isolation

**Every query MUST filter by `subscriber_id` to prevent cross-subscriber data access.**

```sql
-- CORRECT
SELECT * FROM gateway_devices WHERE subscriber_id = $1;

-- INCORRECT - SECURITY VULNERABILITY
SELECT * FROM gateway_devices WHERE status = 'ONLINE';
```

### 2. Device Ownership

```
┌────────────────┐
│  Subscribers   │
│                │
│  Subscriber A  │──┐
│  Subscriber B  │  │  Owns
│  Subscriber C  │  │
└────────────────┘  │
                    │
                    ▼
         ┌──────────────────┐
         │ Gateway Devices  │
         │                  │
         │  Device A1       │
         │  Device A2       │
         │  Device B1       │
         └──────────────────┘
```

### 3. Message Dispatch Flow

```
Message (subscriber_id: A)
    ↓
Dispatcher: SELECT devices WHERE subscriber_id = A
    ↓
Device A1 or A2 (NEVER B1)
```

---

## Schema Diagram

```
┌─────────────────────┐
│    subscribers      │
│  PK: id (UUID)      │
│  - name             │
│  - email (UNIQUE)   │
│  - plan             │
│  - daily_quota      │
│  - max_devices      │◄─────────┐
│  - device_count     │          │
└─────────────────────┘          │
         ▲                       │
         │                       │
         │ FK                    │
         │                       │
┌─────────────────────┐          │
│    api_keys         │          │
│  PK: id (UUID)      │          │
│  FK: subscriber_id  ├──────────┤
│  - key_hash (UNIQUE)│          │
│  - is_active        │          │
└─────────────────────┘          │
                                 │
┌─────────────────────┐          │
│ registration_tokens │          │
│  PK: id (UUID)      │          │
│  FK: subscriber_id  ├──────────┤
│  - token_hash       │          │
│  - used             │          │
│  - expires_at       │          │
└─────────────────────┘          │
                                 │
┌─────────────────────┐          │
│  gateway_devices    │          │
│  PK: id (UUID)      │          │
│  FK: subscriber_id  ├──────────┘
│  - name             │
│  - device_token     │
│  - status           │
│  - deleted_at       │
│  - total_messages_* │
└─────────────────────┘
         ▲
         │
         │ FK
         │
┌─────────────────────┐
│     messages        │
│  PK: id (UUID)      │
│  FK: subscriber_id  ├──────────┐
│  FK: gateway_id     ├──────────┤
│  - to_number        │          │
│  - body             │          │
│  - status           │          │
│  - queued_at        │          │
└─────────────────────┘          │
         ▲                       │
         │                       │
         │ FK                    │
         │                       │
┌─────────────────────┐          │
│ webhook_deliveries  │          │
│  PK: id (UUID)      │          │
│  FK: message_id     ├──────────┘
│  - url              │
│  - status_code      │
│  - attempt          │
└─────────────────────┘
```

---

## Table Definitions

### subscribers

Subscriber accounts that integrate with CodeReply.

```sql
CREATE TABLE subscribers (
  -- Primary key
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Account information
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,

  -- Plan and quotas
  plan          TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  daily_quota   INT DEFAULT 100 CHECK (daily_quota >= 0),

  -- BYOD: Device quotas
  max_devices   INT DEFAULT 1 CHECK (max_devices > 0),
  device_count  INT DEFAULT 0 CHECK (device_count >= 0 AND device_count <= max_devices),

  -- Webhook configuration
  webhook_secret TEXT,

  -- Timestamps
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Points:**
- `device_count` is auto-maintained by triggers
- `max_devices` varies by plan: free=1, starter=2, pro=10, enterprise=100
- `email` must be unique for authentication
- `plan` determines feature access and quotas

### api_keys

API keys for subscriber authentication.

```sql
CREATE TABLE api_keys (
  -- Primary key
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key
  subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,

  -- Key information
  key_hash        TEXT UNIQUE NOT NULL,  -- SHA-256 hash of actual key
  key_prefix      TEXT NOT NULL,         -- e.g., "cr_live_xxxx" for display
  label           TEXT,                  -- User-friendly label

  -- Status
  is_active       BOOLEAN DEFAULT TRUE,

  -- Usage tracking
  last_used_at    TIMESTAMPTZ,

  -- Audit
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Points:**
- Keys are hashed with SHA-256 before storage
- Prefix shown to users for identification
- `is_active` allows soft disabling without deletion
- Cascade delete: deleting subscriber removes all API keys

### gateway_devices (BYOD Model)

Android devices owned by subscribers for SMS delivery.

```sql
CREATE TABLE gateway_devices (
  -- Primary key
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- BYOD: Device ownership (CRITICAL)
  subscriber_id         UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,

  -- Device identification
  name                  TEXT NOT NULL,
  device_label          TEXT,                          -- User-friendly label
  device_token          TEXT UNIQUE NOT NULL,          -- Hashed JWT

  -- SIM information
  sim_carrier           TEXT,
  sim_number            TEXT,

  -- Device status
  status                TEXT DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'DEGRADED')),
  is_enabled            BOOLEAN DEFAULT TRUE,          -- Can be toggled by subscriber
  last_heartbeat        TIMESTAMPTZ,

  -- Software versions
  app_version           TEXT,
  android_version       TEXT,

  -- BYOD: Message counters (auto-maintained by triggers)
  total_messages_sent   INT DEFAULT 0 CHECK (total_messages_sent >= 0),
  total_messages_failed INT DEFAULT 0 CHECK (total_messages_failed >= 0),

  -- Additional metadata
  notes                 TEXT,                          -- Subscriber notes
  created_by            UUID REFERENCES subscribers(id),

  -- Timestamps
  registered_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),

  -- BYOD: Soft delete support
  deleted_at            TIMESTAMPTZ
);
```

**Key Points:**
- `subscriber_id` is NOT NULL - every device belongs to one subscriber
- Soft delete via `deleted_at` allows recovery
- `total_messages_*` counters updated by triggers
- Device names must be unique per subscriber
- Cascade delete: deleting subscriber removes all devices

### messages

SMS messages queued and dispatched through gateway devices.

```sql
CREATE TABLE messages (
  -- Primary key
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- BYOD: Subscriber ownership (CRITICAL)
  subscriber_id    UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,

  -- BYOD: Device assignment (set during dispatch)
  gateway_id       UUID REFERENCES gateway_devices(id) ON DELETE SET NULL,

  -- Message content
  to_number        TEXT NOT NULL,
  body             TEXT NOT NULL CHECK (char_length(body) <= 918),

  -- Message status
  status           TEXT DEFAULT 'QUEUED' CHECK (status IN (
    'QUEUED', 'DISPATCHED', 'SENT', 'DELIVERED', 'FAILED', 'EXPIRED', 'CANCELLED'
  )),

  -- Retry and TTL
  retry_count      INT DEFAULT 0 CHECK (retry_count >= 0),
  ttl              INT DEFAULT 300 CHECK (ttl > 0),
  priority         TEXT DEFAULT 'NORMAL' CHECK (priority IN ('HIGH', 'NORMAL', 'LOW')),

  -- Webhook configuration
  webhook_url      TEXT,

  -- Additional data
  metadata         JSONB,

  -- Timestamps (auto-set by triggers based on status)
  queued_at        TIMESTAMPTZ DEFAULT NOW(),
  dispatched_at    TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  failed_at        TIMESTAMPTZ,

  -- Error tracking
  error            TEXT,

  -- Constraints
  CONSTRAINT valid_status_timestamps CHECK (
    (status = 'QUEUED' AND dispatched_at IS NULL) OR
    (status IN ('DISPATCHED', 'SENT', 'DELIVERED', 'FAILED') AND dispatched_at IS NOT NULL)
  )
);
```

**Key Points:**
- `subscriber_id` inherited from API authentication
- `gateway_id` must belong to same subscriber (enforced by trigger)
- Status transitions: QUEUED → DISPATCHED → SENT → DELIVERED
- Timestamps auto-set by triggers on status changes
- SET NULL on device delete preserves message history

### registration_tokens (NEW - BYOD)

One-time tokens for secure device registration.

```sql
CREATE TABLE registration_tokens (
  -- Primary key
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key
  subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,

  -- Token information
  token_hash      TEXT UNIQUE NOT NULL,  -- SHA-256 hash of JWT

  -- Usage tracking
  used            BOOLEAN DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  used_by_device  UUID REFERENCES gateway_devices(id) ON DELETE SET NULL,

  -- Expiration (typically 1 hour)
  expires_at      TIMESTAMPTZ NOT NULL,

  -- Audit
  created_at      TIMESTAMPTZ DEFAULT NOW(),

  -- Revocation
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES subscribers(id),
  revocation_reason TEXT,

  -- Additional metadata
  metadata        JSONB,

  -- Constraints
  CONSTRAINT chk_expires_at_after_created CHECK (expires_at > created_at),
  CONSTRAINT chk_used_at_when_used CHECK (
    (used = TRUE AND used_at IS NOT NULL) OR
    (used = FALSE AND used_at IS NULL)
  ),
  CONSTRAINT chk_revoked_at_when_revoked CHECK (
    (revoked_at IS NOT NULL AND revoked_by IS NOT NULL) OR
    (revoked_at IS NULL AND revoked_by IS NULL)
  )
);
```

**Key Points:**
- One-time use tokens for device registration
- Typical expiration: 1 hour from creation
- `used_at` auto-set by trigger when `used = TRUE`
- Can be manually revoked by subscriber
- Cleanup job removes expired tokens after 7 days

### webhook_deliveries

Webhook delivery attempts to subscriber endpoints.

```sql
CREATE TABLE webhook_deliveries (
  -- Primary key
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key
  message_id    UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,

  -- Webhook details
  url           TEXT NOT NULL,
  payload       JSONB NOT NULL,

  -- Delivery status
  status_code   INT,
  attempt       INT DEFAULT 1 CHECK (attempt > 0 AND attempt <= 5),
  delivered_at  TIMESTAMPTZ,
  error         TEXT,

  -- Audit
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**Key Points:**
- Tracks webhook delivery attempts
- Maximum 5 attempts per message
- Stores full payload for debugging
- Cascade delete with messages

---

## Relationships & Foreign Keys

### Foreign Key Summary

| Child Table | Parent Table | Foreign Key | On Delete |
|-------------|--------------|-------------|-----------|
| api_keys | subscribers | subscriber_id | CASCADE |
| gateway_devices | subscribers | subscriber_id | CASCADE |
| gateway_devices | subscribers | created_by | NO ACTION |
| messages | subscribers | subscriber_id | CASCADE |
| messages | gateway_devices | gateway_id | SET NULL |
| registration_tokens | subscribers | subscriber_id | CASCADE |
| registration_tokens | gateway_devices | used_by_device | SET NULL |
| registration_tokens | subscribers | revoked_by | NO ACTION |
| webhook_deliveries | messages | message_id | CASCADE |

### Cascade Behavior

**Deleting a subscriber:**
- Deletes all api_keys (CASCADE)
- Deletes all gateway_devices (CASCADE)
- Deletes all messages (CASCADE)
- Deletes all registration_tokens (CASCADE)

**Deleting a device:**
- Sets gateway_id to NULL in messages (SET NULL)
- Preserves message history
- Sets used_by_device to NULL in tokens (SET NULL)

**Deleting a message:**
- Deletes all webhook_deliveries (CASCADE)

---

## Indexes

### Performance-Critical Indexes

#### subscribers
```sql
CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_plan ON subscribers(plan);
CREATE INDEX idx_subscribers_quota ON subscribers(id, daily_quota, max_devices);
```

#### api_keys
```sql
CREATE INDEX idx_api_keys_subscriber_id ON api_keys(subscriber_id);
CREATE INDEX idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active_lookup ON api_keys(key_hash, is_active, subscriber_id)
  WHERE is_active = TRUE;
```

#### gateway_devices (BYOD-Critical)
```sql
-- Basic subscriber lookups
CREATE INDEX idx_gateway_devices_subscriber_id ON gateway_devices(subscriber_id);
CREATE INDEX idx_gateway_devices_subscriber_status ON gateway_devices(subscriber_id, status);

-- Soft delete queries
CREATE INDEX idx_gateway_devices_subscriber_deleted ON gateway_devices(subscriber_id, deleted_at)
  WHERE deleted_at IS NOT NULL;

-- Device dispatch selection (MOST CRITICAL)
CREATE INDEX idx_gateway_devices_dispatch_selection
  ON gateway_devices(subscriber_id, status, is_enabled, deleted_at, last_heartbeat DESC)
  WHERE deleted_at IS NULL AND status = 'ONLINE';

-- Unique device names per subscriber
CREATE UNIQUE INDEX idx_gateway_devices_unique_name_per_subscriber
  ON gateway_devices(subscriber_id, name)
  WHERE deleted_at IS NULL;

-- Performance analytics
CREATE INDEX idx_gateway_devices_performance
  ON gateway_devices(subscriber_id, total_messages_sent, total_messages_failed)
  WHERE deleted_at IS NULL;
```

#### messages (BYOD-Critical)
```sql
-- Subscriber message queries
CREATE INDEX idx_messages_subscriber_id ON messages(subscriber_id);
CREATE INDEX idx_messages_subscriber_status ON messages(subscriber_id, status);
CREATE INDEX idx_messages_subscriber_queued ON messages(subscriber_id, queued_at DESC, status);

-- Device message history
CREATE INDEX idx_messages_gateway_id ON messages(gateway_id);

-- Active message tracking
CREATE INDEX idx_messages_active ON messages(subscriber_id, gateway_id, status, queued_at)
  WHERE status IN ('QUEUED', 'DISPATCHED', 'SENT');

-- Daily quota calculations
CREATE INDEX idx_messages_daily_quota ON messages(subscriber_id, DATE(queued_at), status);

-- Metadata searches
CREATE INDEX idx_messages_metadata_gin ON messages USING GIN(metadata)
  WHERE metadata IS NOT NULL;
```

#### registration_tokens
```sql
CREATE INDEX idx_registration_tokens_subscriber_id ON registration_tokens(subscriber_id);
CREATE INDEX idx_registration_tokens_token_hash ON registration_tokens(token_hash);
CREATE INDEX idx_registration_tokens_active ON registration_tokens(subscriber_id, expires_at)
  WHERE used = FALSE AND revoked_at IS NULL;
```

---

## Triggers & Automation

### 1. Device Count Maintenance

**Function:** `update_subscriber_device_count()`
**Trigger:** `trg_update_device_count`
**Fires:** AFTER INSERT OR UPDATE OR DELETE ON gateway_devices

Automatically maintains `subscribers.device_count`:
- INSERT: Increments when new device added
- UPDATE: Adjusts when device soft-deleted/undeleted
- DELETE: Decrements when device hard-deleted

```sql
-- Test: Adding device should increment count
BEGIN;
SELECT device_count FROM subscribers WHERE id = '<uuid>';  -- e.g., 1
INSERT INTO gateway_devices (subscriber_id, name, device_token, sim_carrier)
VALUES ('<uuid>', 'Test Device', 'token_123', 'Globe');
SELECT device_count FROM subscribers WHERE id = '<uuid>';  -- Should be 2
ROLLBACK;
```

### 2. Device Quota Enforcement

**Function:** `check_device_quota()`
**Trigger:** `trg_check_device_quota`
**Fires:** BEFORE INSERT OR UPDATE ON gateway_devices

Prevents exceeding device quota at database level:
- Raises exception if `device_count >= max_devices`
- Prevents quota bypass even if application logic fails

```sql
-- Test: Should fail if quota exceeded
BEGIN;
UPDATE subscribers SET max_devices = 1 WHERE id = '<uuid>';
-- Try to insert second device (should fail)
INSERT INTO gateway_devices (subscriber_id, name, device_token, sim_carrier)
VALUES ('<uuid>', 'Second Device', 'token_456', 'Smart');
-- Raises: Device quota exceeded. Subscriber <uuid> has reached the maximum of 1 devices.
ROLLBACK;
```

### 3. Message-Device Ownership Validation

**Function:** `validate_message_device_ownership()`
**Trigger:** `trg_validate_message_device_ownership`
**Fires:** BEFORE INSERT OR UPDATE ON messages

**CRITICAL SECURITY TRIGGER**: Ensures messages only go to subscriber's own devices:
- Validates `message.subscriber_id == device.subscriber_id`
- Raises exception on cross-subscriber dispatch attempt

```sql
-- Test: Should fail cross-subscriber dispatch
BEGIN;
UPDATE messages
SET gateway_id = '<subscriber_b_device_uuid>'
WHERE id = '<subscriber_a_message_uuid>';
-- Raises: Security violation: Cannot dispatch message from subscriber A to device owned by subscriber B
ROLLBACK;
```

### 4. Message Counter Updates

**Function:** `update_device_message_counters()`
**Trigger:** `trg_update_device_message_counters`
**Fires:** AFTER UPDATE ON messages

Auto-updates device counters when message status changes:
- Status → DELIVERED: Increments `total_messages_sent`
- Status → FAILED: Increments `total_messages_failed`

### 5. Message Timestamp Automation

**Function:** `update_message_timestamps()`
**Trigger:** `trg_update_message_timestamps`
**Fires:** BEFORE UPDATE ON messages

Auto-sets timestamp fields based on status changes:
- Status → DISPATCHED: Sets `dispatched_at`
- Status → SENT: Sets `sent_at`
- Status → DELIVERED: Sets `delivered_at`
- Status → FAILED: Sets `failed_at`

### 6. Device updated_at Maintenance

**Function:** `update_gateway_devices_updated_at()`
**Trigger:** `trg_gateway_devices_updated_at`
**Fires:** BEFORE UPDATE ON gateway_devices

Updates `updated_at` timestamp on any row modification.

---

## Views & Functions

### Views

#### active_gateway_devices

Real-time view of active devices with computed metrics:

```sql
SELECT
  id,
  subscriber_id,
  name,
  status,
  total_messages_sent,
  total_messages_failed,
  success_rate,
  is_online,
  is_healthy
FROM active_gateway_devices
WHERE subscriber_id = $1;
```

**Computed Fields:**
- `success_rate`: sent / (sent + failed)
- `is_online`: heartbeat within 2 minutes
- `is_healthy`: online + enabled + recent heartbeat

#### daily_message_stats (Materialized)

Pre-aggregated daily statistics per subscriber:

```sql
SELECT
  subscriber_id,
  date,
  total_messages,
  delivered_count,
  failed_count,
  success_rate
FROM daily_message_stats
WHERE subscriber_id = $1
  AND date >= CURRENT_DATE - INTERVAL '30 days'
ORDER BY date DESC;
```

**Refresh:** Run periodically (e.g., every hour):
```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_message_stats;
```

### Functions

#### get_available_devices(subscriber_id, carrier_preference)

Returns available devices for message dispatch:

```sql
SELECT * FROM get_available_devices(
  '<subscriber_uuid>',
  'Globe Telecom'  -- Optional carrier preference
);
```

Returns:
- device_id
- device_name
- sim_carrier
- status
- in_flight_messages (for load balancing)

Ordered by:
1. Carrier match (if preference specified)
2. Lowest in-flight message count

#### can_add_device(subscriber_id)

Checks if subscriber can add another device:

```sql
SELECT can_add_device('<subscriber_uuid>');  -- Returns TRUE or FALSE
```

#### is_token_valid(token_hash)

Validates registration token:

```sql
SELECT is_token_valid('<sha256_hash>');  -- Returns TRUE or FALSE
```

Checks:
- Token exists
- Not used
- Not expired
- Not revoked

#### cleanup_expired_registration_tokens(days_old)

Cleanup function for expired tokens:

```sql
-- Run as scheduled job (e.g., daily)
SELECT cleanup_expired_registration_tokens(7);  -- Delete tokens expired > 7 days ago
```

---

## Query Patterns

### Device Selection for Dispatch (MOST CRITICAL)

```sql
-- Select best device for message dispatch
SELECT id, name, sim_carrier, last_heartbeat
FROM gateway_devices
WHERE subscriber_id = $1  -- CRITICAL: subscriber filter
  AND status = 'ONLINE'
  AND is_enabled = TRUE
  AND deleted_at IS NULL
  AND last_heartbeat > NOW() - INTERVAL '2 minutes'
ORDER BY total_messages_sent ASC  -- Least loaded device
LIMIT 1;
```

**Index Used:** `idx_gateway_devices_dispatch_selection`

### Subscriber Message History

```sql
-- Get subscriber's recent messages with device info
SELECT
  m.id,
  m.to_number,
  m.body,
  m.status,
  m.queued_at,
  m.delivered_at,
  gd.name AS device_name,
  gd.sim_carrier
FROM messages m
LEFT JOIN gateway_devices gd ON gd.id = m.gateway_id
WHERE m.subscriber_id = $1  -- CRITICAL: subscriber filter
  AND m.status = 'DELIVERED'
ORDER BY m.queued_at DESC
LIMIT 50;
```

**Index Used:** `idx_messages_subscriber_queued`

### Daily Quota Check

```sql
-- Check subscriber's quota usage for today
SELECT
  s.daily_quota,
  COUNT(m.id) AS messages_today,
  (s.daily_quota - COUNT(m.id)) AS remaining
FROM subscribers s
LEFT JOIN messages m ON m.subscriber_id = s.id
  AND DATE(m.queued_at) = CURRENT_DATE
WHERE s.id = $1  -- CRITICAL: subscriber filter
GROUP BY s.id, s.daily_quota;
```

**Index Used:** `idx_messages_daily_quota`

### Device Quota Check

```sql
-- Check if subscriber can add device
SELECT
  max_devices,
  device_count,
  (max_devices - device_count) AS available_slots
FROM subscribers
WHERE id = $1;
```

### Subscriber Dashboard Analytics

```sql
-- Get comprehensive subscriber stats
SELECT
  s.name,
  s.plan,
  s.device_count,
  s.max_devices,
  COUNT(DISTINCT gd.id) FILTER (WHERE gd.status = 'ONLINE') AS online_devices,
  COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE) AS messages_today,
  COUNT(m.id) FILTER (WHERE m.status = 'DELIVERED' AND DATE(m.queued_at) = CURRENT_DATE) AS delivered_today,
  ROUND(
    COUNT(m.id) FILTER (WHERE m.status = 'DELIVERED' AND DATE(m.queued_at) = CURRENT_DATE)::NUMERIC /
    NULLIF(COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE), 0) * 100,
    2
  ) AS success_rate_today
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id AND gd.deleted_at IS NULL
LEFT JOIN messages m ON m.subscriber_id = s.id
WHERE s.id = $1  -- CRITICAL: subscriber filter
GROUP BY s.id, s.name, s.plan, s.device_count, s.max_devices;
```

### Device Performance Report

```sql
-- Per-device performance breakdown
SELECT
  gd.id,
  gd.name,
  gd.sim_carrier,
  gd.status,
  gd.total_messages_sent,
  gd.total_messages_failed,
  ROUND(
    gd.total_messages_sent::NUMERIC /
    NULLIF((gd.total_messages_sent + gd.total_messages_failed), 0),
    4
  ) AS success_rate,
  gd.last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - gd.last_heartbeat)) AS seconds_since_heartbeat
FROM gateway_devices gd
WHERE gd.subscriber_id = $1  -- CRITICAL: subscriber filter
  AND gd.deleted_at IS NULL
ORDER BY gd.total_messages_sent DESC;
```

---

## Security Considerations

### The Golden Rule

**EVERY query MUST filter by `subscriber_id` (except admin operations)**

### Security Checklist

- [x] All device queries filter by `subscriber_id`
- [x] All message queries filter by `subscriber_id`
- [x] Device selection for dispatch filters by message's `subscriber_id`
- [x] Database trigger validates message-device ownership
- [x] Foreign keys enforce referential integrity
- [x] Cascade deletes prevent orphaned records
- [x] Soft deletes allow recovery

### Common Vulnerabilities

| Vulnerability | Example | Fix |
|---------------|---------|-----|
| **Cross-subscriber device access** | `SELECT * FROM gateway_devices WHERE id = $1` | Add: `AND subscriber_id = $2` |
| **Cross-subscriber message access** | `SELECT * FROM messages WHERE id = $1` | Add: `AND subscriber_id = $2` |
| **Cross-subscriber dispatch** | `UPDATE messages SET gateway_id = $1` | Enforced by `trg_validate_message_device_ownership` |
| **Quota bypass** | Insert device without quota check | Enforced by `trg_check_device_quota` |

### Penetration Testing Queries

```sql
-- Test 1: Try to access another subscriber's device
-- Should return 0 rows
SELECT * FROM gateway_devices
WHERE id = '<subscriber_b_device_id>'
  AND subscriber_id = '<subscriber_a_id>';

-- Test 2: Try to access another subscriber's messages
-- Should return 0 rows
SELECT * FROM messages
WHERE id = '<subscriber_b_message_id>'
  AND subscriber_id = '<subscriber_a_id>';

-- Test 3: Try to dispatch to another subscriber's device
-- Should raise exception
BEGIN;
UPDATE messages
SET gateway_id = '<subscriber_b_device_id>'
WHERE id = '<subscriber_a_message_id>';
-- Raises: Security violation
ROLLBACK;
```

---

## Performance Optimization

### Index Maintenance

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Find unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
  AND idx_scan = 0
  AND indexname NOT LIKE '%_pkey';

-- Check index size
SELECT
  tablename,
  indexname,
  pg_size_pretty(pg_relation_size(indexrelid)) AS size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY pg_relation_size(indexrelid) DESC;
```

### Query Performance Analysis

```sql
-- Analyze device selection query
EXPLAIN ANALYZE
SELECT id, name, sim_carrier, status
FROM gateway_devices
WHERE subscriber_id = '<uuid>'
  AND status = 'ONLINE'
  AND is_enabled = TRUE
  AND deleted_at IS NULL
  AND last_heartbeat > NOW() - INTERVAL '2 minutes'
ORDER BY total_messages_sent ASC
LIMIT 1;
```

**Expected:** Index Scan using `idx_gateway_devices_dispatch_selection`

### Table Partitioning (Future)

For high-volume deployments, consider partitioning:

```sql
-- Partition messages by month
CREATE TABLE messages_2026_04 PARTITION OF messages
FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

-- Partition webhook_deliveries by month
CREATE TABLE webhook_deliveries_2026_04 PARTITION OF webhook_deliveries
FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
```

### Connection Pooling

Recommended settings (pg-pool or pgBouncer):
- Pool size: 20-50 connections
- Max client connections: 100-200
- Pool mode: Transaction (for pgBouncer)

---

## Migration Scripts

### Migration Order

1. `001_add_subscriber_to_devices.sql` - Add BYOD columns to gateway_devices and subscribers
2. `002_add_device_quotas.sql` - Add device quota columns (part of 001, separated for clarity)
3. `003_create_registration_tokens.sql` - Create registration_tokens table
4. `004_add_indexes.sql` - Add all performance indexes
5. `005_add_triggers.sql` - Create triggers and automation

### Running Migrations

```bash
# Using psql
psql -d codereply -f src/backend/database/migrations/001_add_subscriber_to_devices.sql
psql -d codereply -f src/backend/database/migrations/002_add_device_quotas.sql
psql -d codereply -f src/backend/database/migrations/003_create_registration_tokens.sql
psql -d codereply -f src/backend/database/migrations/004_add_indexes.sql
psql -d codereply -f src/backend/database/migrations/005_add_triggers.sql
```

### Rollback

Each migration includes rollback instructions in comments. To rollback:

```bash
# Example: Rollback migration 005
psql -d codereply -c "
BEGIN;
DROP TRIGGER IF EXISTS trg_update_device_count ON gateway_devices;
-- ... (see migration file for full rollback)
COMMIT;
"
```

---

## Appendix: Schema Evolution

### Version 1.0 (Operator Model)

- Operator owned all devices
- No subscriber_id on gateway_devices
- Messages routed to any available device

### Version 2.0 (BYOD Model)

- Subscribers own their devices
- subscriber_id foreign key on gateway_devices
- Messages only route to subscriber's devices
- Device quotas and registration tokens
- Soft delete support

### Future Considerations

- Message archival strategy (S3/cold storage)
- Table partitioning for scalability
- Read replicas for analytics
- Multi-region support

---

**Document Version:** 2.0
**Last Updated:** April 2, 2026
**Next Review:** Post-BYOD implementation

For questions or clarifications, consult Raj (Database Architect) or refer to `/src/backend/database/schema.sql`.
