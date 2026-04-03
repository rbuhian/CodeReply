-- ============================================================================
-- Performance Statistics Views for BYOD
-- Description: Views for analytics, reporting, and performance monitoring
-- Author: Raj (Database Architect)
-- Date: 2026-04-03
-- ============================================================================

-- ============================================================================
-- View: subscriber_performance_summary
-- Description: Real-time performance metrics per subscriber
-- Usage: SELECT * FROM subscriber_performance_summary WHERE subscriber_id = '...';
-- ============================================================================

CREATE OR REPLACE VIEW subscriber_performance_summary AS
SELECT
  s.id AS subscriber_id,
  s.name AS subscriber_name,
  s.email AS subscriber_email,
  s.plan,
  s.device_count,
  s.max_devices,
  ROUND((s.device_count::NUMERIC / s.max_devices) * 100, 2) AS device_quota_percentage,

  -- Device statistics
  COUNT(DISTINCT gd.id) FILTER (WHERE gd.status = 'ONLINE' AND gd.deleted_at IS NULL) AS devices_online,
  COUNT(DISTINCT gd.id) FILTER (WHERE gd.status = 'OFFLINE' AND gd.deleted_at IS NULL) AS devices_offline,
  COUNT(DISTINCT gd.id) FILTER (WHERE gd.deleted_at IS NOT NULL) AS devices_deleted,

  -- Message statistics (today)
  COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE) AS messages_today,
  COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE AND m.status = 'DELIVERED') AS messages_delivered_today,
  COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE AND m.status = 'FAILED') AS messages_failed_today,

  -- Success rate (today)
  CASE
    WHEN COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE) = 0 THEN NULL
    ELSE ROUND(
      (COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE AND m.status = 'DELIVERED')::NUMERIC /
       COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE)) * 100, 2
    )
  END AS success_rate_today,

  -- Message statistics (last 30 days)
  COUNT(m.id) FILTER (WHERE m.queued_at > CURRENT_DATE - INTERVAL '30 days') AS messages_last_30_days,

  -- Average delivery time (last 24 hours)
  ROUND(AVG(EXTRACT(EPOCH FROM (m.delivered_at - m.queued_at)))::NUMERIC, 2) FILTER (
    WHERE m.delivered_at IS NOT NULL AND m.queued_at > NOW() - INTERVAL '24 hours'
  ) AS avg_delivery_time_seconds,

  -- Timestamps
  s.created_at AS subscriber_created_at,
  s.updated_at AS subscriber_updated_at
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id
LEFT JOIN messages m ON m.subscriber_id = s.id
GROUP BY s.id, s.name, s.email, s.plan, s.device_count, s.max_devices, s.created_at, s.updated_at;

COMMENT ON VIEW subscriber_performance_summary IS
'Real-time performance summary for each subscriber including device counts, message statistics, and success rates.';

-- ============================================================================
-- View: device_performance_summary
-- Description: Performance metrics per device
-- Usage: SELECT * FROM device_performance_summary WHERE subscriber_id = '...';
-- ============================================================================

CREATE OR REPLACE VIEW device_performance_summary AS
SELECT
  gd.id AS device_id,
  gd.subscriber_id,
  s.name AS subscriber_name,
  gd.name AS device_name,
  gd.status,
  gd.sim_carrier,
  gd.sim_number,
  gd.last_heartbeat,

  -- Connection health
  CASE
    WHEN gd.last_heartbeat > NOW() - INTERVAL '1 minute' THEN 'Excellent'
    WHEN gd.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 'Good'
    WHEN gd.last_heartbeat > NOW() - INTERVAL '15 minutes' THEN 'Fair'
    ELSE 'Poor'
  END AS connection_health,

  -- Message counters
  gd.total_messages_sent,
  gd.total_messages_failed,
  gd.total_messages_sent + gd.total_messages_failed AS total_messages_attempted,

  -- Success rate
  CASE
    WHEN (gd.total_messages_sent + gd.total_messages_failed) = 0 THEN NULL
    ELSE ROUND((gd.total_messages_sent::NUMERIC / (gd.total_messages_sent + gd.total_messages_failed)) * 100, 2)
  END AS success_rate_overall,

  -- Recent activity
  COUNT(m.id) FILTER (WHERE m.queued_at > NOW() - INTERVAL '1 hour') AS messages_last_hour,
  COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE) AS messages_today,
  COUNT(m.id) FILTER (WHERE m.queued_at > CURRENT_DATE - INTERVAL '7 days') AS messages_last_7_days,

  -- Average response time (last 24 hours)
  ROUND(AVG(EXTRACT(EPOCH FROM (m.dispatched_at - m.queued_at)) * 1000)::NUMERIC, 0) FILTER (
    WHERE m.dispatched_at IS NOT NULL AND m.queued_at > NOW() - INTERVAL '24 hours'
  ) AS avg_response_time_ms,

  -- In-flight messages
  COUNT(m.id) FILTER (WHERE m.status IN ('DISPATCHED', 'SENT')) AS in_flight_messages,

  -- Timestamps
  gd.created_at AS device_created_at,
  gd.updated_at AS device_updated_at,
  gd.deleted_at AS device_deleted_at
FROM gateway_devices gd
INNER JOIN subscribers s ON s.id = gd.subscriber_id
LEFT JOIN messages m ON m.gateway_id = gd.id
GROUP BY gd.id, gd.subscriber_id, s.name, gd.name, gd.status, gd.sim_carrier, gd.sim_number,
         gd.last_heartbeat, gd.total_messages_sent, gd.total_messages_failed,
         gd.created_at, gd.updated_at, gd.deleted_at;

COMMENT ON VIEW device_performance_summary IS
'Detailed performance metrics for each device including connection health, message stats, and response times.';

-- ============================================================================
-- View: daily_message_stats
-- Description: Daily aggregated message statistics per subscriber
-- Usage: SELECT * FROM daily_message_stats WHERE date >= CURRENT_DATE - 30;
-- ============================================================================

CREATE OR REPLACE VIEW daily_message_stats AS
SELECT
  DATE(m.queued_at) AS date,
  m.subscriber_id,
  s.name AS subscriber_name,
  s.plan,

  -- Message counts by status
  COUNT(*) AS total_messages,
  COUNT(*) FILTER (WHERE m.status = 'QUEUED') AS queued,
  COUNT(*) FILTER (WHERE m.status = 'DISPATCHED') AS dispatched,
  COUNT(*) FILTER (WHERE m.status = 'SENT') AS sent,
  COUNT(*) FILTER (WHERE m.status = 'DELIVERED') AS delivered,
  COUNT(*) FILTER (WHERE m.status = 'FAILED') AS failed,
  COUNT(*) FILTER (WHERE m.status = 'REJECTED') AS rejected,

  -- Success metrics
  ROUND(
    (COUNT(*) FILTER (WHERE m.status = 'DELIVERED')::NUMERIC / COUNT(*)) * 100, 2
  ) AS delivery_rate_percentage,

  -- Unique devices used
  COUNT(DISTINCT m.gateway_id) AS unique_devices_used,

  -- Timing metrics
  ROUND(AVG(EXTRACT(EPOCH FROM (m.delivered_at - m.queued_at)))::NUMERIC, 2) FILTER (
    WHERE m.delivered_at IS NOT NULL
  ) AS avg_delivery_time_seconds,

  -- Cost estimation (assuming $0.01 per delivered message)
  COUNT(*) FILTER (WHERE m.status = 'DELIVERED')::NUMERIC * 0.01 AS estimated_cost
FROM messages m
INNER JOIN subscribers s ON s.id = m.subscriber_id
GROUP BY DATE(m.queued_at), m.subscriber_id, s.name, s.plan
ORDER BY date DESC, m.subscriber_id;

COMMENT ON VIEW daily_message_stats IS
'Daily aggregated message statistics per subscriber including delivery rates, costs, and timing metrics.';

-- ============================================================================
-- View: hourly_message_volume
-- Description: Hourly message volume for load analysis
-- Usage: SELECT * FROM hourly_message_volume WHERE hour_timestamp > NOW() - INTERVAL '7 days';
-- ============================================================================

CREATE OR REPLACE VIEW hourly_message_volume AS
SELECT
  DATE_TRUNC('hour', m.queued_at) AS hour_timestamp,
  m.subscriber_id,
  s.name AS subscriber_name,
  COUNT(*) AS message_count,
  COUNT(DISTINCT m.gateway_id) AS devices_used,

  -- Status breakdown
  COUNT(*) FILTER (WHERE m.status IN ('SENT', 'DELIVERED')) AS successful,
  COUNT(*) FILTER (WHERE m.status = 'FAILED') AS failed,

  -- Success rate
  ROUND(
    (COUNT(*) FILTER (WHERE m.status IN ('SENT', 'DELIVERED'))::NUMERIC / COUNT(*)) * 100, 2
  ) AS success_rate_percentage
FROM messages m
INNER JOIN subscribers s ON s.id = m.subscriber_id
WHERE m.queued_at > NOW() - INTERVAL '30 days'
GROUP BY DATE_TRUNC('hour', m.queued_at), m.subscriber_id, s.name
ORDER BY hour_timestamp DESC, m.subscriber_id;

COMMENT ON VIEW hourly_message_volume IS
'Hourly message volume and success rates for load analysis and capacity planning.';

-- ============================================================================
-- View: carrier_performance
-- Description: Performance metrics grouped by carrier
-- Usage: SELECT * FROM carrier_performance WHERE subscriber_id = '...';
-- ============================================================================

CREATE OR REPLACE VIEW carrier_performance AS
SELECT
  gd.subscriber_id,
  s.name AS subscriber_name,
  COALESCE(gd.sim_carrier, 'Unknown') AS carrier,

  -- Device counts
  COUNT(DISTINCT gd.id) FILTER (WHERE gd.deleted_at IS NULL) AS device_count,
  COUNT(DISTINCT gd.id) FILTER (WHERE gd.status = 'ONLINE' AND gd.deleted_at IS NULL) AS devices_online,

  -- Message statistics
  SUM(gd.total_messages_sent) AS total_messages_sent,
  SUM(gd.total_messages_failed) AS total_messages_failed,

  -- Success rate
  CASE
    WHEN SUM(gd.total_messages_sent + gd.total_messages_failed) = 0 THEN NULL
    ELSE ROUND((SUM(gd.total_messages_sent)::NUMERIC / SUM(gd.total_messages_sent + gd.total_messages_failed)) * 100, 2)
  END AS success_rate_percentage,

  -- Recent activity (last 24 hours)
  COUNT(m.id) FILTER (WHERE m.queued_at > NOW() - INTERVAL '24 hours') AS messages_last_24h,

  -- Average response time (last 24 hours)
  ROUND(AVG(EXTRACT(EPOCH FROM (m.dispatched_at - m.queued_at)) * 1000)::NUMERIC, 0) FILTER (
    WHERE m.dispatched_at IS NOT NULL AND m.queued_at > NOW() - INTERVAL '24 hours'
  ) AS avg_response_time_ms
FROM gateway_devices gd
INNER JOIN subscribers s ON s.id = gd.subscriber_id
LEFT JOIN messages m ON m.gateway_id = gd.id
GROUP BY gd.subscriber_id, s.name, gd.sim_carrier
ORDER BY gd.subscriber_id, device_count DESC;

COMMENT ON VIEW carrier_performance IS
'Performance metrics grouped by carrier for carrier-based routing optimization.';

-- ============================================================================
-- Materialized View: subscriber_monthly_summary
-- Description: Monthly aggregated subscriber statistics (refreshed daily)
-- Usage: SELECT * FROM subscriber_monthly_summary WHERE year = 2026 AND month = 4;
-- ============================================================================

CREATE MATERIALIZED VIEW IF NOT EXISTS subscriber_monthly_summary AS
SELECT
  m.subscriber_id,
  s.name AS subscriber_name,
  s.plan,
  EXTRACT(YEAR FROM m.queued_at)::INT AS year,
  EXTRACT(MONTH FROM m.queued_at)::INT AS month,

  -- Message counts
  COUNT(*) AS total_messages,
  COUNT(*) FILTER (WHERE m.status = 'DELIVERED') AS delivered_messages,
  COUNT(*) FILTER (WHERE m.status = 'FAILED') AS failed_messages,

  -- Success rate
  ROUND((COUNT(*) FILTER (WHERE m.status = 'DELIVERED')::NUMERIC / COUNT(*)) * 100, 2) AS success_rate_percentage,

  -- Unique devices
  COUNT(DISTINCT m.gateway_id) AS unique_devices_used,

  -- Cost estimation
  COUNT(*) FILTER (WHERE m.status = 'DELIVERED')::NUMERIC * 0.01 AS estimated_cost,

  -- Peak day
  (
    SELECT DATE(queued_at)
    FROM messages
    WHERE subscriber_id = m.subscriber_id
      AND EXTRACT(YEAR FROM queued_at) = EXTRACT(YEAR FROM m.queued_at)
      AND EXTRACT(MONTH FROM queued_at) = EXTRACT(MONTH FROM m.queued_at)
    GROUP BY DATE(queued_at)
    ORDER BY COUNT(*) DESC
    LIMIT 1
  ) AS peak_day,

  -- Average per day
  ROUND((COUNT(*)::NUMERIC / EXTRACT(DAY FROM DATE_TRUNC('month', MAX(m.queued_at)) + INTERVAL '1 month' - INTERVAL '1 day')), 2) AS avg_messages_per_day,

  -- Refresh timestamp
  NOW() AS refreshed_at
FROM messages m
INNER JOIN subscribers s ON s.id = m.subscriber_id
GROUP BY m.subscriber_id, s.name, s.plan, EXTRACT(YEAR FROM m.queued_at), EXTRACT(MONTH FROM m.queued_at);

CREATE UNIQUE INDEX idx_subscriber_monthly_summary_unique
ON subscriber_monthly_summary(subscriber_id, year, month);

CREATE INDEX idx_subscriber_monthly_summary_date
ON subscriber_monthly_summary(year DESC, month DESC);

COMMENT ON MATERIALIZED VIEW subscriber_monthly_summary IS
'Monthly aggregated statistics per subscriber. Refresh daily with: REFRESH MATERIALIZED VIEW CONCURRENTLY subscriber_monthly_summary;';

-- ============================================================================
-- Helper Functions to Refresh Materialized Views
-- ============================================================================

CREATE OR REPLACE FUNCTION refresh_monthly_summary()
RETURNS VOID AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY subscriber_monthly_summary;
  RAISE NOTICE 'Materialized view subscriber_monthly_summary refreshed at %', NOW();
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION refresh_monthly_summary IS
'Refreshes the subscriber_monthly_summary materialized view. Run daily via cron job.';

-- ============================================================================
-- Example Usage
-- ============================================================================
/*
-- Get performance summary for all subscribers
SELECT * FROM subscriber_performance_summary ORDER BY messages_today DESC;

-- Get device performance for a specific subscriber
SELECT * FROM device_performance_summary
WHERE subscriber_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY messages_today DESC;

-- Get daily stats for last 30 days
SELECT * FROM daily_message_stats
WHERE date >= CURRENT_DATE - 30
  AND subscriber_id = '550e8400-e29b-41d4-a716-446655440000'
ORDER BY date DESC;

-- Get hourly volume for load analysis
SELECT * FROM hourly_message_volume
WHERE hour_timestamp > NOW() - INTERVAL '7 days'
ORDER BY hour_timestamp DESC;

-- Get carrier performance
SELECT * FROM carrier_performance
WHERE subscriber_id = '550e8400-e29b-41d4-a716-446655440000';

-- Get monthly summary
SELECT * FROM subscriber_monthly_summary
WHERE subscriber_id = '550e8400-e29b-41d4-a716-446655440000'
  AND year = 2026
ORDER BY year DESC, month DESC;

-- Refresh monthly summary (run daily via cron)
SELECT refresh_monthly_summary();
*/

-- ============================================================================
-- Scheduled Refresh (PostgreSQL cron extension - optional)
-- ============================================================================
/*
-- Install pg_cron extension
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule daily refresh at 1:00 AM
SELECT cron.schedule('refresh-monthly-summary', '0 1 * * *', 'SELECT refresh_monthly_summary();');

-- List all cron jobs
SELECT * FROM cron.job;
*/

-- ============================================================================
-- Rollback
-- ============================================================================
/*
DROP MATERIALIZED VIEW IF EXISTS subscriber_monthly_summary;
DROP VIEW IF EXISTS subscriber_performance_summary;
DROP VIEW IF EXISTS device_performance_summary;
DROP VIEW IF EXISTS daily_message_stats;
DROP VIEW IF EXISTS hourly_message_volume;
DROP VIEW IF EXISTS carrier_performance;
DROP FUNCTION IF EXISTS refresh_monthly_summary();
*/
