-- Migration: Add database triggers for BYOD automation
-- Description: Triggers for device count maintenance, quota enforcement, and security
-- Author: Raj (Database Architect)
-- Date: 2026-04-02

BEGIN;

-- ============================================================================
-- Trigger 1: Maintain device_count in subscribers table
-- ============================================================================

CREATE OR REPLACE FUNCTION update_subscriber_device_count()
RETURNS TRIGGER AS $$
BEGIN
  -- On INSERT: increment device_count
  IF TG_OP = 'INSERT' AND NEW.subscriber_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE subscribers
    SET device_count = device_count + 1,
        updated_at = NOW()
    WHERE id = NEW.subscriber_id;
  END IF;

  -- On UPDATE: handle soft delete changes
  IF TG_OP = 'UPDATE' AND OLD.subscriber_id IS NOT NULL THEN
    -- Soft delete: decrement count
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE subscribers
      SET device_count = device_count - 1,
          updated_at = NOW()
      WHERE id = NEW.subscriber_id;
    END IF;

    -- Restore from soft delete: increment count
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE subscribers
      SET device_count = device_count + 1,
          updated_at = NOW()
      WHERE id = NEW.subscriber_id;
    END IF;
  END IF;

  -- On DELETE: decrement device_count (if not already soft-deleted)
  IF TG_OP = 'DELETE' AND OLD.subscriber_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE subscribers
    SET device_count = device_count - 1,
        updated_at = NOW()
    WHERE id = OLD.subscriber_id;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (in case migration 001 already created it)
DROP TRIGGER IF EXISTS trg_update_device_count ON gateway_devices;

CREATE TRIGGER trg_update_device_count
AFTER INSERT OR UPDATE OR DELETE ON gateway_devices
FOR EACH ROW
EXECUTE FUNCTION update_subscriber_device_count();

-- ============================================================================
-- Trigger 2: Enforce device quota before insertion
-- ============================================================================

CREATE OR REPLACE FUNCTION check_device_quota()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_allowed INT;
BEGIN
  -- Only check for new devices or un-deleting devices
  IF NEW.subscriber_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    -- Get current device count and max allowed
    SELECT device_count, max_devices
    INTO current_count, max_allowed
    FROM subscribers
    WHERE id = NEW.subscriber_id;

    -- Check if quota would be exceeded
    IF current_count >= max_allowed THEN
      RAISE EXCEPTION 'DEVICE_QUOTA_EXCEEDED: Subscriber % has reached the maximum of % devices (current: %). Upgrade plan or remove existing devices.',
        NEW.subscriber_id, max_allowed, current_count
      USING HINT = 'Delete unused devices or upgrade subscriber plan to add more devices';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (in case migration 001 already created it)
DROP TRIGGER IF EXISTS trg_check_device_quota ON gateway_devices;

CREATE TRIGGER trg_check_device_quota
BEFORE INSERT OR UPDATE ON gateway_devices
FOR EACH ROW
WHEN (NEW.deleted_at IS NULL)
EXECUTE FUNCTION check_device_quota();

-- ============================================================================
-- Trigger 3: Validate message-device ownership (SECURITY)
-- ============================================================================

CREATE OR REPLACE FUNCTION validate_message_device_ownership()
RETURNS TRIGGER AS $$
DECLARE
  device_subscriber_id UUID;
BEGIN
  -- Only validate if gateway_id is set
  IF NEW.gateway_id IS NOT NULL THEN
    -- Get the subscriber_id of the device
    SELECT subscriber_id
    INTO device_subscriber_id
    FROM gateway_devices
    WHERE id = NEW.gateway_id
      AND deleted_at IS NULL;

    -- Security check: message subscriber must match device subscriber
    IF device_subscriber_id IS NULL THEN
      RAISE EXCEPTION 'INVALID_DEVICE: Gateway device % not found or deleted', NEW.gateway_id;
    END IF;

    IF device_subscriber_id != NEW.subscriber_id THEN
      RAISE EXCEPTION 'SECURITY_VIOLATION: Cannot dispatch message from subscriber % to device owned by subscriber %. Cross-subscriber device access is forbidden.',
        NEW.subscriber_id, device_subscriber_id
      USING HINT = 'Messages can only be sent through devices owned by the same subscriber';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists
DROP TRIGGER IF EXISTS trg_validate_message_device_ownership ON messages;

CREATE TRIGGER trg_validate_message_device_ownership
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW
WHEN (NEW.gateway_id IS NOT NULL)
EXECUTE FUNCTION validate_message_device_ownership();

-- ============================================================================
-- Trigger 4: Update subscriber updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_subscriber_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if updated_at column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_update_subscriber_timestamp ON subscribers;
    CREATE TRIGGER trg_update_subscriber_timestamp
    BEFORE UPDATE ON subscribers
    FOR EACH ROW
    EXECUTE FUNCTION update_subscriber_timestamp();
  END IF;
END $$;

-- ============================================================================
-- Trigger 5: Update gateway_devices updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_gateway_device_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Only create trigger if updated_at column exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'gateway_devices' AND column_name = 'updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_update_gateway_device_timestamp ON gateway_devices;
    CREATE TRIGGER trg_update_gateway_device_timestamp
    BEFORE UPDATE ON gateway_devices
    FOR EACH ROW
    EXECUTE FUNCTION update_gateway_device_timestamp();
  END IF;
END $$;

COMMIT;

-- Rollback script
-- BEGIN;
-- DROP TRIGGER IF EXISTS trg_update_device_count ON gateway_devices;
-- DROP TRIGGER IF EXISTS trg_check_device_quota ON gateway_devices;
-- DROP TRIGGER IF EXISTS trg_validate_message_device_ownership ON messages;
-- DROP TRIGGER IF EXISTS trg_update_subscriber_timestamp ON subscribers;
-- DROP TRIGGER IF EXISTS trg_update_gateway_device_timestamp ON gateway_devices;
-- DROP FUNCTION IF EXISTS update_subscriber_device_count();
-- DROP FUNCTION IF EXISTS check_device_quota();
-- DROP FUNCTION IF EXISTS validate_message_device_ownership();
-- DROP FUNCTION IF EXISTS update_subscriber_timestamp();
-- DROP FUNCTION IF EXISTS update_gateway_device_timestamp();
-- COMMIT;
