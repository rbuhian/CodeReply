-- Rollback Script: Revert BYOD Migration
-- Description: Rollback changes made by migrations 001, 002, and 003
-- Version: 000_rollback
-- Date: 2026-04-02
-- WARNING: This will remove subscriber_id from devices. Use with caution!

-- ============================================================================
-- IMPORTANT: READ BEFORE EXECUTING
-- ============================================================================
-- This script will:
-- 1. Drop all BYOD-related constraints and indexes
-- 2. Remove subscriber_id from gateway_devices
-- 3. Remove device quota tracking from subscribers
-- 4. Drop all helper functions and views
-- 5. Drop all triggers
--
-- DATA LOSS WARNING:
-- - All device-to-subscriber assignments will be lost
-- - Soft-deleted devices will remain deleted
-- - Message history will be preserved
--
-- Only run this if you need to completely revert the BYOD migration.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Drop views
-- ============================================================================

DROP VIEW IF EXISTS active_gateway_devices CASCADE;

-- ============================================================================
-- PART 2: Drop functions
-- ============================================================================

DROP FUNCTION IF EXISTS get_available_devices(UUID, TEXT) CASCADE;
DROP FUNCTION IF EXISTS can_add_device(UUID) CASCADE;
DROP FUNCTION IF EXISTS update_subscriber_device_count() CASCADE;
DROP FUNCTION IF EXISTS check_device_quota() CASCADE;
DROP FUNCTION IF EXISTS update_gateway_devices_updated_at() CASCADE;

-- ============================================================================
-- PART 3: Drop triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trg_update_device_count ON gateway_devices;
DROP TRIGGER IF EXISTS trg_check_device_quota ON gateway_devices;
DROP TRIGGER IF EXISTS trg_gateway_devices_updated_at ON gateway_devices;

-- ============================================================================
-- PART 4: Drop indexes
-- ============================================================================

DROP INDEX IF EXISTS idx_gateway_devices_subscriber_id;
DROP INDEX IF EXISTS idx_gateway_devices_subscriber_status;
DROP INDEX IF EXISTS idx_gateway_devices_subscriber_deleted;
DROP INDEX IF EXISTS idx_gateway_devices_unique_name_per_subscriber;

-- ============================================================================
-- PART 5: Drop check constraints from messages table
-- ============================================================================

ALTER TABLE messages
DROP CONSTRAINT IF EXISTS chk_messages_subscriber_device_match;

-- ============================================================================
-- PART 6: Remove columns from gateway_devices
-- ============================================================================

-- Drop foreign key constraint first
ALTER TABLE gateway_devices
DROP CONSTRAINT IF EXISTS fk_gateway_devices_subscriber;

-- Remove BYOD-related columns
ALTER TABLE gateway_devices
DROP COLUMN IF EXISTS subscriber_id,
DROP COLUMN IF EXISTS deleted_at,
DROP COLUMN IF EXISTS total_messages_sent,
DROP COLUMN IF EXISTS total_messages_failed,
DROP COLUMN IF EXISTS created_by,
DROP COLUMN IF EXISTS updated_at,
DROP COLUMN IF EXISTS device_label,
DROP COLUMN IF EXISTS notes,
DROP COLUMN IF EXISTS is_enabled;

-- ============================================================================
-- PART 7: Remove columns from subscribers table
-- ============================================================================

ALTER TABLE subscribers
DROP COLUMN IF EXISTS max_devices,
DROP COLUMN IF EXISTS device_count;

-- ============================================================================
-- PART 8: Verification
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '========================================';
  RAISE NOTICE 'BYOD Migration Rollback Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'All BYOD-related schema changes have been reverted.';
  RAISE NOTICE 'Devices are no longer associated with subscribers.';
  RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- Post-Rollback Notes:
-- ============================================================================
-- 1. The gateway_devices table is now back to operator-controlled mode
-- 2. All device-to-subscriber associations have been removed
-- 3. You can now operate the system in single-tenant operator mode
-- 4. If you need to re-migrate, run migrations 001, 002, and 003 again
-- ============================================================================
