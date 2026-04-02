-- ============================================================================
-- CodeReply Database Schema (BYOD Model)
-- Version: 2.0 - BYOD (Bring Your Own Device)
-- Date: 2026-04-02
-- Database: PostgreSQL 15+
-- ============================================================================

-- ============================================================================
-- SCHEMA: subscribers
-- ============================================================================

CREATE TABLE IF NOT EXISTS subscribers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name              TEXT NOT NULL,
  email             TEXT UNIQUE NOT NULL,
  plan              TEXT DEFAULT 'free' CHECK (plan IN ('free', 'starter', 'pro', 'enterprise')),
  daily_quota       INT DEFAULT 100,
  max_devices       INT DEFAULT 1,                     -- BYOD: Max devices per plan
  device_count      INT DEFAULT 0,                     -- BYOD: Current active device count
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_subscribers_email ON subscribers(email);
CREATE INDEX idx_subscribers_plan ON subscribers(plan);

-- Comments
COMMENT ON TABLE subscribers IS 'Subscriber accounts - third-party apps that integrate with CodeReply.';
COMMENT ON COLUMN subscribers.max_devices IS 'Maximum number of devices allowed for this subscriber based on their plan.';
COMMENT ON COLUMN subscribers.device_count IS 'Current count of active devices owned by this subscriber.';

-- ============================================================================
-- SCHEMA: api_keys
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  key_hash        TEXT UNIQUE NOT NULL,                -- SHA-256 hash of the actual key
  key_prefix      TEXT NOT NULL,                       -- e.g. "cr_live_xxxx" (for display only)
  label           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_api_keys_subscriber_id ON api_keys(subscriber_id);
CREATE INDEX idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = TRUE;

-- Comments
COMMENT ON TABLE api_keys IS 'API keys for subscriber authentication.';

-- ============================================================================
-- SCHEMA: gateway_devices (BYOD Model)
-- ============================================================================

CREATE TABLE IF NOT EXISTS gateway_devices (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id         UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,  -- BYOD: Owner
  name                  TEXT NOT NULL,
  device_label          TEXT,                          -- BYOD: User-friendly label
  device_token          TEXT UNIQUE NOT NULL,          -- Hashed JWT signing secret
  sim_carrier           TEXT,
  sim_number            TEXT,
  status                TEXT DEFAULT 'OFFLINE' CHECK (status IN ('ONLINE', 'OFFLINE', 'DEGRADED')),
  is_enabled            BOOLEAN DEFAULT TRUE,          -- BYOD: Toggle for dispatch
  last_heartbeat        TIMESTAMPTZ,
  app_version           TEXT,
  android_version       TEXT,
  total_messages_sent   INT DEFAULT 0,                 -- BYOD: Cumulative sent count
  total_messages_failed INT DEFAULT 0,                 -- BYOD: Cumulative failed count
  notes                 TEXT,                          -- BYOD: Subscriber notes
  created_by            UUID REFERENCES subscribers(id), -- BYOD: Who registered it
  registered_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  deleted_at            TIMESTAMPTZ                    -- BYOD: Soft delete timestamp
);

-- Indexes
CREATE INDEX idx_gateway_devices_subscriber_id ON gateway_devices(subscriber_id);
CREATE INDEX idx_gateway_devices_subscriber_status ON gateway_devices(subscriber_id, status);
CREATE INDEX idx_gateway_devices_subscriber_deleted ON gateway_devices(subscriber_id, deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX idx_gateway_devices_status ON gateway_devices(status);
CREATE INDEX idx_gateway_devices_heartbeat ON gateway_devices(last_heartbeat DESC);
CREATE UNIQUE INDEX idx_gateway_devices_unique_name_per_subscriber ON gateway_devices(subscriber_id, name) WHERE deleted_at IS NULL;

-- Comments
COMMENT ON TABLE gateway_devices IS 'Android gateway devices owned by subscribers (BYOD model).';
COMMENT ON COLUMN gateway_devices.subscriber_id IS 'Foreign key to subscribers table. Each device belongs to one subscriber.';
COMMENT ON COLUMN gateway_devices.deleted_at IS 'Timestamp when device was soft-deleted. NULL means device is active.';
COMMENT ON COLUMN gateway_devices.device_label IS 'User-friendly label for the device (e.g., "Office Gateway", "Backup SIM").';
COMMENT ON COLUMN gateway_devices.is_enabled IS 'Whether device is enabled for message dispatch. Can be toggled by subscriber.';

-- ============================================================================
-- SCHEMA: messages
-- ============================================================================

CREATE TABLE IF NOT EXISTS messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id    UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  gateway_id       UUID REFERENCES gateway_devices(id) ON DELETE SET NULL,
  to_number        TEXT NOT NULL,
  body             TEXT NOT NULL,
  status           TEXT DEFAULT 'QUEUED' CHECK (status IN ('QUEUED', 'DISPATCHED', 'SENT', 'DELIVERED', 'FAILED', 'EXPIRED', 'CANCELLED')),
  retry_count      INT DEFAULT 0,
  ttl              INT DEFAULT 300,
  webhook_url      TEXT,
  metadata         JSONB,
  queued_at        TIMESTAMPTZ DEFAULT NOW(),
  dispatched_at    TIMESTAMPTZ,
  sent_at          TIMESTAMPTZ,
  delivered_at     TIMESTAMPTZ,
  failed_at        TIMESTAMPTZ,
  error            TEXT
);

-- Indexes
CREATE INDEX idx_messages_subscriber_id ON messages(subscriber_id);
CREATE INDEX idx_messages_gateway_id ON messages(gateway_id);
CREATE INDEX idx_messages_status ON messages(status);
CREATE INDEX idx_messages_queued_at ON messages(queued_at DESC);
CREATE INDEX idx_messages_subscriber_status ON messages(subscriber_id, status);
CREATE INDEX idx_messages_to_number ON messages(to_number);

-- Comments
COMMENT ON TABLE messages IS 'SMS messages queued and dispatched through gateway devices.';

-- ============================================================================
-- SCHEMA: webhook_deliveries
-- ============================================================================

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    UUID NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  url           TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status_code   INT,
  attempt       INT DEFAULT 1,
  delivered_at  TIMESTAMPTZ,
  error         TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_webhook_deliveries_message_id ON webhook_deliveries(message_id);
CREATE INDEX idx_webhook_deliveries_created_at ON webhook_deliveries(created_at DESC);

-- Comments
COMMENT ON TABLE webhook_deliveries IS 'Webhook delivery attempts to subscriber endpoints.';

-- ============================================================================
-- TRIGGERS: Maintain device_count
-- ============================================================================

CREATE OR REPLACE FUNCTION update_subscriber_device_count()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new device is added
  IF TG_OP = 'INSERT' AND NEW.subscriber_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    UPDATE subscribers
    SET device_count = device_count + 1
    WHERE id = NEW.subscriber_id;
  END IF;

  -- When a device is soft-deleted or undeleted
  IF TG_OP = 'UPDATE' AND OLD.subscriber_id IS NOT NULL THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE subscribers SET device_count = device_count - 1 WHERE id = NEW.subscriber_id;
    END IF;
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      UPDATE subscribers SET device_count = device_count + 1 WHERE id = NEW.subscriber_id;
    END IF;
  END IF;

  -- When a device is hard-deleted
  IF TG_OP = 'DELETE' AND OLD.subscriber_id IS NOT NULL AND OLD.deleted_at IS NULL THEN
    UPDATE subscribers SET device_count = device_count - 1 WHERE id = OLD.subscriber_id;
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_device_count
AFTER INSERT OR UPDATE OR DELETE ON gateway_devices
FOR EACH ROW EXECUTE FUNCTION update_subscriber_device_count();

-- ============================================================================
-- TRIGGERS: Enforce device quota
-- ============================================================================

CREATE OR REPLACE FUNCTION check_device_quota()
RETURNS TRIGGER AS $$
DECLARE
  current_count INT;
  max_allowed INT;
BEGIN
  IF NEW.subscriber_id IS NOT NULL AND NEW.deleted_at IS NULL THEN
    SELECT device_count, max_devices INTO current_count, max_allowed
    FROM subscribers WHERE id = NEW.subscriber_id;

    IF current_count >= max_allowed THEN
      RAISE EXCEPTION 'Device quota exceeded. Subscriber % has reached the maximum of % devices.',
        NEW.subscriber_id, max_allowed;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_device_quota
BEFORE INSERT OR UPDATE ON gateway_devices
FOR EACH ROW EXECUTE FUNCTION check_device_quota();

-- ============================================================================
-- TRIGGERS: Auto-update updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_gateway_devices_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gateway_devices_updated_at
BEFORE UPDATE ON gateway_devices
FOR EACH ROW EXECUTE FUNCTION update_gateway_devices_updated_at();

-- ============================================================================
-- VIEWS: Active gateway devices with metrics
-- ============================================================================

CREATE OR REPLACE VIEW active_gateway_devices AS
SELECT
  gd.id,
  gd.subscriber_id,
  gd.name,
  gd.device_label,
  gd.device_token,
  gd.sim_carrier,
  gd.sim_number,
  gd.status,
  gd.is_enabled,
  gd.last_heartbeat,
  gd.app_version,
  gd.android_version,
  gd.total_messages_sent,
  gd.total_messages_failed,
  gd.notes,
  gd.registered_at,
  gd.updated_at,
  s.name AS subscriber_name,
  s.email AS subscriber_email,
  s.plan AS subscriber_plan,
  -- Calculate success rate
  CASE
    WHEN (gd.total_messages_sent + gd.total_messages_failed) > 0
    THEN ROUND(gd.total_messages_sent::NUMERIC / (gd.total_messages_sent + gd.total_messages_failed)::NUMERIC, 4)
    ELSE NULL
  END AS success_rate,
  -- Check if device is online (heartbeat within last 2 minutes)
  CASE WHEN gd.last_heartbeat > NOW() - INTERVAL '2 minutes' THEN TRUE ELSE FALSE END AS is_online,
  -- Check if device is healthy (online + enabled + recent activity)
  CASE
    WHEN gd.status = 'ONLINE' AND gd.is_enabled = TRUE AND gd.last_heartbeat > NOW() - INTERVAL '2 minutes'
    THEN TRUE ELSE FALSE
  END AS is_healthy
FROM gateway_devices gd
JOIN subscribers s ON s.id = gd.subscriber_id
WHERE gd.deleted_at IS NULL;

COMMENT ON VIEW active_gateway_devices IS 'View of all active gateway devices with computed metrics and subscriber info.';

-- ============================================================================
-- FUNCTIONS: Get available devices for a subscriber
-- ============================================================================

CREATE OR REPLACE FUNCTION get_available_devices(
  p_subscriber_id UUID,
  p_carrier_preference TEXT DEFAULT NULL
)
RETURNS TABLE (
  device_id UUID,
  device_name TEXT,
  sim_carrier TEXT,
  status TEXT,
  in_flight_messages INT,
  last_heartbeat TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    gd.id AS device_id,
    gd.name AS device_name,
    gd.sim_carrier,
    gd.status,
    COALESCE((SELECT COUNT(*) FROM messages m WHERE m.gateway_id = gd.id AND m.status IN ('DISPATCHED', 'QUEUED')), 0)::INT AS in_flight_messages,
    gd.last_heartbeat
  FROM gateway_devices gd
  WHERE gd.subscriber_id = p_subscriber_id
    AND gd.deleted_at IS NULL
    AND gd.is_enabled = TRUE
    AND gd.status = 'ONLINE'
    AND gd.last_heartbeat > NOW() - INTERVAL '2 minutes'
  ORDER BY
    CASE WHEN p_carrier_preference IS NOT NULL AND gd.sim_carrier = p_carrier_preference THEN 0 ELSE 1 END,
    (SELECT COUNT(*) FROM messages m WHERE m.gateway_id = gd.id AND m.status IN ('DISPATCHED', 'QUEUED')) ASC,
    gd.last_heartbeat DESC;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_available_devices IS 'Returns list of available devices for a subscriber, ordered by carrier match and load.';

-- ============================================================================
-- FUNCTIONS: Check if subscriber can add device
-- ============================================================================

CREATE OR REPLACE FUNCTION can_add_device(p_subscriber_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  current_count INT;
  max_allowed INT;
BEGIN
  SELECT device_count, max_devices INTO current_count, max_allowed
  FROM subscribers WHERE id = p_subscriber_id;
  RETURN current_count < max_allowed;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION can_add_device IS 'Check if subscriber can add more devices based on their plan quota.';

-- ============================================================================
-- SEED DATA (Optional - for development/testing)
-- ============================================================================

-- Insert sample subscriber (comment out for production)
-- INSERT INTO subscribers (id, name, email, plan, daily_quota, max_devices)
-- VALUES (
--   gen_random_uuid(),
--   'Demo Subscriber',
--   'demo@example.com',
--   'pro',
--   10000,
--   10
-- );
