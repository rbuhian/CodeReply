-- Migration: Create registration_tokens table (BYOD Model)
-- Description: Support subscriber device registration with one-time tokens
-- Author: Raj (Database Architect)
-- Date: 2026-04-02

BEGIN;

-- Create registration_tokens table
CREATE TABLE registration_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  token_hash      TEXT UNIQUE NOT NULL,
  used            BOOLEAN DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  used_by_device  UUID REFERENCES gateway_devices(id) ON DELETE SET NULL,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  revoked_at      TIMESTAMPTZ,
  revoked_by      UUID REFERENCES subscribers(id),
  revocation_reason TEXT,
  metadata        JSONB,

  CONSTRAINT chk_expires_at_after_created CHECK (expires_at > created_at),
  CONSTRAINT chk_used_at_when_used CHECK (
    (used = TRUE AND used_at IS NOT NULL) OR
    (used = FALSE AND used_at IS NULL)
  )
);

-- Add indexes for registration token queries
CREATE INDEX idx_registration_tokens_subscriber_id ON registration_tokens(subscriber_id);
CREATE INDEX idx_registration_tokens_token_hash ON registration_tokens(token_hash);
CREATE INDEX idx_registration_tokens_active ON registration_tokens(subscriber_id, expires_at) WHERE used = FALSE AND revoked_at IS NULL;

-- Add webhook_secret to subscribers (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'subscribers' AND column_name = 'webhook_secret'
  ) THEN
    ALTER TABLE subscribers ADD COLUMN webhook_secret TEXT;
  END IF;
END $$;

COMMIT;

-- Rollback script
-- BEGIN;
-- DROP TABLE IF EXISTS registration_tokens CASCADE;
-- ALTER TABLE subscribers DROP COLUMN IF EXISTS webhook_secret;
-- COMMIT;
