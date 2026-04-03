-- ============================================================================
-- Quota Management Functions for BYOD
-- Description: Functions to check and enforce subscriber message quotas
-- Author: Raj (Database Architect)
-- Date: 2026-04-03
-- ============================================================================

-- ============================================================================
-- Function: check_daily_quota
-- Description: Check if subscriber can send messages (within daily quota)
-- Usage: SELECT check_daily_quota('subscriber-uuid');
-- Returns: JSON with quota status
-- ============================================================================

CREATE OR REPLACE FUNCTION check_daily_quota(p_subscriber_id UUID)
RETURNS JSON AS $$
DECLARE
  v_max_daily_messages INT;
  v_messages_sent_today INT;
  v_remaining INT;
  v_can_send BOOLEAN;
  v_plan TEXT;
BEGIN
  -- Get subscriber's daily message limit and plan
  SELECT daily_message_limit, plan INTO v_max_daily_messages, v_plan
  FROM subscribers
  WHERE id = p_subscriber_id;

  -- If no limit set, default based on plan
  IF v_max_daily_messages IS NULL THEN
    v_max_daily_messages := CASE v_plan
      WHEN 'free' THEN 100
      WHEN 'starter' THEN 500
      WHEN 'pro' THEN 5000
      WHEN 'enterprise' THEN 999999
      ELSE 100
    END;
  END IF;

  -- Count messages sent today
  SELECT COUNT(*) INTO v_messages_sent_today
  FROM messages
  WHERE subscriber_id = p_subscriber_id
    AND DATE(queued_at) = CURRENT_DATE
    AND status NOT IN ('FAILED', 'REJECTED');

  -- Calculate remaining quota
  v_remaining := GREATEST(0, v_max_daily_messages - v_messages_sent_today);
  v_can_send := v_remaining > 0;

  -- Return JSON result
  RETURN json_build_object(
    'subscriberId', p_subscriber_id,
    'plan', v_plan,
    'maxDailyMessages', v_max_daily_messages,
    'messagesSentToday', v_messages_sent_today,
    'remainingQuota', v_remaining,
    'canSend', v_can_send,
    'quotaPercentageUsed', ROUND((v_messages_sent_today::NUMERIC / v_max_daily_messages) * 100, 2),
    'checkedAt', NOW()
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_daily_quota IS
'Checks subscriber daily message quota and returns detailed quota status. ' ||
'Returns JSON with quota info including remaining messages and percentage used.';

-- ============================================================================
-- Function: can_send_message
-- Description: Simple boolean check if subscriber can send a message
-- Usage: SELECT can_send_message('subscriber-uuid');
-- Returns: TRUE if can send, FALSE if quota exceeded
-- ============================================================================

CREATE OR REPLACE FUNCTION can_send_message(p_subscriber_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_result JSON;
BEGIN
  v_result := check_daily_quota(p_subscriber_id);
  RETURN (v_result->>'canSend')::BOOLEAN;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION can_send_message IS
'Simple boolean check if subscriber can send messages. ' ||
'Returns TRUE if within quota, FALSE if quota exceeded.';

-- ============================================================================
-- Function: get_quota_usage_stats
-- Description: Get detailed quota usage statistics for a subscriber
-- Usage: SELECT * FROM get_quota_usage_stats('subscriber-uuid');
-- ============================================================================

CREATE OR REPLACE FUNCTION get_quota_usage_stats(p_subscriber_id UUID)
RETURNS TABLE (
  subscriber_id UUID,
  plan TEXT,
  max_daily_messages INT,
  messages_sent_today INT,
  messages_sent_this_hour INT,
  messages_sent_this_month INT,
  remaining_daily_quota INT,
  quota_percentage_used NUMERIC,
  device_count INT,
  max_devices INT,
  device_quota_percentage_used NUMERIC,
  can_send BOOLEAN,
  can_add_device BOOLEAN
) AS $$
DECLARE
  v_max_daily INT;
  v_messages_today INT;
  v_messages_hour INT;
  v_messages_month INT;
  v_device_count INT;
  v_max_devices INT;
  v_plan TEXT;
BEGIN
  -- Get subscriber info
  SELECT s.plan, s.daily_message_limit, s.device_count, s.max_devices
  INTO v_plan, v_max_daily, v_device_count, v_max_devices
  FROM subscribers s
  WHERE s.id = p_subscriber_id;

  -- Default daily limit if not set
  IF v_max_daily IS NULL THEN
    v_max_daily := CASE v_plan
      WHEN 'free' THEN 100
      WHEN 'starter' THEN 500
      WHEN 'pro' THEN 5000
      WHEN 'enterprise' THEN 999999
      ELSE 100
    END;
  END IF;

  -- Count messages for different time periods
  SELECT
    COUNT(*) FILTER (WHERE DATE(queued_at) = CURRENT_DATE),
    COUNT(*) FILTER (WHERE queued_at > NOW() - INTERVAL '1 hour'),
    COUNT(*) FILTER (WHERE DATE_TRUNC('month', queued_at) = DATE_TRUNC('month', CURRENT_DATE))
  INTO v_messages_today, v_messages_hour, v_messages_month
  FROM messages
  WHERE subscriber_id = p_subscriber_id
    AND status NOT IN ('FAILED', 'REJECTED');

  -- Return comprehensive stats
  RETURN QUERY SELECT
    p_subscriber_id,
    v_plan,
    v_max_daily,
    v_messages_today,
    v_messages_hour,
    v_messages_month,
    GREATEST(0, v_max_daily - v_messages_today)::INT AS remaining_daily_quota,
    ROUND((v_messages_today::NUMERIC / v_max_daily) * 100, 2) AS quota_percentage_used,
    v_device_count,
    v_max_devices,
    ROUND((v_device_count::NUMERIC / v_max_devices) * 100, 2) AS device_quota_percentage_used,
    (v_messages_today < v_max_daily)::BOOLEAN AS can_send,
    (v_device_count < v_max_devices)::BOOLEAN AS can_add_device;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_quota_usage_stats IS
'Returns comprehensive quota and usage statistics for a subscriber, ' ||
'including message quotas, device quotas, and time-based usage breakdown.';

-- ============================================================================
-- Function: check_rate_limit
-- Description: Check if subscriber is within rate limits (messages per hour)
-- Usage: SELECT check_rate_limit('subscriber-uuid', 100);
-- ============================================================================

CREATE OR REPLACE FUNCTION check_rate_limit(
  p_subscriber_id UUID,
  p_max_per_hour INT DEFAULT 100
)
RETURNS JSON AS $$
DECLARE
  v_messages_this_hour INT;
  v_can_send BOOLEAN;
  v_remaining INT;
BEGIN
  -- Count messages in last hour
  SELECT COUNT(*) INTO v_messages_this_hour
  FROM messages
  WHERE subscriber_id = p_subscriber_id
    AND queued_at > NOW() - INTERVAL '1 hour'
    AND status NOT IN ('FAILED', 'REJECTED');

  v_remaining := GREATEST(0, p_max_per_hour - v_messages_this_hour);
  v_can_send := v_remaining > 0;

  RETURN json_build_object(
    'subscriberId', p_subscriber_id,
    'maxPerHour', p_max_per_hour,
    'sentThisHour', v_messages_this_hour,
    'remaining', v_remaining,
    'canSend', v_can_send,
    'rateLimitPercentageUsed', ROUND((v_messages_this_hour::NUMERIC / p_max_per_hour) * 100, 2),
    'checkedAt', NOW()
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION check_rate_limit IS
'Checks if subscriber is within hourly rate limits. ' ||
'Useful for preventing burst traffic and abuse.';

-- ============================================================================
-- Function: get_monthly_usage_summary
-- Description: Get monthly usage summary for billing/analytics
-- Usage: SELECT * FROM get_monthly_usage_summary('subscriber-uuid', 2026, 4);
-- ============================================================================

CREATE OR REPLACE FUNCTION get_monthly_usage_summary(
  p_subscriber_id UUID,
  p_year INT DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::INT,
  p_month INT DEFAULT EXTRACT(MONTH FROM CURRENT_DATE)::INT
)
RETURNS TABLE (
  subscriber_id UUID,
  year INT,
  month INT,
  total_messages INT,
  successful_messages INT,
  failed_messages INT,
  success_rate NUMERIC,
  total_cost NUMERIC,
  avg_messages_per_day NUMERIC,
  peak_day_messages INT,
  peak_day_date DATE
) AS $$
BEGIN
  RETURN QUERY
  WITH monthly_data AS (
    SELECT
      m.subscriber_id,
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE m.status IN ('SENT', 'DELIVERED')) AS successful,
      COUNT(*) FILTER (WHERE m.status = 'FAILED') AS failed,
      DATE(m.queued_at) AS message_date
    FROM messages m
    WHERE m.subscriber_id = p_subscriber_id
      AND EXTRACT(YEAR FROM m.queued_at) = p_year
      AND EXTRACT(MONTH FROM m.queued_at) = p_month
    GROUP BY m.subscriber_id, DATE(m.queued_at)
  ),
  daily_counts AS (
    SELECT
      message_date,
      SUM(total) AS messages_on_day
    FROM monthly_data
    GROUP BY message_date
  )
  SELECT
    p_subscriber_id,
    p_year,
    p_month,
    COALESCE(SUM(md.total), 0)::INT AS total_messages,
    COALESCE(SUM(md.successful), 0)::INT AS successful_messages,
    COALESCE(SUM(md.failed), 0)::INT AS failed_messages,
    CASE
      WHEN SUM(md.total) = 0 THEN 0.0
      ELSE ROUND((SUM(md.successful)::NUMERIC / SUM(md.total)) * 100, 2)
    END AS success_rate,
    -- Assume $0.01 per message for costing
    COALESCE(SUM(md.successful), 0)::NUMERIC * 0.01 AS total_cost,
    ROUND(COALESCE(AVG(md.total), 0)::NUMERIC, 2) AS avg_messages_per_day,
    COALESCE(MAX(dc.messages_on_day), 0)::INT AS peak_day_messages,
    (SELECT message_date FROM daily_counts WHERE messages_on_day = MAX(dc.messages_on_day) LIMIT 1) AS peak_day_date
  FROM monthly_data md
  LEFT JOIN daily_counts dc ON md.message_date = dc.message_date
  GROUP BY p_subscriber_id, p_year, p_month;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_monthly_usage_summary IS
'Returns comprehensive monthly usage summary including costs, peak usage, and success rates. ' ||
'Useful for billing, analytics, and capacity planning.';

-- ============================================================================
-- Function: enforce_quota_on_insert
-- Description: Trigger function to enforce quota before message insert
-- Usage: Called automatically by trigger
-- ============================================================================

CREATE OR REPLACE FUNCTION enforce_quota_on_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_can_send BOOLEAN;
  v_quota_info JSON;
BEGIN
  -- Check daily quota
  v_quota_info := check_daily_quota(NEW.subscriber_id);
  v_can_send := (v_quota_info->>'canSend')::BOOLEAN;

  IF NOT v_can_send THEN
    RAISE EXCEPTION 'QUOTA_EXCEEDED: Subscriber % has reached daily message quota. Limit: %, Sent: %, Remaining: 0',
      NEW.subscriber_id,
      v_quota_info->>'maxDailyMessages',
      v_quota_info->>'messagesSentToday'
    USING HINT = 'Upgrade subscription plan or wait until tomorrow (quota resets at midnight UTC)';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION enforce_quota_on_insert IS
'Trigger function that enforces daily message quota before inserting messages. ' ||
'Raises QUOTA_EXCEEDED exception if subscriber has reached their limit.';

-- Optional: Create trigger (commented out - apply manually if needed)
/*
CREATE TRIGGER trg_enforce_quota_before_message_insert
BEFORE INSERT ON messages
FOR EACH ROW
EXECUTE FUNCTION enforce_quota_on_insert();
*/

-- ============================================================================
-- Example Usage
-- ============================================================================
/*
-- Check daily quota with detailed info
SELECT check_daily_quota('550e8400-e29b-41d4-a716-446655440000');

-- Simple can-send check
SELECT can_send_message('550e8400-e29b-41d4-a716-446655440000');

-- Get comprehensive quota stats
SELECT * FROM get_quota_usage_stats('550e8400-e29b-41d4-a716-446655440000');

-- Check hourly rate limit
SELECT check_rate_limit('550e8400-e29b-41d4-a716-446655440000', 100);

-- Get monthly usage summary
SELECT * FROM get_monthly_usage_summary('550e8400-e29b-41d4-a716-446655440000', 2026, 4);

-- Combined query for dashboard
SELECT
  (SELECT * FROM check_daily_quota(s.id)) AS daily_quota,
  (SELECT * FROM check_rate_limit(s.id, 100)) AS rate_limit,
  s.device_count,
  s.max_devices
FROM subscribers s
WHERE s.id = '550e8400-e29b-41d4-a716-446655440000';
*/

-- ============================================================================
-- Rollback
-- ============================================================================
/*
DROP TRIGGER IF EXISTS trg_enforce_quota_before_message_insert ON messages;
DROP FUNCTION IF EXISTS enforce_quota_on_insert();
DROP FUNCTION IF EXISTS check_daily_quota(UUID);
DROP FUNCTION IF EXISTS can_send_message(UUID);
DROP FUNCTION IF EXISTS get_quota_usage_stats(UUID);
DROP FUNCTION IF EXISTS check_rate_limit(UUID, INT);
DROP FUNCTION IF EXISTS get_monthly_usage_summary(UUID, INT, INT);
*/
