-- ============================================================================
-- Migration: 003_create_registration_tokens.sql
-- Description: Create registration_tokens table for BYOD device registration
-- Version: 2.0 - BYOD (Bring Your Own Device)
-- Date: 2026-04-02
-- Author: Raj (Database Architect)
-- ============================================================================
-- This migration creates the registration_tokens table to support secure
-- one-time device registration in the BYOD model. Subscribers generate
-- time-limited tokens that Android devices use to register themselves.
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Create registration_tokens table
-- ============================================================================

CREATE TABLE IF NOT EXISTS registration_tokens (
  -- Primary key
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign key to subscriber who generated this token
  subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,

  -- Hashed token value for security (JWT stored client-side only)
  token_hash      TEXT UNIQUE NOT NULL,

  -- Token usage tracking
  used            BOOLEAN DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  used_by_device  UUID REFERENCES gateway_devices(id) ON DELETE SET NULL,

  -- Token expiration (typically 1 hour from creation)
  expires_at      TIMESTAMPTZ NOT NULL,

  -- Audit fields
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES subscribers(id),
  revocation_reason TEXT,

  -- Optional metadata
  metadata        JSONB,

  -- Constraints
  CONSTRAINT chk_expires_at_after_created CHECK (expires_at > created_at),
  CONSTRAINT chk_used_at_when_used CHECK (
    (used = TRUE AND used_at IS NOT NULL) OR
    (used = FALSE AND used_at IS NULL)
  ),
  CONSTRAINT chk_revoked_at_when_revoked CHECK (
    (revoked_at IS NOT NULL AND revoked_by IS NOT NULL) OR
    (revoked_at IS NULL AND revoked_by IS NULL)
  )
);

-- ============================================================================
-- STEP 2: Add table comments for documentation
-- ============================================================================

COMMENT ON TABLE registration_tokens IS
'One-time registration tokens for BYOD device registration. Subscribers generate these tokens which Android devices use to register themselves.';

COMMENT ON COLUMN registration_tokens.id IS
'Unique token identifier.';

COMMENT ON COLUMN registration_tokens.subscriber_id IS
'Subscriber who generated this registration token.';

COMMENT ON COLUMN registration_tokens.token_hash IS
'SHA-256 hash of the registration token. The actual token (JWT) is only shown once to the subscriber.';

COMMENT ON COLUMN registration_tokens.used IS
'Whether this token has been used to register a device.';

COMMENT ON COLUMN registration_tokens.used_at IS
'Timestamp when this token was used to register a device.';

COMMENT ON COLUMN registration_tokens.used_by_device IS
'Reference to the device that was registered using this token.';

COMMENT ON COLUMN registration_tokens.expires_at IS
'Expiration timestamp for this token. Typically 1 hour after creation.';

COMMENT ON COLUMN registration_tokens.revoked_at IS
'Timestamp when this token was manually revoked by a subscriber.';

COMMENT ON COLUMN registration_tokens.metadata IS
'Optional metadata (e.g., IP address, user agent, QR code generated flag).';

-- ============================================================================
-- STEP 3: Create indexes for query performance
-- ============================================================================

-- Index for finding tokens by subscriber
CREATE INDEX idx_registration_tokens_subscriber_id
ON registration_tokens(subscriber_id);

-- Index for token lookup during device registration
CREATE INDEX idx_registration_tokens_token_hash
ON registration_tokens(token_hash);

-- Partial index for active (unused, unexpired, not revoked) tokens
CREATE INDEX idx_registration_tokens_active
ON registration_tokens(subscriber_id, expires_at)
WHERE used = FALSE AND revoked_at IS NULL;

-- Partial index for expired tokens (for cleanup jobs)
CREATE INDEX idx_registration_tokens_expired
ON registration_tokens(expires_at)
WHERE used = FALSE AND expires_at < NOW();

-- Index for cleanup queries
CREATE INDEX idx_registration_tokens_created_at
ON registration_tokens(created_at DESC);

-- ============================================================================
-- STEP 4: Add index comments
-- ============================================================================

COMMENT ON INDEX idx_registration_tokens_subscriber_id IS
'Supports queries fetching all tokens for a subscriber.';

COMMENT ON INDEX idx_registration_tokens_token_hash IS
'Supports fast token validation during device registration.';

COMMENT ON INDEX idx_registration_tokens_active IS
'Partial index for finding active (unused, unexpired, not revoked) tokens.';

COMMENT ON INDEX idx_registration_tokens_expired IS
'Partial index for cleanup jobs to remove expired tokens.';

-- ============================================================================
-- STEP 5: Create trigger to mark token as used
-- ============================================================================

-- Function to automatically set used_at when used flag changes
CREATE OR REPLACE FUNCTION update_registration_token_used_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.used = TRUE AND OLD.used = FALSE THEN
    NEW.used_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger
CREATE TRIGGER trg_update_registration_token_used_at
BEFORE UPDATE ON registration_tokens
FOR EACH ROW
EXECUTE FUNCTION update_registration_token_used_at();

COMMENT ON TRIGGER trg_update_registration_token_used_at ON registration_tokens IS
'Automatically sets used_at timestamp when token is marked as used.';

-- ============================================================================
-- STEP 6: Create helper functions
-- ============================================================================

-- Function to check if a token is valid (unused, unexpired, not revoked)
CREATE OR REPLACE FUNCTION is_token_valid(p_token_hash TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  token_record RECORD;
BEGIN
  SELECT used, expires_at, revoked_at
  INTO token_record
  FROM registration_tokens
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  -- Token must be unused, not expired, and not revoked
  RETURN (
    token_record.used = FALSE AND
    token_record.expires_at > NOW() AND
    token_record.revoked_at IS NULL
  );
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION is_token_valid IS
'Check if a registration token is valid (unused, unexpired, not revoked).';

-- Function to revoke a token
CREATE OR REPLACE FUNCTION revoke_registration_token(
  p_token_id UUID,
  p_revoked_by UUID,
  p_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE registration_tokens
  SET
    revoked_at = NOW(),
    revoked_by = p_revoked_by,
    revocation_reason = p_reason
  WHERE id = p_token_id
    AND used = FALSE
    AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION revoke_registration_token IS
'Revoke an unused registration token. Returns TRUE if token was revoked.';

-- Function to cleanup expired tokens (for scheduled jobs)
CREATE OR REPLACE FUNCTION cleanup_expired_registration_tokens(p_days_old INT DEFAULT 7)
RETURNS INT AS $$
DECLARE
  deleted_count INT;
BEGIN
  WITH deleted AS (
    DELETE FROM registration_tokens
    WHERE expires_at < NOW() - (p_days_old || ' days')::INTERVAL
      AND used = FALSE
    RETURNING id
  )
  SELECT COUNT(*) INTO deleted_count FROM deleted;

  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_expired_registration_tokens IS
'Delete expired registration tokens older than specified days. Returns count of deleted tokens.';

-- ============================================================================
-- VALIDATION
-- ============================================================================

-- Verify table was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'registration_tokens'
  ) THEN
    RAISE EXCEPTION 'Migration failed: registration_tokens table not created';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- USAGE EXAMPLES
-- ============================================================================

-- Generate a new registration token (application logic):
-- INSERT INTO registration_tokens (subscriber_id, token_hash, expires_at, metadata)
-- VALUES (
--   '<subscriber_uuid>',
--   '<sha256_hash_of_jwt>',
--   NOW() + INTERVAL '1 hour',
--   '{"ip_address": "1.2.3.4", "user_agent": "Mozilla/5.0..."}'::JSONB
-- )
-- RETURNING id, expires_at;

-- Validate a token before device registration:
-- SELECT is_token_valid('<token_hash>');

-- Mark token as used after successful device registration:
-- UPDATE registration_tokens
-- SET used = TRUE, used_by_device = '<device_uuid>'
-- WHERE token_hash = '<token_hash>';

-- List active tokens for a subscriber:
-- SELECT id, created_at, expires_at, used, revoked_at
-- FROM registration_tokens
-- WHERE subscriber_id = '<subscriber_uuid>'
--   AND expires_at > NOW()
-- ORDER BY created_at DESC;

-- Cleanup expired tokens (run as scheduled job):
-- SELECT cleanup_expired_registration_tokens(7);

-- ============================================================================
-- ROLLBACK INSTRUCTIONS
-- ============================================================================
-- To rollback this migration:
--
-- BEGIN;
--
-- -- Drop functions
-- DROP FUNCTION IF EXISTS cleanup_expired_registration_tokens(INT);
-- DROP FUNCTION IF EXISTS revoke_registration_token(UUID, UUID, TEXT);
-- DROP FUNCTION IF EXISTS is_token_valid(TEXT);
-- DROP FUNCTION IF EXISTS update_registration_token_used_at();
--
-- -- Drop indexes
-- DROP INDEX IF EXISTS idx_registration_tokens_created_at;
-- DROP INDEX IF EXISTS idx_registration_tokens_expired;
-- DROP INDEX IF EXISTS idx_registration_tokens_active;
-- DROP INDEX IF EXISTS idx_registration_tokens_token_hash;
-- DROP INDEX IF EXISTS idx_registration_tokens_subscriber_id;
--
-- -- Drop table
-- DROP TABLE IF EXISTS registration_tokens CASCADE;
--
-- COMMIT;
-- ============================================================================
