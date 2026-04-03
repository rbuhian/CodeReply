-- ============================================================================
-- Development Seed Data Script
-- Description: Populate database with test data for local development
-- Author: Raj (Database Architect)
-- Date: 2026-04-03
-- ============================================================================
-- This script creates realistic test data including:
-- - Test subscribers with different plans
-- - Test gateway devices
-- - Test messages in various states
-- - Test registration tokens
-- - Test API keys
-- ============================================================================

BEGIN;

-- ============================================================================
-- PART 1: Create Test Subscribers
-- ============================================================================

-- Clean existing test data (optional - comment out if you want to keep existing data)
-- DELETE FROM messages WHERE subscriber_id IN (SELECT id FROM subscribers WHERE email LIKE '%@test.codereply%');
-- DELETE FROM registration_tokens WHERE subscriber_id IN (SELECT id FROM subscribers WHERE email LIKE '%@test.codereply%');
-- DELETE FROM gateway_devices WHERE subscriber_id IN (SELECT id FROM subscribers WHERE email LIKE '%@test.codereply%');
-- DELETE FROM api_keys WHERE subscriber_id IN (SELECT id FROM subscribers WHERE email LIKE '%@test.codereply%');
-- DELETE FROM subscribers WHERE email LIKE '%@test.codereply%';

-- Create test subscribers
INSERT INTO subscribers (id, name, email, plan, max_devices, device_count, created_at, updated_at)
VALUES
  -- Free plan subscriber
  ('11111111-1111-1111-1111-111111111111',
   'Alice Free',
   'alice@test.codereply.app',
   'free',
   1,    -- max_devices
   0,    -- device_count (will be updated by trigger)
   NOW() - INTERVAL '30 days',
   NOW()),

  -- Starter plan subscriber
  ('22222222-2222-2222-2222-222222222222',
   'Bob Starter',
   'bob@test.codereply.app',
   'starter',
   2,    -- max_devices
   0,
   NOW() - INTERVAL '20 days',
   NOW()),

  -- Pro plan subscriber
  ('33333333-3333-3333-3333-333333333333',
   'Charlie Pro',
   'charlie@test.codereply.app',
   'pro',
   10,   -- max_devices
   0,
   NOW() - INTERVAL '60 days',
   NOW()),

  -- Enterprise plan subscriber
  ('44444444-4444-4444-4444-444444444444',
   'Diana Enterprise',
   'diana@test.codereply.app',
   'enterprise',
   100,  -- max_devices
   0,
   NOW() - INTERVAL '90 days',
   NOW())
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  email = EXCLUDED.email,
  plan = EXCLUDED.plan,
  max_devices = EXCLUDED.max_devices,
  updated_at = NOW();

-- ============================================================================
-- PART 2: Create Test API Keys
-- ============================================================================

INSERT INTO api_keys (id, subscriber_id, key_hash, name, is_active, created_at, last_used_at)
VALUES
  -- Alice's API key
  (gen_random_uuid(),
   '11111111-1111-1111-1111-111111111111',
   'hash_cr_test_alice_key_1111',  -- In production, this would be a real hash
   'Development Key',
   TRUE,
   NOW() - INTERVAL '30 days',
   NOW() - INTERVAL '1 hour'),

  -- Bob's API keys (2 keys)
  (gen_random_uuid(),
   '22222222-2222-2222-2222-222222222222',
   'hash_cr_test_bob_key_2222',
   'Production Key',
   TRUE,
   NOW() - INTERVAL '20 days',
   NOW() - INTERVAL '30 minutes'),

  (gen_random_uuid(),
   '22222222-2222-2222-2222-222222222222',
   'hash_cr_test_bob_dev_key_2222',
   'Development Key',
   TRUE,
   NOW() - INTERVAL '10 days',
   NOW() - INTERVAL '2 hours'),

  -- Charlie's API key
  (gen_random_uuid(),
   '33333333-3333-3333-3333-333333333333',
   'hash_cr_test_charlie_key_3333',
   'Production Key',
   TRUE,
   NOW() - INTERVAL '60 days',
   NOW() - INTERVAL '15 minutes'),

  -- Diana's API key
  (gen_random_uuid(),
   '44444444-4444-4444-4444-444444444444',
   'hash_cr_test_diana_key_4444',
   'Production Key',
   TRUE,
   NOW() - INTERVAL '90 days',
   NOW() - INTERVAL '5 minutes')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 3: Create Test Gateway Devices
-- ============================================================================

INSERT INTO gateway_devices (
  id, subscriber_id, name, status, sim_carrier, sim_number,
  last_heartbeat, total_messages_sent, total_messages_failed,
  created_at, updated_at, deleted_at
)
VALUES
  -- Alice's device (Free plan - 1 device)
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '11111111-1111-1111-1111-111111111111',
   'Alice iPhone 13',
   'ONLINE',
   'Globe',
   '+639171234001',
   NOW() - INTERVAL '2 minutes',
   150,
   5,
   NOW() - INTERVAL '25 days',
   NOW(),
   NULL),

  -- Bob's devices (Starter plan - 2 devices)
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222',
   'Bob Samsung S21',
   'ONLINE',
   'Smart',
   '+639191234001',
   NOW() - INTERVAL '1 minute',
   320,
   12,
   NOW() - INTERVAL '18 days',
   NOW(),
   NULL),

  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
   '22222222-2222-2222-2222-222222222222',
   'Bob Backup Phone',
   'OFFLINE',
   'Globe',
   '+639171234002',
   NOW() - INTERVAL '3 hours',
   89,
   3,
   NOW() - INTERVAL '15 days',
   NOW(),
   NULL),

  -- Charlie's devices (Pro plan - 3 devices)
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333',
   'Charlie Device 1',
   'ONLINE',
   'Globe',
   '+639171234003',
   NOW() - INTERVAL '30 seconds',
   1250,
   45,
   NOW() - INTERVAL '55 days',
   NOW(),
   NULL),

  ('cccccccc-cccc-cccc-cccc-ccccccccccc2',
   '33333333-3333-3333-3333-333333333333',
   'Charlie Device 2',
   'ONLINE',
   'Smart',
   '+639191234002',
   NOW() - INTERVAL '45 seconds',
   980,
   32,
   NOW() - INTERVAL '50 days',
   NOW(),
   NULL),

  ('cccccccc-cccc-cccc-cccc-ccccccccccc3',
   '33333333-3333-3333-3333-333333333333',
   'Charlie Device 3',
   'OFFLINE',
   'Dito',
   '+639051234001',
   NOW() - INTERVAL '2 days',
   450,
   18,
   NOW() - INTERVAL '45 days',
   NOW(),
   NULL),

  -- Diana's devices (Enterprise plan - 5 devices)
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '44444444-4444-4444-4444-444444444444',
   'Diana Hub 1',
   'ONLINE',
   'Globe',
   '+639171234004',
   NOW() - INTERVAL '20 seconds',
   5200,
   180,
   NOW() - INTERVAL '85 days',
   NOW(),
   NULL),

  ('dddddddd-dddd-dddd-dddd-ddddddddddd2',
   '44444444-4444-4444-4444-444444444444',
   'Diana Hub 2',
   'ONLINE',
   'Smart',
   '+639191234003',
   NOW() - INTERVAL '25 seconds',
   4800,
   165,
   NOW() - INTERVAL '80 days',
   NOW(),
   NULL),

  ('dddddddd-dddd-dddd-dddd-ddddddddddd3',
   '44444444-4444-4444-4444-444444444444',
   'Diana Hub 3',
   'ONLINE',
   'Globe',
   '+639171234005',
   NOW() - INTERVAL '15 seconds',
   3900,
   142,
   NOW() - INTERVAL '75 days',
   NOW(),
   NULL),

  ('dddddddd-dddd-dddd-dddd-ddddddddddd4',
   '44444444-4444-4444-4444-444444444444',
   'Diana Backup 1',
   'OFFLINE',
   'Dito',
   '+639051234002',
   NOW() - INTERVAL '6 hours',
   1200,
   55,
   NOW() - INTERVAL '70 days',
   NOW(),
   NULL),

  ('dddddddd-dddd-dddd-dddd-ddddddddddd5',
   '44444444-4444-4444-4444-444444444444',
   'Diana Backup 2',
   'OFFLINE',
   'Smart',
   '+639191234004',
   NOW() - INTERVAL '12 hours',
   890,
   41,
   NOW() - INTERVAL '65 days',
   NOW(),
   NULL)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  last_heartbeat = EXCLUDED.last_heartbeat,
  updated_at = NOW();

-- ============================================================================
-- PART 4: Create Test Messages
-- ============================================================================

-- Helper function to generate random phone numbers
CREATE OR REPLACE FUNCTION random_phone_number() RETURNS TEXT AS $$
BEGIN
  RETURN '+63917' || LPAD(FLOOR(RANDOM() * 9999999)::TEXT, 7, '0');
END;
$$ LANGUAGE plpgsql;

-- Generate messages for Alice (Free tier - 150 messages total)
DO $$
DECLARE
  i INT;
  device_id UUID := 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  subscriber_id UUID := '11111111-1111-1111-1111-111111111111';
BEGIN
  FOR i IN 1..50 LOOP
    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, sent_at, delivered_at
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      device_id,
      random_phone_number(),
      'Test message ' || i || ' from Alice',
      'DELIVERED',
      NOW() - (RANDOM() * INTERVAL '7 days'),
      NOW() - (RANDOM() * INTERVAL '7 days') + INTERVAL '5 seconds',
      NOW() - (RANDOM() * INTERVAL '7 days') + INTERVAL '10 seconds',
      NOW() - (RANDOM() * INTERVAL '7 days') + INTERVAL '30 seconds'
    );
  END LOOP;

  -- Add some failed messages
  FOR i IN 1..5 LOOP
    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, failed_at, error_message
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      device_id,
      random_phone_number(),
      'Test message ' || i || ' (failed)',
      'FAILED',
      NOW() - (RANDOM() * INTERVAL '7 days'),
      NOW() - (RANDOM() * INTERVAL '7 days') + INTERVAL '5 seconds',
      NOW() - (RANDOM() * INTERVAL '7 days') + INTERVAL '15 seconds',
      'Network timeout'
    );
  END LOOP;

  -- Add messages for today
  FOR i IN 1..10 LOOP
    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, sent_at
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      device_id,
      random_phone_number(),
      'OTP: ' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0'),
      CASE WHEN i <= 8 THEN 'DELIVERED' ELSE 'SENT' END,
      NOW() - (RANDOM() * INTERVAL '12 hours'),
      NOW() - (RANDOM() * INTERVAL '12 hours') + INTERVAL '3 seconds',
      NOW() - (RANDOM() * INTERVAL '12 hours') + INTERVAL '8 seconds'
    );
  END LOOP;
END $$;

-- Generate messages for Bob (Starter tier - 320 messages)
DO $$
DECLARE
  i INT;
  device_id UUID;
  subscriber_id UUID := '22222222-2222-2222-2222-222222222222';
BEGIN
  FOR i IN 1..100 LOOP
    -- Distribute across Bob's 2 devices
    device_id := CASE WHEN RANDOM() < 0.7 THEN 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' ELSE 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2' END;

    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, sent_at, delivered_at
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      device_id,
      random_phone_number(),
      'Marketing message ' || i || ' from Bob Inc',
      'DELIVERED',
      NOW() - (RANDOM() * INTERVAL '20 days'),
      NOW() - (RANDOM() * INTERVAL '20 days') + INTERVAL '4 seconds',
      NOW() - (RANDOM() * INTERVAL '20 days') + INTERVAL '9 seconds',
      NOW() - (RANDOM() * INTERVAL '20 days') + INTERVAL '35 seconds'
    );
  END LOOP;

  -- Messages today
  FOR i IN 1..25 LOOP
    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, sent_at, delivered_at
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      random_phone_number(),
      'Your verification code is ' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0'),
      'DELIVERED',
      NOW() - (RANDOM() * INTERVAL '8 hours'),
      NOW() - (RANDOM() * INTERVAL '8 hours') + INTERVAL '2 seconds',
      NOW() - (RANDOM() * INTERVAL '8 hours') + INTERVAL '7 seconds',
      NOW() - (RANDOM() * INTERVAL '8 hours') + INTERVAL '25 seconds'
    );
  END LOOP;
END $$;

-- Generate messages for Charlie (Pro tier - heavy usage)
DO $$
DECLARE
  i INT;
  device_id UUID;
  subscriber_id UUID := '33333333-3333-3333-3333-333333333333';
  devices UUID[] := ARRAY[
    'cccccccc-cccc-cccc-cccc-cccccccccccc'::UUID,
    'cccccccc-cccc-cccc-cccc-ccccccccccc2'::UUID,
    'cccccccc-cccc-cccc-cccc-ccccccccccc3'::UUID
  ];
BEGIN
  FOR i IN 1..200 LOOP
    -- Random device selection
    device_id := devices[1 + FLOOR(RANDOM() * 3)];

    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, sent_at, delivered_at,
      metadata
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      device_id,
      random_phone_number(),
      'Transaction alert: Your payment of PHP ' || (100 + RANDOM() * 9900)::INT || ' has been processed.',
      'DELIVERED',
      NOW() - (RANDOM() * INTERVAL '60 days'),
      NOW() - (RANDOM() * INTERVAL '60 days') + INTERVAL '3 seconds',
      NOW() - (RANDOM() * INTERVAL '60 days') + INTERVAL '8 seconds',
      NOW() - (RANDOM() * INTERVAL '60 days') + INTERVAL '20 seconds',
      jsonb_build_object('campaign_id', 'banking_alerts', 'priority', 'high')
    );
  END LOOP;

  -- Messages today (high volume)
  FOR i IN 1..50 LOOP
    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, sent_at, delivered_at
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      devices[1 + FLOOR(RANDOM() * 2)],  -- Only online devices
      random_phone_number(),
      'Your OTP for login is ' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0'),
      'DELIVERED',
      NOW() - (RANDOM() * INTERVAL '6 hours'),
      NOW() - (RANDOM() * INTERVAL '6 hours') + INTERVAL '1 second',
      NOW() - (RANDOM() * INTERVAL '6 hours') + INTERVAL '5 seconds',
      NOW() - (RANDOM() * INTERVAL '6 hours') + INTERVAL '18 seconds'
    );
  END LOOP;
END $$;

-- Generate messages for Diana (Enterprise - very high volume)
DO $$
DECLARE
  i INT;
  device_id UUID;
  subscriber_id UUID := '44444444-4444-4444-4444-444444444444';
  devices UUID[] := ARRAY[
    'dddddddd-dddd-dddd-dddd-dddddddddddd'::UUID,
    'dddddddd-dddd-dddd-dddd-ddddddddddd2'::UUID,
    'dddddddd-dddd-dddd-dddd-ddddddddddd3'::UUID
  ];
BEGIN
  FOR i IN 1..500 LOOP
    device_id := devices[1 + FLOOR(RANDOM() * 3)];

    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, sent_at, delivered_at,
      metadata
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      device_id,
      random_phone_number(),
      'Appointment reminder: You have an appointment on ' || TO_CHAR(NOW() + (RANDOM() * INTERVAL '30 days'), 'MM/DD/YYYY'),
      'DELIVERED',
      NOW() - (RANDOM() * INTERVAL '90 days'),
      NOW() - (RANDOM() * INTERVAL '90 days') + INTERVAL '2 seconds',
      NOW() - (RANDOM() * INTERVAL '90 days') + INTERVAL '6 seconds',
      NOW() - (RANDOM() * INTERVAL '90 days') + INTERVAL '15 seconds',
      jsonb_build_object('campaign_id', 'appointment_reminders', 'type', 'automated')
    );
  END LOOP;

  -- Messages today (very high volume)
  FOR i IN 1..100 LOOP
    INSERT INTO messages (
      id, subscriber_id, gateway_id, to_number, body, status,
      queued_at, dispatched_at, sent_at
    ) VALUES (
      gen_random_uuid(),
      subscriber_id,
      devices[1 + FLOOR(RANDOM() * 3)],
      random_phone_number(),
      'Notification: Your order #' || LPAD(FLOOR(RANDOM() * 999999)::TEXT, 6, '0') || ' is being processed.',
      CASE WHEN i <= 95 THEN 'DELIVERED' ELSE 'SENT' END,
      NOW() - (RANDOM() * INTERVAL '4 hours'),
      NOW() - (RANDOM() * INTERVAL '4 hours') + INTERVAL '1 second',
      NOW() - (RANDOM() * INTERVAL '4 hours') + INTERVAL '4 seconds'
    );
  END LOOP;
END $$;

-- Cleanup helper function
DROP FUNCTION IF EXISTS random_phone_number();

-- ============================================================================
-- PART 5: Create Test Registration Tokens
-- ============================================================================

INSERT INTO registration_tokens (
  id, subscriber_id, token_hash, used, expires_at, created_at
)
VALUES
  -- Active token for Alice (not yet used)
  (gen_random_uuid(),
   '11111111-1111-1111-1111-111111111111',
   'hash_token_alice_active_1',
   FALSE,
   NOW() + INTERVAL '30 minutes',
   NOW() - INTERVAL '15 minutes'),

  -- Used token for Bob
  (gen_random_uuid(),
   '22222222-2222-2222-2222-222222222222',
   'hash_token_bob_used_1',
   TRUE,
   NOW() - INTERVAL '23 hours',
   NOW() - INTERVAL '24 hours'),

  -- Expired token for Charlie
  (gen_random_uuid(),
   '33333333-3333-3333-3333-333333333333',
   'hash_token_charlie_expired_1',
   FALSE,
   NOW() - INTERVAL '2 hours',
   NOW() - INTERVAL '3 hours'),

  -- Active tokens for Diana
  (gen_random_uuid(),
   '44444444-4444-4444-4444-444444444444',
   'hash_token_diana_active_1',
   FALSE,
   NOW() + INTERVAL '45 minutes',
   NOW() - INTERVAL '10 minutes'),

  (gen_random_uuid(),
   '44444444-4444-4444-4444-444444444444',
   'hash_token_diana_active_2',
   FALSE,
   NOW() + INTERVAL '55 minutes',
   NOW() - INTERVAL '5 minutes')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- PART 6: Update Device Counters (should match actual devices)
-- ============================================================================

-- Update device counts based on actual devices
UPDATE subscribers s
SET device_count = (
  SELECT COUNT(*)
  FROM gateway_devices gd
  WHERE gd.subscriber_id = s.id
    AND gd.deleted_at IS NULL
);

-- Update message counters on devices (already done via totals in inserts above)

-- ============================================================================
-- PART 7: Display Summary
-- ============================================================================

DO $$
DECLARE
  total_subscribers INT;
  total_devices INT;
  total_messages INT;
  total_tokens INT;
BEGIN
  SELECT COUNT(*) INTO total_subscribers FROM subscribers WHERE email LIKE '%@test.codereply%';
  SELECT COUNT(*) INTO total_devices FROM gateway_devices WHERE deleted_at IS NULL;
  SELECT COUNT(*) INTO total_messages FROM messages;
  SELECT COUNT(*) INTO total_tokens FROM registration_tokens;

  RAISE NOTICE '========================================';
  RAISE NOTICE 'Development Seed Data Created';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Test Subscribers: %', total_subscribers;
  RAISE NOTICE 'Test Devices: %', total_devices;
  RAISE NOTICE 'Test Messages: %', total_messages;
  RAISE NOTICE 'Test Registration Tokens: %', total_tokens;
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Test Subscriber Logins:';
  RAISE NOTICE 'Alice (Free):       alice@test.codereply.app';
  RAISE NOTICE 'Bob (Starter):      bob@test.codereply.app';
  RAISE NOTICE 'Charlie (Pro):      charlie@test.codereply.app';
  RAISE NOTICE 'Diana (Enterprise): diana@test.codereply.app';
  RAISE NOTICE '========================================';
END $$;

COMMIT;

-- ============================================================================
-- Verification Queries (run these to verify seed data)
-- ============================================================================
/*
-- View all test subscribers
SELECT id, name, email, plan, device_count, max_devices FROM subscribers WHERE email LIKE '%@test.codereply%';

-- View all test devices
SELECT gd.name, s.name AS subscriber, gd.status, gd.sim_carrier, gd.total_messages_sent
FROM gateway_devices gd
JOIN subscribers s ON s.id = gd.subscriber_id
WHERE s.email LIKE '%@test.codereply%'
ORDER BY s.name, gd.name;

-- View message statistics per subscriber
SELECT
  s.name,
  s.plan,
  COUNT(m.id) AS total_messages,
  COUNT(m.id) FILTER (WHERE m.status = 'DELIVERED') AS delivered,
  COUNT(m.id) FILTER (WHERE DATE(m.queued_at) = CURRENT_DATE) AS today
FROM subscribers s
LEFT JOIN messages m ON m.subscriber_id = s.id
WHERE s.email LIKE '%@test.codereply%'
GROUP BY s.id, s.name, s.plan
ORDER BY s.name;

-- View registration tokens
SELECT
  s.name,
  rt.used,
  rt.expires_at > NOW() AS is_valid,
  rt.created_at
FROM registration_tokens rt
JOIN subscribers s ON s.id = rt.subscriber_id
WHERE s.email LIKE '%@test.codereply%'
ORDER BY rt.created_at DESC;
*/
