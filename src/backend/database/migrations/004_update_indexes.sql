-- Migration: Update indexes for BYOD query patterns
-- Description: Optimize indexes for subscriber-scoped queries
-- Author: Raj (Database Architect)
-- Date: 2026-04-02

-- NOTE: This migration uses CONCURRENTLY, so it cannot run inside a transaction
-- No BEGIN/COMMIT blocks allowed with CONCURRENTLY

-- ============================================================================
-- Messages Table Indexes (BYOD-optimized)
-- ============================================================================

-- Subscriber-scoped message queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_subscriber_status
ON messages(subscriber_id, status);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_subscriber_queued
ON messages(subscriber_id, queued_at DESC, status);

-- Active messages (for queue processing)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_active
ON messages(subscriber_id, gateway_id, status, queued_at)
WHERE status IN ('QUEUED', 'DISPATCHED', 'SENT');

-- Daily quota tracking
-- Note: DATE and ::date casts are not IMMUTABLE (timezone-dependent), so we can't use them in indexes
-- Instead, we'll use queued_at directly and filter by date range in queries
-- Example query: WHERE queued_at >= CURRENT_DATE AND queued_at < CURRENT_DATE + INTERVAL '1 day'
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_daily_quota
ON messages(subscriber_id, queued_at, status);

-- Metadata search (GIN index)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_messages_metadata_gin
ON messages USING GIN(metadata)
WHERE metadata IS NOT NULL;

-- ============================================================================
-- API Keys Table Indexes
-- ============================================================================

-- Fast API key lookup with subscriber info
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_active_lookup
ON api_keys(key_hash, is_active, subscriber_id)
WHERE is_active = TRUE;

-- ============================================================================
-- Gateway Devices Table Indexes (already created in migration 001)
-- ============================================================================

-- These were created in 001_add_subscriber_to_devices.sql:
-- - idx_gateway_devices_subscriber_id
-- - idx_gateway_devices_subscriber_status
-- - idx_gateway_devices_subscriber_deleted
-- - idx_gateway_devices_dispatch_selection
-- - idx_gateway_devices_unique_name_per_subscriber

-- ============================================================================
-- Registration Tokens Table Indexes (already created in migration 002)
-- ============================================================================

-- These were created in 002_create_registration_tokens.sql:
-- - idx_registration_tokens_subscriber_id
-- - idx_registration_tokens_token_hash
-- - idx_registration_tokens_active

-- ============================================================================
-- Clean up old indexes that are no longer optimal
-- ============================================================================

-- Drop generic status index if it exists (we now use subscriber-scoped queries)
DROP INDEX CONCURRENTLY IF EXISTS idx_messages_status_only;

-- Drop generic gateway status index if it exists
DROP INDEX CONCURRENTLY IF EXISTS idx_gateway_devices_status_only;

-- Rollback script (also cannot use BEGIN/COMMIT with CONCURRENTLY)
--
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_subscriber_status;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_subscriber_queued;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_active;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_daily_quota;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_messages_metadata_gin;
-- DROP INDEX CONCURRENTLY IF EXISTS idx_api_keys_active_lookup;
