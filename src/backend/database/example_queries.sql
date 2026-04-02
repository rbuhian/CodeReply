-- ============================================================================
-- CodeReply - Example Queries (BYOD Model)
-- Description: Common database queries for the BYOD architecture
-- Version: 2.0
-- Date: 2026-04-02
-- ============================================================================

-- ============================================================================
-- SECTION 1: DEVICE MANAGEMENT QUERIES
-- ============================================================================

-- 1.1 Get all active devices for a subscriber
SELECT
  id,
  name,
  device_label,
  sim_carrier,
  sim_number,
  status,
  is_enabled,
  last_heartbeat,
  total_messages_sent,
  total_messages_failed,
  CASE
    WHEN (total_messages_sent + total_messages_failed) > 0
    THEN ROUND(total_messages_sent::NUMERIC / (total_messages_sent + total_messages_failed)::NUMERIC * 100, 2)
    ELSE 0
  END AS success_rate_percent
FROM gateway_devices
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND deleted_at IS NULL
ORDER BY registered_at DESC;

-- 1.2 Get only ONLINE and ENABLED devices for a subscriber
SELECT
  id,
  name,
  device_label,
  status,
  last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - last_heartbeat)) AS seconds_since_heartbeat
FROM gateway_devices
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND deleted_at IS NULL
  AND is_enabled = TRUE
  AND status = 'ONLINE'
  AND last_heartbeat > NOW() - INTERVAL '2 minutes'
ORDER BY last_heartbeat DESC;

-- 1.3 Get device with lowest message load for a subscriber
SELECT
  gd.id,
  gd.name,
  gd.sim_carrier,
  COUNT(m.id) AS in_flight_messages
FROM gateway_devices gd
LEFT JOIN messages m ON m.gateway_id = gd.id
  AND m.status IN ('QUEUED', 'DISPATCHED')
WHERE gd.subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND gd.deleted_at IS NULL
  AND gd.is_enabled = TRUE
  AND gd.status = 'ONLINE'
  AND gd.last_heartbeat > NOW() - INTERVAL '2 minutes'
GROUP BY gd.id, gd.name, gd.sim_carrier
ORDER BY COUNT(m.id) ASC
LIMIT 1;

-- 1.4 Get device statistics for a subscriber
SELECT
  s.name AS subscriber_name,
  s.plan,
  s.device_count AS active_devices,
  s.max_devices AS device_quota,
  COUNT(gd.id) AS total_devices_including_deleted,
  COUNT(CASE WHEN gd.status = 'ONLINE' THEN 1 END) AS online_devices,
  COUNT(CASE WHEN gd.status = 'OFFLINE' THEN 1 END) AS offline_devices,
  COUNT(CASE WHEN gd.deleted_at IS NOT NULL THEN 1 END) AS deleted_devices
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id
WHERE s.id = 'YOUR_SUBSCRIBER_UUID'
GROUP BY s.id, s.name, s.plan, s.device_count, s.max_devices;

-- 1.5 Check if subscriber can add more devices
SELECT
  s.name,
  s.device_count AS current_devices,
  s.max_devices AS max_allowed,
  s.max_devices - s.device_count AS available_slots,
  can_add_device(s.id) AS can_add_more
FROM subscribers s
WHERE s.id = 'YOUR_SUBSCRIBER_UUID';

-- 1.6 Soft delete a device
UPDATE gateway_devices
SET deleted_at = NOW()
WHERE id = 'DEVICE_UUID'
  AND subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND deleted_at IS NULL;

-- 1.7 Restore a soft-deleted device
UPDATE gateway_devices
SET deleted_at = NULL
WHERE id = 'DEVICE_UUID'
  AND subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND deleted_at IS NOT NULL;

-- 1.8 Disable a device (prevent it from receiving messages)
UPDATE gateway_devices
SET is_enabled = FALSE
WHERE id = 'DEVICE_UUID'
  AND subscriber_id = 'YOUR_SUBSCRIBER_UUID';

-- 1.9 Enable a device
UPDATE gateway_devices
SET is_enabled = TRUE
WHERE id = 'DEVICE_UUID'
  AND subscriber_id = 'YOUR_SUBSCRIBER_UUID';

-- 1.10 Get devices that haven't sent a heartbeat in 5 minutes (potentially offline)
SELECT
  gd.id,
  gd.name,
  gd.subscriber_id,
  s.email AS subscriber_email,
  gd.last_heartbeat,
  EXTRACT(EPOCH FROM (NOW() - gd.last_heartbeat)) AS seconds_since_heartbeat
FROM gateway_devices gd
JOIN subscribers s ON s.id = gd.subscriber_id
WHERE gd.deleted_at IS NULL
  AND gd.last_heartbeat < NOW() - INTERVAL '5 minutes'
ORDER BY gd.last_heartbeat ASC;

-- ============================================================================
-- SECTION 2: MESSAGE DISPATCH QUERIES
-- ============================================================================

-- 2.1 Get available devices for dispatching (using helper function)
SELECT *
FROM get_available_devices(
  'YOUR_SUBSCRIBER_UUID',
  NULL  -- No carrier preference
);

-- 2.2 Get available devices with carrier preference
SELECT *
FROM get_available_devices(
  'YOUR_SUBSCRIBER_UUID',
  'Globe Telecom'  -- Prefer Globe Telecom carrier
);

-- 2.3 Dispatch a message to a specific device
-- Step 1: Insert message
INSERT INTO messages (
  subscriber_id,
  gateway_id,
  to_number,
  body,
  status,
  webhook_url,
  metadata,
  dispatched_at
) VALUES (
  'YOUR_SUBSCRIBER_UUID',
  'DEVICE_UUID',
  '+639171234567',
  'Your OTP is 123456. Valid for 5 minutes.',
  'DISPATCHED',
  'https://yourapp.com/webhook',
  '{"purpose": "otp", "userId": "user123"}'::JSONB,
  NOW()
) RETURNING id;

-- 2.4 Get messages dispatched to subscriber's devices
SELECT
  m.id,
  m.to_number,
  m.body,
  m.status,
  gd.name AS device_name,
  gd.sim_carrier,
  m.queued_at,
  m.dispatched_at,
  m.sent_at,
  m.delivered_at
FROM messages m
LEFT JOIN gateway_devices gd ON gd.id = m.gateway_id
WHERE m.subscriber_id = 'YOUR_SUBSCRIBER_UUID'
ORDER BY m.queued_at DESC
LIMIT 100;

-- 2.5 Get messages by status for a subscriber
SELECT
  status,
  COUNT(*) AS count,
  MIN(queued_at) AS oldest,
  MAX(queued_at) AS newest
FROM messages
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND queued_at > NOW() - INTERVAL '24 hours'
GROUP BY status
ORDER BY count DESC;

-- 2.6 Find queued messages that need to be dispatched
SELECT
  m.id,
  m.to_number,
  m.body,
  m.queued_at,
  EXTRACT(EPOCH FROM (NOW() - m.queued_at)) AS seconds_in_queue
FROM messages m
WHERE m.subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND m.status = 'QUEUED'
  AND m.queued_at + (m.ttl * INTERVAL '1 second') > NOW()  -- Not expired
ORDER BY m.queued_at ASC;

-- 2.7 Mark messages as EXPIRED if TTL has elapsed
UPDATE messages
SET status = 'EXPIRED'
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND status = 'QUEUED'
  AND queued_at + (ttl * INTERVAL '1 second') < NOW();

-- ============================================================================
-- SECTION 3: ANALYTICS AND REPORTING QUERIES
-- ============================================================================

-- 3.1 Get daily message statistics for a subscriber
SELECT
  DATE(queued_at) AS date,
  COUNT(*) AS total_messages,
  COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) AS delivered,
  COUNT(CASE WHEN status = 'FAILED' THEN 1 END) AS failed,
  COUNT(CASE WHEN status = 'EXPIRED' THEN 1 END) AS expired,
  ROUND(
    COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC * 100,
    2
  ) AS delivery_rate_percent
FROM messages
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND queued_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(queued_at)
ORDER BY date DESC;

-- 3.2 Get per-device performance for a subscriber
SELECT
  gd.name AS device_name,
  gd.sim_carrier,
  COUNT(m.id) AS total_messages,
  COUNT(CASE WHEN m.status = 'DELIVERED' THEN 1 END) AS delivered,
  COUNT(CASE WHEN m.status = 'FAILED' THEN 1 END) AS failed,
  ROUND(
    COUNT(CASE WHEN m.status = 'DELIVERED' THEN 1 END)::NUMERIC / NULLIF(COUNT(m.id), 0)::NUMERIC * 100,
    2
  ) AS success_rate_percent,
  AVG(EXTRACT(EPOCH FROM (m.delivered_at - m.queued_at))) AS avg_delivery_time_seconds
FROM gateway_devices gd
LEFT JOIN messages m ON m.gateway_id = gd.id
  AND m.queued_at >= NOW() - INTERVAL '7 days'
WHERE gd.subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND gd.deleted_at IS NULL
GROUP BY gd.id, gd.name, gd.sim_carrier
ORDER BY total_messages DESC;

-- 3.3 Get hourly message distribution (for capacity planning)
SELECT
  EXTRACT(HOUR FROM queued_at) AS hour,
  COUNT(*) AS message_count,
  AVG(EXTRACT(EPOCH FROM (delivered_at - queued_at))) AS avg_delivery_time_seconds
FROM messages
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND queued_at >= NOW() - INTERVAL '7 days'
  AND status = 'DELIVERED'
GROUP BY EXTRACT(HOUR FROM queued_at)
ORDER BY hour;

-- 3.4 Get top recipients (most messages sent to)
SELECT
  to_number,
  COUNT(*) AS message_count,
  COUNT(CASE WHEN status = 'DELIVERED' THEN 1 END) AS delivered_count,
  MAX(queued_at) AS last_message_at
FROM messages
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND queued_at >= NOW() - INTERVAL '30 days'
GROUP BY to_number
ORDER BY message_count DESC
LIMIT 10;

-- 3.5 Get subscriber dashboard summary
SELECT
  s.name AS subscriber_name,
  s.email,
  s.plan,
  s.daily_quota,
  s.device_count AS active_devices,
  s.max_devices AS device_quota,
  -- Messages today
  COUNT(CASE WHEN DATE(m.queued_at) = CURRENT_DATE THEN 1 END) AS messages_today,
  -- Messages this month
  COUNT(CASE WHEN DATE_TRUNC('month', m.queued_at) = DATE_TRUNC('month', CURRENT_DATE) THEN 1 END) AS messages_this_month,
  -- Online devices
  COUNT(CASE WHEN gd.status = 'ONLINE' AND gd.last_heartbeat > NOW() - INTERVAL '2 minutes' THEN 1 END) AS online_devices,
  -- Success rate (last 24 hours)
  ROUND(
    COUNT(CASE WHEN m.status = 'DELIVERED' AND m.queued_at >= NOW() - INTERVAL '24 hours' THEN 1 END)::NUMERIC /
    NULLIF(COUNT(CASE WHEN m.queued_at >= NOW() - INTERVAL '24 hours' THEN 1 END), 0)::NUMERIC * 100,
    2
  ) AS success_rate_24h_percent
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id AND gd.deleted_at IS NULL
LEFT JOIN messages m ON m.subscriber_id = s.id
WHERE s.id = 'YOUR_SUBSCRIBER_UUID'
GROUP BY s.id, s.name, s.email, s.plan, s.daily_quota, s.device_count, s.max_devices;

-- ============================================================================
-- SECTION 4: QUOTA AND LIMIT ENFORCEMENT QUERIES
-- ============================================================================

-- 4.1 Check daily quota usage for a subscriber
SELECT
  s.name,
  s.daily_quota,
  COUNT(m.id) AS messages_today,
  s.daily_quota - COUNT(m.id) AS remaining_quota,
  ROUND(COUNT(m.id)::NUMERIC / s.daily_quota::NUMERIC * 100, 2) AS quota_used_percent
FROM subscribers s
LEFT JOIN messages m ON m.subscriber_id = s.id
  AND DATE(m.queued_at) = CURRENT_DATE
WHERE s.id = 'YOUR_SUBSCRIBER_UUID'
GROUP BY s.id, s.name, s.daily_quota;

-- 4.2 Get subscribers who have exceeded their daily quota
SELECT
  s.id,
  s.name,
  s.email,
  s.plan,
  s.daily_quota,
  COUNT(m.id) AS messages_today,
  COUNT(m.id) - s.daily_quota AS over_quota_by
FROM subscribers s
LEFT JOIN messages m ON m.subscriber_id = s.id
  AND DATE(m.queued_at) = CURRENT_DATE
GROUP BY s.id, s.name, s.email, s.plan, s.daily_quota
HAVING COUNT(m.id) > s.daily_quota
ORDER BY over_quota_by DESC;

-- 4.3 Get subscribers approaching device quota (80% or more)
SELECT
  s.id,
  s.name,
  s.email,
  s.plan,
  s.device_count AS active_devices,
  s.max_devices AS max_allowed,
  ROUND(s.device_count::NUMERIC / s.max_devices::NUMERIC * 100, 2) AS quota_used_percent
FROM subscribers s
WHERE s.device_count::NUMERIC / s.max_devices::NUMERIC >= 0.8
ORDER BY quota_used_percent DESC;

-- ============================================================================
-- SECTION 5: MAINTENANCE AND ADMIN QUERIES
-- ============================================================================

-- 5.1 Get all subscribers with device counts
SELECT
  s.name,
  s.email,
  s.plan,
  s.device_count AS active_devices,
  s.max_devices AS max_allowed,
  COUNT(gd.id) AS total_devices_including_deleted,
  s.daily_quota,
  s.created_at
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id
GROUP BY s.id
ORDER BY s.created_at DESC;

-- 5.2 Find orphaned messages (gateway_id points to deleted device)
SELECT
  m.id,
  m.subscriber_id,
  m.gateway_id,
  m.status,
  m.queued_at
FROM messages m
LEFT JOIN gateway_devices gd ON gd.id = m.gateway_id
WHERE m.gateway_id IS NOT NULL
  AND gd.id IS NULL;

-- 5.3 Clean up old messages (older than 90 days)
DELETE FROM messages
WHERE queued_at < NOW() - INTERVAL '90 days'
  AND status IN ('DELIVERED', 'FAILED', 'EXPIRED', 'CANCELLED');

-- 5.4 Hard delete soft-deleted devices (older than 30 days)
DELETE FROM gateway_devices
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '30 days';

-- 5.5 Get database table sizes
SELECT
  schemaname AS schema,
  tablename AS table,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size,
  pg_total_relation_size(schemaname||'.'||tablename) AS size_bytes
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY size_bytes DESC;

-- 5.6 Get device registration rate (devices added per day in last 30 days)
SELECT
  DATE(registered_at) AS date,
  COUNT(*) AS devices_registered
FROM gateway_devices
WHERE registered_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(registered_at)
ORDER BY date DESC;

-- ============================================================================
-- SECTION 6: USING THE ACTIVE_GATEWAY_DEVICES VIEW
-- ============================================================================

-- 6.1 Get all active devices with computed metrics
SELECT
  subscriber_name,
  name AS device_name,
  device_label,
  sim_carrier,
  status,
  is_online,
  is_healthy,
  success_rate,
  total_messages_sent,
  total_messages_failed,
  last_heartbeat
FROM active_gateway_devices
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
ORDER BY is_healthy DESC, is_online DESC, last_heartbeat DESC;

-- 6.2 Get only healthy devices for a subscriber
SELECT
  name,
  device_label,
  sim_carrier,
  last_heartbeat,
  success_rate
FROM active_gateway_devices
WHERE subscriber_id = 'YOUR_SUBSCRIBER_UUID'
  AND is_healthy = TRUE
ORDER BY success_rate DESC NULLS LAST;

-- ============================================================================
-- NOTES:
-- ============================================================================
-- 1. Replace 'YOUR_SUBSCRIBER_UUID' with actual subscriber UUID
-- 2. Replace 'DEVICE_UUID' with actual device UUID
-- 3. All queries filter by subscriber_id to ensure multi-tenant isolation
-- 4. Soft-deleted devices (deleted_at IS NOT NULL) are excluded by default
-- 5. Use indexes for best performance on large datasets
-- ============================================================================
