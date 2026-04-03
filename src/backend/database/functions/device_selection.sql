-- ============================================================================
-- Device Selection Functions for BYOD Message Dispatch
-- Description: Functions to select optimal devices for message routing
-- Author: Raj (Database Architect)
-- Date: 2026-04-03
-- ============================================================================

-- ============================================================================
-- Function: get_available_devices
-- Description: Get list of online devices for a subscriber, optionally filtered by carrier
-- Usage: SELECT * FROM get_available_devices('subscriber-uuid', 'Globe');
-- ============================================================================

CREATE OR REPLACE FUNCTION get_available_devices(
  p_subscriber_id UUID,
  p_preferred_carrier TEXT DEFAULT NULL
)
RETURNS TABLE (
  device_id UUID,
  device_name TEXT,
  sim_carrier TEXT,
  sim_number TEXT,
  status TEXT,
  last_heartbeat TIMESTAMPTZ,
  total_messages_sent INT,
  total_messages_failed INT,
  success_rate NUMERIC,
  in_flight_count INT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gd.id AS device_id,
    gd.name AS device_name,
    gd.sim_carrier,
    gd.sim_number,
    gd.status,
    gd.last_heartbeat,
    gd.total_messages_sent,
    gd.total_messages_failed,
    CASE
      WHEN (gd.total_messages_sent + gd.total_messages_failed) = 0 THEN 100.0
      ELSE ROUND((gd.total_messages_sent::NUMERIC / (gd.total_messages_sent + gd.total_messages_failed)) * 100, 2)
    END AS success_rate,
    (
      SELECT COUNT(*)
      FROM messages m
      WHERE m.gateway_id = gd.id
        AND m.status IN ('DISPATCHED', 'SENT')
        AND m.queued_at > NOW() - INTERVAL '1 hour'
    ) AS in_flight_count
  FROM gateway_devices gd
  WHERE gd.subscriber_id = p_subscriber_id
    AND gd.status = 'ONLINE'
    AND gd.deleted_at IS NULL
    AND gd.last_heartbeat > NOW() - INTERVAL '5 minutes'
    AND (p_preferred_carrier IS NULL OR gd.sim_carrier = p_preferred_carrier)
  ORDER BY
    -- Priority 1: Carrier match (if specified)
    CASE WHEN p_preferred_carrier IS NOT NULL AND gd.sim_carrier = p_preferred_carrier THEN 0 ELSE 1 END,
    -- Priority 2: Least loaded device (fewest in-flight messages)
    in_flight_count ASC,
    -- Priority 3: Best success rate
    success_rate DESC,
    -- Priority 4: Most recent heartbeat
    gd.last_heartbeat DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_available_devices IS
'Returns available devices for a subscriber, sorted by optimal dispatch order. ' ||
'Considers carrier matching, load balancing, success rate, and connection health.';

-- ============================================================================
-- Function: select_optimal_device
-- Description: Select single best device for message dispatch
-- Usage: SELECT select_optimal_device('subscriber-uuid', 'Globe');
-- Returns: device_id (UUID) or NULL if no devices available
-- ============================================================================

CREATE OR REPLACE FUNCTION select_optimal_device(
  p_subscriber_id UUID,
  p_preferred_carrier TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_device_id UUID;
BEGIN
  -- Get the first (optimal) device from available devices
  SELECT device_id INTO v_device_id
  FROM get_available_devices(p_subscriber_id, p_preferred_carrier)
  LIMIT 1;

  RETURN v_device_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION select_optimal_device IS
'Returns the single most optimal device ID for message dispatch. ' ||
'Returns NULL if no devices are available online for the subscriber.';

-- ============================================================================
-- Function: get_device_stats
-- Description: Get comprehensive statistics for a device
-- Usage: SELECT * FROM get_device_stats('device-uuid');
-- ============================================================================

CREATE OR REPLACE FUNCTION get_device_stats(p_device_id UUID)
RETURNS TABLE (
  device_id UUID,
  device_name TEXT,
  subscriber_id UUID,
  status TEXT,
  total_sent INT,
  total_failed INT,
  success_rate NUMERIC,
  messages_today INT,
  messages_this_hour INT,
  avg_response_time_ms INT,
  last_heartbeat TIMESTAMPTZ,
  uptime_percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gd.id AS device_id,
    gd.name AS device_name,
    gd.subscriber_id,
    gd.status,
    gd.total_messages_sent AS total_sent,
    gd.total_messages_failed AS total_failed,
    CASE
      WHEN (gd.total_messages_sent + gd.total_messages_failed) = 0 THEN 100.0
      ELSE ROUND((gd.total_messages_sent::NUMERIC / (gd.total_messages_sent + gd.total_messages_failed)) * 100, 2)
    END AS success_rate,
    (
      SELECT COUNT(*)
      FROM messages m
      WHERE m.gateway_id = gd.id
        AND DATE(m.queued_at) = CURRENT_DATE
        AND m.status IN ('SENT', 'DELIVERED')
    ) AS messages_today,
    (
      SELECT COUNT(*)
      FROM messages m
      WHERE m.gateway_id = gd.id
        AND m.queued_at > NOW() - INTERVAL '1 hour'
        AND m.status IN ('SENT', 'DELIVERED')
    ) AS messages_this_hour,
    (
      SELECT COALESCE(AVG(EXTRACT(EPOCH FROM (dispatched_at - queued_at)) * 1000)::INT, 0)
      FROM messages m
      WHERE m.gateway_id = gd.id
        AND m.dispatched_at IS NOT NULL
        AND m.queued_at > NOW() - INTERVAL '24 hours'
    ) AS avg_response_time_ms,
    gd.last_heartbeat,
    -- Calculate uptime as percentage of time device was online in last 24h
    100.0 AS uptime_percentage  -- TODO: Implement with heartbeat tracking table
  FROM gateway_devices gd
  WHERE gd.id = p_device_id
    AND gd.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_device_stats IS
'Returns comprehensive statistics for a specific device including performance metrics.';

-- ============================================================================
-- Function: check_device_availability
-- Description: Quick check if subscriber has any devices online
-- Usage: SELECT check_device_availability('subscriber-uuid');
-- Returns: boolean (TRUE if devices available, FALSE if none)
-- ============================================================================

CREATE OR REPLACE FUNCTION check_device_availability(p_subscriber_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_device_count INT;
BEGIN
  SELECT COUNT(*) INTO v_device_count
  FROM gateway_devices
  WHERE subscriber_id = p_subscriber_id
    AND status = 'ONLINE'
    AND deleted_at IS NULL
    AND last_heartbeat > NOW() - INTERVAL '5 minutes';

  RETURN v_device_count > 0;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_device_availability IS
'Quick boolean check to determine if subscriber has any online devices. ' ||
'Used for early validation before message queueing.';

-- ============================================================================
-- Function: get_carrier_distribution
-- Description: Get distribution of devices across carriers for a subscriber
-- Usage: SELECT * FROM get_carrier_distribution('subscriber-uuid');
-- ============================================================================

CREATE OR REPLACE FUNCTION get_carrier_distribution(p_subscriber_id UUID)
RETURNS TABLE (
  carrier TEXT,
  device_count INT,
  online_count INT,
  total_messages_sent BIGINT,
  avg_success_rate NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(gd.sim_carrier, 'Unknown') AS carrier,
    COUNT(*)::INT AS device_count,
    COUNT(*) FILTER (WHERE gd.status = 'ONLINE' AND gd.deleted_at IS NULL)::INT AS online_count,
    COALESCE(SUM(gd.total_messages_sent), 0)::BIGINT AS total_messages_sent,
    CASE
      WHEN SUM(gd.total_messages_sent + gd.total_messages_failed) = 0 THEN 100.0
      ELSE ROUND((SUM(gd.total_messages_sent)::NUMERIC / SUM(gd.total_messages_sent + gd.total_messages_failed)) * 100, 2)
    END AS avg_success_rate
  FROM gateway_devices gd
  WHERE gd.subscriber_id = p_subscriber_id
    AND gd.deleted_at IS NULL
  GROUP BY gd.sim_carrier
  ORDER BY online_count DESC, device_count DESC;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_carrier_distribution IS
'Returns carrier distribution statistics for subscriber devices. ' ||
'Useful for understanding device fleet composition and carrier performance.';

-- ============================================================================
-- Example Usage
-- ============================================================================
/*
-- Get all available devices for a subscriber
SELECT * FROM get_available_devices('550e8400-e29b-41d4-a716-446655440000');

-- Get available devices with carrier preference
SELECT * FROM get_available_devices('550e8400-e29b-41d4-a716-446655440000', 'Globe');

-- Select optimal device for dispatch
SELECT select_optimal_device('550e8400-e29b-41d4-a716-446655440000');

-- Check if subscriber has any devices online
SELECT check_device_availability('550e8400-e29b-41d4-a716-446655440000');

-- Get device statistics
SELECT * FROM get_device_stats('device-uuid-here');

-- Get carrier distribution
SELECT * FROM get_carrier_distribution('550e8400-e29b-41d4-a716-446655440000');
*/

-- ============================================================================
-- Rollback
-- ============================================================================
/*
DROP FUNCTION IF EXISTS get_available_devices(UUID, TEXT);
DROP FUNCTION IF EXISTS select_optimal_device(UUID, TEXT);
DROP FUNCTION IF EXISTS get_device_stats(UUID);
DROP FUNCTION IF EXISTS check_device_availability(UUID);
DROP FUNCTION IF EXISTS get_carrier_distribution(UUID);
*/
