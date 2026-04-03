-- ============================================================================
-- Function: get_optimal_device_for_subscriber
-- Description: Select the best available device for message dispatch
-- Version: 1.0 - BYOD Optimized
-- Author: Raj (Database Architect)
-- Performance Target: < 10ms
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS get_optimal_device_for_subscriber(UUID, TEXT);

-- Create optimized function for device selection
CREATE OR REPLACE FUNCTION get_optimal_device_for_subscriber(
  p_subscriber_id UUID,
  p_carrier_preference TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  selected_device_id UUID;
BEGIN
  -- CRITICAL SECURITY: This function ALWAYS filters by subscriber_id
  -- to ensure multi-tenant data isolation.

  -- Select device with:
  -- 1. Subscriber match (CRITICAL for multi-tenant security)
  -- 2. Online status (device is actively connected)
  -- 3. Enabled flag (not manually disabled by subscriber)
  -- 4. Recent heartbeat (within last 2 minutes)
  -- 5. Not soft-deleted
  -- 6. Carrier preference match (optional, for optimal routing)
  -- 7. Lowest in-flight message count (load balancing)

  SELECT gd.id INTO selected_device_id
  FROM gateway_devices gd
  LEFT JOIN LATERAL (
    -- Count in-flight messages for this device
    -- Using LATERAL join for better performance
    SELECT COUNT(*) as in_flight
    FROM messages m
    WHERE m.gateway_id = gd.id
      AND m.status IN ('DISPATCHED', 'SENT')
  ) msg_count ON true
  WHERE gd.subscriber_id = p_subscriber_id  -- SECURITY: Subscriber scope
    AND gd.status = 'ONLINE'                -- Device is online
    AND gd.is_enabled = TRUE                -- Device is enabled for dispatch
    AND gd.deleted_at IS NULL               -- Device is not soft-deleted
    AND gd.last_heartbeat > NOW() - INTERVAL '2 minutes'  -- Recent heartbeat
    AND (p_carrier_preference IS NULL OR gd.sim_carrier = p_carrier_preference)  -- Carrier match
  ORDER BY
    -- Priority 1: Carrier match (0 = match, 1 = no match)
    CASE
      WHEN p_carrier_preference IS NOT NULL AND gd.sim_carrier = p_carrier_preference
      THEN 0
      ELSE 1
    END,
    -- Priority 2: Least in-flight messages (load balancing)
    msg_count.in_flight ASC,
    -- Priority 3: Most recent heartbeat (device health)
    gd.last_heartbeat DESC
  LIMIT 1;

  -- Return selected device ID (NULL if no device available)
  RETURN selected_device_id;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return NULL on failure
    RAISE WARNING 'Error in get_optimal_device_for_subscriber for subscriber %: %',
      p_subscriber_id, SQLERRM;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add function comment
COMMENT ON FUNCTION get_optimal_device_for_subscriber IS
'Selects the optimal device for message dispatch with subscriber-scoped filtering.
Returns device ID with lowest load, matching carrier preference if provided.
Performance target: < 10ms. Always includes subscriber_id filtering for security.';

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Get optimal device without carrier preference
-- SELECT get_optimal_device_for_subscriber('123e4567-e89b-12d3-a456-426614174000');

-- Example 2: Get optimal device with carrier preference
-- SELECT get_optimal_device_for_subscriber(
--   '123e4567-e89b-12d3-a456-426614174000',
--   'Globe Telecom'
-- );

-- Example 3: Use in message dispatch query
-- UPDATE messages
-- SET
--   gateway_id = get_optimal_device_for_subscriber(subscriber_id, NULL),
--   status = 'DISPATCHED',
--   dispatched_at = NOW()
-- WHERE id = 'message_uuid'
--   AND subscriber_id = 'subscriber_uuid'
--   AND status = 'QUEUED';

-- ============================================================================
-- PERFORMANCE ANALYSIS
-- ============================================================================

-- Test query performance (replace with actual subscriber UUID)
-- EXPLAIN ANALYZE
-- SELECT get_optimal_device_for_subscriber('123e4567-e89b-12d3-a456-426614174000');

-- Expected query plan:
-- - Uses idx_gateway_devices_dispatch_selection for fast device lookup
-- - Uses idx_messages_device_load for in-flight count
-- - Returns result in < 10ms for typical workloads

-- ============================================================================
-- INDEXES REQUIRED FOR OPTIMAL PERFORMANCE
-- ============================================================================

-- These indexes should already exist from 004_add_indexes.sql migration:
-- 1. idx_gateway_devices_dispatch_selection
--    ON gateway_devices(subscriber_id, status, is_enabled, deleted_at, last_heartbeat DESC)
--    WHERE deleted_at IS NULL AND status = 'ONLINE';
--
-- 2. idx_messages_device_load
--    ON messages(gateway_id, status)
--    WHERE status IN ('DISPATCHED', 'SENT');

-- Verify indexes exist:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename IN ('gateway_devices', 'messages')
--   AND indexname IN ('idx_gateway_devices_dispatch_selection', 'idx_messages_device_load');

-- ============================================================================
-- SECURITY VALIDATION
-- ============================================================================

-- This function enforces multi-tenant security by:
-- 1. ALWAYS filtering by subscriber_id in the WHERE clause
-- 2. Never allowing cross-subscriber device selection
-- 3. Using STABLE (not VOLATILE) to allow query optimization
-- 4. No dynamic SQL that could be exploited

-- Test security: Should return NULL (no devices for other subscribers)
-- SELECT get_optimal_device_for_subscriber('00000000-0000-0000-0000-000000000000');
