# CodeReply BYOD - Implementation TODO

**Project**: CodeReply BYOD (Bring Your Own Device) Architecture
**Version**: 2.0
**Last Updated**: April 3, 2026
**Status**: In Development

---

## 📋 Overview

- **Total Tasks**: 87
- **Completed**: 15 (17%)
- **In Progress**: 7 (8%)
- **Pending**: 65 (75%)

---

## Phase 1: Architecture & Design ✅ COMPLETE

### Documentation
- [x] Create BYOD architecture specification (@sheldon)
- [x] Design database schema for subscriber ownership (@raj)
- [x] Create Android implementation guide (@leonard)
- [x] Write implementation summary document
- [x] Update project README with BYOD model
- [x] Create agent guides for BYOD development

**Status**: ✅ Complete (6/6)

---

## Phase 2: Database 🔄 IN PROGRESS

### Schema Migrations
- [x] Migration 001: Add subscriber_id to gateway_devices (@raj)
- [x] Migration 002: Create registration_tokens table (@raj)
- [x] Migration 003: Add database triggers (@raj)
- [x] Migration 004: Update indexes (@raj)
- [ ] Test migrations on local database
- [ ] Review migration rollback scripts
- [ ] Document migration procedures

**Status**: 🔄 In Progress (4/7)

### Query Optimization
- [x] Design subscriber-scoped query patterns (@raj)
- [ ] Create device selection function (@raj) - IN PROGRESS
- [ ] Create quota check function (@raj) - IN PROGRESS
- [ ] Create performance statistics views (@raj) - IN PROGRESS
- [ ] Benchmark critical queries
- [ ] Document query patterns in DATABASE_QUERIES.md

**Status**: 🔄 In Progress (1/6)

### Seed Data
- [ ] Create development seed data script
- [ ] Create staging seed data script
- [ ] Create test subscriber accounts
- [ ] Create test devices and messages

**Status**: ⏸️ Pending (0/4)

---

## Phase 3: Backend API 🔄 IN PROGRESS

### Authentication & Security
- [x] Design API key authentication flow (@bernadette)
- [ ] Implement API key middleware (@bernadette)
- [ ] Implement JWT generation and validation (@bernadette)
- [ ] Create subscriber context middleware (@sheldon)
- [ ] Implement rate limiting
- [ ] Add request logging with subscriber_id

**Status**: 🔄 In Progress (1/6)

### Device Registration Endpoints
- [ ] POST /v1/devices/registration-token (@bernadette) - IN PROGRESS
  - [ ] Generate one-time registration token
  - [ ] Check device quota
  - [ ] Generate QR code
  - [ ] Return token with expiry
- [ ] POST /v1/devices/register (@bernadette) - IN PROGRESS
  - [ ] Validate registration token
  - [ ] Check token expiry and usage
  - [ ] Create device record
  - [ ] Generate device token (JWT)
  - [ ] Mark token as used
- [ ] Add input validation (Zod/Joi schemas)
- [ ] Add error handling and logging
- [ ] Write API documentation

**Status**: 🔄 In Progress (0/9)

### Device Management Endpoints
- [ ] GET /v1/devices (@bernadette) - IN PROGRESS
  - [ ] List subscriber's devices only
  - [ ] Add filtering (status, carrier)
  - [ ] Include device statistics
  - [ ] Add pagination
- [ ] GET /v1/devices/:id (@bernadette) - IN PROGRESS
  - [ ] Get device details
  - [ ] Validate subscriber ownership
  - [ ] Include performance metrics
- [ ] PATCH /v1/devices/:id (@bernadette)
  - [ ] Update device name/label
  - [ ] Validate subscriber ownership
- [ ] DELETE /v1/devices/:id (@bernadette) - IN PROGRESS
  - [ ] Soft delete device
  - [ ] Disconnect WebSocket
  - [ ] Validate subscriber ownership
  - [ ] Log deletion

**Status**: 🔄 In Progress (0/14)

### Message Routing & Dispatch
- [ ] Update message service (@sheldon) - IN PROGRESS
  - [ ] Add subscriber_id to all message operations
  - [ ] Implement quota checking
  - [ ] Add subscriber context validation
- [ ] Implement device selection service (@sheldon) - IN PROGRESS
  - [ ] Get subscriber's online devices ONLY
  - [ ] Carrier matching algorithm
  - [ ] Least-load balancing
  - [ ] Round-robin distribution
  - [ ] Failover handling
- [ ] Update message dispatcher (@sheldon) - IN PROGRESS
  - [ ] Filter devices by subscriber_id
  - [ ] Validate device ownership before dispatch
  - [ ] Handle "no devices online" scenario
  - [ ] Implement retry logic with subscriber scope
- [ ] Update message queue worker (@sheldon) - IN PROGRESS
  - [ ] Process messages with subscriber context
  - [ ] Dispatch to subscriber's devices only
  - [ ] Handle failures with fallback

**Status**: 🔄 In Progress (0/17)

### WebSocket Server
- [ ] Update WebSocket authentication (@sheldon)
  - [ ] Validate device token (JWT)
  - [ ] Extract subscriber_id from token
  - [ ] Validate device exists and not deleted
- [ ] Update device connection manager (@sheldon)
  - [ ] Track connections by subscriber
  - [ ] Handle device heartbeats
  - [ ] Disconnect revoked devices
- [ ] Update message dispatch via WebSocket (@sheldon)
  - [ ] Validate device ownership before sending
  - [ ] Track in-flight messages per subscriber
  - [ ] Handle delivery reports

**Status**: ⏸️ Pending (0/9)

### Error Handling
- [ ] Define error codes for BYOD scenarios
- [ ] Implement error response format
- [ ] Add error logging with context
- [ ] Create error documentation

**Status**: ⏸️ Pending (0/4)

---

## Phase 4: Android Application 🔄 IN PROGRESS

### Registration UI
- [ ] Create LoginScreen.kt (@leonard) - IN PROGRESS
  - [ ] API key input field
  - [ ] Input validation
  - [ ] "Scan QR Code" button
  - [ ] Backend URL configuration
  - [ ] Loading states
  - [ ] Error display
- [ ] Create QrScannerScreen.kt (@leonard) - IN PROGRESS
  - [ ] ML Kit barcode scanner integration
  - [ ] Camera permission handling
  - [ ] QR code format validation (cr_reg_)
  - [ ] Cancel button
- [ ] Create RegistrationViewModel.kt (@leonard) - IN PROGRESS
  - [ ] API key exchange logic
  - [ ] Device registration logic
  - [ ] State management (Idle, Loading, Success, Error)
  - [ ] Error handling

**Status**: 🔄 In Progress (0/15)

### Data Layer
- [ ] Create CredentialsStore.kt (@leonard) - IN PROGRESS
  - [ ] EncryptedSharedPreferences implementation
  - [ ] Save device token
  - [ ] Save subscriber context
  - [ ] Retrieve credentials
  - [ ] Clear credentials on logout
- [ ] Create ApiClient.kt (@leonard) - IN PROGRESS
  - [ ] Retrofit interface
  - [ ] POST /devices/registration-token
  - [ ] POST /devices/register
  - [ ] Error handling
  - [ ] Request/response models
- [ ] Create DeviceInfoProvider.kt (@leonard) - IN PROGRESS
  - [ ] Collect device metadata
  - [ ] Get SIM information
  - [ ] Handle READ_PHONE_STATE permission
  - [ ] Get Android version

**Status**: 🔄 In Progress (0/13)

### Dashboard UI
- [ ] Update DashboardScreen.kt (@leonard) - IN PROGRESS
  - [ ] Show subscriber name and plan
  - [ ] Display quota usage (progress bar)
  - [ ] Connection status indicator
  - [ ] Device information
  - [ ] Message log
- [ ] Create QuotaUsageCard.kt (@leonard)
  - [ ] Visual progress indicator
  - [ ] Messages sent / daily quota
  - [ ] Warning when approaching limit
- [ ] Create ConnectionStatusCard.kt (@leonard)
  - [ ] Online/offline indicator
  - [ ] Last heartbeat time
  - [ ] Connection quality indicator

**Status**: 🔄 In Progress (0/10)

### WebSocket Client
- [ ] Update GatewayWebSocketClient.kt (@leonard)
  - [ ] Device token authentication
  - [ ] Include subscriber_id in context
  - [ ] Handle connection with new auth
- [ ] Update GatewayService.kt (@leonard)
  - [ ] Display subscriber info in notification
  - [ ] Show quota in notification
  - [ ] Update notification on status change

**Status**: ⏸️ Pending (0/6)

### Dependencies & Configuration
- [ ] Add EncryptedSharedPreferences dependency
- [ ] Add ML Kit Barcode Scanning dependency
- [ ] Update AndroidManifest.xml permissions
- [ ] Configure ProGuard rules

**Status**: ⏸️ Pending (0/4)

---

## Phase 5: Web Dashboard 🔄 IN PROGRESS

### Device Management Pages
- [ ] Create DevicesPage.tsx (@penny) - IN PROGRESS
  - [ ] List subscriber's devices
  - [ ] Device status badges
  - [ ] "Add Device" button
  - [ ] Real-time status updates
  - [ ] Empty state (no devices)
- [ ] Create AddDeviceModal.tsx (@penny) - IN PROGRESS
  - [ ] Generate registration token flow
  - [ ] Display QR code
  - [ ] Show registration token text
  - [ ] Copy to clipboard button
  - [ ] Expiry countdown timer
  - [ ] Setup instructions
- [ ] Create DeviceCard.tsx (@penny) - IN PROGRESS
  - [ ] Device name and status
  - [ ] SIM carrier and number
  - [ ] Messages sent today
  - [ ] Success rate
  - [ ] Last heartbeat
  - [ ] Remove device button
- [ ] Create DeviceDetailsModal.tsx (@penny)
  - [ ] Full device information
  - [ ] Message history per device
  - [ ] Performance charts
  - [ ] Device logs

**Status**: 🔄 In Progress (0/20)

### Components
- [ ] Create DeviceStatusBadge.tsx (@penny) - IN PROGRESS
  - [ ] Online (green)
  - [ ] Offline (gray)
  - [ ] Degraded (orange)
- [ ] Create QuotaIndicator.tsx (@penny) - IN PROGRESS
  - [ ] Progress bar (X/Y devices)
  - [ ] Warning when approaching limit
  - [ ] Upgrade prompt when at limit
- [ ] Create QrCodeDisplay.tsx (@penny) - IN PROGRESS
  - [ ] Generate and display QR code
  - [ ] Download QR code as image
  - [ ] Copy token button

**Status**: 🔄 In Progress (0/9)

### Dashboard Updates
- [ ] Update Dashboard.tsx (@penny)
  - [ ] Add device quota widget
  - [ ] Show "X/Y devices active"
  - [ ] Quick link to add device
- [ ] Update navigation
  - [ ] Add "Devices" menu item
  - [ ] Update routing

**Status**: ⏸️ Pending (0/5)

### API Integration
- [ ] Update API service (@penny)
  - [ ] Add device endpoints
  - [ ] Add registration token generation
  - [ ] Add WebSocket connection for real-time updates
- [ ] Create TypeScript types
  - [ ] Device types
  - [ ] Registration token types
  - [ ] API response types

**Status**: ⏸️ Pending (0/6)

### Styling & UX
- [ ] Design consistent color scheme
- [ ] Add loading states for all actions
- [ ] Implement toast notifications
- [ ] Add confirmation dialogs for destructive actions
- [ ] Ensure responsive design (mobile/tablet/desktop)

**Status**: ⏸️ Pending (0/5)

---

## Phase 6: Testing 🔄 IN PROGRESS

### Unit Tests
- [ ] Backend message dispatcher tests (@amy) - IN PROGRESS
- [ ] Backend device service tests (@amy) - IN PROGRESS
- [ ] Android RegistrationViewModel tests (@amy) - IN PROGRESS
- [ ] Frontend component tests (@amy) - IN PROGRESS
- [ ] Database function tests (@amy) - IN PROGRESS

**Status**: 🔄 In Progress (0/5)

### Integration Tests
- [ ] Device registration flow E2E (@amy) - IN PROGRESS
- [ ] Message routing E2E (@amy) - IN PROGRESS
- [ ] Device management E2E (@amy) - IN PROGRESS
- [ ] Webhook delivery E2E (@amy)

**Status**: 🔄 In Progress (0/4)

### Security Tests
- [ ] Cross-subscriber isolation tests (@amy) - IN PROGRESS
  - [ ] Test subscriber A cannot access subscriber B's devices
  - [ ] Test subscriber A cannot route to subscriber B's devices
  - [ ] Test subscriber A cannot view subscriber B's messages
  - [ ] Test database triggers prevent cross-subscriber routing
- [ ] Device ownership validation tests (@amy) - IN PROGRESS
- [ ] Message routing security tests (@amy) - IN PROGRESS
- [ ] Registration token security tests (@amy) - IN PROGRESS

**Status**: 🔄 In Progress (0/11)

### Performance Tests
- [ ] Load test device selection queries (@amy)
- [ ] Load test message dispatch (@amy)
- [ ] Load test quota checking (@amy)
- [ ] Benchmark subscriber-scoped queries (@amy)

**Status**: ⏸️ Pending (0/4)

### Test Coverage
- [ ] Achieve 80%+ backend test coverage
- [ ] Achieve 80%+ Android test coverage
- [ ] Achieve 60%+ frontend test coverage
- [ ] Generate coverage reports

**Status**: ⏸️ Pending (0/4)

---

## Phase 7: Security & Compliance

### Security Audit
- [ ] Audit all database queries for subscriber_id filtering
- [ ] Review authorization middleware on all endpoints
- [ ] Test cross-subscriber access attempts (should fail with 403)
- [ ] Validate device token security
- [ ] Test registration token expiry and one-time use
- [ ] Review encrypted credential storage (Android)
- [ ] Validate webhook signature implementation

**Status**: ⏸️ Pending (0/7)

### Penetration Testing
- [ ] Test device registration flow for vulnerabilities
- [ ] Test message routing for unauthorized access
- [ ] Test API endpoints for injection attacks
- [ ] Test WebSocket for unauthorized connections
- [ ] Test quota bypass attempts

**Status**: ⏸️ Pending (0/5)

### Compliance
- [ ] Review GDPR compliance (data ownership)
- [ ] Document data retention policies
- [ ] Implement data export functionality
- [ ] Implement data deletion functionality

**Status**: ⏸️ Pending (0/4)

---

## Phase 8: DevOps & Deployment 🔄 IN PROGRESS

### Infrastructure Setup
- [ ] Set up staging environment (@howard) - IN PROGRESS
  - [ ] PostgreSQL database (staging)
  - [ ] Redis instance
  - [ ] Backend API server
  - [ ] WebSocket server
  - [ ] Frontend hosting
- [ ] Configure staging environment variables (@howard) - IN PROGRESS
- [ ] Set up SSL certificates (@howard) - IN PROGRESS
- [ ] Configure CORS (@howard) - IN PROGRESS

**Status**: 🔄 In Progress (0/8)

### CI/CD Pipeline
- [ ] Create GitHub Actions workflow (@howard) - IN PROGRESS
  - [ ] Run tests on every PR
  - [ ] Deploy to staging on merge to develop
  - [ ] Deploy to production on merge to main
- [ ] Set up automated database migrations (@howard) - IN PROGRESS
- [ ] Configure rollback procedures (@howard) - IN PROGRESS

**Status**: 🔄 In Progress (0/5)

### Monitoring & Alerting
- [ ] Set up health check endpoints (@howard) - IN PROGRESS
- [ ] Configure Datadog/BetterStack (@howard) - IN PROGRESS
- [ ] Create alerting rules (@howard) - IN PROGRESS
  - [ ] API downtime > 1 minute
  - [ ] Database connection failures
  - [ ] Cross-subscriber routing attempts (SECURITY!)
  - [ ] High error rate (> 5%)
  - [ ] No devices online for subscriber
- [ ] Set up log aggregation (@howard)
- [ ] Create monitoring dashboard (@howard)

**Status**: 🔄 In Progress (0/10)

### Docker & Orchestration
- [ ] Create production Dockerfile (backend) (@howard)
- [ ] Create production Dockerfile (frontend) (@howard)
- [ ] Create Docker Compose for local dev (@howard) - IN PROGRESS
- [ ] Optimize container images (@howard)

**Status**: 🔄 In Progress (0/4)

### Deployment
- [ ] Deploy to staging environment (@howard) - IN PROGRESS
- [ ] Run smoke tests on staging (@howard)
- [ ] Deploy to production (@howard)
- [ ] Monitor production deployment (@howard)

**Status**: 🔄 In Progress (0/4)

---

## Phase 9: Documentation

### API Documentation
- [ ] Document all new endpoints (OpenAPI/Swagger)
- [ ] Create Postman collection
- [ ] Write API integration guide
- [ ] Document error codes
- [ ] Create webhook documentation

**Status**: ⏸️ Pending (0/5)

### User Documentation
- [ ] Write subscriber onboarding guide
- [ ] Create device setup tutorial
- [ ] Document troubleshooting procedures
- [ ] Create video tutorial for device registration
- [ ] Write FAQ document

**Status**: ⏸️ Pending (0/5)

### Developer Documentation
- [ ] Update contribution guide
- [ ] Document database schema changes
- [ ] Create testing guide
- [ ] Document deployment procedures
- [ ] Write architecture decision records (ADRs)

**Status**: ⏸️ Pending (0/5)

---

## Phase 10: Migration & Rollout

### Data Migration
- [ ] Create migration script for existing operator devices
- [ ] Test migration on staging data
- [ ] Create rollback script
- [ ] Document migration procedures

**Status**: ⏸️ Pending (0/4)

### Beta Testing
- [ ] Invite beta subscribers (5-10 users)
- [ ] Collect feedback
- [ ] Fix critical issues
- [ ] Iterate based on feedback

**Status**: ⏸️ Pending (0/4)

### Production Rollout
- [ ] Final security audit
- [ ] Performance testing under load
- [ ] Deploy to production
- [ ] Monitor error rates
- [ ] Gather user feedback
- [ ] Create post-launch checklist

**Status**: ⏸️ Pending (0/6)

---

## Critical Path Items ⚠️

These items are blocking other work and should be prioritized:

1. **Database Migrations** - Must be completed and tested before backend work
2. **Device Registration API** - Blocks Android app testing
3. **Message Routing Logic** - Core BYOD functionality
4. **Cross-Subscriber Security Tests** - Must validate security model
5. **Staging Deployment** - Needed for integration testing

---

## Known Issues & Blockers 🚧

1. **Agent Spending Caps** - 7 agents paused, will resume at 4am
2. **Migration Testing** - Need local database setup to test migrations
3. **Android Testing** - Need physical device with SIM card for full testing
4. **WebSocket Testing** - Need mock server for development

---

## Quick Reference

### Key Documents
- Architecture: `docs/BYOD_ARCHITECTURE.md`
- Implementation Guide: `docs/BYOD_IMPLEMENTATION_SUMMARY.md`
- Android Guide: `docs/ANDROID_BYOD_IMPLEMENTATION.md`
- Database Schema: `.claude/agents/raj.md`

### Agent Assignments
- @sheldon - Backend routing, WebSocket, message dispatch
- @leonard - Android app (registration, UI, WebSocket client)
- @penny - Web dashboard (device management, UI)
- @raj - Database (migrations, queries, optimization)
- @bernadette - API endpoints (registration, device management)
- @amy - Testing (security, integration, E2E)
- @howard - DevOps (deployment, monitoring, infrastructure)

### Commands
```bash
# Run migrations
npm run migrate

# Start backend dev server
npm run dev

# Start frontend dev server
cd src/web && npm run dev

# Run tests
npm test
npm run test:security
npm run test:integration

# Deploy to staging
npm run deploy:staging
```

---

**Last Updated**: April 3, 2026
**Next Review**: April 10, 2026
**Project Manager**: User (with AI agent assistance)
