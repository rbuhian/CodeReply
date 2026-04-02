-- Migration: Migrate existing devices to subscriber ownership
-- Description: Data migration script to assign existing operator devices to subscribers
-- Version: 002
-- Date: 2026-04-02
-- Dependencies: 001_add_subscriber_to_devices.sql

-- ============================================================================
-- PART 1: Create migration strategy
-- ============================================================================

-- This migration handles the transition from operator-owned to subscriber-owned devices
-- There are three common scenarios:

-- SCENARIO A: Single-tenant setup (one subscriber, all devices belong to them)
-- SCENARIO B: Multi-tenant setup with clear device ownership
-- SCENARIO C: Migration where a default "operator" subscriber is created

-- ============================================================================
-- PART 2: SCENARIO A - Single Subscriber Migration
-- ============================================================================

-- If you have a single subscriber and want all devices to belong to them:

-- Example: Assign all devices to the first subscriber
-- UPDATE gateway_devices
-- SET subscriber_id = (SELECT id FROM subscribers ORDER BY created_at ASC LIMIT 1)
-- WHERE subscriber_id IS NULL;

-- ============================================================================
-- PART 3: SCENARIO B - Manual Device Assignment
-- ============================================================================

-- For multi-tenant setups, manually assign devices to specific subscribers:

-- Example: Assign specific devices by name or ID
-- UPDATE gateway_devices
-- SET subscriber_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'  -- Replace with actual subscriber UUID
-- WHERE id IN ('device-uuid-1', 'device-uuid-2', 'device-uuid-3');

-- ============================================================================
-- PART 4: SCENARIO C - Create Default Operator Subscriber
-- ============================================================================

-- Create a default "operator" subscriber for legacy devices
DO $$
DECLARE
  operator_subscriber_id UUID;
BEGIN
  -- Check if operator subscriber already exists
  SELECT id INTO operator_subscriber_id
  FROM subscribers
  WHERE email = 'operator@codereply.internal';

  -- Create operator subscriber if it doesn't exist
  IF operator_subscriber_id IS NULL THEN
    INSERT INTO subscribers (
      id,
      name,
      email,
      plan,
      daily_quota,
      max_devices,
      created_at
    ) VALUES (
      gen_random_uuid(),
      'CodeReply Operator',
      'operator@codereply.internal',
      'enterprise',
      999999,
      999,
      NOW()
    )
    RETURNING id INTO operator_subscriber_id;

    RAISE NOTICE 'Created operator subscriber with ID: %', operator_subscriber_id;
  END IF;

  -- Assign all unassigned devices to operator subscriber
  UPDATE gateway_devices
  SET subscriber_id = operator_subscriber_id
  WHERE subscriber_id IS NULL;

  RAISE NOTICE 'Assigned % devices to operator subscriber',
    (SELECT COUNT(*) FROM gateway_devices WHERE subscriber_id = operator_subscriber_id);
END $$;

-- ============================================================================
-- PART 5: Verify migration
-- ============================================================================

-- Check for any devices without a subscriber
DO $$
DECLARE
  unassigned_count INT;
BEGIN
  SELECT COUNT(*) INTO unassigned_count
  FROM gateway_devices
  WHERE subscriber_id IS NULL;

  IF unassigned_count > 0 THEN
    RAISE WARNING 'Found % devices without a subscriber. Please assign them manually.', unassigned_count;
  ELSE
    RAISE NOTICE 'All devices have been assigned to subscribers successfully.';
  END IF;
END $$;

-- ============================================================================
-- PART 6: Update device_count for all subscribers
-- ============================================================================

-- Recalculate device counts after migration
UPDATE subscribers s
SET device_count = (
  SELECT COUNT(*)
  FROM gateway_devices gd
  WHERE gd.subscriber_id = s.id
    AND gd.deleted_at IS NULL
);

-- ============================================================================
-- PART 7: Generate migration report
-- ============================================================================

-- Show summary of device distribution
SELECT
  s.name AS subscriber_name,
  s.email AS subscriber_email,
  s.plan,
  COUNT(gd.id) AS total_devices,
  COUNT(CASE WHEN gd.status = 'ONLINE' THEN 1 END) AS online_devices,
  COUNT(CASE WHEN gd.status = 'OFFLINE' THEN 1 END) AS offline_devices,
  s.max_devices AS max_allowed,
  s.device_count AS current_count
FROM subscribers s
LEFT JOIN gateway_devices gd ON gd.subscriber_id = s.id AND gd.deleted_at IS NULL
GROUP BY s.id, s.name, s.email, s.plan, s.max_devices, s.device_count
ORDER BY s.created_at;

-- ============================================================================
-- Migration Notes:
-- ============================================================================
-- 1. Choose the appropriate scenario (A, B, or C) for your setup
-- 2. Comment out the scenarios you don't need
-- 3. After running this migration, verify all devices have subscriber_id assigned
-- 4. The next migration (003) will make subscriber_id NOT NULL
-- ============================================================================
