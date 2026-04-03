-- ============================================================================
-- Migration: 002_add_device_quotas.sql
-- Description: Add device quota columns to subscribers table
-- Version: 2.0 - BYOD (Bring Your Own Device)
-- Date: 2026-04-02
-- Author: Raj (Database Architect)
-- ============================================================================
-- This migration adds device quota management to the subscribers table.
-- Note: This is part of 001_add_subscriber_to_devices.sql but separated
-- for clarity in the task requirements.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Verify prerequisites
-- ============================================================================

-- Ensure subscribers table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'subscribers'
  ) THEN
    RAISE EXCEPTION 'Migration failed: subscribers table does not exist';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Add device quota columns
-- ============================================================================

-- Add max_devices column (quota limit based on plan)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'max_devices'
  ) THEN
    ALTER TABLE subscribers
    ADD COLUMN max_devices INT DEFAULT 1;
  END IF;
END $$;

-- Add device_count column (current active device count)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'device_count'
  ) THEN
    ALTER TABLE subscribers
    ADD COLUMN device_count INT DEFAULT 0;
  END IF;
END $$;

-- Add constraints to ensure valid values
ALTER TABLE subscribers
ADD CONSTRAINT IF NOT EXISTS chk_max_devices_positive
CHECK (max_devices > 0);

ALTER TABLE subscribers
ADD CONSTRAINT IF NOT EXISTS chk_device_count_non_negative
CHECK (device_count >= 0);

ALTER TABLE subscribers
ADD CONSTRAINT IF NOT EXISTS chk_device_count_within_quota
CHECK (device_count <= max_devices);

-- Add comments for documentation
COMMENT ON COLUMN subscribers.max_devices IS
'Maximum number of devices allowed for this subscriber based on their plan.';

COMMENT ON COLUMN subscribers.device_count IS
'Current count of active (non-deleted) devices owned by this subscriber. Auto-maintained by trigger.';

-- ============================================================================
-- STEP 3: Set default quotas based on plan
-- ============================================================================

-- Update existing subscribers with plan-based quotas
UPDATE subscribers SET max_devices = 1 WHERE plan = 'free' AND max_devices = 1;
UPDATE subscribers SET max_devices = 2 WHERE plan = 'starter' AND max_devices = 1;
UPDATE subscribers SET max_devices = 10 WHERE plan = 'pro' AND max_devices = 1;
UPDATE subscribers SET max_devices = 100 WHERE plan = 'enterprise' AND max_devices = 1;

-- ============================================================================
-- STEP 4: Initialize device_count for existing subscribers
-- ============================================================================

-- Calculate current device count based on gateway_devices table
UPDATE subscribers s
SET device_count = (
  SELECT COUNT(*)
  FROM gateway_devices gd
  WHERE gd.subscriber_id = s.id
    AND gd.deleted_at IS NULL
);

-- ============================================================================
-- STEP 5: Create index for quota checks
-- ============================================================================

-- Index to support quota validation queries
CREATE INDEX IF NOT EXISTS idx_subscribers_device_quota
ON subscribers(id, device_count, max_devices);

COMMENT ON INDEX idx_subscribers_device_quota IS
'Supports efficient device quota validation queries.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

-- Verify columns exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'max_devices'
  ) THEN
    RAISE EXCEPTION 'Migration failed: max_devices column not created';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'device_count'
  ) THEN
    RAISE EXCEPTION 'Migration failed: device_count column not created';
  END IF;
END $$;

-- Verify no subscribers exceed their quota
DO $$
DECLARE
  violation_count INT;
BEGIN
  SELECT COUNT(*) INTO violation_count
  FROM subscribers
  WHERE device_count > max_devices;

  IF violation_count > 0 THEN
    RAISE WARNING 'Found % subscribers exceeding device quota. Manual review required.', violation_count;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Check if subscriber can add another device:
-- SELECT id, name, device_count, max_devices,
--        (max_devices - device_count) AS available_slots
-- FROM subscribers
-- WHERE id = '<subscriber_uuid>';

-- List subscribers approaching quota limit:
-- SELECT id, name, plan, device_count, max_devices,
--        ROUND((device_count::NUMERIC / max_devices::NUMERIC) * 100, 2) AS quota_usage_pct
-- FROM subscribers
-- WHERE device_count >= (max_devices * 0.8)
-- ORDER BY quota_usage_pct DESC;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- BEGIN;
--
-- -- Remove index
-- DROP INDEX IF EXISTS idx_subscribers_device_quota;
--
-- -- Remove constraints
-- ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS chk_device_count_within_quota;
-- ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS chk_device_count_non_negative;
-- ALTER TABLE subscribers DROP CONSTRAINT IF EXISTS chk_max_devices_positive;
--
-- -- Remove columns
-- ALTER TABLE subscribers DROP COLUMN IF EXISTS device_count;
-- ALTER TABLE subscribers DROP COLUMN IF EXISTS max_devices;
--
-- COMMIT;
-- ============================================================================
