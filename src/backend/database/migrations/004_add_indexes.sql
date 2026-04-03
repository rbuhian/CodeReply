-- ============================================================================
-- Migration: 004_add_indexes.sql
-- Description: Add comprehensive indexes for BYOD query patterns
-- Version: 2.0 - BYOD (Bring Your Own Device)
-- Date: 2026-04-02
-- Author: Raj (Database Architect)
-- ============================================================================
-- This migration adds all necessary indexes to support efficient queries
-- in the BYOD model. Indexes are created CONCURRENTLY to avoid blocking
-- production traffic.
-- ============================================================================

BEGIN;

-- ============================================================================
-- SECTION 1: Gateway Devices Indexes
-- ============================================================================

-- Composite index for device selection queries
-- Used by: dispatcher to find online devices for a subscriber
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gateway_devices_dispatch_selection
ON gateway_devices(subscriber_id, status, is_enabled, deleted_at, last_heartbeat DESC)
WHERE deleted_at IS NULL AND status = 'ONLINE';

COMMENT ON INDEX idx_gateway_devices_dispatch_selection IS
'Optimizes device selection for message dispatch: online, enabled, non-deleted devices by subscriber.';

-- Index for device performance queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gateway_devices_performance
ON gateway_devices(subscriber_id, total_messages_sent, total_messages_failed)
WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_gateway_devices_performance IS
'Supports device performance analytics queries.';

-- Index for heartbeat monitoring queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gateway_devices_heartbeat_monitoring
ON gateway_devices(status, last_heartbeat DESC)
WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_gateway_devices_heartbeat_monitoring IS
'Supports heartbeat monitoring and stale device detection.';

-- Index for SIM carrier matching (for optimal routing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gateway_devices_carrier
ON gateway_devices(subscriber_id, sim_carrier, status)
WHERE deleted_at IS NULL;

COMMENT ON INDEX idx_gateway_devices_carrier IS
'Supports carrier-based device routing optimization.';

-- Partial index for enabled devices only
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_gateway_devices_enabled
ON gateway_devices(subscriber_id, id)
WHERE is_enabled = TRUE AND deleted_at IS NULL;

COMMENT ON INDEX idx_gateway_devices_enabled IS
'Partial index for quickly finding enabled devices per subscriber.';

-- ============================================================================
-- SECTION 2: Messages Indexes
-- ============================================================================

-- Composite index for subscriber message queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_subscriber_queued
ON messages(subscriber_id, queued_at DESC, status);

COMMENT ON INDEX idx_messages_subscriber_queued IS
'Optimizes subscriber message history queries with sorting by queue time.';

-- Composite index for device message history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_gateway_history
ON messages(gateway_id, queued_at DESC)
WHERE gateway_id IS NOT NULL;

COMMENT ON INDEX idx_messages_gateway_history IS
'Supports device-specific message history queries.';

-- Partial index for active/pending messages
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_active
ON messages(subscriber_id, gateway_id, status, queued_at)
WHERE status IN ('QUEUED', 'DISPATCHED', 'SENT');

COMMENT ON INDEX idx_messages_active IS
'Partial index for active messages (queued, dispatched, or sent).';

-- Partial index for failed messages requiring analysis
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_failed
ON messages(subscriber_id, failed_at DESC, error)
WHERE status = 'FAILED';

COMMENT ON INDEX idx_messages_failed IS
'Partial index for failed messages analytics.';

-- Index for message TTL and expiration checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_expiration
ON messages(queued_at, ttl, status)
WHERE status IN ('QUEUED', 'DISPATCHED');

COMMENT ON INDEX idx_messages_expiration IS
'Supports TTL-based message expiration checks.';

-- Index for webhook URL lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_webhook
ON messages(webhook_url, status)
WHERE webhook_url IS NOT NULL;

COMMENT ON INDEX idx_messages_webhook IS
'Supports webhook delivery queries.';

-- Index for to_number searches (for debugging/support)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_to_number_subscriber
ON messages(to_number, subscriber_id, queued_at DESC);

COMMENT ON INDEX idx_messages_to_number_subscriber IS
'Supports phone number lookup within subscriber scope.';

-- JSONB GIN index for metadata queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_metadata_gin
ON messages USING GIN(metadata)
WHERE metadata IS NOT NULL;

COMMENT ON INDEX idx_messages_metadata_gin IS
'GIN index for JSONB metadata field queries.';

-- ============================================================================
-- SECTION 3: Subscribers Indexes
-- ============================================================================

-- Index for plan-based queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscribers_plan_active
ON subscribers(plan, created_at DESC);

COMMENT ON INDEX idx_subscribers_plan_active IS
'Supports plan-based subscriber queries and analytics.';

-- Index for quota checks
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscribers_quota
ON subscribers(id, daily_quota, max_devices);

COMMENT ON INDEX idx_subscribers_quota IS
'Optimizes quota validation queries.';

-- ============================================================================
-- SECTION 4: API Keys Indexes
-- ============================================================================

-- Composite index for active key lookups
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_active_lookup
ON api_keys(key_hash, is_active, subscriber_id)
WHERE is_active = TRUE;

COMMENT ON INDEX idx_api_keys_active_lookup IS
'Optimizes API key authentication lookups.';

-- Index for subscriber API key management
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_subscriber_management
ON api_keys(subscriber_id, created_at DESC);

COMMENT ON INDEX idx_api_keys_subscriber_management IS
'Supports subscriber API key management queries.';

-- Index for last_used_at tracking
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_last_used
ON api_keys(last_used_at DESC NULLS LAST)
WHERE is_active = TRUE;

COMMENT ON INDEX idx_api_keys_last_used IS
'Supports queries for recently used or unused API keys.';

-- ============================================================================
-- SECTION 5: Webhook Deliveries Indexes
-- ============================================================================

-- Composite index for message webhook history
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_message
ON webhook_deliveries(message_id, created_at DESC);

COMMENT ON INDEX idx_webhook_deliveries_message IS
'Supports webhook delivery history for specific messages.';

-- Partial index for failed webhook deliveries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_failed
ON webhook_deliveries(message_id, attempt, created_at DESC)
WHERE status_code IS NULL OR status_code >= 400;

COMMENT ON INDEX idx_webhook_deliveries_failed IS
'Partial index for failed webhook deliveries requiring retry.';

-- Index for webhook retry scheduling
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_deliveries_retry
ON webhook_deliveries(created_at, attempt)
WHERE delivered_at IS NULL AND attempt < 5;

COMMENT ON INDEX idx_webhook_deliveries_retry IS
'Supports webhook retry scheduling queries.';

-- ============================================================================
-- SECTION 6: Cross-Table Composite Indexes
-- ============================================================================

-- Index for subscriber daily message count queries
-- (Used for quota enforcement)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_daily_quota
ON messages(subscriber_id, DATE(queued_at), status);

COMMENT ON INDEX idx_messages_daily_quota IS
'Optimizes daily message quota counting queries.';

-- Index for device load balancing queries
-- (Counts in-flight messages per device)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_device_load
ON messages(gateway_id, status)
WHERE status IN ('DISPATCHED', 'SENT');

COMMENT ON INDEX idx_messages_device_load IS
'Supports real-time device load calculation for load balancing.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

-- Count total indexes created in this migration
DO $$
DECLARE
  index_count INT;
BEGIN
  SELECT COUNT(*) INTO index_count
  FROM pg_indexes
  WHERE schemaname = 'public'
    AND tablename IN ('gateway_devices', 'messages', 'subscribers', 'api_keys', 'webhook_deliveries', 'registration_tokens');

  RAISE NOTICE 'Total indexes on BYOD tables: %', index_count;
END $$;

COMMIT;

-- ============================================================================
-- INDEX MAINTENANCE RECOMMENDATIONS
-- ============================================================================

-- Monitor index usage:
-- SELECT schemaname, tablename, indexname, idx_scan, idx_tup_read, idx_tup_fetch
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY idx_scan DESC;

-- Find unused indexes:
-- SELECT schemaname, tablename, indexname
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
--   AND idx_scan = 0
--   AND indexname NOT LIKE '%_pkey';

-- Check index bloat:
-- SELECT schemaname, tablename, indexname,
--        pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
-- FROM pg_stat_user_indexes
-- WHERE schemaname = 'public'
-- ORDER BY pg_relation_size(indexrelid) DESC;

-- Reindex if needed (run during low traffic):
-- REINDEX INDEX CONCURRENTLY idx_name;

-- ============================================================================
-- PERFORMANCE TESTING QUERIES
-- ============================================================================

-- Test device selection query (most critical):
-- EXPLAIN ANALYZE
-- SELECT id, name, sim_carrier, status, last_heartbeat
-- FROM gateway_devices
-- WHERE subscriber_id = '<subscriber_uuid>'
--   AND status = 'ONLINE'
--   AND is_enabled = TRUE
--   AND deleted_at IS NULL
--   AND last_heartbeat > NOW() - INTERVAL '2 minutes'
-- ORDER BY total_messages_sent ASC
-- LIMIT 1;

-- Test subscriber message history query:
-- EXPLAIN ANALYZE
-- SELECT id, to_number, body, status, queued_at, delivered_at
-- FROM messages
-- WHERE subscriber_id = '<subscriber_uuid>'
--   AND status = 'DELIVERED'
-- ORDER BY queued_at DESC
-- LIMIT 50;

-- Test daily quota check query:
-- EXPLAIN ANALYZE
-- SELECT COUNT(*) AS messages_today
-- FROM messages
-- WHERE subscriber_id = '<subscriber_uuid>'
--   AND DATE(queued_at) = CURRENT_DATE;

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration (drop all indexes):
--
-- BEGIN;
--
-- -- Gateway devices indexes
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gateway_devices_dispatch_selection;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gateway_devices_performance;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gateway_devices_heartbeat_monitoring;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gateway_devices_carrier;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_gateway_devices_enabled;
--
-- -- Messages indexes
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_subscriber_queued;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_gateway_history;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_active;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_failed;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_expiration;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_webhook;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_to_number_subscriber;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_metadata_gin;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_daily_quota;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_device_load;
--
-- -- Subscribers indexes
-- DROP INDEX CONCURRENTLY IF EXISTS idx_subscribers_plan_active;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_subscribers_quota;
--
-- -- API keys indexes
-- DROP INDEX CONCURRENTLY IF EXISTS idx_api_keys_active_lookup;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_api_keys_subscriber_management;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_api_keys_last_used;
--
-- -- Webhook deliveries indexes
-- DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_deliveries_message;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_deliveries_failed;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_webhook_deliveries_retry;
--
-- COMMIT;
-- ============================================================================
