# Database Migrations Guide

**Project**: CodeReply BYOD v2.0
**Author**: Raj (Database Architect)
**Last Updated**: April 3, 2026

---

## Overview

This document describes the database migration strategy for CodeReply's BYOD (Bring Your Own Device) architecture. The migrations transform the system from an operator-controlled model to a subscriber-owned device model.

## Migration Strategy

### Philosophy

1. **Safety First**: All migrations are designed to be non-destructive and reversible
2. **Zero Downtime**: Migrations use `CONCURRENTLY` where possible to avoid blocking
3. **Data Integrity**: Foreign keys, constraints, and triggers ensure data consistency
4. **Performance**: Indexes are optimized for subscriber-scoped queries
5. **Audit Trail**: All schema changes are documented and versioned

### Migration Order

Migrations must be applied in sequential order:

```
001 → 002 → 003 → 004
```

Never skip migrations or apply them out of order.

---

## Migration Files

### Migration 001: Add Subscriber Ownership
**File**: `001_add_subscriber_to_devices.sql`
**Purpose**: Add subscriber_id to gateway_devices and implement device quotas
**Status**: ✅ Complete

**Changes**:
- Add `subscriber_id` column to `gateway_devices` (FK to subscribers)
- Add `deleted_at` column for soft delete support
- Add `total_messages_sent` and `total_messages_failed` counters
- Add `max_devices` and `device_count` to `subscribers` table
- Create indexes for subscriber-scoped queries
- Create triggers to maintain `device_count` automatically
- Create trigger to enforce device quota limits

**Indexes Created**:
- `idx_gateway_devices_subscriber_id` - Fast subscriber lookups
- `idx_gateway_devices_subscriber_status` - Subscriber + status queries
- `idx_gateway_devices_subscriber_deleted` - Soft delete queries

**Triggers Created**:
- `trg_update_device_count` - Maintains `subscribers.device_count`
- `trg_check_device_quota` - Enforces max device limit

**Rollback**: See embedded rollback script in migration file

---

### Migration 002: Create Registration Tokens
**File**: `002_create_registration_tokens.sql`
**Purpose**: Support secure one-time device registration
**Status**: ✅ Complete

**Changes**:
- Create `registration_tokens` table
- Token hash storage (never store plaintext)
- One-time use enforcement
- Expiration tracking (default 1 hour)
- Revocation support
- Metadata storage for additional context

**Table Schema**:
```sql
CREATE TABLE registration_tokens (
  id              UUID PRIMARY KEY,
  subscriber_id   UUID NOT NULL,
  token_hash      TEXT UNIQUE NOT NULL,
  used            BOOLEAN DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  used_by_device  UUID,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID,
  revocation_reason TEXT,
  metadata        JSONB
);
```

**Indexes Created**:
- `idx_registration_tokens_subscriber_id` - List tokens by subscriber
- `idx_registration_tokens_token_hash` - Fast token lookup
- `idx_registration_tokens_active` - Active (unused, non-expired) tokens

**Constraints**:
- `chk_expires_at_after_created` - Expiry must be after creation
- `chk_used_at_when_used` - Usage timestamp consistency

**Rollback**:
```sql
BEGIN;
DROP TABLE IF EXISTS registration_tokens CASCADE;
ALTER TABLE subscribers DROP COLUMN IF EXISTS webhook_secret;
COMMIT;
```

---

### Migration 003: Add Database Triggers
**File**: `003_add_database_triggers.sql`
**Purpose**: Automate device counting and enforce security
**Status**: ✅ Complete

**Changes**:
- Enhance device count maintenance trigger
- Create device quota enforcement trigger
- **CRITICAL**: Create message-device ownership validation trigger (security)
- Create updated_at timestamp triggers

**Triggers Created**:

#### 1. Device Count Maintenance
```sql
CREATE TRIGGER trg_update_device_count
AFTER INSERT OR UPDATE OR DELETE ON gateway_devices
FOR EACH ROW
EXECUTE FUNCTION update_subscriber_device_count();
```
- Automatically increments/decrements `subscribers.device_count`
- Handles inserts, soft deletes, undeletes, and hard deletes

#### 2. Device Quota Enforcement
```sql
CREATE TRIGGER trg_check_device_quota
BEFORE INSERT OR UPDATE ON gateway_devices
FOR EACH ROW WHEN (NEW.deleted_at IS NULL)
EXECUTE FUNCTION check_device_quota();
```
- Prevents adding devices beyond `max_devices` limit
- Raises clear error: `DEVICE_QUOTA_EXCEEDED`

#### 3. Message-Device Ownership Validation (SECURITY)
```sql
CREATE TRIGGER trg_validate_message_device_ownership
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW WHEN (NEW.gateway_id IS NOT NULL)
EXECUTE FUNCTION validate_message_device_ownership();
```
- **CRITICAL SECURITY**: Prevents cross-subscriber message routing
- Validates that message.subscriber_id matches device.subscriber_id
- Raises error: `SECURITY_VIOLATION` if mismatch detected

#### 4. Timestamp Automation
- `trg_update_subscriber_timestamp` - Auto-update subscribers.updated_at
- `trg_update_gateway_device_timestamp` - Auto-update gateway_devices.updated_at

**Rollback**:
```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_update_device_count ON gateway_devices;
DROP TRIGGER IF EXISTS trg_check_device_quota ON gateway_devices;
DROP TRIGGER IF EXISTS trg_validate_message_device_ownership ON messages;
DROP TRIGGER IF EXISTS trg_update_subscriber_timestamp ON subscribers;
DROP TRIGGER IF EXISTS trg_update_gateway_device_timestamp ON gateway_devices;
DROP FUNCTION IF EXISTS update_subscriber_device_count();
DROP FUNCTION IF EXISTS check_device_quota();
DROP FUNCTION IF EXISTS validate_message_device_ownership();
DROP FUNCTION IF EXISTS update_subscriber_timestamp();
DROP FUNCTION IF EXISTS update_gateway_device_timestamp();
COMMIT;
```

---

### Migration 004: Update Indexes
**File**: `004_update_indexes.sql`
**Purpose**: Optimize indexes for BYOD query patterns
**Status**: ✅ Complete

**Changes**:
- Create subscriber-scoped message indexes
- Create optimized device selection indexes
- Create daily quota tracking index
- Add metadata GIN index for JSON search
- Drop obsolete generic indexes

**Indexes Created**:

#### Messages Table
- `idx_messages_subscriber_status` - Filter messages by subscriber + status
- `idx_messages_subscriber_queued` - Recent messages for subscriber
- `idx_messages_active` - Active messages for queue processing
- `idx_messages_daily_quota` - Fast daily quota checks
- `idx_messages_metadata_gin` - JSON metadata search

#### API Keys Table
- `idx_api_keys_active_lookup` - Fast API key authentication

**Indexes Dropped**:
- `idx_messages_status_only` - Replaced by subscriber-scoped index
- `idx_gateway_devices_status_only` - Replaced by subscriber-scoped index

**Rollback**:
```sql
BEGIN;
DROP INDEX CONCURRENTLY IF EXISTS idx_messages_subscriber_status;
DROP INDEX CONCURRENTLY IF EXISTS idx_messages_subscriber_queued;
DROP INDEX CONCURRENTLY IF EXISTS idx_messages_active;
DROP INDEX CONCURRENTLY IF EXISTS idx_messages_daily_quota;
DROP INDEX CONCURRENTLY IF EXISTS idx_messages_metadata_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_api_keys_active_lookup;
COMMIT;
```

---

## Running Migrations

### Prerequisites

1. **Database Access**: PostgreSQL 15+ with CREATE/ALTER privileges
2. **Backup**: Always backup before running migrations
3. **Environment**: Test in development/staging before production

### Local Development

```bash
# Navigate to backend directory
cd src/backend

# Set database connection
export DATABASE_URL="postgresql://user:password@localhost:5432/codereply_dev"

# Run migrations
npm run migrate

# Or manually with psql
psql $DATABASE_URL -f database/migrations/001_add_subscriber_to_devices.sql
psql $DATABASE_URL -f database/migrations/002_create_registration_tokens.sql
psql $DATABASE_URL -f database/migrations/003_add_database_triggers.sql
psql $DATABASE_URL -f database/migrations/004_update_indexes.sql
```

### Staging/Production

```bash
# Always backup first!
pg_dump $DATABASE_URL > backup_$(date +%Y%m%d_%H%M%S).sql

# Run migrations with transaction safety
psql $DATABASE_URL << EOF
BEGIN;
\i database/migrations/001_add_subscriber_to_devices.sql
\i database/migrations/002_create_registration_tokens.sql
\i database/migrations/003_add_database_triggers.sql
\i database/migrations/004_update_indexes.sql
COMMIT;
EOF

# Verify migrations
psql $DATABASE_URL -c "
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE table_name IN ('gateway_devices', 'registration_tokens', 'subscribers')
  ORDER BY table_name, ordinal_position;
"
```

---

## Rollback Procedures

### Full BYOD Rollback

If you need to completely revert the BYOD migration:

```bash
psql $DATABASE_URL -f database/migrations/000_rollback_byod_migration.sql
```

**⚠️ WARNING**: This will:
- Remove ALL subscriber ownership data
- Drop registration tokens table
- Remove device quotas
- Revert to operator-controlled model

### Individual Migration Rollback

Rollback migrations in reverse order:

```sql
-- Rollback 004
\i database/migrations/004_update_indexes.sql -- see rollback section

-- Rollback 003
\i database/migrations/003_add_database_triggers.sql -- see rollback section

-- Rollback 002
DROP TABLE IF EXISTS registration_tokens CASCADE;

-- Rollback 001
\i database/migrations/001_add_subscriber_to_devices.sql -- see rollback section
```

---

## Testing Migrations

### Automated Testing

Create a test script to verify migrations:

```bash
#!/bin/bash
# test_migrations.sh

set -e

echo "Creating test database..."
createdb codereply_migration_test

echo "Running migrations..."
psql codereply_migration_test -f migrations/001_add_subscriber_to_devices.sql
psql codereply_migration_test -f migrations/002_create_registration_tokens.sql
psql codereply_migration_test -f migrations/003_add_database_triggers.sql
psql codereply_migration_test -f migrations/004_update_indexes.sql

echo "Verifying schema..."
psql codereply_migration_test -c "
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gateway_devices' AND column_name = 'subscriber_id'
  ) AS has_subscriber_id;
"

echo "Testing rollback..."
psql codereply_migration_test -f migrations/000_rollback_byod_migration.sql

echo "Cleanup..."
dropdb codereply_migration_test

echo "✅ Migration tests passed!"
```

### Manual Testing Checklist

After running migrations, verify:

- [ ] `gateway_devices` has `subscriber_id` column
- [ ] `gateway_devices` has `deleted_at` column
- [ ] `subscribers` has `max_devices` and `device_count` columns
- [ ] `registration_tokens` table exists
- [ ] All indexes exist (check with `\di` in psql)
- [ ] All triggers exist (check with `\dy` in psql)
- [ ] Foreign key constraints are active
- [ ] Test device quota enforcement:
  ```sql
  -- Should fail if exceeding max_devices
  INSERT INTO gateway_devices (subscriber_id, ...) VALUES (...);
  ```
- [ ] Test cross-subscriber security:
  ```sql
  -- Should fail with SECURITY_VIOLATION
  INSERT INTO messages (subscriber_id, gateway_id)
  VALUES ('subscriber-a-id', 'subscriber-b-device-id');
  ```

---

## Monitoring & Maintenance

### Check Migration Status

```sql
-- Check if all BYOD columns exist
SELECT
  table_name,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_name IN ('gateway_devices', 'subscribers', 'registration_tokens')
  AND column_name IN ('subscriber_id', 'max_devices', 'device_count', 'deleted_at')
ORDER BY table_name, column_name;

-- Check triggers
SELECT
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name LIKE '%device%' OR trigger_name LIKE '%subscriber%'
ORDER BY event_object_table, trigger_name;

-- Check indexes
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename IN ('gateway_devices', 'messages', 'registration_tokens', 'api_keys')
ORDER BY tablename, indexname;
```

### Performance Monitoring

```sql
-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan AS index_scans,
  idx_tup_read AS tuples_read,
  idx_tup_fetch AS tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- Check table sizes
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

---

## Troubleshooting

### Issue: Migration fails with "relation already exists"

**Cause**: Migration was partially applied

**Solution**:
```sql
-- Check what exists
\d gateway_devices
\d registration_tokens

-- Drop problematic objects
DROP TABLE IF EXISTS registration_tokens CASCADE;
ALTER TABLE gateway_devices DROP COLUMN IF EXISTS subscriber_id CASCADE;

-- Re-run migration
\i migrations/001_add_subscriber_to_devices.sql
```

### Issue: Trigger fires too many times

**Cause**: Recursive trigger or missing condition

**Solution**:
```sql
-- Disable trigger temporarily
ALTER TABLE gateway_devices DISABLE TRIGGER trg_update_device_count;

-- Fix data manually
UPDATE subscribers SET device_count = (
  SELECT COUNT(*) FROM gateway_devices
  WHERE subscriber_id = subscribers.id AND deleted_at IS NULL
);

-- Re-enable trigger
ALTER TABLE gateway_devices ENABLE TRIGGER trg_update_device_count;
```

### Issue: Foreign key constraint violation

**Cause**: Orphaned records or incorrect subscriber_id

**Solution**:
```sql
-- Find orphaned devices
SELECT * FROM gateway_devices WHERE subscriber_id NOT IN (SELECT id FROM subscribers);

-- Assign to default subscriber or delete
UPDATE gateway_devices SET subscriber_id = 'default-subscriber-id'
WHERE subscriber_id NOT IN (SELECT id FROM subscribers);
```

---

## Migration Checklist

Use this checklist when applying migrations:

### Pre-Migration
- [ ] Backup database
- [ ] Test migrations in development environment
- [ ] Review rollback scripts
- [ ] Schedule maintenance window (if needed)
- [ ] Notify team of upcoming changes

### During Migration
- [ ] Run migrations in correct order (001 → 002 → 003 → 004)
- [ ] Monitor for errors
- [ ] Verify each migration completes successfully
- [ ] Check trigger creation
- [ ] Check index creation

### Post-Migration
- [ ] Verify schema changes
- [ ] Test device registration flow
- [ ] Test message routing with subscriber filtering
- [ ] Test quota enforcement
- [ ] Test cross-subscriber security
- [ ] Monitor query performance
- [ ] Update application code if needed
- [ ] Document any issues encountered

---

## Additional Resources

- **BYOD Architecture**: See `docs/BYOD_ARCHITECTURE.md`
- **Database Queries**: See `docs/DATABASE_QUERIES.md`
- **Implementation Summary**: See `docs/BYOD_IMPLEMENTATION_SUMMARY.md`
- **Agent Support**: Contact @raj for database questions

---

**Last Review**: April 3, 2026
**Next Review**: April 17, 2026
**Maintained by**: Raj (Database Architect)
