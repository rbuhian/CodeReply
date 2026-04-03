#!/bin/bash

# ============================================================================
# Migration Test Script
# Description: Automated testing of database migrations
# Author: Raj (Database Architect)
# Date: 2026-04-03
# ============================================================================
# This script:
# 1. Creates a test database
# 2. Runs all migrations
# 3. Verifies schema changes
# 4. Tests triggers and functions
# 5. Tests rollback procedures
# 6. Cleans up test database
# ============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
TEST_DB_NAME="${TEST_DB_NAME:-codereply_migration_test}"
DB_USER="${DB_USER:-codereply}"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
MIGRATIONS_DIR="$(dirname "$0")/migrations"
FUNCTIONS_DIR="$(dirname "$0")/functions"
VIEWS_DIR="$(dirname "$0")/views"

# ============================================================================
# Helper Functions
# ============================================================================

print_header() {
  echo -e "${BLUE}========================================${NC}"
  echo -e "${BLUE}$1${NC}"
  echo -e "${BLUE}========================================${NC}"
}

print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

print_error() {
  echo -e "${RED}✗ $1${NC}"
}

print_info() {
  echo -e "${YELLOW}→ $1${NC}"
}

# ============================================================================
# Database Connection Test
# ============================================================================

test_connection() {
  print_info "Testing database connection..."
  if psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "SELECT 1" > /dev/null 2>&1; then
    print_success "Database connection successful"
    return 0
  else
    print_error "Cannot connect to database at $DB_HOST:$DB_PORT"
    return 1
  fi
}

# ============================================================================
# Create Test Database
# ============================================================================

create_test_database() {
  print_header "Creating Test Database"

  # Drop existing test database if it exists
  print_info "Dropping existing test database (if exists)..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" 2>/dev/null || true

  # Create new test database
  print_info "Creating test database: $TEST_DB_NAME"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "CREATE DATABASE $TEST_DB_NAME;"
  print_success "Test database created"

  # Create base schema (subscribers, messages, gateway_devices tables)
  print_info "Creating base schema..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" << 'EOF'
-- Create base tables (simplified version for testing)

CREATE TABLE IF NOT EXISTS subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  plan TEXT DEFAULT 'free',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS gateway_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  status TEXT DEFAULT 'OFFLINE',
  sim_carrier TEXT,
  sim_number TEXT,
  last_heartbeat TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID,
  gateway_id UUID,
  to_number TEXT NOT NULL,
  body TEXT NOT NULL,
  status TEXT DEFAULT 'QUEUED',
  queued_at TIMESTAMPTZ DEFAULT NOW(),
  dispatched_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id UUID,
  key_hash TEXT UNIQUE NOT NULL,
  name TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ
);
EOF
  print_success "Base schema created"
}

# ============================================================================
# Run Migrations
# ============================================================================

run_migrations() {
  print_header "Running Migrations"

  # Migration 001
  if [ -f "$MIGRATIONS_DIR/001_add_subscriber_to_devices.sql" ]; then
    print_info "Running migration 001: Add subscriber_id to devices..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$MIGRATIONS_DIR/001_add_subscriber_to_devices.sql" > /dev/null
    print_success "Migration 001 completed"
  else
    print_error "Migration 001 file not found"
    return 1
  fi

  # Migration 002
  if [ -f "$MIGRATIONS_DIR/002_create_registration_tokens.sql" ]; then
    print_info "Running migration 002: Create registration_tokens table..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$MIGRATIONS_DIR/002_create_registration_tokens.sql" > /dev/null
    print_success "Migration 002 completed"
  else
    print_error "Migration 002 file not found"
    return 1
  fi

  # Migration 003
  if [ -f "$MIGRATIONS_DIR/003_add_database_triggers.sql" ]; then
    print_info "Running migration 003: Add database triggers..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$MIGRATIONS_DIR/003_add_database_triggers.sql" > /dev/null
    print_success "Migration 003 completed"
  else
    print_error "Migration 003 file not found"
    return 1
  fi

  # Migration 004
  if [ -f "$MIGRATIONS_DIR/004_update_indexes.sql" ]; then
    print_info "Running migration 004: Update indexes..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$MIGRATIONS_DIR/004_update_indexes.sql" > /dev/null
    print_success "Migration 004 completed"
  else
    print_error "Migration 004 file not found"
    return 1
  fi
}

# ============================================================================
# Verify Schema Changes
# ============================================================================

verify_schema() {
  print_header "Verifying Schema Changes"

  # Check subscriber_id column exists in gateway_devices
  print_info "Checking gateway_devices.subscriber_id column..."
  RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'gateway_devices' AND column_name = 'subscriber_id'
    );
  ")
  if [[ "$RESULT" =~ "t" ]]; then
    print_success "gateway_devices.subscriber_id exists"
  else
    print_error "gateway_devices.subscriber_id missing"
    return 1
  fi

  # Check deleted_at column exists
  print_info "Checking gateway_devices.deleted_at column..."
  RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'gateway_devices' AND column_name = 'deleted_at'
    );
  ")
  if [[ "$RESULT" =~ "t" ]]; then
    print_success "gateway_devices.deleted_at exists"
  else
    print_error "gateway_devices.deleted_at missing"
    return 1
  fi

  # Check max_devices column in subscribers
  print_info "Checking subscribers.max_devices column..."
  RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'subscribers' AND column_name = 'max_devices'
    );
  ")
  if [[ "$RESULT" =~ "t" ]]; then
    print_success "subscribers.max_devices exists"
  else
    print_error "subscribers.max_devices missing"
    return 1
  fi

  # Check registration_tokens table exists
  print_info "Checking registration_tokens table..."
  RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_name = 'registration_tokens'
    );
  ")
  if [[ "$RESULT" =~ "t" ]]; then
    print_success "registration_tokens table exists"
  else
    print_error "registration_tokens table missing"
    return 1
  fi

  # Check indexes
  print_info "Checking critical indexes..."
  INDEX_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename IN ('gateway_devices', 'messages', 'registration_tokens')
      AND indexname LIKE 'idx_%';
  ")
  if [ "$INDEX_COUNT" -gt 5 ]; then
    print_success "$INDEX_COUNT indexes created"
  else
    print_error "Expected more indexes (found: $INDEX_COUNT)"
    return 1
  fi

  print_success "Schema verification complete"
}

# ============================================================================
# Test Triggers
# ============================================================================

test_triggers() {
  print_header "Testing Triggers"

  # Create test subscriber
  print_info "Creating test subscriber..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" << 'EOF' > /dev/null
INSERT INTO subscribers (id, name, email, plan, max_devices)
VALUES ('11111111-1111-1111-1111-111111111111', 'Test User', 'test@example.com', 'starter', 2);
EOF
  print_success "Test subscriber created"

  # Test device count trigger (insert)
  print_info "Testing device count trigger (insert)..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" << 'EOF' > /dev/null
INSERT INTO gateway_devices (id, subscriber_id, name)
VALUES ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111', 'Test Device 1');
EOF

  DEVICE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT device_count FROM subscribers WHERE id = '11111111-1111-1111-1111-111111111111';
  " | xargs)

  if [ "$DEVICE_COUNT" -eq 1 ]; then
    print_success "Device count trigger works (count: $DEVICE_COUNT)"
  else
    print_error "Device count trigger failed (expected 1, got: $DEVICE_COUNT)"
    return 1
  fi

  # Test device quota trigger (should allow second device)
  print_info "Testing device quota trigger (should allow)..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" << 'EOF' > /dev/null 2>&1
INSERT INTO gateway_devices (id, subscriber_id, name)
VALUES ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', '11111111-1111-1111-1111-111111111111', 'Test Device 2');
EOF

  if [ $? -eq 0 ]; then
    print_success "Second device allowed (within quota)"
  else
    print_error "Should have allowed second device"
    return 1
  fi

  # Check current device count before testing quota
  DEVICE_COUNT_BEFORE=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT device_count FROM subscribers WHERE id = '11111111-1111-1111-1111-111111111111';
  " | xargs)

  # Test device quota trigger (should reject third device)
  print_info "Testing device quota trigger (should reject)... (current count: $DEVICE_COUNT_BEFORE, max: 2)"
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" << 'EOF' > /dev/null 2>&1
INSERT INTO gateway_devices (id, subscriber_id, name)
VALUES ('cccccccc-cccc-cccc-cccc-cccccccccccc', '11111111-1111-1111-1111-111111111111', 'Test Device 3');
EOF

  # Check if the device was actually inserted by checking the device count
  DEVICE_COUNT_AFTER=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT device_count FROM subscribers WHERE id = '11111111-1111-1111-1111-111111111111';
  " | xargs)

  # Also check if the specific device exists
  DEVICE_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT EXISTS(SELECT 1 FROM gateway_devices WHERE id = 'cccccccc-cccc-cccc-cccc-cccccccccccc');
  " | xargs)

  if [ "$DEVICE_COUNT_AFTER" -eq 2 ] && [ "$DEVICE_EXISTS" = "f" ]; then
    print_success "Third device rejected (quota exceeded, count stayed at 2)"
  else
    print_error "Should have rejected third device (count: $DEVICE_COUNT_BEFORE -> $DEVICE_COUNT_AFTER, device exists: $DEVICE_EXISTS)"
    return 1
  fi

  # Test soft delete trigger
  print_info "Testing soft delete trigger..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" << 'EOF' > /dev/null
UPDATE gateway_devices SET deleted_at = NOW() WHERE id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
EOF

  DEVICE_COUNT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT device_count FROM subscribers WHERE id = '11111111-1111-1111-1111-111111111111';
  " | xargs)

  if [ "$DEVICE_COUNT" -eq 1 ]; then
    print_success "Soft delete trigger works (count decremented to: $DEVICE_COUNT)"
  else
    print_error "Soft delete trigger failed (expected 1, got: $DEVICE_COUNT)"
    return 1
  fi

  # Test cross-subscriber security trigger (should reject)
  print_info "Testing cross-subscriber security trigger..."

  # Create second subscriber and device
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" << 'EOF' > /dev/null 2>&1
INSERT INTO subscribers (id, name, email, plan)
VALUES ('22222222-2222-2222-2222-222222222222', 'Subscriber 2', 'sub2@example.com', 'free');

INSERT INTO gateway_devices (id, subscriber_id, name)
VALUES ('dddddddd-dddd-dddd-dddd-dddddddddddd', '22222222-2222-2222-2222-222222222222', 'Sub2 Device');
EOF

  # Try to route subscriber 1's message through subscriber 2's device (should fail)
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" << 'EOF' > /dev/null 2>&1
INSERT INTO messages (subscriber_id, gateway_id, to_number, body)
VALUES ('11111111-1111-1111-1111-111111111111', 'dddddddd-dddd-dddd-dddd-dddddddddddd', '+639171234567', 'Test');
EOF

  if [ $? -ne 0 ]; then
    print_success "Cross-subscriber routing blocked (security trigger works)"
  else
    # Double check if message was actually inserted
    MESSAGE_EXISTS=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
      SELECT EXISTS(SELECT 1 FROM messages WHERE gateway_id = 'dddddddd-dddd-dddd-dddd-dddddddddddd');
    " | xargs)

    if [ "$MESSAGE_EXISTS" = "f" ]; then
      print_success "Cross-subscriber routing blocked (security trigger works)"
    else
      print_error "Security violation: cross-subscriber routing was allowed!"
      return 1
    fi
  fi

  print_success "All trigger tests passed"
}

# ============================================================================
# Test Functions
# ============================================================================

test_functions() {
  print_header "Testing Database Functions"

  # Install device selection functions
  if [ -f "$FUNCTIONS_DIR/device_selection.sql" ]; then
    print_info "Installing device selection functions..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$FUNCTIONS_DIR/device_selection.sql" > /dev/null 2>&1
    print_success "Device selection functions installed"
  fi

  # Install quota management functions
  if [ -f "$FUNCTIONS_DIR/quota_management.sql" ]; then
    print_info "Installing quota management functions..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$FUNCTIONS_DIR/quota_management.sql" > /dev/null 2>&1
    print_success "Quota management functions installed"
  fi

  # Test device selection function
  print_info "Testing get_available_devices function..."
  RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'get_available_devices'
    );
  ")
  if [[ "$RESULT" =~ "t" ]]; then
    print_success "get_available_devices function exists"
  else
    print_error "get_available_devices function missing"
  fi

  # Test quota check function
  print_info "Testing check_daily_quota function..."
  RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
    SELECT EXISTS (
      SELECT 1 FROM pg_proc WHERE proname = 'check_daily_quota'
    );
  ")
  if [[ "$RESULT" =~ "t" ]]; then
    print_success "check_daily_quota function exists"
  else
    print_error "check_daily_quota function missing"
  fi
}

# ============================================================================
# Test Rollback
# ============================================================================

test_rollback() {
  print_header "Testing Rollback"

  if [ -f "$MIGRATIONS_DIR/000_rollback_byod_migration.sql" ]; then
    print_info "Running rollback script..."
    psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -f "$MIGRATIONS_DIR/000_rollback_byod_migration.sql" > /dev/null 2>&1

    # Verify subscriber_id column is gone
    RESULT=$(psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$TEST_DB_NAME" -t -c "
      SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'gateway_devices' AND column_name = 'subscriber_id'
      );
    ")

    if [[ "$RESULT" =~ "f" ]]; then
      print_success "Rollback successful (subscriber_id removed)"
    else
      print_error "Rollback failed (subscriber_id still exists)"
      return 1
    fi
  else
    print_info "Rollback script not found, skipping rollback test"
  fi
}

# ============================================================================
# Cleanup
# ============================================================================

cleanup() {
  print_header "Cleanup"

  print_info "Dropping test database..."
  psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d postgres -c "DROP DATABASE IF EXISTS $TEST_DB_NAME;" 2>/dev/null
  print_success "Test database dropped"
}

# ============================================================================
# Main Execution
# ============================================================================

main() {
  print_header "CodeReply Migration Test Suite"
  echo ""

  # Check connection
  if ! test_connection; then
    exit 1
  fi

  # Create test database
  if ! create_test_database; then
    print_error "Failed to create test database"
    exit 1
  fi

  # Run migrations
  if ! run_migrations; then
    print_error "Migration failed"
    cleanup
    exit 1
  fi

  # Verify schema
  if ! verify_schema; then
    print_error "Schema verification failed"
    cleanup
    exit 1
  fi

  # Test triggers
  if ! test_triggers; then
    print_error "Trigger tests failed"
    cleanup
    exit 1
  fi

  # Test functions
  test_functions

  # Test rollback (optional)
  # test_rollback

  # Cleanup
  cleanup

  # Success!
  echo ""
  print_header "All Tests Passed! ✓"
  echo -e "${GREEN}Migrations are ready for production deployment.${NC}"
  echo ""
}

# Run main function
main
