-- Migration: Finalize BYOD constraints
-- Description: Make subscriber_id NOT NULL and add final constraints
-- Version: 003
-- Date: 2026-04-02
-- Dependencies: 002_migrate_device_ownership.sql

-- ============================================================================
-- PART 1: Pre-migration validation
-- ============================================================================

-- Ensure all devices have been assigned to subscribers
DO $$
DECLARE
  unassigned_count INT;
BEGIN
  SELECT COUNT(*) INTO unassigned_count
  FROM gateway_devices
  WHERE subscriber_id IS NULL AND deleted_at IS NULL;

  IF unassigned_count > 0 THEN
    RAISE EXCEPTION 'Cannot proceed: % active devices are not assigned to any subscriber. Run migration 002 first.', unassigned_count;
  END IF;
END $$;

-- ============================================================================
-- PART 2: Make subscriber_id NOT NULL
-- ============================================================================

-- This ensures all future devices must belong to a subscriber
ALTER TABLE gateway_devices
ALTER COLUMN subscriber_id SET NOT NULL;

-- ============================================================================
-- PART 3: Add additional business constraints
-- ============================================================================

-- Ensure device names are unique within a subscriber's scope
-- (but different subscribers can have devices with the same name)
CREATE UNIQUE INDEX idx_gateway_devices_unique_name_per_subscriber
ON gateway_devices(subscriber_id, name)
WHERE deleted_at IS NULL;

-- ============================================================================
-- PART 4: Add audit columns
-- ============================================================================

-- Track when device was registered by subscriber
ALTER TABLE gateway_devices
ADD COLUMN created_by UUID REFERENCES subscribers(id),
ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();

-- Add comments
COMMENT ON COLUMN gateway_devices.created_by IS 'Subscriber who registered this device. Usually same as subscriber_id unless admin registered on behalf.';
COMMENT ON COLUMN gateway_devices.updated_at IS 'Timestamp of last update to device record.';

-- Set created_by to subscriber_id for existing devices
UPDATE gateway_devices
SET created_by = subscriber_id
WHERE created_by IS NULL;

-- ============================================================================
-- PART 5: Create trigger to update updated_at automatically
-- ============================================================================

CREATE OR REPLACE FUNCTION update_gateway_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gateway_devices_updated_at
BEFORE UPDATE ON gateway_devices
FOR EACH ROW
EXECUTE FUNCTION update_gateway_devices_updated_at();

-- ============================================================================
-- PART 6: Add device metadata columns
-- ============================================================================

-- Additional metadata for better device management
ALTER TABLE gateway_devices
ADD COLUMN device_label TEXT,
ADD COLUMN notes TEXT,
ADD COLUMN is_enabled BOOLEAN DEFAULT TRUE;

-- Add comments
COMMENT ON COLUMN gateway_devices.device_label IS 'User-friendly label for the device (e.g., "Office Gateway", "Backup SIM").';
COMMENT ON COLUMN gateway_devices.notes IS 'Optional notes about the device for subscriber reference.';
COMMENT ON COLUMN gateway_devices.is_enabled IS 'Whether device is enabled for message dispatch. Can be toggled by subscriber.';

-- ============================================================================
-- PART 7: Update messages table to enforce subscriber-device relationship
-- ============================================================================

-- Ensure messages can only be sent through subscriber's own devices
-- This is enforced at application level but we add a check constraint for safety

-- Add check constraint (optional, can be commented out if enforced in app layer)
-- Note: This is a soft constraint that will be validated at application level
-- Uncomment if you want database-level enforcement:

/*
ALTER TABLE messages
ADD CONSTRAINT chk_messages_subscriber_device_match
CHECK (
  -- Allow NULL gateway_id (message not yet dispatched)
  gateway_id IS NULL
  OR
  -- Ensure gateway belongs to the same subscriber
  EXISTS (
    SELECT 1 FROM gateway_devices
    WHERE gateway_devices.id = messages.gateway_id
    AND gateway_devices.subscriber_id = messages.subscriber_id
    AND gateway_devices.deleted_at IS NULL
  )
);
*/

-- Note: The above constraint might impact performance on large tables.
-- It's recommended to enforce this at the application layer instead.

-- ============================================================================
-- PART 8: Create view for active subscriber devices
-- ============================================================================

-- View showing only active, non-deleted devices
CREATE OR REPLACE VIEW active_gateway_devices AS
SELECT
  gd.id,
  gd.subscriber_id,
  gd.name,
  gd.device_label,
  gd.device_token,
  gd.sim_carrier,
  gd.sim_number,
  gd.status,
  gd.is_enabled,
  gd.last_heartbeat,
  gd.app_version,
  gd.android_version,
  gd.total_messages_sent,
  gd.total_messages_failed,
  gd.notes,
  gd.registered_at,
  gd.updated_at,
  s.name AS subscriber_name,
  s.email AS subscriber_email,
  s.plan AS subscriber_plan,
  -- Calculate success rate
  CASE
    WHEN (gd.total_messages_sent + gd.total_messages_failed) > 0
    THEN ROUND(
      gd.total_messages_sent::NUMERIC /
      (gd.total_messages_sent + gd.total_messages_failed)::NUMERIC,
      4
    )
    ELSE NULL
  END AS success_rate,
  -- Check if device is online (heartbeat within last 2 minutes)
  CASE
    WHEN gd.last_heartbeat > NOW() - INTERVAL '2 minutes'
    THEN TRUE
    ELSE FALSE
  END AS is_online,
  -- Check if device is healthy (online + enabled + recent activity)
  CASE
    WHEN gd.status = 'ONLINE'
      AND gd.is_enabled = TRUE
      AND gd.last_heartbeat > NOW() - INTERVAL '2 minutes'
    THEN TRUE
    ELSE FALSE
  END AS is_healthy
FROM gateway_devices gd
JOIN subscribers s ON s.id = gd.subscriber_id
WHERE gd.deleted_at IS NULL;

-- Add comment
COMMENT ON VIEW active_gateway_devices IS 'View of all active gateway devices with computed metrics and subscriber info.';

-- ============================================================================
-- PART 9: Create function to get available devices for a subscriber
-- ============================================================================

-- Function returns available devices for dispatching messages for a subscriber
CREATE OR REPLACE FUNCTION get_available_devices(
  p_subscriber_id UUID,
  p_carrier_preference TEXT DEFAULT NULL
)
RETURNS TABLE (
  device_id UUID,
  device_name TEXT,
  sim_carrier TEXT,
  status TEXT,
  in_flight_messages INT,
  last_heartbeat TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gd.id AS device_id,
    gd.name AS device_name,
    gd.sim_carrier,
    gd.status,
    COALESCE(
      (SELECT COUNT(*)
       FROM messages m
       WHERE m.gateway_id = gd.id
         AND m.status IN ('DISPATCHED', 'QUEUED')
      ), 0
    )::INT AS in_flight_messages,
    gd.last_heartbeat
  FROM gateway_devices gd
  WHERE gd.subscriber_id = p_subscriber_id
    AND gd.deleted_at IS NULL
    AND gd.is_enabled = TRUE
    AND gd.status = 'ONLINE'
    AND gd.last_heartbeat > NOW() - INTERVAL '2 minutes'
  ORDER BY
    -- Prefer matching carrier if specified
    CASE WHEN p_carrier_preference IS NOT NULL AND gd.sim_carrier = p_carrier_preference THEN 0 ELSE 1 END,
    -- Then by least load (fewest in-flight messages)
    (SELECT COUNT(*) FROM messages m WHERE m.gateway_id = gd.id AND m.status IN ('DISPATCHED', 'QUEUED')) ASC,
    -- Finally by last heartbeat (most recently active)
    gd.last_heartbeat DESC;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION get_available_devices IS 'Returns list of available devices for a subscriber, ordered by carrier match and load.';

-- ============================================================================
-- PART 10: Create function to validate device quota
-- ============================================================================

CREATE OR REPLACE FUNCTION can_add_device(
  p_subscriber_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INT;
  max_allowed INT;
BEGIN
  SELECT device_count, max_devices
  INTO current_count, max_allowed
  FROM subscribers
  WHERE id = p_subscriber_id;

  RETURN current_count < max_allowed;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION can_add_device IS 'Check if subscriber can add more devices based on their plan quota.';

-- ============================================================================
-- PART 11: Final validation and summary
-- ============================================================================

-- Generate final migration report
DO $$
DECLARE
  total_subscribers INT;
  total_devices INT;
  total_active_devices INT;
BEGIN
  SELECT COUNT(*) INTO total_subscribers FROM subscribers;
  SELECT COUNT(*) INTO total_devices FROM gateway_devices;
  SELECT COUNT(*) INTO total_active_devices FROM gateway_devices WHERE deleted_at IS NULL;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'BYOD Migration Complete';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Total Subscribers: %', total_subscribers;
  RAISE NOTICE 'Total Devices: %', total_devices;
  RAISE NOTICE 'Active Devices: %', total_active_devices;
  RAISE NOTICE 'Deleted Devices: %', total_devices - total_active_devices;
  RAISE NOTICE '========================================';
END $$;

-- Show device distribution by subscriber
SELECT
  s.name AS subscriber,
  s.plan,
  s.device_count AS active_devices,
  s.max_devices AS quota,
  CONCAT(s.device_count, '/', s.max_devices) AS usage,
  COUNT(gd.id) AS total_including_deleted
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id
GROUP BY s.id, s.name, s.plan, s.device_count, s.max_devices
ORDER BY s.created_at;

-- ============================================================================
-- Migration Complete
-- ============================================================================
-- The database is now fully migrated to the BYOD model:
-- ✓ All devices belong to subscribers
-- ✓ Device quotas are enforced
-- ✓ Soft delete is available
-- ✓ Indexes are in place for performance
-- ✓ Helper functions and views are created
-- ✓ Triggers maintain data integrity
-- ============================================================================
