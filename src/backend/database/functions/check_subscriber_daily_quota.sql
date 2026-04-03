-- ============================================================================
-- Function: check_subscriber_daily_quota
-- Description: Fast daily quota validation for subscriber
-- Version: 1.0 - BYOD Optimized
-- Author: Raj (Database Architect)
-- Performance Target: < 5ms
-- ============================================================================

-- Drop existing function if it exists
DROP FUNCTION IF EXISTS check_subscriber_daily_quota(UUID);

-- Fast quota check function
CREATE OR REPLACE FUNCTION check_subscriber_daily_quota(
  p_subscriber_id UUID
) RETURNS TABLE (
  messages_today BIGINT,
  daily_quota INT,
  remaining INT,
  quota_exceeded BOOLEAN
) AS $$
BEGIN
  -- CRITICAL SECURITY: This function ALWAYS filters by subscriber_id
  -- to ensure multi-tenant data isolation.

  RETURN QUERY
  SELECT
    COALESCE(COUNT(m.id), 0) as messages_today,
    s.daily_quota,
    (s.daily_quota - COALESCE(COUNT(m.id), 0)::INT) as remaining,
    (COALESCE(COUNT(m.id), 0) >= s.daily_quota) as quota_exceeded
  FROM subscribers s
  LEFT JOIN messages m ON m.subscriber_id = s.id
    AND DATE(m.queued_at) = CURRENT_DATE
  WHERE s.id = p_subscriber_id  -- SECURITY: Subscriber scope
  GROUP BY s.id, s.daily_quota;

EXCEPTION
  WHEN OTHERS THEN
    -- Log error and return safe defaults
    RAISE WARNING 'Error in check_subscriber_daily_quota for subscriber %: %',
      p_subscriber_id, SQLERRM;
    -- Return quota exceeded to fail-safe
    RETURN QUERY SELECT 0::BIGINT, 0::INT, 0::INT, TRUE::BOOLEAN;
END;
$$ LANGUAGE plpgsql STABLE;

-- Add function comment
COMMENT ON FUNCTION check_subscriber_daily_quota IS
'Fast daily quota check with subscriber-scoped filtering.
Returns message count today, quota limit, remaining, and exceeded flag.
Performance target: < 5ms. Fail-safe: returns quota_exceeded=true on error.';

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Example 1: Check quota for subscriber
-- SELECT * FROM check_subscriber_daily_quota('123e4567-e89b-12d3-a456-426614174000');

-- Example 2: Use in message queueing logic
-- DO $$
-- DECLARE
--   quota_info RECORD;
-- BEGIN
--   SELECT * INTO quota_info
--   FROM check_subscriber_daily_quota('123e4567-e89b-12d3-a456-426614174000');
--
--   IF quota_info.quota_exceeded THEN
--     RAISE EXCEPTION 'Daily quota exceeded. Limit: %, Used: %',
--       quota_info.daily_quota, quota_info.messages_today;
--   END IF;
--
--   -- Proceed with message insertion
-- END $$;

-- Example 3: Bulk check for multiple subscribers
-- SELECT
--   s.id,
--   s.email,
--   q.*
-- FROM subscribers s
-- CROSS JOIN LATERAL check_subscriber_daily_quota(s.id) q
-- WHERE q.quota_exceeded = TRUE;

-- ============================================================================
-- PERFORMANCE ANALYSIS
-- ============================================================================

-- Test query performance (replace with actual subscriber UUID)
-- EXPLAIN ANALYZE
-- SELECT * FROM check_subscriber_daily_quota('123e4567-e89b-12d3-a456-426614174000');

-- Expected query plan:
-- - Uses idx_messages_daily_quota for fast daily message count
-- - Uses primary key lookup on subscribers table
-- - Returns result in < 5ms for typical workloads

-- Performance benchmark:
-- \timing
-- SELECT * FROM check_subscriber_daily_quota('123e4567-e89b-12d3-a456-426614174000');
-- \timing

-- ============================================================================
-- OPTIMIZED INDEX FOR THIS QUERY
-- ============================================================================

-- This index should already exist from 004_add_indexes.sql migration:
-- idx_messages_daily_quota
-- ON messages(subscriber_id, DATE(queued_at), status);

-- However, for even better performance, we can add a specialized partial index
-- for today's messages only. This index automatically becomes invalid tomorrow
-- and needs recreation, so it's suitable for high-volume systems.

-- Create daily partial index (run this daily via cron job):
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_subscriber_today
-- ON messages(subscriber_id, DATE(queued_at))
-- WHERE queued_at >= CURRENT_DATE;

-- Drop yesterday's index:
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_subscriber_yesterday;

-- Verify indexes exist:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE tablename = 'messages'
--   AND (indexname LIKE '%daily_quota%' OR indexname LIKE '%subscriber_today%');

-- ============================================================================
-- ALTERNATIVE: MATERIALIZED VIEW APPROACH
-- ============================================================================

-- For extremely high-volume systems (millions of messages/day),
-- consider using a materialized view refreshed every 5 minutes:

/*
CREATE MATERIALIZED VIEW mv_subscriber_daily_quota AS
SELECT
  subscriber_id,
  DATE(queued_at) as date,
  COUNT(*) as message_count
FROM messages
WHERE queued_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY subscriber_id, DATE(queued_at);

CREATE UNIQUE INDEX ON mv_subscriber_daily_quota(subscriber_id, date);

-- Refresh every 5 minutes via cron:
-- REFRESH MATERIALIZED VIEW CONCURRENTLY mv_subscriber_daily_quota;

-- Then modify the function to query the materialized view:
CREATE OR REPLACE FUNCTION check_subscriber_daily_quota_mv(
  p_subscriber_id UUID
) RETURNS TABLE (
  messages_today BIGINT,
  daily_quota INT,
  remaining INT,
  quota_exceeded BOOLEAN
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(mv.message_count, 0) as messages_today,
    s.daily_quota,
    (s.daily_quota - COALESCE(mv.message_count, 0)::INT) as remaining,
    (COALESCE(mv.message_count, 0) >= s.daily_quota) as quota_exceeded
  FROM subscribers s
  LEFT JOIN mv_subscriber_daily_quota mv ON mv.subscriber_id = s.id
    AND mv.date = CURRENT_DATE
  WHERE s.id = p_subscriber_id
  GROUP BY s.id, s.daily_quota, mv.message_count;
END;
$$ LANGUAGE plpgsql STABLE;
*/

-- ============================================================================
-- REDIS CACHE APPROACH
-- ============================================================================

-- For ultra-low latency (< 1ms), cache quota counts in Redis:
-- Key pattern: quota:{subscriber_id}:{YYYY-MM-DD}
-- Value: message count (integer)
-- TTL: 24 hours + 1 hour (expires at end of day + grace period)

-- Pseudo-code for application layer:
/*
async function checkQuota(subscriberId: string): Promise<QuotaInfo> {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `quota:${subscriberId}:${today}`;

  // Try Redis first
  let count = await redis.get(cacheKey);
  if (count === null) {
    // Cache miss: query database
    const result = await db.query(
      'SELECT * FROM check_subscriber_daily_quota($1)',
      [subscriberId]
    );
    count = result.rows[0].messages_today;

    // Cache for 5 minutes
    await redis.setex(cacheKey, 300, count);
  }

  const quota = await getSubscriberQuota(subscriberId);
  return {
    messages_today: parseInt(count),
    daily_quota: quota,
    remaining: quota - parseInt(count),
    quota_exceeded: parseInt(count) >= quota
  };
}

// Increment counter after message is queued
async function incrementQuotaCount(subscriberId: string) {
  const today = new Date().toISOString().split('T')[0];
  const cacheKey = `quota:${subscriberId}:${today}`;
  await redis.incr(cacheKey);
  await redis.expire(cacheKey, 86400 + 3600); // 25 hours
}
*/

-- ============================================================================
-- MONITORING AND ALERTING
-- ============================================================================

-- Query to find subscribers approaching quota (90% or more):
-- SELECT
--   s.email,
--   s.daily_quota,
--   q.messages_today,
--   ROUND(q.messages_today::NUMERIC / s.daily_quota::NUMERIC * 100, 2) as usage_percent
-- FROM subscribers s
-- CROSS JOIN LATERAL check_subscriber_daily_quota(s.id) q
-- WHERE q.messages_today::NUMERIC / s.daily_quota::NUMERIC >= 0.9
-- ORDER BY usage_percent DESC;

-- Query to find subscribers who exceeded quota:
-- SELECT
--   s.id,
--   s.email,
--   s.plan,
--   q.*,
--   (q.messages_today - q.daily_quota) as over_limit_by
-- FROM subscribers s
-- CROSS JOIN LATERAL check_subscriber_daily_quota(s.id) q
-- WHERE q.quota_exceeded = TRUE
-- ORDER BY over_limit_by DESC;

-- ============================================================================
-- SECURITY VALIDATION
-- ============================================================================

-- This function enforces multi-tenant security by:
-- 1. ALWAYS filtering by subscriber_id in the WHERE clause
-- 2. Never allowing cross-subscriber quota checks
-- 3. Using STABLE (not VOLATILE) to allow query optimization
-- 4. Failing safe (returns quota_exceeded=true) on errors

-- Test security: Should return quota info only for specified subscriber
-- SELECT * FROM check_subscriber_daily_quota('123e4567-e89b-12d3-a456-426614174000');
