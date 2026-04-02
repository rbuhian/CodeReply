# Database Schema Updates - BYOD Migration

**Version:** 2.0.0
**Date:** April 2, 2026
**Status:** Ready for Implementation
**Architect:** Raj (Database Architect)

---

## Table of Contents

1. [Overview](#overview)
2. [Migration Strategy](#migration-strategy)
3. [Schema Changes](#schema-changes)
4. [Migration Scripts](#migration-scripts)
5. [Index Strategy](#index-strategy)
6. [Data Integrity](#data-integrity)
7. [Performance Considerations](#performance-considerations)
8. [Rollback Plan](#rollback-plan)
9. [Testing Checklist](#testing-checklist)
10. [Example Queries](#example-queries)

---

## Overview

### Background

CodeReply is transitioning from an **operator-controlled device model** to a **BYOD (Bring Your Own Device) model**, where subscribers own and manage their own Android gateway devices instead of the operator controlling all devices centrally.

### Key Changes

The migration involves:

1. **Device Ownership**: Each device now belongs to a specific subscriber
2. **Device Quotas**: Subscribers have device limits based on their plan
3. **Soft Delete**: Devices can be soft-deleted and restored
4. **Isolation**: Subscribers can only dispatch messages to their own devices
5. **Self-Management**: Subscribers register, manage, and monitor their devices

### Impact

| Component | Change |
|-----------|--------|
| **gateway_devices table** | Add `subscriber_id` FK, soft delete, quotas |
| **subscribers table** | Add `max_devices`, `device_count` columns |
| **messages table** | No schema changes, but queries updated |
| **API endpoints** | Filter devices by subscriber_id |
| **WebSocket dispatch** | Only dispatch to subscriber's devices |
| **Dashboard** | Show subscriber's devices only |

---

## Migration Strategy

### Three-Phase Approach

The migration is split into three sequential scripts to ensure safety:

```
Phase 1: Add Columns & Indexes
   ↓
Phase 2: Migrate Data
   ↓
Phase 3: Enforce Constraints
```

### Migration Files

| File | Description | Dependencies |
|------|-------------|--------------|
| `001_add_subscriber_to_devices.sql` | Add columns, indexes, triggers | None |
| `002_migrate_device_ownership.sql` | Assign devices to subscribers | 001 |
| `003_finalize_byod_constraints.sql` | Make subscriber_id NOT NULL, add views | 002 |
| `000_rollback_byod_migration.sql` | Revert all changes | N/A (rollback) |

### Execution Order

```bash
# Step 1: Add schema changes (safe - nullable columns)
psql -U postgres -d codereply -f migrations/001_add_subscriber_to_devices.sql

# Step 2: Migrate data (assign devices to subscribers)
psql -U postgres -d codereply -f migrations/002_migrate_device_ownership.sql

# Step 3: Finalize constraints (make subscriber_id NOT NULL)
psql -U postgres -d codereply -f migrations/003_finalize_byod_constraints.sql
```

### Rollback (if needed)

```bash
psql -U postgres -d codereply -f migrations/000_rollback_byod_migration.sql
```

---

## Schema Changes

### 1. gateway_devices Table

#### New Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `subscriber_id` | UUID | NO (after migration) | NULL | Foreign key to subscribers table |
| `deleted_at` | TIMESTAMPTZ | YES | NULL | Soft delete timestamp |
| `total_messages_sent` | INT | NO | 0 | Cumulative sent count |
| `total_messages_failed` | INT | NO | 0 | Cumulative failed count |
| `created_by` | UUID | YES | NULL | Subscriber who registered device |
| `updated_at` | TIMESTAMPTZ | NO | NOW() | Last update timestamp |
| `device_label` | TEXT | YES | NULL | User-friendly label |
| `notes` | TEXT | YES | NULL | Subscriber notes |
| `is_enabled` | BOOLEAN | NO | TRUE | Toggle for dispatch |

#### Foreign Keys

```sql
ALTER TABLE gateway_devices
ADD CONSTRAINT fk_gateway_devices_subscriber
  FOREIGN KEY (subscriber_id)
  REFERENCES subscribers(id)
  ON DELETE CASCADE;
```

**Cascade Behavior**: When a subscriber is deleted, all their devices are also deleted.

#### Before and After

**Before (v1.0 - Operator Model)**
```sql
CREATE TABLE gateway_devices (
  id              UUID PRIMARY KEY,
  name            TEXT NOT NULL,
  device_token    TEXT UNIQUE NOT NULL,
  sim_carrier     TEXT,
  sim_number      TEXT,
  status          TEXT DEFAULT 'OFFLINE',
  last_heartbeat  TIMESTAMPTZ,
  app_version     TEXT,
  android_version TEXT,
  registered_at   TIMESTAMPTZ DEFAULT NOW()
);
```

**After (v2.0 - BYOD Model)**
```sql
CREATE TABLE gateway_devices (
  id                    UUID PRIMARY KEY,
  subscriber_id         UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  device_label          TEXT,
  device_token          TEXT UNIQUE NOT NULL,
  sim_carrier           TEXT,
  sim_number            TEXT,
  status                TEXT DEFAULT 'OFFLINE',
  is_enabled            BOOLEAN DEFAULT TRUE,
  last_heartbeat        TIMESTAMPTZ,
  app_version           TEXT,
  android_version       TEXT,
  total_messages_sent   INT DEFAULT 0,
  total_messages_failed INT DEFAULT 0,
  notes                 TEXT,
  created_by            UUID REFERENCES subscribers(id),
  registered_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ
);
```

### 2. subscribers Table

#### New Columns

| Column | Type | Nullable | Default | Description |
|--------|------|----------|---------|-------------|
| `max_devices` | INT | NO | 1 | Max devices allowed by plan |
| `device_count` | INT | NO | 0 | Current active device count |

#### Plan-Based Quotas

| Plan | Max Devices |
|------|-------------|
| Free | 1 |
| Starter | 2 |
| Pro | 10 |
| Enterprise | 100 (or custom) |

### 3. New Database Objects

#### Views

**`active_gateway_devices`**
- Joins `gateway_devices` with `subscribers`
- Excludes soft-deleted devices
- Computes `success_rate`, `is_online`, `is_healthy`

#### Functions

**`get_available_devices(subscriber_id, carrier_preference)`**
- Returns available devices for a subscriber
- Orders by carrier match, load, and heartbeat
- Used for message dispatch

**`can_add_device(subscriber_id)`**
- Returns boolean indicating if subscriber can add more devices
- Checks against plan quota

#### Triggers

**`trg_update_device_count`**
- Automatically maintains `device_count` in subscribers table
- Fires on INSERT, UPDATE, DELETE of gateway_devices

**`trg_check_device_quota`**
- Enforces device quota before inserting new devices
- Raises exception if quota exceeded

**`trg_gateway_devices_updated_at`**
- Auto-updates `updated_at` timestamp on device updates

---

## Migration Scripts

### Migration 001: Add Columns and Indexes

**File:** `001_add_subscriber_to_devices.sql`

**What it does:**
1. Adds `subscriber_id` column (nullable initially)
2. Adds foreign key constraint with CASCADE delete
3. Creates indexes for performance
4. Adds soft delete column (`deleted_at`)
5. Adds device count tracking columns
6. Updates subscribers table with quota columns
7. Creates triggers for device count maintenance
8. Creates trigger for quota enforcement

**Safety:** Safe to run on production. All new columns are nullable initially.

**Execution time:** < 1 minute (depends on table size)

### Migration 002: Migrate Device Ownership

**File:** `002_migrate_device_ownership.sql`

**What it does:**
1. Assigns existing devices to subscribers
2. Provides three migration scenarios:
   - **Scenario A**: Single-tenant (all devices to one subscriber)
   - **Scenario B**: Manual assignment (specify device-to-subscriber mapping)
   - **Scenario C**: Create default "operator" subscriber
3. Validates that all devices have been assigned
4. Recalculates device counts for all subscribers
5. Generates migration report

**Important:** Choose the appropriate scenario for your setup before running.

**Default behavior:** Creates an "operator" subscriber and assigns all devices to it.

### Migration 003: Finalize Constraints

**File:** `003_finalize_byod_constraints.sql`

**What it does:**
1. Pre-migration validation (ensures all devices are assigned)
2. Makes `subscriber_id` NOT NULL
3. Adds unique constraint on device names per subscriber
4. Adds audit columns (`created_by`, `updated_at`)
5. Creates view for active devices
6. Creates helper functions for device selection
7. Generates final migration report

**Safety:** Will fail if any devices lack `subscriber_id`. This is intentional.

**Execution time:** < 1 minute

### Rollback Script

**File:** `000_rollback_byod_migration.sql`

**What it does:**
- Drops all views, functions, triggers
- Drops all indexes
- Removes all BYOD-related columns
- Reverts to v1.0 schema

**Data loss:** All device-to-subscriber assignments will be lost.

**Use case:** Emergency rollback only.

---

## Index Strategy

### Primary Indexes

| Index Name | Columns | Type | Purpose |
|------------|---------|------|---------|
| `idx_gateway_devices_subscriber_id` | `subscriber_id` | B-tree | Filter devices by subscriber |
| `idx_gateway_devices_subscriber_status` | `subscriber_id, status` | B-tree | Get online devices for subscriber |
| `idx_gateway_devices_subscriber_deleted` | `subscriber_id, deleted_at` | B-tree (partial) | Query soft-deleted devices |
| `idx_gateway_devices_unique_name_per_subscriber` | `subscriber_id, name` | Unique (partial) | Enforce unique names per subscriber |

### Existing Indexes (unchanged)

| Index Name | Columns | Purpose |
|------------|---------|---------|
| `idx_messages_subscriber_id` | `subscriber_id` | Filter messages by subscriber |
| `idx_messages_gateway_id` | `gateway_id` | Filter messages by device |
| `idx_messages_status` | `status` | Filter by message status |
| `idx_gateway_devices_status` | `status` | Filter devices by status |

### Index Usage Patterns

#### Query: Get all devices for a subscriber
```sql
SELECT * FROM gateway_devices
WHERE subscriber_id = ? AND deleted_at IS NULL;
```
**Index used:** `idx_gateway_devices_subscriber_id`

#### Query: Get online devices for a subscriber
```sql
SELECT * FROM gateway_devices
WHERE subscriber_id = ? AND status = 'ONLINE' AND deleted_at IS NULL;
```
**Index used:** `idx_gateway_devices_subscriber_status`

#### Query: Get available devices (helper function)
```sql
SELECT * FROM get_available_devices(?::UUID, 'Globe Telecom');
```
**Indexes used:**
- `idx_gateway_devices_subscriber_id`
- `idx_gateway_devices_subscriber_status`
- `idx_messages_gateway_id` (for in-flight count)

### Performance Impact

| Table | Before | After | Index Overhead |
|-------|--------|-------|----------------|
| gateway_devices | 2 indexes | 6 indexes | +4 indexes (~20% more storage) |
| subscribers | 2 indexes | 2 indexes | No change |
| messages | 5 indexes | 5 indexes | No change |

**Recommendation:** Monitor index usage after deployment. Drop unused indexes if necessary.

---

## Data Integrity

### Foreign Key Constraints

#### gateway_devices.subscriber_id → subscribers.id

**Constraint:** `fk_gateway_devices_subscriber`

**Behavior:**
- `ON DELETE CASCADE`: When subscriber is deleted, their devices are deleted too
- `ON UPDATE CASCADE`: When subscriber.id changes, gateway_devices.subscriber_id updates

**Rationale:** Subscribers own their devices. When a subscriber account is removed, their devices should also be removed.

#### gateway_devices.created_by → subscribers.id

**Constraint:** Not enforced at DB level (nullable)

**Rationale:** `created_by` tracks who registered the device (admin vs. self-registration). It's informational, not critical for integrity.

### Triggers for Data Consistency

#### Device Count Maintenance

**Trigger:** `trg_update_device_count`

**Fires on:** `gateway_devices` INSERT, UPDATE, DELETE

**Maintains:** `subscribers.device_count`

**Logic:**
- INSERT: Increment `device_count` if `deleted_at IS NULL`
- UPDATE (soft delete): Decrement `device_count`
- UPDATE (restore): Increment `device_count`
- DELETE: Decrement `device_count` if device was active

**Example:**
```sql
-- Before
subscriber.device_count = 3

-- Insert new device
INSERT INTO gateway_devices (subscriber_id, name, ...) VALUES (...);

-- After
subscriber.device_count = 4  -- Automatically incremented
```

#### Device Quota Enforcement

**Trigger:** `trg_check_device_quota`

**Fires on:** `gateway_devices` BEFORE INSERT, UPDATE

**Validates:** `device_count < max_devices`

**Behavior:**
```sql
-- If quota exceeded
RAISE EXCEPTION 'Device quota exceeded. Subscriber % has reached the maximum of % devices.'
```

**Example:**
```sql
-- Subscriber has max_devices = 2, device_count = 2

-- Try to add 3rd device
INSERT INTO gateway_devices (subscriber_id, name, ...) VALUES (...);

-- Result: ERROR: Device quota exceeded
```

### Soft Delete Implementation

**Column:** `deleted_at TIMESTAMPTZ`

**Semantics:**
- `NULL`: Device is active
- `NOT NULL`: Device is soft-deleted

**Benefits:**
1. **Audit trail**: Keep history of deleted devices
2. **Recovery**: Restore accidentally deleted devices
3. **Analytics**: Track device churn

**Queries must filter:**
```sql
WHERE deleted_at IS NULL  -- Active devices only
```

**Hard delete (cleanup):**
```sql
DELETE FROM gateway_devices
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '30 days';
```

---

## Performance Considerations

### Query Performance

#### Before BYOD (v1.0)
```sql
-- Get all devices (operator has access to all)
SELECT * FROM gateway_devices WHERE status = 'ONLINE';
```
**Index used:** `idx_gateway_devices_status`
**Rows scanned:** All devices

#### After BYOD (v2.0)
```sql
-- Get subscriber's devices
SELECT * FROM gateway_devices
WHERE subscriber_id = ? AND status = 'ONLINE' AND deleted_at IS NULL;
```
**Index used:** `idx_gateway_devices_subscriber_status`
**Rows scanned:** Only subscriber's devices (much fewer)

**Result:** Queries are faster due to better filtering.

### Message Dispatch Performance

The `get_available_devices()` function optimizes device selection:

```sql
SELECT * FROM get_available_devices(
  'subscriber-uuid',
  'Globe Telecom'  -- Carrier preference
);
```

**Query plan:**
1. Filter by `subscriber_id` (index scan)
2. Filter by `status = 'ONLINE'` (index scan)
3. Filter by `deleted_at IS NULL` (index scan)
4. Filter by heartbeat (sequential)
5. Order by carrier match, load, heartbeat

**Optimization:** Pre-computed `in_flight_messages` count using a subquery.

### Trigger Performance

**Concern:** Triggers add overhead on INSERT/UPDATE/DELETE.

**Mitigation:**
- Triggers are lightweight (single UPDATE per operation)
- Only fire when necessary (`subscriber_id` changes)
- Use indexed columns for UPDATE queries

**Benchmark (estimated):**
- INSERT without trigger: ~0.5ms
- INSERT with trigger: ~0.7ms
- Overhead: ~0.2ms per operation

**Conclusion:** Acceptable overhead for data integrity benefits.

### Index Maintenance

**Concern:** More indexes = slower writes.

**Reality:**
- PostgreSQL handles index updates efficiently
- 4 additional indexes on `gateway_devices` is reasonable
- Table is relatively small (< 10,000 devices typically)

**Monitoring:**
```sql
-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename = 'gateway_devices'
ORDER BY idx_scan ASC;
```

Drop indexes with `idx_scan = 0` (never used).

---

## Rollback Plan

### When to Rollback

Rollback only if:
1. Critical data corruption detected
2. Unacceptable performance degradation
3. Business requirement changes (revert to operator model)

### Rollback Process

**Step 1: Backup**
```bash
pg_dump -U postgres codereply > backup_before_rollback.sql
```

**Step 2: Execute rollback script**
```bash
psql -U postgres -d codereply -f migrations/000_rollback_byod_migration.sql
```

**Step 3: Verify**
```sql
-- Check that subscriber_id is gone
\d gateway_devices
```

**Step 4: Restart application**
```bash
# Ensure app code is compatible with v1.0 schema
```

### Data Loss Warning

**What is lost:**
- All device-to-subscriber assignments
- Soft-deleted device records (if hard-deleted during cleanup)
- Device count history

**What is preserved:**
- All message records
- Subscriber accounts
- API keys
- Device records (but not their ownership)

### Re-Migration

If you need to re-apply BYOD after rollback:

```bash
# Re-run migrations from scratch
psql -U postgres -d codereply -f migrations/001_add_subscriber_to_devices.sql
psql -U postgres -d codereply -f migrations/002_migrate_device_ownership.sql
psql -U postgres -d codereply -f migrations/003_finalize_byod_constraints.sql
```

---

## Testing Checklist

### Pre-Migration Testing

- [ ] Backup production database
- [ ] Test migrations on staging environment
- [ ] Verify migration scripts run without errors
- [ ] Check that all devices are assigned after migration 002
- [ ] Validate constraint enforcement (quota, foreign keys)

### Post-Migration Testing

- [ ] Verify all devices have `subscriber_id` assigned
- [ ] Test device registration by subscriber
- [ ] Test device quota enforcement
- [ ] Test soft delete and restore
- [ ] Verify message dispatch only to subscriber's devices
- [ ] Test `get_available_devices()` function
- [ ] Verify indexes are being used (EXPLAIN ANALYZE)
- [ ] Check trigger functionality (device count updates)

### API Testing

- [ ] GET `/devices` returns only subscriber's devices
- [ ] POST `/devices/register` enforces quota
- [ ] DELETE `/devices/:id` soft-deletes device
- [ ] POST `/messages` only dispatches to subscriber's devices
- [ ] Dashboard shows correct device counts

### Performance Testing

- [ ] Benchmark device queries before/after migration
- [ ] Benchmark message dispatch before/after
- [ ] Monitor database CPU/memory during load test
- [ ] Check slow query log for new bottlenecks

### Data Integrity Testing

- [ ] Delete a subscriber → verify devices cascade-deleted
- [ ] Soft-delete device → verify device_count decrements
- [ ] Restore device → verify device_count increments
- [ ] Try to exceed quota → verify exception raised
- [ ] Insert duplicate device name per subscriber → verify blocked

---

## Example Queries

### Device Management

#### Get all active devices for a subscriber
```sql
SELECT id, name, device_label, sim_carrier, status, last_heartbeat
FROM gateway_devices
WHERE subscriber_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
  AND deleted_at IS NULL
ORDER BY registered_at DESC;
```

#### Get device with lowest load
```sql
SELECT gd.id, gd.name, COUNT(m.id) AS in_flight_messages
FROM gateway_devices gd
LEFT JOIN messages m ON m.gateway_id = gd.id AND m.status IN ('QUEUED', 'DISPATCHED')
WHERE gd.subscriber_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
  AND gd.deleted_at IS NULL
  AND gd.is_enabled = TRUE
  AND gd.status = 'ONLINE'
  AND gd.last_heartbeat > NOW() - INTERVAL '2 minutes'
GROUP BY gd.id, gd.name
ORDER BY COUNT(m.id) ASC
LIMIT 1;
```

#### Soft-delete a device
```sql
UPDATE gateway_devices
SET deleted_at = NOW()
WHERE id = 'device-uuid'
  AND subscriber_id = 'subscriber-uuid'
  AND deleted_at IS NULL;
```

#### Restore a soft-deleted device
```sql
UPDATE gateway_devices
SET deleted_at = NULL
WHERE id = 'device-uuid'
  AND subscriber_id = 'subscriber-uuid'
  AND deleted_at IS NOT NULL;
```

### Message Dispatch

#### Get available devices using helper function
```sql
SELECT * FROM get_available_devices(
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',  -- subscriber_id
  'Globe Telecom'                          -- carrier_preference
);
```

#### Dispatch message to subscriber's device
```sql
INSERT INTO messages (
  subscriber_id, gateway_id, to_number, body, status, dispatched_at
) VALUES (
  'subscriber-uuid',
  'device-uuid',
  '+639171234567',
  'Your OTP is 123456',
  'DISPATCHED',
  NOW()
) RETURNING id;
```

### Analytics

#### Subscriber dashboard summary
```sql
SELECT
  s.name,
  s.plan,
  s.device_count AS active_devices,
  s.max_devices AS device_quota,
  COUNT(CASE WHEN gd.status = 'ONLINE' THEN 1 END) AS online_devices,
  COUNT(CASE WHEN DATE(m.queued_at) = CURRENT_DATE THEN 1 END) AS messages_today
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id AND gd.deleted_at IS NULL
LEFT JOIN messages m ON m.subscriber_id = s.id
WHERE s.id = 'subscriber-uuid'
GROUP BY s.id, s.name, s.plan, s.device_count, s.max_devices;
```

#### Per-device performance
```sql
SELECT
  gd.name,
  gd.sim_carrier,
  COUNT(m.id) AS total_messages,
  COUNT(CASE WHEN m.status = 'DELIVERED' THEN 1 END) AS delivered,
  ROUND(COUNT(CASE WHEN m.status = 'DELIVERED' THEN 1 END)::NUMERIC / NULLIF(COUNT(m.id), 0) * 100, 2) AS success_rate_percent
FROM gateway_devices gd
LEFT JOIN messages m ON m.gateway_id = gd.id AND m.queued_at >= NOW() - INTERVAL '7 days'
WHERE gd.subscriber_id = 'subscriber-uuid' AND gd.deleted_at IS NULL
GROUP BY gd.id, gd.name, gd.sim_carrier
ORDER BY total_messages DESC;
```

### Quota Enforcement

#### Check if subscriber can add more devices
```sql
SELECT can_add_device('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx');
-- Returns: true or false
```

#### Get subscribers approaching device quota
```sql
SELECT
  name, email, plan,
  device_count AS current,
  max_devices AS max,
  ROUND(device_count::NUMERIC / max_devices * 100, 2) AS quota_used_percent
FROM subscribers
WHERE device_count::NUMERIC / max_devices >= 0.8
ORDER BY quota_used_percent DESC;
```

---

## Additional Resources

### Related Files

| File | Location | Purpose |
|------|----------|---------|
| Migration 001 | `/src/backend/database/migrations/001_add_subscriber_to_devices.sql` | Add columns & indexes |
| Migration 002 | `/src/backend/database/migrations/002_migrate_device_ownership.sql` | Migrate data |
| Migration 003 | `/src/backend/database/migrations/003_finalize_byod_constraints.sql` | Finalize constraints |
| Rollback | `/src/backend/database/migrations/000_rollback_byod_migration.sql` | Revert changes |
| Schema | `/src/backend/database/schema.sql` | Complete BYOD schema |
| Example Queries | `/src/backend/database/example_queries.sql` | Common query patterns |

### Next Steps

1. **Review migration scripts** with the team
2. **Test on staging environment** thoroughly
3. **Schedule migration window** (low-traffic period)
4. **Backup production database** before migration
5. **Run migrations** sequentially
6. **Deploy updated backend code** that filters by subscriber_id
7. **Monitor performance** for 24-48 hours
8. **Update API documentation** to reflect BYOD model

### Support

For questions or issues, contact:
- **Database Architect:** Raj (@raj)
- **Backend Lead:** Sheldon (@sheldon)
- **DevOps:** Howard (@howard)

---

**Document Version:** 1.0
**Last Updated:** April 2, 2026
**Status:** Ready for Review
