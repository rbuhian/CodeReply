-- ============================================================================
-- Migration: 005_add_triggers.sql
-- Description: Add database triggers for BYOD model automation
-- Version: 2.0 - BYOD (Bring Your Own Device)
-- Date: 2026-04-02
-- Author: Raj (Database Architect)
-- ============================================================================
-- This migration creates triggers to automate:
-- 1. Device count maintenance (subscribers.device_count)
-- 2. Device quota enforcement
-- 3. Message counter updates (device.total_messages_sent/failed)
-- 4. Timestamp updates (updated_at fields)
-- ============================================================================

BEGIN;

-- ============================================================================
-- TRIGGER 1: Maintain subscribers.device_count
-- ============================================================================

-- Function to update device_count when devices are added/removed/soft-deleted
CREATE OR REPLACE FUNCTION update_subscriber_device_count()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new device is added (INSERT)
  IF TG_OP = 'INSERT' AND NEW.subscriber_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE subscribers
    SET device_count = device_count + 1
    WHERE id = NEW.subscriber_id;
    RAISE NOTICE 'Device count incremented for subscriber %', NEW.subscriber_id;
  END IF;

  -- When a device is soft-deleted or undeleted (UPDATE)
  IF TG_OP = 'UPDATE' AND OLD.subscriber_id IS NOT NULL THEN
    -- Device was soft-deleted (active -> deleted)
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE subscribers
      SET device_count = device_count - 1
      WHERE id = NEW.subscriber_id;
      RAISE NOTICE 'Device count decremented for subscriber % (soft delete)', NEW.subscriber_id;
    END IF;

    -- Device was undeleted (deleted -> active)
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE subscribers
      SET device_count = device_count + 1
      WHERE id = NEW.subscriber_id;
      RAISE NOTICE 'Device count incremented for subscriber % (undelete)', NEW.subscriber_id;
    END IF;
  END IF;

  -- When a device is hard-deleted (DELETE)
  IF TG_OP = 'DELETE' AND OLD.subscriber_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE subscribers
    SET device_count = device_count - 1
    WHERE id = OLD.subscriber_id;
    RAISE NOTICE 'Device count decremented for subscriber % (hard delete)', OLD.subscriber_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_device_count ON gateway_devices;

-- Create trigger (AFTER to ensure foreign key exists)
CREATE TRIGGER trg_update_device_count
AFTER INSERT OR UPDATE OR DELETE ON gateway_devices
FOR EACH ROW
EXECUTE FUNCTION update_subscriber_device_count();

COMMENT ON TRIGGER trg_update_device_count ON gateway_devices IS
'Automatically maintains subscribers.device_count when devices are added, removed, or soft-deleted.';

-- ============================================================================
-- TRIGGER 2: Enforce device quota
-- ============================================================================

-- Function to check device quota before insert/update
CREATE OR REPLACE FUNCTION check_device_quota()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_allowed INT;
  subscriber_name TEXT;
BEGIN
  -- Only check if device is being activated (not deleted)
  IF NEW.subscriber_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    -- Get current count and quota
    SELECT s.device_count, s.max_devices, s.name
    INTO current_count, max_allowed, subscriber_name
    FROM subscribers s
    WHERE s.id = NEW.subscriber_id;

    -- Check if quota would be exceeded
    -- For INSERT: current_count will be incremented after this trigger
    -- For UPDATE (undelete): same logic applies
    IF current_count >= max_allowed THEN
      RAISE EXCEPTION 'Device quota exceeded for subscriber "%" (%). Maximum % devices allowed, currently have %.',
        subscriber_name,
        NEW.subscriber_id,
        max_allowed,
        current_count
      USING HINT = 'Upgrade subscriber plan or delete an existing device.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_check_device_quota ON gateway_devices;

-- Create trigger (BEFORE to prevent insertion)
CREATE TRIGGER trg_check_device_quota
BEFORE INSERT OR UPDATE ON gateway_devices
FOR EACH ROW
EXECUTE FUNCTION check_device_quota();

COMMENT ON TRIGGER trg_check_device_quota ON gateway_devices IS
'Enforces device quota limit before allowing device registration or activation.';

-- ============================================================================
-- TRIGGER 3: Auto-update gateway_devices.updated_at
-- ============================================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_gateway_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_gateway_devices_updated_at ON gateway_devices;

-- Create trigger
CREATE TRIGGER trg_gateway_devices_updated_at
BEFORE UPDATE ON gateway_devices
FOR EACH ROW
WHEN (OLD.* IS DISTINCT FROM NEW.*)
EXECUTE FUNCTION update_gateway_devices_updated_at();

COMMENT ON TRIGGER trg_gateway_devices_updated_at ON gateway_devices IS
'Automatically updates updated_at timestamp when device record is modified.';

-- ============================================================================
-- TRIGGER 4: Update device message counters
-- ============================================================================

-- Function to update device message counters when message status changes
CREATE OR REPLACE FUNCTION update_device_message_counters()
RETURNS TRIGGER AS $$
BEGIN
  -- When message is marked as DELIVERED, increment sent counter
  IF TG_OP = 'UPDATE' AND OLD.status != 'DELIVERED' AND NEW.status = 'DELIVERED' THEN
    IF NEW.gateway_id IS NOT NULL THEN
      UPDATE gateway_devices
      SET total_messages_sent = total_messages_sent + 1
      WHERE id = NEW.gateway_id;
    END IF;
  END IF;

  -- When message is marked as FAILED, increment failed counter
  IF TG_OP = 'UPDATE' AND OLD.status != 'FAILED' AND NEW.status = 'FAILED' THEN
    IF NEW.gateway_id IS NOT NULL THEN
      UPDATE gateway_devices
      SET total_messages_failed = total_messages_failed + 1
      WHERE id = NEW.gateway_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_device_message_counters ON messages;

-- Create trigger
CREATE TRIGGER trg_update_device_message_counters
AFTER UPDATE ON messages
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_device_message_counters();

COMMENT ON TRIGGER trg_update_device_message_counters ON messages IS
'Automatically updates device message counters (sent/failed) when message status changes.';

-- ============================================================================
-- TRIGGER 5: Auto-set timestamps on messages
-- ============================================================================

-- Function to set appropriate timestamps based on status changes
CREATE OR REPLACE FUNCTION update_message_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  -- Set dispatched_at when status changes to DISPATCHED
  IF TG_OP = 'UPDATE' AND OLD.status != 'DISPATCHED' AND NEW.status = 'DISPATCHED' THEN
    IF NEW.dispatched_at IS NULL THEN
      NEW.dispatched_at = NOW();
    END IF;
  END IF;

  -- Set sent_at when status changes to SENT
  IF TG_OP = 'UPDATE' AND OLD.status != 'SENT' AND NEW.status = 'SENT' THEN
    IF NEW.sent_at IS NULL THEN
      NEW.sent_at = NOW();
    END IF;
  END IF;

  -- Set delivered_at when status changes to DELIVERED
  IF TG_OP = 'UPDATE' AND OLD.status != 'DELIVERED' AND NEW.status = 'DELIVERED' THEN
    IF NEW.delivered_at IS NULL THEN
      NEW.delivered_at = NOW();
    END IF;
  END IF;

  -- Set failed_at when status changes to FAILED
  IF TG_OP = 'UPDATE' AND OLD.status != 'FAILED' AND NEW.status = 'FAILED' THEN
    IF NEW.failed_at IS NULL THEN
      NEW.failed_at = NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_message_timestamps ON messages;

-- Create trigger
CREATE TRIGGER trg_update_message_timestamps
BEFORE UPDATE ON messages
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION update_message_timestamps();

COMMENT ON TRIGGER trg_update_message_timestamps ON messages IS
'Automatically sets timestamp fields (dispatched_at, sent_at, delivered_at, failed_at) based on status changes.';

-- ============================================================================
-- TRIGGER 6: Validate subscriber ownership on message dispatch
-- ============================================================================

-- Function to ensure messages only go to subscriber's own devices
CREATE OR REPLACE FUNCTION validate_message_device_ownership()
RETURNS TRIGGER AS $$
DECLARE
  device_subscriber_id UUID;
BEGIN
  -- Only validate if gateway_id is being set
  IF NEW.gateway_id IS NOT NULL THEN
    -- Get the subscriber_id of the device
    SELECT subscriber_id INTO device_subscriber_id
    FROM gateway_devices
    WHERE id = NEW.gateway_id;

    -- Ensure message's subscriber matches device's subscriber
    IF device_subscriber_id != NEW.subscriber_id THEN
      RAISE EXCEPTION 'Security violation: Cannot dispatch message % from subscriber % to device % owned by subscriber %',
        NEW.id,
        NEW.subscriber_id,
        NEW.gateway_id,
        device_subscriber_id
      USING HINT = 'Messages can only be dispatched to devices owned by the same subscriber.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_validate_message_device_ownership ON messages;

-- Create trigger
CREATE TRIGGER trg_validate_message_device_ownership
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW
WHEN (NEW.gateway_id IS NOT NULL)
EXECUTE FUNCTION validate_message_device_ownership();

COMMENT ON TRIGGER trg_validate_message_device_ownership ON messages IS
'Security trigger: Ensures messages are only dispatched to devices owned by the same subscriber.';

-- ============================================================================
-- TRIGGER 7: Auto-update registration token used_at
-- ============================================================================

-- Function to set used_at when token is marked as used
CREATE OR REPLACE FUNCTION update_registration_token_used_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.used = TRUE AND OLD.used = FALSE THEN
    NEW.used_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trg_update_registration_token_used_at ON registration_tokens;

-- Create trigger
CREATE TRIGGER trg_update_registration_token_used_at
BEFORE UPDATE ON registration_tokens
FOR EACH ROW
WHEN (OLD.used IS DISTINCT FROM NEW.used)
EXECUTE FUNCTION update_registration_token_used_at();

COMMENT ON TRIGGER trg_update_registration_token_used_at ON registration_tokens IS
'Automatically sets used_at timestamp when registration token is marked as used.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

-- List all triggers created
DO $$
DECLARE
  trigger_record RECORD;
BEGIN
  RAISE NOTICE '=== BYOD Triggers Summary ===';

  FOR trigger_record IN
    SELECT trigger_name, event_object_table, action_timing, event_manipulation
    FROM information_schema.triggers
    WHERE trigger_schema = 'public'
      AND trigger_name LIKE 'trg_%'
    ORDER BY event_object_table, trigger_name
  LOOP
    RAISE NOTICE '% on % (% %)',
      trigger_record.trigger_name,
      trigger_record.event_object_table,
      trigger_record.action_timing,
      trigger_record.event_manipulation;
  END LOOP;
END $$;

COMMIT;

-- ============================================================================
-- TESTING TRIGGERS
-- ============================================================================

-- Test device count trigger:
-- BEGIN;
-- INSERT INTO gateway_devices (subscriber_id, name, device_token, sim_carrier)
-- VALUES ('<subscriber_uuid>', 'Test Device', 'test_token_123', 'Test Carrier');
-- SELECT device_count FROM subscribers WHERE id = '<subscriber_uuid>';
-- -- Should show device_count incremented by 1
-- ROLLBACK;

-- Test quota enforcement trigger:
-- BEGIN;
-- UPDATE subscribers SET max_devices = 1 WHERE id = '<subscriber_uuid>';
-- -- Try to insert second device (should fail)
-- INSERT INTO gateway_devices (subscriber_id, name, device_token, sim_carrier)
-- VALUES ('<subscriber_uuid>', 'Second Device', 'test_token_456', 'Test Carrier');
-- -- Should raise exception
-- ROLLBACK;

-- Test message counter trigger:
-- BEGIN;
-- UPDATE messages SET status = 'DELIVERED' WHERE id = '<message_uuid>';
-- SELECT total_messages_sent FROM gateway_devices WHERE id = '<device_uuid>';
-- -- Should show total_messages_sent incremented by 1
-- ROLLBACK;

-- Test ownership validation trigger:
-- BEGIN;
-- -- Try to dispatch subscriber A's message to subscriber B's device (should fail)
-- UPDATE messages
-- SET gateway_id = '<subscriber_b_device_uuid>'
-- WHERE id = '<subscriber_a_message_uuid>';
-- -- Should raise security violation exception
-- ROLLBACK;

-- ============================================================================
-- MONITORING TRIGGER PERFORMANCE
-- ============================================================================

-- Check trigger execution frequency:
-- SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del
-- FROM pg_stat_user_tables
-- WHERE schemaname = 'public'
-- ORDER BY (n_tup_ins + n_tup_upd + n_tup_del) DESC;

-- Monitor slow triggers (if pg_stat_statements is enabled):
-- SELECT query, calls, mean_exec_time, total_exec_time
-- FROM pg_stat_statements
-- WHERE query LIKE '%TRIGGER%'
-- ORDER BY mean_exec_time DESC
-- LIMIT 20;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- BEGIN;
--
-- -- Drop triggers
-- DROP TRIGGER IF EXISTS trg_update_registration_token_used_at ON registration_tokens;
-- DROP TRIGGER IF EXISTS trg_validate_message_device_ownership ON messages;
-- DROP TRIGGER IF EXISTS trg_update_message_timestamps ON messages;
-- DROP TRIGGER IF EXISTS trg_update_device_message_counters ON messages;
-- DROP TRIGGER IF EXISTS trg_gateway_devices_updated_at ON gateway_devices;
-- DROP TRIGGER IF EXISTS trg_check_device_quota ON gateway_devices;
-- DROP TRIGGER IF EXISTS trg_update_device_count ON gateway_devices;
--
-- -- Drop functions
-- DROP FUNCTION IF EXISTS update_registration_token_used_at();
-- DROP FUNCTION IF EXISTS validate_message_device_ownership();
-- DROP FUNCTION IF EXISTS update_message_timestamps();
-- DROP FUNCTION IF EXISTS update_device_message_counters();
-- DROP FUNCTION IF EXISTS update_gateway_devices_updated_at();
-- DROP FUNCTION IF EXISTS check_device_quota();
-- DROP FUNCTION IF EXISTS update_subscriber_device_count();
--
-- COMMIT;
-- ============================================================================
