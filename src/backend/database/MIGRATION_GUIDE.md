# BYOD Migration - Quick Start Guide

This is a quick reference for running the BYOD database migration. For detailed documentation, see `/docs/DATABASE_SCHEMA_UPDATES.md`.

## Prerequisites

- PostgreSQL 15+
- Database backup created
- Migrations tested on staging environment
- Low-traffic window scheduled

## Migration Steps

### Step 1: Backup Database

```bash
# Create backup
pg_dump -U postgres codereply > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backup_*.sql
```

### Step 2: Run Migration 001 (Add Columns)

```bash
psql -U postgres -d codereply -f migrations/001_add_subscriber_to_devices.sql
```

**Expected output:**
```
ALTER TABLE
ALTER TABLE
CREATE INDEX
CREATE INDEX
CREATE TRIGGER
...
```

**Validation:**
```sql
-- Check that subscriber_id column exists
\d gateway_devices

-- Should see: subscriber_id | uuid | (nullable)
```

### Step 3: Run Migration 002 (Migrate Data)

**IMPORTANT:** Before running, decide on migration scenario:

#### Option A: Single Subscriber (all devices to one subscriber)
Edit `002_migrate_device_ownership.sql` and uncomment Scenario A:
```sql
UPDATE gateway_devices
SET subscriber_id = (SELECT id FROM subscribers ORDER BY created_at ASC LIMIT 1)
WHERE subscriber_id IS NULL;
```

#### Option B: Manual Assignment
Edit the script to specify device-to-subscriber mapping.

#### Option C: Default Operator Subscriber (Recommended)
Leave script as-is. It will create an "operator" subscriber and assign all devices.

**Run migration:**
```bash
psql -U postgres -d codereply -f migrations/002_migrate_device_ownership.sql
```

**Expected output:**
```
NOTICE: Created operator subscriber with ID: ...
NOTICE: Assigned X devices to operator subscriber
NOTICE: All devices have been assigned to subscribers successfully.
```

**Validation:**
```sql
-- Check for unassigned devices (should return 0)
SELECT COUNT(*) FROM gateway_devices WHERE subscriber_id IS NULL;
```

### Step 4: Run Migration 003 (Finalize)

```bash
psql -U postgres -d codereply -f migrations/003_finalize_byod_constraints.sql
```

**Expected output:**
```
ALTER TABLE
CREATE INDEX
CREATE VIEW
CREATE FUNCTION
...
NOTICE: ========================================
NOTICE: BYOD Migration Complete
NOTICE: ========================================
```

**Validation:**
```sql
-- Check that subscriber_id is NOT NULL
\d gateway_devices
-- Should see: subscriber_id | uuid | not null

-- Test helper function
SELECT * FROM get_available_devices(
  (SELECT id FROM subscribers LIMIT 1),
  NULL
);

-- Test view
SELECT * FROM active_gateway_devices LIMIT 5;
```

## Post-Migration Checklist

- [ ] All devices have `subscriber_id` assigned
- [ ] `subscribers.device_count` is accurate
- [ ] Views and functions work correctly
- [ ] Triggers fire on INSERT/UPDATE/DELETE
- [ ] API endpoints filter by subscriber_id
- [ ] Dashboard shows correct device counts
- [ ] Message dispatch only sends to subscriber's devices

## Rollback (Emergency Only)

```bash
psql -U postgres -d codereply -f migrations/000_rollback_byod_migration.sql
```

## Common Issues

### Issue: Migration 003 fails with "devices without subscriber"

**Cause:** Migration 002 didn't assign all devices.

**Fix:**
```sql
-- Find unassigned devices
SELECT id, name FROM gateway_devices WHERE subscriber_id IS NULL;

-- Manually assign them
UPDATE gateway_devices
SET subscriber_id = 'your-subscriber-uuid'
WHERE id = 'device-uuid';
```

### Issue: Trigger prevents device insertion

**Cause:** Subscriber has reached device quota.

**Fix:**
```sql
-- Increase quota temporarily
UPDATE subscribers
SET max_devices = max_devices + 1
WHERE id = 'subscriber-uuid';
```

### Issue: Slow queries after migration

**Cause:** Missing indexes or outdated statistics.

**Fix:**
```sql
-- Analyze tables
ANALYZE gateway_devices;
ANALYZE subscribers;
ANALYZE messages;

-- Check index usage
SELECT schemaname, tablename, indexname, idx_scan
FROM pg_stat_user_indexes
WHERE tablename = 'gateway_devices';
```

## Verification Queries

### Check migration status
```sql
-- Count devices by subscriber
SELECT
  s.name,
  COUNT(gd.id) AS device_count,
  s.device_count AS recorded_count
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id AND gd.deleted_at IS NULL
GROUP BY s.id, s.name, s.device_count;
```

### Test device selection
```sql
-- Get available devices for a subscriber
SELECT * FROM get_available_devices(
  (SELECT id FROM subscribers WHERE email = 'your@email.com'),
  NULL
);
```

### Test quota enforcement
```sql
-- Try to add device beyond quota (should fail)
INSERT INTO gateway_devices (subscriber_id, name, device_token)
VALUES (
  (SELECT id FROM subscribers WHERE max_devices = 1 AND device_count = 1 LIMIT 1),
  'Test Device',
  'test-token-' || gen_random_uuid()
);
-- Expected: ERROR: Device quota exceeded
```

## Timeline

| Step | Duration | Description |
|------|----------|-------------|
| Backup | 2-5 min | Database dump |
| Migration 001 | 30 sec | Add columns and indexes |
| Migration 002 | 1 min | Assign devices to subscribers |
| Migration 003 | 30 sec | Finalize constraints |
| Validation | 5 min | Run verification queries |
| **Total** | **10-15 min** | Complete migration |

## Support

- Database Architect: @raj
- Backend Lead: @sheldon
- DevOps: @howard

---

**Status:** Ready for Execution
**Version:** 1.0
**Date:** April 2, 2026
