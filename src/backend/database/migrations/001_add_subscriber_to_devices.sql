-- Migration: Add subscriber_id to gateway_devices for BYOD model
-- Description: Transition from operator-controlled devices to subscriber-owned devices
-- Version: 001
-- Date: 2026-04-02

-- ============================================================================
-- PART 1: Add subscriber_id column to gateway_devices
-- ============================================================================

-- Add subscriber_id column (nullable initially for safe migration)
ALTER TABLE gateway_devices
ADD COLUMN subscriber_id UUID;

-- Add comment to document the column
COMMENT ON COLUMN gateway_devices.subscriber_id IS 'Foreign key to subscribers table. Each device belongs to one subscriber (BYOD model).';

-- ============================================================================
-- PART 2: Add foreign key constraint
-- ============================================================================

-- Add foreign key constraint with CASCADE delete
-- When a subscriber is deleted, their devices are also deleted
ALTER TABLE gateway_devices
ADD CONSTRAINT fk_gateway_devices_subscriber
  FOREIGN KEY (subscriber_id)
  REFERENCES subscribers(id)
  ON DELETE CASCADE;

-- ============================================================================
-- PART 3: Create indexes for performance
-- ============================================================================

-- Index for queries filtering devices by subscriber_id
-- Used for: fetching all devices for a subscriber, counting devices, etc.
CREATE INDEX idx_gateway_devices_subscriber_id
ON gateway_devices(subscriber_id);

-- Composite index for subscriber + status queries
-- Used for: fetching only ONLINE devices for a subscriber
CREATE INDEX idx_gateway_devices_subscriber_status
ON gateway_devices(subscriber_id, status);

-- ============================================================================
-- PART 4: Add soft delete support
-- ============================================================================

-- Add deleted_at column for soft delete functionality
ALTER TABLE gateway_devices
ADD COLUMN deleted_at TIMESTAMPTZ;

-- Composite index for subscriber + deleted_at (for soft delete queries)
-- NOTE: Created AFTER adding deleted_at column
CREATE INDEX idx_gateway_devices_subscriber_deleted
ON gateway_devices(subscriber_id, deleted_at)
WHERE deleted_at IS NOT NULL;

-- Add comment
COMMENT ON COLUMN gateway_devices.deleted_at IS 'Timestamp when device was soft-deleted. NULL means device is active.';

-- ============================================================================
-- PART 5: Add device count tracking columns
-- ============================================================================

-- Add total_messages_sent counter (for analytics and quotas)
ALTER TABLE gateway_devices
ADD COLUMN total_messages_sent INT DEFAULT 0,
ADD COLUMN total_messages_failed INT DEFAULT 0;

-- Add comments
COMMENT ON COLUMN gateway_devices.total_messages_sent IS 'Cumulative count of successfully sent messages from this device.';
COMMENT ON COLUMN gateway_devices.total_messages_failed IS 'Cumulative count of failed messages from this device.';

-- ============================================================================
-- PART 6: Update subscribers table with device quotas
-- ============================================================================

-- Add device quota limits to subscribers table
ALTER TABLE subscribers
ADD COLUMN max_devices INT DEFAULT 1,
ADD COLUMN device_count INT DEFAULT 0;

-- Add comments
COMMENT ON COLUMN subscribers.max_devices IS 'Maximum number of devices allowed for this subscriber based on their plan.';
COMMENT ON COLUMN subscribers.device_count IS 'Current count of active devices owned by this subscriber.';

-- Set default quotas based on plan
UPDATE subscribers SET max_devices = 1 WHERE plan = 'free';
UPDATE subscribers SET max_devices = 2 WHERE plan = 'starter';
UPDATE subscribers SET max_devices = 10 WHERE plan = 'pro';
UPDATE subscribers SET max_devices = 100 WHERE plan = 'enterprise';

-- ============================================================================
-- PART 7: Create trigger to maintain device_count
-- ============================================================================

-- Function to update device_count when devices are added/removed/soft-deleted
CREATE OR REPLACE FUNCTION update_subscriber_device_count()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new device is added
  IF TG_OP = 'INSERT' AND NEW.subscriber_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE subscribers
    SET device_count = device_count + 1
    WHERE id = NEW.subscriber_id;
  END IF;

  -- When a device is soft-deleted or undeleted
  IF TG_OP = 'UPDATE' AND OLD.subscriber_id IS NOT NULL THEN
    -- Device was soft-deleted
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE subscribers
      SET device_count = device_count - 1
      WHERE id = NEW.subscriber_id;
    END IF;

    -- Device was undeleted
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE subscribers
      SET device_count = device_count + 1
      WHERE id = NEW.subscriber_id;
    END IF;
  END IF;

  -- When a device is hard-deleted
  IF TG_OP = 'DELETE' AND OLD.subscriber_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE subscribers
    SET device_count = device_count - 1
    WHERE id = OLD.subscriber_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trg_update_device_count
AFTER INSERT OR UPDATE OR DELETE ON gateway_devices
FOR EACH ROW
EXECUTE FUNCTION update_subscriber_device_count();

-- ============================================================================
-- PART 8: Initialize device_count for existing subscribers
-- ============================================================================

-- Calculate and set current device_count for all subscribers
UPDATE subscribers s
SET device_count = (
  SELECT COUNT(*)
  FROM gateway_devices gd
  WHERE gd.subscriber_id = s.id
    AND gd.deleted_at IS NULL
);

-- ============================================================================
-- PART 9: Add constraint to enforce device quota
-- ============================================================================

-- Function to check device quota before insert
CREATE OR REPLACE FUNCTION check_device_quota()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_allowed INT;
BEGIN
  IF NEW.subscriber_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    SELECT device_count, max_devices
    INTO current_count, max_allowed
    FROM subscribers
    WHERE id = NEW.subscriber_id;

    IF current_count >= max_allowed THEN
      RAISE EXCEPTION 'Device quota exceeded. Subscriber % has reached the maximum of % devices.',
        NEW.subscriber_id, max_allowed;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to enforce quota
CREATE TRIGGER trg_check_device_quota
BEFORE INSERT OR UPDATE ON gateway_devices
FOR EACH ROW
EXECUTE FUNCTION check_device_quota();

-- ============================================================================
-- Migration Notes:
-- ============================================================================
-- 1. subscriber_id is initially NULL to allow safe migration
-- 2. Run data migration script (002_migrate_device_ownership.sql) to assign devices
-- 3. After data migration, make subscriber_id NOT NULL with another migration
-- 4. Soft delete is implemented via deleted_at timestamp
-- 5. Device quotas are enforced via database trigger
-- 6. All indexes support common query patterns
-- ============================================================================

-- ============================================================================
-- ROLLBACK SCRIPT
-- ============================================================================
-- To revert this migration, execute the following in order:
-- WARNING: This will remove all subscriber ownership data from devices!
-- ============================================================================
/*
BEGIN;

-- Drop triggers
DROP TRIGGER IF EXISTS trg_check_device_quota ON gateway_devices;
DROP TRIGGER IF EXISTS trg_update_device_count ON gateway_devices;

-- Drop functions
DROP FUNCTION IF EXISTS check_device_quota();
DROP FUNCTION IF EXISTS update_subscriber_device_count();

-- Drop indexes
DROP INDEX IF EXISTS idx_gateway_devices_subscriber_deleted;
DROP INDEX IF EXISTS idx_gateway_devices_subscriber_status;
DROP INDEX IF EXISTS idx_gateway_devices_subscriber_id;

-- Drop foreign key constraint
ALTER TABLE gateway_devices
DROP CONSTRAINT IF EXISTS fk_gateway_devices_subscriber;

-- Remove columns from gateway_devices
ALTER TABLE gateway_devices
DROP COLUMN IF EXISTS total_messages_failed,
DROP COLUMN IF EXISTS total_messages_sent,
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS subscriber_id;

-- Remove columns from subscribers
ALTER TABLE subscribers
DROP COLUMN IF EXISTS device_count,
DROP COLUMN IF EXISTS max_devices;

COMMIT;
*/
-- ============================================================================
