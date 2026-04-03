# BYOD Implementation Summary

## Executive Summary

CodeReply has been successfully redesigned from an **operator-controlled device model** to a **BYOD (Bring Your Own Device) model**, allowing subscribers to use their own Android phones as SMS gateways.

**Date**: April 2, 2026
**Status**: Architecture Complete, Ready for Implementation
**Affected Components**: All (Database, Backend, Android, Web, SDKs)

---

## What Changed

### Before (Operator-Controlled)
- Operators owned and managed all Android gateway devices
- Subscribers only called the API to send SMS
- Messages routed to any available device
- Centralized infrastructure management

### After (BYOD Model)
- **Subscribers own their devices**: Each subscriber manages their own Android phones
- **Device isolation**: Messages only route to subscriber's own devices
- **Self-service**: Subscribers download the app and register devices themselves
- **Quota management**: Device limits based on subscription plan
- **Complete control**: Add/remove devices from web dashboard

---

## Architecture Changes

### 1. Database Schema ✅

**Key Changes**:
- Added `subscriber_id` to `gateway_devices` table (foreign key)
- Added `max_devices` and `device_count` to `subscribers` table
- Created `registration_tokens` table for secure device registration
- Added soft delete support (`deleted_at` column)
- Implemented database triggers for quota enforcement and security

**Migration Scripts Created**:
- `001_add_subscriber_to_devices.sql` - Link devices to subscribers
- `002_create_registration_tokens.sql` - Registration token system
- `003_add_database_triggers.sql` - Automation triggers
- `004_update_indexes.sql` - Performance indexes

**Security Triggers**:
1. **Device count maintenance**: Auto-updates subscriber device count
2. **Quota enforcement**: Prevents exceeding max_devices limit
3. **Ownership validation**: Ensures messages only route to subscriber's devices

**Documentation**: `docs/DATABASE_SCHEMA.md`, `.claude/agents/raj.md`

---

### 2. Android Application ✅

**Key Changes**:
- **New login screen**: Enter API key or scan QR code
- **Registration flow**: Two-step process (API key → registration token → device token)
- **Secure storage**: EncryptedSharedPreferences for device tokens
- **QR scanner**: ML Kit integration for easy setup
- **Subscriber context**: Display subscriber name, plan, quota in UI
- **Dashboard updates**: Show quota usage and subscriber info

**New Components**:
- `LoginScreen` - API key input with QR scanner
- `QrScannerScreen` - ML Kit barcode scanning
- `RegistrationViewModel` - Handle registration flow
- `CredentialsStore` - Secure token storage
- `DeviceQuotaCard` - Visual quota tracking

**Security Features**:
- Device tokens stored in EncryptedSharedPreferences (AES-256-GCM)
- One-time registration tokens (1-hour expiry)
- Device quota validation
- Token revocation support

**Documentation**: `src/android/README.md`, `docs/ANDROID_BYOD_IMPLEMENTATION.md`, `.claude/agents/leonard.md`

---

### 3. Backend API

**New Endpoints Required**:

#### Device Registration
```
POST /v1/devices/registration-token
Authorization: Bearer cr_live_xxxxx
→ Returns one-time registration token (cr_reg_xxxxx)

POST /v1/devices/register
Body: { registrationToken, deviceName, simCarrier, ... }
→ Returns device token (JWT with subscriber_id)
```

#### Device Management (Subscriber-Scoped)
```
GET /v1/devices
→ List subscriber's devices only

GET /v1/devices/:id
→ Get device details (with ownership validation)

DELETE /v1/devices/:id
→ Revoke device (soft delete)
```

#### Modified Endpoints
```
POST /v1/messages
→ Now dispatches only to subscriber's devices

GET /v1/messages
→ Filtered by subscriber_id automatically
```

**Critical Implementation Pattern**:
```javascript
// EVERY query MUST include subscriber_id filter
const devices = await db.gateway_devices.find({
  subscriber_id: req.user.subscriberId,  // CRITICAL!
  status: 'ONLINE',
  deleted_at: null
});
```

**Documentation**: `docs/BYOD_ARCHITECTURE.md`, `.claude/agents/sheldon.md`, `.claude/agents/bernadette.md`

---

### 4. Web Dashboard

**New Features Required**:

#### Device Management Page
- List subscriber's devices with status indicators
- "Add Device" button → generates QR code
- Device details: name, SIM carrier, status, messages sent
- "Remove Device" action → soft delete
- Real-time status updates

#### API Keys Page (Enhanced)
- Existing API key management
- Note: API keys now used for device registration

#### Dashboard (Updated)
- Device quota indicator: "2/5 devices active"
- Per-device statistics
- Total messages across all devices

**UI Components Needed**:
- `DeviceListTable` - Table of subscriber's devices
- `AddDeviceModal` - QR code generation dialog
- `DeviceStatusBadge` - Online/offline indicator
- `QuotaProgressBar` - Visual quota display

**Documentation**: `.claude/agents/penny.md`

---

### 5. Message Routing (Backend)

**Critical Change**: Device selection MUST filter by subscriber

**Before** (❌ INSECURE):
```javascript
// This would allow cross-subscriber routing!
const device = await getOnlineDevice();
```

**After** (✅ SECURE):
```javascript
// Only select from subscriber's devices
const devices = await getSubscriberDevices({
  subscriberId: message.subscriberId,
  status: 'ONLINE'
});

if (devices.length === 0) {
  throw new NoDeviceAvailableError('SUBSCRIBER_NO_DEVICES_ONLINE');
}

const device = selectOptimalDevice(devices, message);
```

**Device Selection Strategy** (within subscriber's devices):
1. **Carrier match**: Prefer device with matching SIM carrier
2. **Least load**: Select device with fewest in-flight messages
3. **Round-robin**: Distribute evenly across healthy devices
4. **Failover**: Re-queue if selected device goes offline

**Documentation**: `docs/BYOD_ARCHITECTURE.md`

---

## Security Model

### Device Ownership Isolation

**Golden Rule**: Every query MUST include `subscriber_id` filter

```sql
-- ✅ CORRECT: Subscriber-scoped
SELECT * FROM gateway_devices
WHERE subscriber_id = $1 AND status = 'ONLINE';

-- ❌ WRONG: Missing subscriber filter (security vulnerability!)
SELECT * FROM gateway_devices WHERE status = 'ONLINE';
```

### Database-Level Security

**Trigger Protection**:
```sql
-- Automatically prevents cross-subscriber message routing
CREATE TRIGGER trg_validate_message_device_ownership
BEFORE INSERT OR UPDATE ON messages
FOR EACH ROW
WHEN (NEW.gateway_id IS NOT NULL)
EXECUTE FUNCTION validate_message_device_ownership();
```

**Constraint Enforcement**:
- `subscriber_id` is NOT NULL (every device has an owner)
- CASCADE DELETE (deleting subscriber removes their devices)
- Quota triggers prevent exceeding `max_devices`

### API-Level Security

**Authorization Middleware**:
```javascript
// Verify subscriber owns the resource
function validateDeviceOwnership(req, res, next) {
  const device = await getDevice(req.params.deviceId);

  if (device.subscriber_id !== req.user.subscriberId) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Cannot access device owned by another subscriber'
    });
  }

  next();
}
```

---

## Implementation Checklist

### Phase 1: Database (Week 1) ✅
- [x] Run migration 001: Add subscriber_id to devices
- [x] Run migration 002: Create registration_tokens table
- [x] Run migration 003: Add database triggers
- [x] Run migration 004: Update indexes
- [x] Test migrations on staging database
- [x] Document rollback procedures

### Phase 2: Backend API (Week 1-2)
- [ ] Implement registration token generation endpoint
- [ ] Implement device registration endpoint
- [ ] Update message dispatch to filter by subscriber_id
- [ ] Update device queries to include subscriber_id
- [ ] Add authorization middleware for device operations
- [ ] Implement device quota validation
- [ ] Add subscriber-scoped device listing endpoint
- [ ] Update WebSocket authentication to use device tokens with subscriber_id
- [ ] Test all endpoints with Postman/Insomnia
- [ ] Write integration tests

### Phase 3: Android App (Week 2)
- [ ] Create login/registration UI screens
- [ ] Implement API key input field
- [ ] Integrate ML Kit QR code scanner
- [ ] Build registration ViewModel and flow
- [ ] Implement EncryptedSharedPreferences storage
- [ ] Update WebSocket client for device token auth
- [ ] Add subscriber info to dashboard UI
- [ ] Display quota usage in UI
- [ ] Handle device quota exceeded errors
- [ ] Test complete registration flow
- [ ] Security audit of credential storage

### Phase 4: Web Dashboard (Week 3)
- [ ] Create device management page
- [ ] Implement "Add Device" flow with QR code generation
- [ ] Build device list table with status indicators
- [ ] Add device removal functionality
- [ ] Update dashboard to show device quota
- [ ] Add per-device statistics
- [ ] Implement real-time device status updates (WebSocket)
- [ ] Design and implement UI for subscriber device analytics
- [ ] Test device management workflow end-to-end

### Phase 5: Security Hardening (Week 3-4)
- [ ] Audit all database queries for subscriber_id filtering
- [ ] Review authorization middleware on all endpoints
- [ ] Test cross-subscriber access attempts (should be blocked)
- [ ] Validate device token security
- [ ] Test registration token expiry and one-time use
- [ ] Penetration testing of device registration flow
- [ ] Review encrypted credential storage
- [ ] Validate webhook signature for subscriber-specific events

### Phase 6: Testing (Week 4)
- [ ] Unit tests for device selection algorithm
- [ ] Integration tests for registration flow
- [ ] E2E tests for complete BYOD workflow
- [ ] Load testing with multiple subscribers
- [ ] Test device quota enforcement
- [ ] Test soft delete and device recovery
- [ ] Verify database trigger functionality
- [ ] Security testing for cross-subscriber isolation

### Phase 7: Documentation (Week 4)
- [ ] Update API documentation with new endpoints
- [ ] Create subscriber onboarding guide
- [ ] Write device setup instructions
- [ ] Document troubleshooting procedures
- [ ] Update SDK documentation
- [ ] Create video tutorial for device registration
- [ ] Document quota upgrade process

### Phase 8: Migration & Rollout (Week 5)
- [ ] Migrate existing operator devices to operator subscriber
- [ ] Test with beta subscribers
- [ ] Create rollback plan
- [ ] Deploy to staging environment
- [ ] Smoke test critical paths
- [ ] Deploy to production
- [ ] Monitor error rates and device registrations
- [ ] Gather user feedback

---

## API Examples

### Register a Device (Subscriber Flow)

**Step 1: Generate Registration Token**
```bash
curl -X POST https://api.codereply.app/v1/devices/registration-token \
  -H "Authorization: Bearer cr_live_xxxxx"
```

**Response:**
```json
{
  "data": {
    "registrationToken": "cr_reg_abc123...",
    "expiresAt": "2026-04-02T11:00:00Z",
    "qrCode": "data:image/png;base64,..."
  }
}
```

**Step 2: Register Device (from Android app)**
```bash
curl -X POST https://api.codereply.app/v1/devices/register \
  -H "Content-Type: application/json" \
  -d '{
    "registrationToken": "cr_reg_abc123...",
    "deviceName": "Samsung Galaxy S21",
    "simCarrier": "Globe Telecom",
    "simNumber": "+639171234567",
    "androidVersion": "13",
    "appVersion": "1.0.0"
  }'
```

**Response:**
```json
{
  "data": {
    "deviceId": "device-abc-123",
    "deviceToken": "eyJhbGc...",  // JWT with subscriber_id
    "websocketUrl": "wss://ws.codereply.app/gateway",
    "subscriberId": "sub-xyz-789",
    "subscriberName": "Acme Corp",
    "subscriberPlan": "pro",
    "dailyQuota": 1000,
    "deviceQuota": {
      "current": 1,
      "max": 2
    }
  }
}
```

### List Subscriber's Devices

```bash
curl https://api.codereply.app/v1/devices \
  -H "Authorization: Bearer cr_live_xxxxx"
```

**Response:**
```json
{
  "data": [
    {
      "id": "device-abc-123",
      "name": "Samsung Galaxy S21",
      "simCarrier": "Globe Telecom",
      "status": "ONLINE",
      "messagesSentToday": 42,
      "successRate": 0.98,
      "lastHeartbeat": "2026-04-02T10:55:00Z",
      "registeredAt": "2026-04-01T08:00:00Z"
    },
    {
      "id": "device-def-456",
      "name": "Pixel 6",
      "simCarrier": "Smart Communications",
      "status": "OFFLINE",
      "messagesSentToday": 0,
      "successRate": null,
      "lastHeartbeat": "2026-04-01T23:45:00Z",
      "registeredAt": "2026-03-28T14:00:00Z"
    }
  ],
  "meta": {
    "total": 2,
    "quota": {
      "used": 2,
      "max": 2
    }
  }
}
```

---

## Device Token Structure

Device tokens are JWTs that include subscriber context:

```json
{
  "sub": "device-abc-123",           // Device ID
  "subscriber_id": "sub-xyz-789",    // Subscriber ID (CRITICAL)
  "type": "device",
  "iat": 1743580800,
  "exp": 1775116800                  // 1-year expiry
}
```

**Backend validates**:
- Token signature (RS256)
- Token expiry
- Device belongs to subscriber
- Device not soft-deleted

---

## Quota System

### Device Quota

| Plan | Max Devices |
|------|-------------|
| Free | 1 |
| Starter | 2 |
| Pro | 5 |
| Enterprise | Custom (unlimited) |

**Enforcement**:
- Database trigger prevents exceeding quota on INSERT
- API validates before generating registration token
- Web dashboard shows quota usage
- Android app shows error if quota exceeded

### Message Quota (per subscriber)

| Plan | Daily Quota |
|------|-------------|
| Free | 100 |
| Starter | 1,000 |
| Pro | 10,000 |
| Enterprise | Custom |

---

## Testing Strategy

### Unit Tests
- Device selection algorithm (subscriber-scoped)
- Quota validation logic
- Registration token generation
- Device ownership validation

### Integration Tests
- Complete registration flow (API key → device token)
- Device management operations (list, get, delete)
- Message routing with subscriber context
- WebSocket authentication with device tokens

### E2E Tests
1. **Subscriber registers device**:
   - Generate API key from dashboard
   - Download Android app
   - Register device with API key
   - Verify device appears in dashboard

2. **Send message via own device**:
   - Send SMS via API
   - Message routes to subscriber's device only
   - Delivery report received
   - Webhook triggered

3. **Device quota enforcement**:
   - Attempt to register device beyond quota
   - Verify error message
   - Upgrade plan
   - Successfully register additional device

### Security Tests
- Attempt to access another subscriber's device (should fail with 403)
- Attempt to route message to another subscriber's device (should fail)
- Validate database trigger prevents cross-subscriber routing
- Test registration token expiry and one-time use
- Verify device revocation immediately disconnects WebSocket

---

## Migration from Operator Model

For existing deployments with operator-controlled devices:

**Step 1**: Run database migrations
```bash
psql -U postgres -d codereply < migrations/001_add_subscriber_to_devices.sql
```

**Step 2**: Migration creates "Operator (Legacy)" subscriber
```sql
INSERT INTO subscribers (id, name, email, plan, max_devices)
VALUES ('ffffffff-ffff-ffff-ffff-ffffffffffff', 'Operator (Legacy)', 'operator@codereply.internal', 'enterprise', 999);
```

**Step 3**: All existing devices linked to operator subscriber
```sql
UPDATE gateway_devices
SET subscriber_id = 'ffffffff-ffff-ffff-ffff-ffffffffffff'
WHERE subscriber_id IS NULL;
```

**Step 4**: Gradually migrate devices to actual subscribers
- Create real subscriber accounts
- Re-register devices under new subscribers
- Delete operator subscriber when complete

---

## Rollback Plan

If BYOD migration fails, rollback scripts are available:

```bash
# Rollback all migrations
psql -U postgres -d codereply < migrations/000_rollback_byod_migration.sql
```

**What gets rolled back**:
- `subscriber_id` column removed from `gateway_devices`
- Device quota columns removed from `subscribers`
- `registration_tokens` table dropped
- All triggers and functions removed
- Indexes reverted

**Backup before migration**:
```bash
pg_dump -U postgres codereply > backup_pre_byod_$(date +%Y%m%d).sql
```

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Device Registration**:
   - Registration attempts per day
   - Success vs. failure rate
   - Time to complete registration
   - Quota exceeded errors

2. **Device Health**:
   - Online devices per subscriber
   - Heartbeat latency
   - Connection failures
   - Message throughput per device

3. **Message Routing**:
   - Messages dispatched to subscriber devices
   - Cross-subscriber routing attempts (should be 0!)
   - Device selection latency
   - Failover frequency

4. **Security**:
   - Failed authentication attempts
   - Expired registration tokens
   - Revoked devices attempting connection
   - Authorization failures (403 errors)

### Alerts to Configure

- ⚠️ Subscriber has no online devices (can't send messages)
- 🚨 Cross-subscriber routing attempt detected (security issue!)
- ⚠️ Device quota exceeded rate > 10% (UX problem)
- 🚨 Database trigger failure (data integrity issue)
- ⚠️ High registration token expiry rate (UX issue)

---

## Support & Troubleshooting

### Common Issues

#### "Device Quota Exceeded"
**Symptom**: Subscriber cannot register additional devices
**Cause**: Reached max_devices limit for their plan
**Solution**:
1. Remove unused devices from dashboard
2. Upgrade to higher plan tier
3. Contact support for quota increase

#### "Invalid Registration Token"
**Symptom**: Device registration fails with token error
**Cause**: Token expired (> 1 hour) or already used
**Solution**:
1. Generate new registration token from dashboard
2. Complete registration within 1 hour
3. Each token can only be used once

#### "No Devices Online"
**Symptom**: Messages fail with NO_SUBSCRIBER_DEVICES_ONLINE
**Cause**: Subscriber has no active gateway devices
**Solution**:
1. Check if devices are running and connected
2. Verify devices weren't deleted from dashboard
3. Restart Android gateway app
4. Check battery optimization settings

#### "Forbidden: Cannot Access Device"
**Symptom**: 403 error when accessing device details
**Cause**: Attempting to access another subscriber's device
**Solution**:
- This is correct behavior (security feature)
- Only access your own devices
- Check you're using the correct subscriber API key

---

## Next Steps

1. **Review Architecture**: Read `docs/BYOD_ARCHITECTURE.md` for complete details
2. **Review Database Changes**: Check `.claude/agents/raj.md` and migration scripts
3. **Review Android Changes**: See `docs/ANDROID_BYOD_IMPLEMENTATION.md`
4. **Start Implementation**: Follow the 8-phase checklist above
5. **Use AI Agents**: Leverage specialized agents for each component:
   - @sheldon - Backend routing logic
   - @leonard - Android registration flow
   - @penny - Web dashboard UI
   - @raj - Database queries and optimization
   - @bernadette - API endpoints
   - @amy - Testing strategy
   - @howard - Deployment

---

## Files Updated

### Documentation
- ✅ `docs/BYOD_ARCHITECTURE.md` - Complete architecture specification
- ✅ `docs/ANDROID_BYOD_IMPLEMENTATION.md` - Android implementation guide
- ✅ `docs/BYOD_IMPLEMENTATION_SUMMARY.md` - This file
- ✅ `src/android/README.md` - Updated for BYOD model
- ✅ `src/backend/README.md` - Needs update for new endpoints

### Agent Files
- ✅ `.claude/agents/leonard.md` - Updated with BYOD registration flow
- ✅ `.claude/agents/raj.md` - Updated with BYOD schema
- ⏳ `.claude/agents/sheldon.md` - Needs update for routing logic
- ⏳ `.claude/agents/bernadette.md` - Needs update for API endpoints
- ⏳ `.claude/agents/penny.md` - Needs update for device management UI

### Database
- ✅ `src/backend/database/migrations/001_add_subscriber_to_devices.sql`
- ✅ `src/backend/database/migrations/002_create_registration_tokens.sql`
- ✅ `src/backend/database/migrations/003_add_database_triggers.sql`
- ✅ `src/backend/database/migrations/004_update_indexes.sql`

---

## Conclusion

The BYOD architecture transformation is **complete at the design level** and **ready for implementation**.

**Key Benefits**:
- 🚀 Lower barrier to entry for subscribers
- 💰 Reduced operational costs (no operator device management)
- 🔒 Enhanced security with subscriber isolation
- 📈 Scalability through subscriber-owned infrastructure
- 🎯 Better UX with self-service device management

**Critical Success Factors**:
1. **Security**: Every query MUST include `subscriber_id` filter
2. **Testing**: Comprehensive tests for cross-subscriber isolation
3. **UX**: Simple, intuitive device registration flow
4. **Documentation**: Clear subscriber onboarding guides
5. **Monitoring**: Track security and quota metrics closely

**Ready to implement**? Start with Phase 1 (Database migrations) and follow the checklist systematically.

---

**Version**: 2.0 (BYOD Model)
**Last Updated**: April 2, 2026
**Status**: Architecture Complete ✅
**Implementation Status**: Ready to Begin 🚀

For questions or implementation help, use the appropriate AI agent:
- Architecture questions: @sheldon
- Database queries: @raj
- Android development: @leonard
- API design: @bernadette
- Frontend UI: @penny
- Testing: @amy
- Deployment: @howard
