# BYOD Schema Diagram

## Database Schema Overview (v2.0 - BYOD Model)

### Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                          SUBSCRIBERS                                │
│─────────────────────────────────────────────────────────────────────│
│ • id (PK, UUID)                                                     │
│ • name (TEXT)                                                       │
│ • email (TEXT, UNIQUE)                                              │
│ • plan (TEXT) — 'free', 'starter', 'pro', 'enterprise'              │
│ • daily_quota (INT) — default: 100                                  │
│ • max_devices (INT) — NEW: max devices allowed by plan              │
│ • device_count (INT) — NEW: current active device count             │
│ • created_at (TIMESTAMPTZ)                                          │
└─────────────────────────────────────────────────────────────────────┘
           │                                    │
           │ 1:N                                │ 1:N
           │                                    │
           ▼                                    ▼
┌─────────────────────────────────┐  ┌─────────────────────────────────┐
│      GATEWAY_DEVICES            │  │        API_KEYS                 │
│─────────────────────────────────│  │─────────────────────────────────│
│ • id (PK, UUID)                 │  │ • id (PK, UUID)                 │
│ • subscriber_id (FK) — NEW      │  │ • subscriber_id (FK)            │
│ • name (TEXT)                   │  │ • key_hash (TEXT, UNIQUE)       │
│ • device_label (TEXT) — NEW     │  │ • key_prefix (TEXT)             │
│ • device_token (TEXT, UNIQUE)   │  │ • label (TEXT)                  │
│ • sim_carrier (TEXT)            │  │ • is_active (BOOLEAN)           │
│ • sim_number (TEXT)             │  │ • last_used_at (TIMESTAMPTZ)    │
│ • status (TEXT)                 │  │ • created_at (TIMESTAMPTZ)      │
│ • is_enabled (BOOLEAN) — NEW    │  └─────────────────────────────────┘
│ • last_heartbeat (TIMESTAMPTZ)  │
│ • app_version (TEXT)            │
│ • android_version (TEXT)        │
│ • total_messages_sent (INT) NEW │
│ • total_messages_failed (INT) — │
│ • notes (TEXT) — NEW            │
│ • created_by (FK) — NEW         │
│ • registered_at (TIMESTAMPTZ)   │
│ • updated_at (TIMESTAMPTZ) — NEW│
│ • deleted_at (TIMESTAMPTZ) — NEW│
└─────────────────────────────────┘
           │
           │ 1:N
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                            MESSAGES                                 │
│─────────────────────────────────────────────────────────────────────│
│ • id (PK, UUID)                                                     │
│ • subscriber_id (FK) — owner of the message                         │
│ • gateway_id (FK) — device that sent the message                    │
│ • to_number (TEXT)                                                  │
│ • body (TEXT)                                                       │
│ • status (TEXT)                                                     │
│ • retry_count (INT)                                                 │
│ • ttl (INT)                                                         │
│ • webhook_url (TEXT)                                                │
│ • metadata (JSONB)                                                  │
│ • queued_at (TIMESTAMPTZ)                                           │
│ • dispatched_at (TIMESTAMPTZ)                                       │
│ • sent_at (TIMESTAMPTZ)                                             │
│ • delivered_at (TIMESTAMPTZ)                                        │
│ • failed_at (TIMESTAMPTZ)                                           │
│ • error (TEXT)                                                      │
└─────────────────────────────────────────────────────────────────────┘
           │
           │ 1:N
           │
           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      WEBHOOK_DELIVERIES                             │
│─────────────────────────────────────────────────────────────────────│
│ • id (PK, UUID)                                                     │
│ • message_id (FK)                                                   │
│ • url (TEXT)                                                        │
│ • payload (JSONB)                                                   │
│ • status_code (INT)                                                 │
│ • attempt (INT)                                                     │
│ • delivered_at (TIMESTAMPTZ)                                        │
│ • error (TEXT)                                                      │
│ • created_at (TIMESTAMPTZ)                                          │
└─────────────────────────────────────────────────────────────────────┘
```

## Key Relationships

### 1. Subscriber → Gateway Devices (1:N)

```
subscribers.id ←──── gateway_devices.subscriber_id
                     (ON DELETE CASCADE)
```

**Constraint:** When a subscriber is deleted, all their devices are automatically deleted.

**Quota:** Enforced by trigger `trg_check_device_quota`.

### 2. Subscriber → Messages (1:N)

```
subscribers.id ←──── messages.subscriber_id
```

**Constraint:** Each message belongs to one subscriber (the sender).

### 3. Gateway Device → Messages (1:N)

```
gateway_devices.id ←──── messages.gateway_id
                         (ON DELETE SET NULL)
```

**Constraint:** When a device is deleted, messages keep their history but `gateway_id` becomes NULL.

### 4. Subscriber → API Keys (1:N)

```
subscribers.id ←──── api_keys.subscriber_id
                     (ON DELETE CASCADE)
```

**Constraint:** When a subscriber is deleted, all their API keys are deleted.

## Key Indexes

### Gateway Devices

| Index | Columns | Type | Purpose |
|-------|---------|------|---------|
| `PK` | `id` | Primary Key | Unique device identifier |
| `idx_gateway_devices_subscriber_id` | `subscriber_id` | B-tree | Filter devices by subscriber |
| `idx_gateway_devices_subscriber_status` | `subscriber_id, status` | B-tree | Get online devices for subscriber |
| `idx_gateway_devices_subscriber_deleted` | `subscriber_id, deleted_at` | B-tree (partial) | Query soft-deleted devices |
| `idx_gateway_devices_unique_name_per_subscriber` | `subscriber_id, name` | Unique (partial) | Enforce unique names per subscriber |
| `idx_gateway_devices_status` | `status` | B-tree | Filter by status globally |
| `idx_gateway_devices_heartbeat` | `last_heartbeat DESC` | B-tree | Find inactive devices |

### Messages

| Index | Columns | Type | Purpose |
|-------|---------|------|---------|
| `PK` | `id` | Primary Key | Unique message identifier |
| `idx_messages_subscriber_id` | `subscriber_id` | B-tree | Filter messages by subscriber |
| `idx_messages_gateway_id` | `gateway_id` | B-tree | Filter messages by device |
| `idx_messages_status` | `status` | B-tree | Filter by status |
| `idx_messages_queued_at` | `queued_at DESC` | B-tree | Recent messages first |
| `idx_messages_subscriber_status` | `subscriber_id, status` | B-tree | Filter by subscriber + status |
| `idx_messages_to_number` | `to_number` | B-tree | Find messages to specific number |

### Subscribers

| Index | Columns | Type | Purpose |
|-------|---------|------|---------|
| `PK` | `id` | Primary Key | Unique subscriber identifier |
| `idx_subscribers_email` | `email` | B-tree (unique) | Login lookup |
| `idx_subscribers_plan` | `plan` | B-tree | Filter by plan type |

## Database Triggers

### 1. Device Count Maintenance

**Trigger:** `trg_update_device_count`

**Table:** `gateway_devices`

**Fires:** AFTER INSERT, UPDATE, DELETE

**Purpose:** Automatically maintain `subscribers.device_count`

**Logic:**
```
INSERT → device_count++
UPDATE (soft delete) → device_count--
UPDATE (restore) → device_count++
DELETE → device_count--
```

### 2. Device Quota Enforcement

**Trigger:** `trg_check_device_quota`

**Table:** `gateway_devices`

**Fires:** BEFORE INSERT, UPDATE

**Purpose:** Prevent exceeding device quota

**Logic:**
```sql
IF device_count >= max_devices THEN
  RAISE EXCEPTION 'Device quota exceeded'
END IF
```

### 3. Updated At Timestamp

**Trigger:** `trg_gateway_devices_updated_at`

**Table:** `gateway_devices`

**Fires:** BEFORE UPDATE

**Purpose:** Auto-update `updated_at` timestamp

**Logic:**
```sql
NEW.updated_at = NOW()
```

## Helper Functions

### 1. get_available_devices()

**Signature:**
```sql
get_available_devices(
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
)
```

**Purpose:** Get optimal device for message dispatch

**Selection Criteria:**
1. Device belongs to subscriber
2. Device is not soft-deleted
3. Device is enabled
4. Device status is ONLINE
5. Heartbeat within last 2 minutes

**Ordering:**
1. Carrier match (if preference specified)
2. Least load (fewest in-flight messages)
3. Most recent heartbeat

### 2. can_add_device()

**Signature:**
```sql
can_add_device(p_subscriber_id UUID)
RETURNS BOOLEAN
```

**Purpose:** Check if subscriber can add more devices

**Logic:**
```sql
RETURN device_count < max_devices
```

## View: active_gateway_devices

**Definition:**
```sql
CREATE VIEW active_gateway_devices AS
SELECT
  gd.*,
  s.name AS subscriber_name,
  s.email AS subscriber_email,
  s.plan AS subscriber_plan,
  -- Computed columns
  success_rate,
  is_online,
  is_healthy
FROM gateway_devices gd
JOIN subscribers s ON s.id = gd.subscriber_id
WHERE gd.deleted_at IS NULL;
```

**Computed Columns:**
- `success_rate`: `sent / (sent + failed)`
- `is_online`: `last_heartbeat > NOW() - 2 minutes`
- `is_healthy`: `status = 'ONLINE' AND is_enabled AND is_online`

## Soft Delete Implementation

### Concept

Instead of hard-deleting devices, we set `deleted_at` timestamp.

**Benefits:**
- Audit trail preserved
- Can restore accidentally deleted devices
- Analytics on device churn

### Usage

**Soft delete:**
```sql
UPDATE gateway_devices
SET deleted_at = NOW()
WHERE id = ?;
```

**Restore:**
```sql
UPDATE gateway_devices
SET deleted_at = NULL
WHERE id = ?;
```

**Query active devices:**
```sql
SELECT * FROM gateway_devices
WHERE deleted_at IS NULL;
```

**Hard delete (cleanup):**
```sql
DELETE FROM gateway_devices
WHERE deleted_at IS NOT NULL
  AND deleted_at < NOW() - INTERVAL '30 days';
```

## Device Quota System

### Plan-Based Limits

| Plan | max_devices |
|------|-------------|
| free | 1 |
| starter | 2 |
| pro | 10 |
| enterprise | 100+ |

### Enforcement

**Database Trigger:**
- Checks `device_count < max_devices` before INSERT
- Raises exception if quota exceeded

**Application Layer:**
- Check `can_add_device(subscriber_id)` before allowing registration
- Show quota usage in dashboard

### Monitoring

```sql
-- Check quota usage
SELECT
  name,
  device_count,
  max_devices,
  ROUND(device_count::NUMERIC / max_devices * 100, 2) AS usage_percent
FROM subscribers
ORDER BY usage_percent DESC;
```

## Migration Path

### v1.0 (Operator Model) → v2.0 (BYOD Model)

```
┌──────────────────┐
│  Migration 001   │  Add subscriber_id (nullable), indexes, triggers
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Migration 002   │  Assign devices to subscribers
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  Migration 003   │  Make subscriber_id NOT NULL, add views
└──────────────────┘
```

## Data Flow

### Device Registration (BYOD)

```
1. Subscriber → POST /devices/register
                    ↓
2. Backend checks can_add_device(subscriber_id)
                    ↓
3. If allowed: INSERT INTO gateway_devices (subscriber_id, ...)
                    ↓
4. Trigger: device_count++
                    ↓
5. Return device_token to subscriber
```

### Message Dispatch

```
1. Subscriber → POST /messages
                    ↓
2. Backend: INSERT INTO messages (subscriber_id, status='QUEUED')
                    ↓
3. Dispatcher: SELECT * FROM get_available_devices(subscriber_id)
                    ↓
4. Update: messages.gateway_id = selected_device_id, status='DISPATCHED'
                    ↓
5. WebSocket: Send to device
                    ↓
6. Device sends SMS
                    ↓
7. Update: messages.status = 'SENT' / 'DELIVERED'
```

## Security Considerations

### Multi-Tenant Isolation

**All queries MUST filter by subscriber_id:**

```sql
-- GOOD: Filters by subscriber
SELECT * FROM gateway_devices
WHERE subscriber_id = ?;

-- BAD: Exposes all devices
SELECT * FROM gateway_devices;
```

### Cascade Deletes

**When subscriber is deleted:**
- All gateway_devices → CASCADE deleted
- All messages → CASCADE deleted (or SET NULL depending on FK)
- All api_keys → CASCADE deleted

**Rationale:** Subscriber owns all data. When account is deleted, everything goes.

### Soft Delete vs Hard Delete

**Soft delete:** Default behavior for subscriber-facing operations
**Hard delete:** Admin-only, for data cleanup/GDPR compliance

---

**Version:** 1.0
**Date:** April 2, 2026
**Author:** Raj (Database Architect)
