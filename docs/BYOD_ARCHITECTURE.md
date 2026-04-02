# BYOD Architecture - Bring Your Own Device Model

**Version:** 1.0.0
**Date:** April 2, 2026
**Status:** Implementation in Progress
**Author:** Sheldon (Backend Architect)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current vs New Architecture](#2-current-vs-new-architecture)
3. [System Architecture Changes](#3-system-architecture-changes)
4. [Device Registration & Authentication](#4-device-registration--authentication)
5. [Message Routing & Dispatch](#5-message-routing--dispatch)
6. [API Endpoint Changes](#6-api-endpoint-changes)
7. [Security Model](#7-security-model)
8. [Database Schema Changes](#8-database-schema-changes)
9. [Multi-Device Support](#9-multi-device-support)
10. [Edge Cases & Error Handling](#10-edge-cases--error-handling)
11. [Implementation Checklist](#11-implementation-checklist)
12. [Migration Strategy](#12-migration-strategy)

---

## 1. Executive Summary

### What is Changing?

CodeReply is transitioning from an **operator-controlled device model** to a **subscriber BYOD (Bring Your Own Device) model**. This architectural shift fundamentally changes device ownership, message routing, and system security.

### Key Changes

| Aspect | Before (Operator Model) | After (BYOD Model) |
|--------|------------------------|-------------------|
| **Device Ownership** | Operator owns all devices | Each subscriber owns their devices |
| **Device Management** | Centralized operator management | Self-service subscriber management |
| **Message Routing** | Route to any available device | Route ONLY to subscriber's devices |
| **Device Registration** | Operator registers devices | Subscriber registers via app download |
| **Security Boundary** | Shared device pool | Isolated device pools per subscriber |
| **Scaling** | Operator adds devices | Subscribers add their own devices |
| **Cost Model** | Operator covers all SIM costs | Subscribers cover their own SIM costs |

### Business Impact

**Benefits:**
- Subscribers have full control over their messaging infrastructure
- Reduced operational costs for operators (no device procurement/management)
- Better message security (no cross-subscriber device access)
- Scalability managed by subscribers themselves
- Predictable per-subscriber device quotas

**Challenges:**
- Subscribers must manage their own Android devices
- More complex onboarding process
- Support burden shifts to helping subscribers with device setup
- Requires robust device authentication and isolation

---

## 2. Current vs New Architecture

### 2.1 Current Architecture (Operator-Controlled)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Subscriber Applications                     │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
│  │ Subscriber│    │ Subscriber│    │ Subscriber│                │
│  │     A     │    │     B     │    │     C     │                │
│  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘                │
└────────┼───────────────┼────────────────┼─────────────────────┘
         │               │                │
         └───────────────┴────────────────┘
                         │ POST /messages
                         │
              ┌──────────▼──────────┐
              │  CodeReply Backend  │
              │                     │
              │   Message Queue     │
              │   ┌──────────────┐  │
              │   │ Dispatcher   │  │
              │   │ (Any Device) │  │
              │   └──────┬───────┘  │
              └──────────┼──────────┘
                         │ WebSocket
         ┌───────────────┼───────────────┐
         │               │               │
    ┌────▼────┐     ┌────▼────┐    ┌────▼────┐
    │ Device  │     │ Device  │    │ Device  │
    │  Pool   │     │  Pool   │    │  Pool   │
    │  (OP)   │     │  (OP)   │    │  (OP)   │
    └─────────┘     └─────────┘    └─────────┘
        SHARED DEVICE POOL - Any message can go to any device
```

**Problems:**
- Subscriber A's message could be sent from Subscriber B's device
- No device isolation between subscribers
- Operator must manage all devices
- Difficult to scale per subscriber

### 2.2 New Architecture (BYOD Model)

```
┌─────────────────────────────────────────────────────────────────┐
│                     Subscriber Applications                     │
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐                 │
│  │ Subscriber│    │ Subscriber│    │ Subscriber│                │
│  │     A     │    │     B     │    │     C     │                │
│  └─────┬─────┘    └─────┬─────┘    └─────┬─────┘                │
└────────┼───────────────┼────────────────┼─────────────────────┘
         │               │                │
         │               │                │ POST /messages
         │               │                │ (with subscriber auth)
         └───────────────┴────────────────┘
                         │
              ┌──────────▼──────────┐
              │  CodeReply Backend  │
              │                     │
              │   Message Queue     │
              │   ┌──────────────┐  │
              │   │ Dispatcher   │  │
              │   │ (Subscriber  │  │
              │   │  Scoped)     │  │
              │   └──────┬───────┘  │
              └──────────┼──────────┘
                         │ WebSocket
         ┌───────────────┼───────────────┐
         │               │               │
         │               │               │
    ┌────▼─────┐    ┌────▼─────┐   ┌────▼─────┐
    │ Sub A    │    │ Sub B    │   │ Sub C    │
    │ Device 1 │    │ Device 1 │   │ Device 1 │
    │ Device 2 │    │ Device 2 │   │          │
    └──────────┘    └──────────┘   └──────────┘

    ISOLATED DEVICE POOLS - Messages only route to subscriber's own devices
```

**Advantages:**
- Complete device isolation per subscriber
- Subscriber A's messages ONLY go to Subscriber A's devices
- Subscribers manage their own devices
- Clear scaling boundaries

---

## 3. System Architecture Changes

### 3.1 Updated System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Subscriber Application                       │
│                                                                     │
│   ┌──────────────────────────────────────────────────────────────┐ │
│   │  Backend Logic                                                │ │
│   │  - Send SMS via CodeReply API                                 │ │
│   │  - Receive webhook callbacks                                  │ │
│   └──────────────────────────────┬───────────────────────────────┘ │
└────────────────────────────────────┼─────────────────────────────────┘
                                     │ HTTPS REST API
                                     │ (with API key / JWT)
                                     │
                      ┌──────────────▼──────────────┐
                      │    CodeReply Backend        │
                      │                             │
                      │  ┌────────────────────────┐ │
                      │  │  API Gateway           │ │
                      │  │  - Auth Middleware     │ │
                      │  │  - Rate Limiting       │ │
                      │  │  - Request Validation  │ │
                      │  └──────────┬─────────────┘ │
                      │             │               │
                      │  ┌──────────▼─────────────┐ │
                      │  │  Message Service       │ │
                      │  │  - Validate message    │ │
                      │  │  - Check quotas        │ │
                      │  │  - Enqueue with        │ │
                      │  │    subscriber_id       │ │
                      │  └──────────┬─────────────┘ │
                      │             │               │
                      │  ┌──────────▼─────────────┐ │
                      │  │  Redis Message Queue   │ │
                      │  │  - Prioritized queues  │ │
                      │  │  - Per-subscriber TTL  │ │
                      │  └──────────┬─────────────┘ │
                      │             │               │
                      │  ┌──────────▼─────────────┐ │
                      │  │  Dispatcher Service    │ │
                      │  │  ┌──────────────────┐  │ │
                      │  │  │ Device Selection │  │ │
                      │  │  │ Algorithm:       │  │ │
                      │  │  │ 1. Filter by     │  │ │
                      │  │  │    subscriber_id │  │ │
                      │  │  │ 2. Online only   │  │ │
                      │  │  │ 3. Least load    │  │ │
                      │  │  └──────────────────┘  │ │
                      │  └──────────┬─────────────┘ │
                      │             │               │
                      │  ┌──────────▼─────────────┐ │
                      │  │  WebSocket Manager     │ │
                      │  │  - Per-device conns    │ │
                      │  │  - Subscriber-scoped   │ │
                      │  └──────────┬─────────────┘ │
                      │             │               │
                      │  ┌──────────▼─────────────┐ │
                      │  │  PostgreSQL Database   │ │
                      │  │  - subscribers         │ │
                      │  │  - gateway_devices     │ │
                      │  │    (subscriber_id FK)  │ │
                      │  │  - messages            │ │
                      │  │    (subscriber_id FK)  │ │
                      │  └────────────────────────┘ │
                      └─────────────┬───────────────┘
                                    │ WebSocket (WSS)
                                    │ (with device token)
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
   ┌──────────▼──────────┐  ┌───────▼────────┐  ┌───────▼────────┐
   │  Subscriber A       │  │ Subscriber A   │  │ Subscriber B   │
   │  Android Device #1  │  │ Device #2      │  │ Device #1      │
   │  (Own SIM)          │  │ (Own SIM)      │  │ (Own SIM)      │
   │                     │  │                │  │                │
   │  ┌───────────────┐  │  │ ┌────────────┐ │  │ ┌────────────┐ │
   │  │ Gateway App   │  │  │ │ Gateway App│ │  │ │ Gateway App│ │
   │  │ - WebSocket   │  │  │ │ - WebSocket│ │  │ │ - WebSocket│ │
   │  │ - SmsManager  │  │  │ │ - SmsManager│ │  │ │ - SmsManager│ │
   │  └───────────────┘  │  │ └────────────┘ │  │ └────────────┘ │
   └─────────┬───────────┘  └────────┬───────┘  └────────┬───────┘
             │                       │                   │
             └───────────────────────┴───────────────────┘
                           │  Physical SMS
                  ┌────────▼──────────┐
                  │   End Users       │
                  │  (SMS Recipients) │
                  └───────────────────┘
```

### 3.2 Core Architectural Principles

1. **Subscriber Isolation**
   - Each subscriber's devices are completely isolated
   - No cross-subscriber device access
   - Database queries always include `WHERE subscriber_id = X`

2. **Device Ownership**
   - Each device belongs to exactly ONE subscriber
   - Foreign key: `gateway_devices.subscriber_id → subscribers.id`
   - Cascade delete: deleting subscriber removes their devices

3. **Message Routing**
   - Messages inherit subscriber_id from API authentication
   - Dispatcher ONLY considers devices with matching subscriber_id
   - No fallback to other subscribers' devices

4. **Multi-Device Support**
   - Subscribers can register multiple devices (quota-limited)
   - Load balancing across subscriber's own devices
   - Redundancy for high availability

---

## 4. Device Registration & Authentication

### 4.1 New Device Registration Flow

```
┌─────────────────┐                                  ┌──────────────────┐
│  Subscriber     │                                  │  CodeReply       │
│  (Web Dashboard)│                                  │  Backend         │
└────────┬────────┘                                  └────────┬─────────┘
         │                                                    │
         │ 1. Login to dashboard                             │
         │────────────────────────────────────────────────────▶
         │                                                    │
         │ 2. Navigate to "Add Device"                       │
         │                                                    │
         │ 3. Click "Generate Registration Token"            │
         │────────────────────────────────────────────────────▶
         │                                                    │
         │                           4. Generate token        │
         │                              - subscriber_id       │
         │                              - expiry: 1 hour      │
         │                              - one-time use        │
         │                                                    │
         │◀───────────────────────────────────────────────────│
         │ 5. Display QR code + token                        │
         │    (cr_reg_xxxxxxxxxxx)                           │
         │                                                    │

┌─────────────────┐                                  ┌──────────────────┐
│  Subscriber's   │                                  │  CodeReply       │
│  Android Device │                                  │  Backend         │
└────────┬────────┘                                  └────────┬─────────┘
         │                                                    │
         │ 6. Download CodeReply Gateway App                 │
         │    (from Play Store / APK)                        │
         │                                                    │
         │ 7. Open app, tap "Register Device"                │
         │                                                    │
         │ 8. Scan QR code / enter token                     │
         │                                                    │
         │ 9. POST /devices/register                         │
         │    {                                               │
         │      registrationToken,                           │
         │      deviceName,                                  │
         │      simCarrier,                                  │
         │      simNumber,                                   │
         │      androidVersion,                              │
         │      appVersion                                   │
         │    }                                               │
         │────────────────────────────────────────────────────▶
         │                                                    │
         │                         10. Validate token         │
         │                             - Not expired?         │
         │                             - Not used?            │
         │                             - Check device quota   │
         │                                                    │
         │                         11. Create device record   │
         │                             - subscriber_id (from  │
         │                               token)               │
         │                             - Generate device JWT  │
         │                             - Store in DB          │
         │                                                    │
         │◀───────────────────────────────────────────────────│
         │ 12. Return device token                           │
         │     {                                              │
         │       deviceId,                                    │
         │       deviceToken: "<JWT>",                        │
         │       websocketUrl                                 │
         │     }                                              │
         │                                                    │
         │ 13. Store device token securely                   │
         │     (EncryptedSharedPreferences)                  │
         │                                                    │
         │ 14. Connect WebSocket                             │
         │     wss://ws.codereply.app/gateway                │
         │     Authorization: Bearer <deviceToken>           │
         │────────────────────────────────────────────────────▶
         │                                                    │
         │                         15. Validate device token  │
         │                             - Verify JWT signature │
         │                             - Extract subscriber_id│
         │                             - Mark device ONLINE   │
         │                                                    │
         │◀───────────────────────────────────────────────────│
         │ 16. WebSocket CONNECTED                           │
         │     { type: "CONNECTED" }                         │
         │                                                    │
         │ 17. Start sending heartbeats (every 30s)          │
         │────────────────────────────────────────────────────▶
         │                                                    │
```

### 4.2 Registration Token System

**Token Generation (Backend):**

```javascript
// POST /api/v1/devices/registration-token
async function generateRegistrationToken(req, res) {
  const subscriberId = req.user.subscriberId; // from JWT

  // Check device quota
  const subscriber = await db.subscribers.findById(subscriberId);
  const deviceCount = await db.gateway_devices.count({
    subscriber_id: subscriberId,
    deleted_at: null
  });

  if (deviceCount >= subscriber.max_devices) {
    return res.status(403).json({
      error: {
        code: 'DEVICE_QUOTA_EXCEEDED',
        message: `You have reached the maximum of ${subscriber.max_devices} devices for your plan.`
      }
    });
  }

  // Generate one-time registration token
  const registrationToken = {
    jti: generateId(), // unique token ID
    sub: subscriberId,
    purpose: 'device_registration',
    exp: Date.now() + 3600000, // 1 hour expiry
    oneTimeUse: true
  };

  const token = jwt.sign(registrationToken, process.env.REGISTRATION_TOKEN_SECRET);

  // Store token in Redis with 1-hour TTL
  await redis.setex(
    `reg_token:${registrationToken.jti}`,
    3600,
    JSON.stringify({ subscriberId, used: false })
  );

  return res.json({
    registrationToken: `cr_reg_${token}`,
    expiresAt: new Date(registrationToken.exp).toISOString(),
    qrCode: generateQRCode(`cr_reg_${token}`)
  });
}
```

**Token Validation (During Device Registration):**

```javascript
// POST /api/v1/devices/register
async function registerDevice(req, res) {
  const { registrationToken, deviceName, simCarrier, simNumber, androidVersion, appVersion } = req.body;

  // Extract and verify token
  const tokenString = registrationToken.replace('cr_reg_', '');
  let decoded;
  try {
    decoded = jwt.verify(tokenString, process.env.REGISTRATION_TOKEN_SECRET);
  } catch (err) {
    return res.status(401).json({
      error: { code: 'INVALID_TOKEN', message: 'Invalid or expired registration token' }
    });
  }

  // Check if token has been used
  const tokenData = await redis.get(`reg_token:${decoded.jti}`);
  if (!tokenData) {
    return res.status(401).json({
      error: { code: 'TOKEN_EXPIRED', message: 'Registration token has expired' }
    });
  }

  const tokenInfo = JSON.parse(tokenData);
  if (tokenInfo.used) {
    return res.status(401).json({
      error: { code: 'TOKEN_ALREADY_USED', message: 'This registration token has already been used' }
    });
  }

  // Mark token as used
  await redis.setex(
    `reg_token:${decoded.jti}`,
    3600,
    JSON.stringify({ ...tokenInfo, used: true })
  );

  // Create device record
  const deviceId = generateId();
  const deviceToken = jwt.sign(
    {
      sub: deviceId,
      subscriber_id: decoded.sub,
      type: 'device',
      exp: Math.floor(Date.now() / 1000) + (365 * 24 * 60 * 60) // 1 year
    },
    process.env.DEVICE_JWT_SECRET
  );

  await db.gateway_devices.create({
    id: deviceId,
    subscriber_id: decoded.sub,
    name: deviceName,
    device_token_hash: hashToken(deviceToken),
    sim_carrier: simCarrier,
    sim_number: simNumber,
    android_version: androidVersion,
    app_version: appVersion,
    status: 'OFFLINE',
    registered_at: new Date()
  });

  return res.status(201).json({
    deviceId,
    deviceToken,
    websocketUrl: process.env.WEBSOCKET_URL
  });
}
```

### 4.3 Device Authentication (WebSocket)

When a device connects to the WebSocket, it must authenticate using its device token:

```javascript
// WebSocket connection handler
wss.on('connection', async (ws, req) => {
  const token = extractTokenFromRequest(req); // from Authorization header or query param

  if (!token) {
    ws.close(4001, 'Missing authentication token');
    return;
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.DEVICE_JWT_SECRET);
  } catch (err) {
    ws.close(4002, 'Invalid token');
    return;
  }

  // Verify device exists and belongs to the subscriber
  const device = await db.gateway_devices.findOne({
    id: decoded.sub,
    subscriber_id: decoded.subscriber_id,
    deleted_at: null
  });

  if (!device) {
    ws.close(4003, 'Device not found or deleted');
    return;
  }

  // Store connection with subscriber context
  wsConnections.set(device.id, {
    ws,
    deviceId: device.id,
    subscriberId: device.subscriber_id,
    lastHeartbeat: Date.now()
  });

  // Update device status
  await db.gateway_devices.update(
    { id: device.id },
    { status: 'ONLINE', last_heartbeat: new Date() }
  );

  ws.send(JSON.stringify({ type: 'CONNECTED', deviceId: device.id }));
});
```

---

## 5. Message Routing & Dispatch

### 5.1 Message Dispatch Flow (BYOD Model)

```
┌──────────────┐
│ Subscriber A │
│ Sends Message│
└──────┬───────┘
       │
       │ POST /messages
       │ { to: "+639171234567", body: "OTP is 123456" }
       │ Authorization: Bearer <subscriber_a_jwt>
       │
       ▼
┌──────────────────────────────────────────┐
│ Message Service                          │
│                                          │
│ 1. Extract subscriber_id from JWT       │
│    → subscriber_id = "sub-a-uuid"       │
│                                          │
│ 2. Validate message                     │
│    - Phone number format                │
│    - Body length                        │
│    - Check daily quota                  │
│                                          │
│ 3. Create message record                │
│    INSERT INTO messages (               │
│      id: "msg-xyz",                     │
│      subscriber_id: "sub-a-uuid",       │
│      to_number: "+639171234567",        │
│      body: "OTP is 123456",             │
│      status: "QUEUED"                   │
│    )                                    │
│                                          │
│ 4. Enqueue to Redis                     │
│    LPUSH queue:messages:sub-a-uuid {    │
│      messageId: "msg-xyz",              │
│      subscriberId: "sub-a-uuid",        │
│      to: "+639171234567",               │
│      body: "OTP is 123456",             │
│      priority: "HIGH"                   │
│    }                                    │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│ Dispatcher Service                       │
│                                          │
│ 1. Dequeue message                      │
│    RPOP queue:messages:sub-a-uuid       │
│    → { messageId, subscriberId, ... }   │
│                                          │
│ 2. Device Selection (CRITICAL)          │
│    SELECT * FROM gateway_devices        │
│    WHERE subscriber_id = 'sub-a-uuid'   │
│      AND status = 'ONLINE'              │
│      AND deleted_at IS NULL             │
│                                          │
│    RESULT:                              │
│    - Device A1 (load: 5 messages)       │
│    - Device A2 (load: 2 messages) ← SELECT THIS
│                                          │
│ 3. Apply load balancing                 │
│    → Select device with lowest load     │
│    → selected_device = "device-a2-uuid" │
│                                          │
│ 4. Update message record                │
│    UPDATE messages                      │
│    SET gateway_id = 'device-a2-uuid',   │
│        status = 'DISPATCHED',           │
│        dispatched_at = NOW()            │
│    WHERE id = 'msg-xyz'                 │
│                                          │
│ 5. Send via WebSocket                   │
│    ws.send({                            │
│      type: "SEND_SMS",                  │
│      messageId: "msg-xyz",              │
│      to: "+639171234567",               │
│      body: "OTP is 123456"              │
│    })                                   │
└──────────────────┬───────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────┐
│ Subscriber A - Device #2                 │
│                                          │
│ 1. Receive WebSocket message            │
│                                          │
│ 2. Send SMS via SmsManager              │
│    smsManager.sendTextMessage(...)      │
│                                          │
│ 3. Report status                        │
│    → SENT (handed to carrier)           │
│    → DELIVERED (carrier confirmed)      │
└──────────────────────────────────────────┘

IMPORTANT: Device selection ALWAYS filters by subscriber_id
           Messages from Subscriber A will NEVER go to Subscriber B's devices
```

### 5.2 Device Selection Algorithm

```javascript
async function selectDeviceForMessage(message) {
  const subscriberId = message.subscriberId;

  // STEP 1: Filter by subscriber_id (CRITICAL for BYOD)
  // Only consider devices owned by this subscriber
  const candidateDevices = await db.gateway_devices.findAll({
    subscriber_id: subscriberId,
    status: 'ONLINE',
    deleted_at: null
  });

  // STEP 2: Handle no devices available
  if (candidateDevices.length === 0) {
    throw new NoDeviceAvailableError(
      `Subscriber ${subscriberId} has no online devices`
    );
  }

  // STEP 3: Get current load for each device
  const devicesWithLoad = await Promise.all(
    candidateDevices.map(async (device) => {
      const inFlightMessages = await redis.get(`device:${device.id}:load`) || 0;
      return {
        device,
        load: parseInt(inFlightMessages, 10)
      };
    })
  );

  // STEP 4: Optional - Carrier matching (if recipient carrier is known)
  // Prefer devices with matching SIM carrier for better delivery rates
  const recipientCarrier = await detectCarrier(message.to);
  const carrierMatches = devicesWithLoad.filter(
    d => d.device.sim_carrier === recipientCarrier
  );

  const selectionPool = carrierMatches.length > 0 ? carrierMatches : devicesWithLoad;

  // STEP 5: Select device with least load
  selectionPool.sort((a, b) => a.load - b.load);
  const selectedDevice = selectionPool[0].device;

  // STEP 6: Increment load counter
  await redis.incr(`device:${selectedDevice.id}:load`);
  await redis.expire(`device:${selectedDevice.id}:load`, 3600); // 1 hour TTL

  return selectedDevice;
}
```

### 5.3 Handling No Devices Online

When a subscriber has no online devices, the system must handle this gracefully:

```javascript
async function dispatchMessage(message) {
  try {
    const device = await selectDeviceForMessage(message);

    // ... dispatch to device via WebSocket

  } catch (error) {
    if (error instanceof NoDeviceAvailableError) {
      // Update message status
      await db.messages.update(
        { id: message.id },
        {
          status: 'FAILED',
          failed_at: new Date(),
          error: 'No online devices available'
        }
      );

      // Notify subscriber via webhook
      await webhookService.send({
        subscriberId: message.subscriberId,
        event: 'message.failed',
        messageId: message.id,
        error: 'NO_DEVICE_AVAILABLE',
        message: 'You have no online gateway devices. Please ensure your device is connected.'
      });

      // Return error to API if synchronous
      throw new ServiceUnavailableError(
        'No online gateway devices available. Please connect a device and retry.'
      );
    }
    throw error;
  }
}
```

**API Response:**

```json
{
  "error": {
    "code": "NO_DEVICE_AVAILABLE",
    "message": "No online gateway devices available. Please ensure your device is connected and online.",
    "status": 503,
    "details": {
      "totalDevices": 2,
      "onlineDevices": 0,
      "helpUrl": "https://docs.codereply.app/troubleshooting/no-devices"
    }
  }
}
```

---

## 6. API Endpoint Changes

### 6.1 Modified Endpoints

#### POST /messages (Send SMS)

**Before (Operator Model):**
```javascript
// subscriber_id extracted from API key
// Any available device selected
POST /v1/messages
Authorization: Bearer <api_key>

{
  "to": "+639171234567",
  "body": "Your OTP is 123456",
  "webhookUrl": "https://myapp.com/webhook"
}
```

**After (BYOD Model):**
```javascript
// subscriber_id extracted from JWT
// ONLY subscriber's devices considered
POST /v1/messages
Authorization: Bearer <jwt_token>

{
  "to": "+639171234567",
  "body": "Your OTP is 123456",
  "webhookUrl": "https://myapp.com/webhook"
}

// Optional: specify a specific device (if subscriber has multiple)
{
  "to": "+639171234567",
  "body": "Your OTP is 123456",
  "preferredDeviceId": "device-a1-uuid", // Optional
  "webhookUrl": "https://myapp.com/webhook"
}
```

**Response includes device info:**
```json
{
  "messageId": "msg-xyz",
  "status": "QUEUED",
  "to": "+639171234567",
  "queuedAt": "2026-04-02T10:00:00Z",
  "estimatedDispatch": "2026-04-02T10:00:02Z",
  "deviceInfo": {
    "deviceId": "device-a2-uuid",
    "deviceName": "My iPhone Gateway",
    "status": "online"
  }
}
```

#### GET /messages (List Messages)

**Before:**
```javascript
// All messages for subscriber (no device filtering)
GET /v1/messages?status=delivered&limit=50
```

**After:**
```javascript
// Can filter by specific device
GET /v1/messages?status=delivered&deviceId=device-a1-uuid&limit=50

// Response includes device info
{
  "messages": [
    {
      "id": "msg-xyz",
      "to": "+639171234567",
      "status": "DELIVERED",
      "sentViaDevice": {
        "id": "device-a1-uuid",
        "name": "My iPhone Gateway"
      }
    }
  ]
}
```

### 6.2 New Endpoints

#### POST /devices/registration-token (Generate Registration Token)

```javascript
POST /v1/devices/registration-token
Authorization: Bearer <subscriber_jwt>

Response 200:
{
  "registrationToken": "cr_reg_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresAt": "2026-04-02T11:00:00Z",
  "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA..."
}

Response 403 (Quota Exceeded):
{
  "error": {
    "code": "DEVICE_QUOTA_EXCEEDED",
    "message": "You have reached the maximum of 2 devices for your plan.",
    "currentDevices": 2,
    "maxDevices": 2,
    "upgradeUrl": "https://app.codereply.com/billing/upgrade"
  }
}
```

#### POST /devices/register (Device Registration - Android App)

```javascript
POST /v1/devices/register
Content-Type: application/json

{
  "registrationToken": "cr_reg_eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "deviceName": "Samsung Galaxy S21",
  "simCarrier": "Globe Telecom",
  "simNumber": "+639171234567",
  "androidVersion": "13",
  "appVersion": "1.0.0"
}

Response 201:
{
  "deviceId": "device-abc-123",
  "deviceToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "websocketUrl": "wss://ws.codereply.app/gateway",
  "subscriberName": "Acme Corp",
  "deviceQuota": {
    "current": 2,
    "max": 2
  }
}
```

#### GET /devices (List Subscriber's Devices)

```javascript
GET /v1/devices
Authorization: Bearer <subscriber_jwt>

Response 200:
{
  "devices": [
    {
      "id": "device-a1-uuid",
      "name": "Samsung Galaxy S21",
      "simCarrier": "Globe Telecom",
      "simNumber": "+639171234567",
      "status": "ONLINE",
      "lastHeartbeat": "2026-04-02T09:59:55Z",
      "registeredAt": "2026-04-01T10:00:00Z",
      "stats": {
        "messagesSentToday": 142,
        "messagesTotal": 1250,
        "successRate": 0.98
      }
    },
    {
      "id": "device-a2-uuid",
      "name": "iPhone 13",
      "simCarrier": "Smart Communications",
      "simNumber": "+639187654321",
      "status": "OFFLINE",
      "lastHeartbeat": "2026-04-02T08:30:00Z",
      "registeredAt": "2026-03-28T14:22:00Z",
      "stats": {
        "messagesSentToday": 0,
        "messagesTotal": 856,
        "successRate": 0.96
      }
    }
  ],
  "quota": {
    "current": 2,
    "max": 2
  }
}
```

#### DELETE /devices/:id (Delete Device)

```javascript
DELETE /v1/devices/device-a1-uuid
Authorization: Bearer <subscriber_jwt>

Response 200:
{
  "message": "Device deleted successfully",
  "deviceId": "device-a1-uuid",
  "deviceName": "Samsung Galaxy S21"
}

Response 403 (Not your device):
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not own this device"
  }
}
```

#### GET /devices/:id/stats (Device Analytics)

```javascript
GET /v1/devices/device-a1-uuid/stats?period=7d
Authorization: Bearer <subscriber_jwt>

Response 200:
{
  "deviceId": "device-a1-uuid",
  "deviceName": "Samsung Galaxy S21",
  "period": "7d",
  "stats": {
    "totalMessages": 1250,
    "delivered": 1225,
    "failed": 25,
    "successRate": 0.98,
    "averageDeliveryTime": 4.2,
    "dailyBreakdown": [
      {
        "date": "2026-04-02",
        "sent": 142,
        "delivered": 140,
        "failed": 2
      }
    ]
  }
}
```

### 6.3 Authorization Changes

All device-related endpoints now require subscriber authentication:

```javascript
// Middleware to verify subscriber owns the device
async function authorizeDeviceAccess(req, res, next) {
  const deviceId = req.params.deviceId;
  const subscriberId = req.user.subscriberId; // from JWT

  const device = await db.gateway_devices.findOne({
    id: deviceId,
    deleted_at: null
  });

  if (!device) {
    return res.status(404).json({
      error: { code: 'DEVICE_NOT_FOUND', message: 'Device not found' }
    });
  }

  if (device.subscriber_id !== subscriberId) {
    return res.status(403).json({
      error: {
        code: 'FORBIDDEN',
        message: 'You do not have permission to access this device'
      }
    });
  }

  req.device = device;
  next();
}

// Apply to routes
router.get('/devices/:deviceId', authenticate, authorizeDeviceAccess, getDeviceStats);
router.delete('/devices/:deviceId', authenticate, authorizeDeviceAccess, deleteDevice);
```

---

## 7. Security Model

### 7.1 Security Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                     Subscriber A                            │
│                                                             │
│  API Keys:  cr_live_xxx...                                  │
│  JWT:       eyJhbGciOiJIUzI1NiI...                          │
│  Devices:   device-a1-uuid, device-a2-uuid                  │
│  Messages:  msg-a1, msg-a2, msg-a3                          │
│                                                             │
│  CANNOT ACCESS:                                             │
│    - Subscriber B's devices                                 │
│    - Subscriber B's messages                                │
│    - Subscriber B's API keys                                │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                     Subscriber B                            │
│                                                             │
│  API Keys:  cr_live_yyy...                                  │
│  JWT:       eyJhbGciOiJIUzI1NiJ...                          │
│  Devices:   device-b1-uuid                                  │
│  Messages:  msg-b1, msg-b2                                  │
│                                                             │
│  CANNOT ACCESS:                                             │
│    - Subscriber A's devices                                 │
│    - Subscriber A's messages                                │
│    - Subscriber A's API keys                                │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Authorization Matrix

| Action | Requires | Authorization Check |
|--------|----------|-------------------|
| Send message | Subscriber JWT | Message inherits subscriber_id from JWT |
| List messages | Subscriber JWT | `WHERE subscriber_id = jwt.sub` |
| View message details | Subscriber JWT | `WHERE id = X AND subscriber_id = jwt.sub` |
| Generate device reg token | Subscriber JWT | Check device quota |
| Register device | Registration token | Token contains subscriber_id |
| List devices | Subscriber JWT | `WHERE subscriber_id = jwt.sub` |
| View device details | Subscriber JWT | `WHERE id = X AND subscriber_id = jwt.sub` |
| Delete device | Subscriber JWT | `WHERE id = X AND subscriber_id = jwt.sub` |
| WebSocket connect | Device token (JWT) | Token contains device_id + subscriber_id |
| Dispatch message to device | Internal | `WHERE device.subscriber_id = message.subscriber_id` |

### 7.3 Preventing Cross-Subscriber Access

**Database Query Pattern:**

```sql
-- ALWAYS include subscriber_id in WHERE clause
-- NEVER query without subscriber_id filter (except admin operations)

-- CORRECT: Get devices for authenticated subscriber
SELECT * FROM gateway_devices
WHERE subscriber_id = $1  -- from JWT
  AND deleted_at IS NULL;

-- INCORRECT: Missing subscriber_id filter (security vulnerability!)
SELECT * FROM gateway_devices
WHERE deleted_at IS NULL;

-- CORRECT: Get message details
SELECT * FROM messages
WHERE id = $1
  AND subscriber_id = $2;  -- CRITICAL: prevents cross-subscriber access

-- INCORRECT: Missing subscriber_id check
SELECT * FROM messages
WHERE id = $1;  -- Subscriber A could access Subscriber B's messages!
```

**ORM/Query Builder Pattern:**

```javascript
// Sequelize example with global scope
class Message extends Model {}
Message.init({
  // ... fields
}, {
  defaultScope: {
    // NEVER use defaultScope for subscriber_id - too risky
  }
});

// ALWAYS explicitly filter by subscriber_id
async function getMessages(subscriberId, filters) {
  return await Message.findAll({
    where: {
      subscriber_id: subscriberId,  // ALWAYS include this
      ...filters
    }
  });
}

// Express middleware to inject subscriber context
function injectSubscriberContext(req, res, next) {
  // Extract from JWT
  req.subscriberId = req.user.subscriberId;

  // Add to all DB queries via request context
  req.dbContext = {
    subscriber_id: req.subscriberId
  };

  next();
}

// Repository pattern
class MessageRepository {
  constructor(subscriberId) {
    this.subscriberId = subscriberId;
  }

  async findById(messageId) {
    return await db.messages.findOne({
      id: messageId,
      subscriber_id: this.subscriberId  // Automatically scoped
    });
  }

  async findAll(filters) {
    return await db.messages.findAll({
      ...filters,
      subscriber_id: this.subscriberId  // Automatically scoped
    });
  }
}
```

### 7.4 Device Token Security

**Device JWT Structure:**

```json
{
  "sub": "device-abc-123",           // Device ID
  "subscriber_id": "sub-xyz-789",    // Subscriber ID (for authorization)
  "type": "device",
  "iat": 1743580800,
  "exp": 1775116800                  // 1 year expiry
}
```

**Token Storage on Android:**

```kotlin
// Use EncryptedSharedPreferences for secure storage
val masterKey = MasterKey.Builder(context)
    .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
    .build()

val encryptedPrefs = EncryptedSharedPreferences.create(
    context,
    "device_credentials",
    masterKey,
    EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
    EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
)

// Store device token
encryptedPrefs.edit()
    .putString("device_token", deviceToken)
    .apply()

// Retrieve for WebSocket connection
val deviceToken = encryptedPrefs.getString("device_token", null)
```

**WebSocket Authentication:**

```javascript
// Server-side WebSocket auth
async function authenticateDevice(token) {
  // Verify JWT
  const decoded = jwt.verify(token, process.env.DEVICE_JWT_SECRET);

  // Validate device exists
  const device = await db.gateway_devices.findOne({
    id: decoded.sub,
    subscriber_id: decoded.subscriber_id,
    deleted_at: null
  });

  if (!device) {
    throw new Error('Device not found or deleted');
  }

  // Check if device is suspended
  const subscriber = await db.subscribers.findById(device.subscriber_id);
  if (subscriber.status === 'SUSPENDED') {
    throw new Error('Subscriber account suspended');
  }

  return {
    deviceId: device.id,
    subscriberId: device.subscriber_id,
    device
  };
}
```

### 7.5 Attack Vectors & Mitigations

| Attack Vector | Description | Mitigation |
|--------------|-------------|------------|
| **Cross-subscriber message access** | Subscriber A tries to access Subscriber B's messages | Always filter queries by `subscriber_id` from JWT |
| **Cross-subscriber device control** | Subscriber A tries to connect to Subscriber B's device | Device token contains `subscriber_id`; validate on WebSocket connect |
| **Device quota bypass** | Register more devices than allowed | Enforce quota via database trigger + application logic |
| **Registration token reuse** | Use same token to register multiple devices | Mark token as used in Redis; validate on each registration |
| **Stolen device token** | Attacker steals device token from Android device | Store in EncryptedSharedPreferences; implement device revocation |
| **Message routing manipulation** | Try to force message to another subscriber's device | Dispatcher ALWAYS filters devices by `message.subscriber_id` |
| **Spoofed WebSocket connection** | Impersonate another device | Verify JWT signature; check device exists and matches subscriber |

---

## 8. Database Schema Changes

### 8.1 Core Schema Modifications

**gateway_devices table (MODIFIED):**

```sql
-- BEFORE (Operator Model)
CREATE TABLE gateway_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  device_token_hash TEXT UNIQUE NOT NULL,
  sim_carrier     TEXT,
  sim_number      TEXT,
  status          TEXT DEFAULT 'OFFLINE',
  last_heartbeat  TIMESTAMPTZ,
  app_version     TEXT,
  android_version TEXT,
  registered_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- AFTER (BYOD Model)
CREATE TABLE gateway_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- NEW: Device ownership
  subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,

  name            TEXT NOT NULL,
  device_token_hash TEXT UNIQUE NOT NULL,
  sim_carrier     TEXT,
  sim_number      TEXT,
  status          TEXT DEFAULT 'OFFLINE',
  last_heartbeat  TIMESTAMPTZ,
  app_version     TEXT,
  android_version TEXT,

  -- NEW: Soft delete support
  deleted_at      TIMESTAMPTZ,

  -- NEW: Usage tracking
  total_messages_sent   INT DEFAULT 0,
  total_messages_failed INT DEFAULT 0,

  registered_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- NEW: Indexes for BYOD queries
CREATE INDEX idx_gateway_devices_subscriber_id ON gateway_devices(subscriber_id);
CREATE INDEX idx_gateway_devices_subscriber_status ON gateway_devices(subscriber_id, status);
CREATE INDEX idx_gateway_devices_subscriber_deleted ON gateway_devices(subscriber_id, deleted_at)
  WHERE deleted_at IS NOT NULL;
```

**subscribers table (MODIFIED):**

```sql
-- BEFORE
CREATE TABLE subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  plan          TEXT DEFAULT 'free',
  daily_quota   INT DEFAULT 100,
  webhook_secret TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- AFTER (with device quotas)
CREATE TABLE subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  plan          TEXT DEFAULT 'free',
  daily_quota   INT DEFAULT 100,

  -- NEW: Device quotas
  max_devices   INT DEFAULT 1,
  device_count  INT DEFAULT 0,

  webhook_secret TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);
```

**registration_tokens table (NEW):**

```sql
CREATE TABLE registration_tokens (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   UUID NOT NULL REFERENCES subscribers(id) ON DELETE CASCADE,
  token_hash      TEXT UNIQUE NOT NULL,
  used            BOOLEAN DEFAULT FALSE,
  used_at         TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_registration_tokens_subscriber_id ON registration_tokens(subscriber_id);
CREATE INDEX idx_registration_tokens_expires_at ON registration_tokens(expires_at);
CREATE INDEX idx_registration_tokens_used ON registration_tokens(used) WHERE used = FALSE;
```

### 8.2 Database Triggers

**Device Count Maintenance:**

```sql
-- See migration file: 001_add_subscriber_to_devices.sql
-- Function: update_subscriber_device_count()
-- Trigger: trg_update_device_count

-- Automatically maintains subscribers.device_count
-- Increments on INSERT, decrements on DELETE/soft-delete
```

**Device Quota Enforcement:**

```sql
-- See migration file: 001_add_subscriber_to_devices.sql
-- Function: check_device_quota()
-- Trigger: trg_check_device_quota

-- Raises exception if device_count >= max_devices
-- Prevents quota bypass at database level
```

### 8.3 Queries to Update

**All queries that reference gateway_devices must be updated:**

```sql
-- OLD: Get all online devices
SELECT * FROM gateway_devices WHERE status = 'ONLINE';

-- NEW: Get online devices for a subscriber
SELECT * FROM gateway_devices
WHERE subscriber_id = $1
  AND status = 'ONLINE'
  AND deleted_at IS NULL;

-- OLD: Select device for message dispatch
SELECT * FROM gateway_devices
WHERE status = 'ONLINE'
ORDER BY RANDOM()
LIMIT 1;

-- NEW: Select device for message (subscriber-scoped)
SELECT * FROM gateway_devices
WHERE subscriber_id = $1
  AND status = 'ONLINE'
  AND deleted_at IS NULL
ORDER BY total_messages_sent ASC  -- Least loaded
LIMIT 1;

-- OLD: Count total devices
SELECT COUNT(*) FROM gateway_devices;

-- NEW: Count subscriber's devices
SELECT COUNT(*) FROM gateway_devices
WHERE subscriber_id = $1
  AND deleted_at IS NULL;
```

---

## 9. Multi-Device Support

### 9.1 Load Balancing Across Subscriber's Devices

When a subscriber has multiple devices, messages should be distributed evenly:

**Load Balancing Strategies:**

1. **Least Load (Default)**
   - Track in-flight messages per device
   - Select device with fewest active messages
   - Best for balanced distribution

2. **Round Robin**
   - Rotate through devices sequentially
   - Simple but doesn't account for device performance

3. **Weighted Distribution**
   - Assign weights based on device performance
   - Faster devices get more messages

**Implementation (Least Load):**

```javascript
async function selectDeviceWithLeastLoad(subscriberId) {
  // Get all online devices for subscriber
  const devices = await db.gateway_devices.findAll({
    subscriber_id: subscriberId,
    status: 'ONLINE',
    deleted_at: null
  });

  if (devices.length === 0) {
    throw new NoDeviceAvailableError();
  }

  // Get current load for each device
  const devicesWithLoad = await Promise.all(
    devices.map(async (device) => {
      const load = await redis.get(`device:${device.id}:load`) || 0;
      return {
        device,
        load: parseInt(load, 10)
      };
    })
  );

  // Sort by load (ascending)
  devicesWithLoad.sort((a, b) => a.load - b.load);

  // Select device with least load
  const selected = devicesWithLoad[0];

  // Increment load counter
  await redis.incr(`device:${selected.device.id}:load`);
  await redis.expire(`device:${selected.device.id}:load`, 3600);

  return selected.device;
}

// Decrement load when message completes
async function onMessageComplete(deviceId, messageId) {
  await redis.decr(`device:${deviceId}:load`);

  // Update message record
  await db.messages.update(
    { id: messageId },
    { status: 'DELIVERED', delivered_at: new Date() }
  );
}
```

### 9.2 Failover Between Subscriber's Devices

If a device goes offline mid-dispatch, fail over to another device:

```javascript
async function dispatchWithFailover(message, maxRetries = 3) {
  let attempt = 0;
  let lastError;

  while (attempt < maxRetries) {
    try {
      // Select device
      const device = await selectDeviceWithLeastLoad(message.subscriberId);

      // Update message record
      await db.messages.update(
        { id: message.id },
        {
          gateway_id: device.id,
          status: 'DISPATCHED',
          dispatched_at: new Date(),
          retry_count: attempt
        }
      );

      // Send via WebSocket
      const ws = wsConnections.get(device.id);
      if (!ws || ws.readyState !== WebSocket.OPEN) {
        // Device went offline between selection and dispatch
        throw new DeviceOfflineError();
      }

      await sendMessageToDevice(ws, message);

      // Success
      return { deviceId: device.id, attempt };

    } catch (error) {
      lastError = error;
      attempt++;

      if (error instanceof DeviceOfflineError) {
        // Try another device
        await sleep(1000 * attempt); // Exponential backoff
        continue;
      }

      if (error instanceof NoDeviceAvailableError) {
        // No devices online - fail immediately
        break;
      }

      throw error;
    }
  }

  // All retries exhausted
  await db.messages.update(
    { id: message.id },
    {
      status: 'FAILED',
      failed_at: new Date(),
      error: `Failed after ${attempt} attempts: ${lastError.message}`
    }
  );

  throw new MessageDispatchFailedError(lastError);
}
```

### 9.3 Device Redundancy Best Practices

**Recommendations for Subscribers:**

1. **Minimum 2 Devices for Production**
   - Primary and backup device
   - Different SIM carriers if possible
   - Geographic diversity (optional)

2. **Monitoring & Alerts**
   - Alert when all devices offline
   - Alert when only 1 device online (no redundancy)
   - Alert on high failure rate

3. **Device Health Checks**
   - Monitor heartbeat frequency
   - Track message success rate per device
   - Auto-disable unhealthy devices

**Health Check Implementation:**

```javascript
// Background job - runs every 5 minutes
async function checkDeviceHealth() {
  const devices = await db.gateway_devices.findAll({
    status: 'ONLINE'
  });

  for (const device of devices) {
    const lastHeartbeat = new Date(device.last_heartbeat);
    const minutesSinceHeartbeat = (Date.now() - lastHeartbeat) / 1000 / 60;

    // Mark as DEGRADED if no heartbeat for 2 minutes
    if (minutesSinceHeartbeat > 2 && minutesSinceHeartbeat < 5) {
      await db.gateway_devices.update(
        { id: device.id },
        { status: 'DEGRADED' }
      );
    }

    // Mark as OFFLINE if no heartbeat for 5 minutes
    if (minutesSinceHeartbeat >= 5) {
      await db.gateway_devices.update(
        { id: device.id },
        { status: 'OFFLINE' }
      );

      // Notify subscriber
      await sendDeviceOfflineAlert(device);
    }
  }
}
```

---

## 10. Edge Cases & Error Handling

### 10.1 Edge Cases

| Edge Case | Handling Strategy |
|-----------|------------------|
| **Subscriber deletes device while message in queue** | Check device still exists before dispatch; fail message if deleted |
| **Subscriber reaches quota mid-registration** | Database trigger prevents insertion; return quota error |
| **Device token stolen** | Implement device revocation endpoint; subscriber can delete device |
| **All subscriber's devices offline** | Return 503 error; queue message with TTL (optional) |
| **Device disconnects during message send** | Re-queue to another device; max 3 retries |
| **Subscriber has 0 devices** | Return 503 with helpful error; link to device setup guide |
| **Registration token used twice** | Check `used` flag in Redis/DB; return error on second use |
| **Two messages sent simultaneously** | Load balancing distributes to different devices (if available) |
| **Device soft-deleted but still connected** | Disconnect WebSocket; mark device as offline |
| **Subscriber account suspended** | Reject API requests; disconnect all devices |

### 10.2 Error Codes & Messages

```javascript
const ErrorCodes = {
  // Device Registration Errors
  DEVICE_QUOTA_EXCEEDED: {
    status: 403,
    message: 'You have reached the maximum number of devices for your plan.',
    action: 'Upgrade your plan or delete an existing device.'
  },

  INVALID_REGISTRATION_TOKEN: {
    status: 401,
    message: 'Invalid or expired registration token.',
    action: 'Generate a new registration token from your dashboard.'
  },

  TOKEN_ALREADY_USED: {
    status: 401,
    message: 'This registration token has already been used.',
    action: 'Generate a new registration token to register another device.'
  },

  // Message Dispatch Errors
  NO_DEVICE_AVAILABLE: {
    status: 503,
    message: 'No online gateway devices available.',
    action: 'Ensure at least one of your devices is connected and online.'
  },

  DEVICE_NOT_FOUND: {
    status: 404,
    message: 'The specified device was not found.',
    action: 'Check the device ID and ensure it belongs to your account.'
  },

  DEVICE_OFFLINE: {
    status: 503,
    message: 'The selected device is offline.',
    action: 'Wait for the device to come online or use a different device.'
  },

  // Authorization Errors
  DEVICE_ACCESS_FORBIDDEN: {
    status: 403,
    message: 'You do not have permission to access this device.',
    action: 'This device belongs to a different subscriber.'
  },

  MESSAGE_ACCESS_FORBIDDEN: {
    status: 403,
    message: 'You do not have permission to access this message.',
    action: 'This message belongs to a different subscriber.'
  }
};
```

### 10.3 Graceful Degradation

**When subscriber has no devices:**

```javascript
app.post('/messages', authenticate, async (req, res) => {
  const subscriberId = req.user.subscriberId;

  // Check if subscriber has any devices
  const deviceCount = await db.gateway_devices.count({
    subscriber_id: subscriberId,
    deleted_at: null
  });

  if (deviceCount === 0) {
    return res.status(503).json({
      error: {
        code: 'NO_DEVICES_CONFIGURED',
        message: 'You have not registered any gateway devices yet.',
        action: 'Register your first device to start sending messages.',
        helpLinks: {
          quickStart: 'https://docs.codereply.app/quickstart',
          androidApp: 'https://play.google.com/store/apps/details?id=app.codereply.gateway',
          videoTutorial: 'https://youtube.com/watch?v=xxx'
        }
      }
    });
  }

  // Check if any devices are online
  const onlineDevices = await db.gateway_devices.count({
    subscriber_id: subscriberId,
    status: 'ONLINE',
    deleted_at: null
  });

  if (onlineDevices === 0) {
    return res.status(503).json({
      error: {
        code: 'NO_DEVICE_ONLINE',
        message: `You have ${deviceCount} device(s) registered, but none are online.`,
        action: 'Open the CodeReply Gateway app on your Android device and ensure it is connected.',
        devices: await getDeviceStatusSummary(subscriberId)
      }
    });
  }

  // Proceed with message dispatch
  // ...
});
```

---

## 11. Implementation Checklist

### Phase 1: Database & Core Backend (Week 1)

- [x] Create migration: Add `subscriber_id` to `gateway_devices`
- [x] Create migration: Add device quotas to `subscribers`
- [x] Create migration: Device count triggers
- [ ] Update all device queries to include `subscriber_id` filter
- [ ] Update message dispatcher to filter devices by `subscriber_id`
- [ ] Add device quota enforcement in application layer
- [ ] Update WebSocket auth to validate device ownership
- [ ] Create registration token generation endpoint
- [ ] Create device registration endpoint

### Phase 2: API Endpoints (Week 1-2)

- [ ] `POST /devices/registration-token` - Generate token
- [ ] `POST /devices/register` - Register device (Android)
- [ ] `GET /devices` - List subscriber's devices
- [ ] `GET /devices/:id` - Get device details
- [ ] `GET /devices/:id/stats` - Device analytics
- [ ] `DELETE /devices/:id` - Delete/revoke device
- [ ] Update `POST /messages` response to include device info
- [ ] Update `GET /messages` to support device filtering
- [ ] Add authorization middleware for device endpoints

### Phase 3: Android App Changes (Week 2)

- [ ] Add registration flow UI
  - [ ] QR code scanner
  - [ ] Manual token input
  - [ ] Device naming
- [ ] Update device registration logic
  - [ ] Use registration token instead of operator-generated token
  - [ ] Store subscriber context
- [ ] Update WebSocket connection
  - [ ] Include device token in auth
  - [ ] Handle subscriber-specific errors
- [ ] Add device management UI
  - [ ] Show subscriber name
  - [ ] Display device quota usage
  - [ ] Show other devices (read-only)

### Phase 4: Web Dashboard (Week 3)

- [ ] Device management page
  - [ ] List all devices
  - [ ] Device status indicators
  - [ ] "Add Device" button → Generate token
  - [ ] QR code display
  - [ ] Device deletion
- [ ] Device analytics dashboard
  - [ ] Messages sent per device
  - [ ] Success rates
  - [ ] Uptime tracking
- [ ] Device quota display
  - [ ] Current vs max devices
  - [ ] Upgrade prompts

### Phase 5: Security Hardening (Week 3-4)

- [ ] Security audit of all queries
  - [ ] Verify `subscriber_id` filtering everywhere
  - [ ] Test cross-subscriber access attempts
  - [ ] Penetration testing
- [ ] Rate limiting per subscriber
- [ ] Device revocation system
- [ ] Suspicious activity detection
  - [ ] Multiple failed auth attempts
  - [ ] Unusual device registration patterns

### Phase 6: Testing (Week 4)

- [ ] Unit tests for device registration flow
- [ ] Unit tests for message routing (subscriber-scoped)
- [ ] Integration tests for multi-device scenarios
- [ ] Security tests (cross-subscriber access)
- [ ] Load tests (multiple subscribers, multiple devices)
- [ ] Failover tests (device goes offline during dispatch)

### Phase 7: Documentation (Week 4)

- [ ] Update API documentation
- [ ] Create device registration guide
- [ ] Create subscriber onboarding guide
- [ ] Create troubleshooting guide
- [ ] Update SDK documentation
- [ ] Create video tutorials

### Phase 8: Migration & Rollout (Week 5)

- [ ] Migrate existing devices to subscribers
  - [ ] Assign devices to appropriate subscribers
  - [ ] Verify all devices have `subscriber_id`
- [ ] Deploy to staging environment
- [ ] Staging smoke tests
- [ ] Deploy to production
- [ ] Monitor for errors
- [ ] Gradual rollout (canary deployment)

---

## 12. Migration Strategy

### 12.1 Data Migration Plan

**Scenario: Existing Production System**

If you have an existing CodeReply deployment with devices, you need to migrate them to the BYOD model:

**Option A: Single Subscriber (Simple)**

All existing devices belong to one subscriber:

```sql
-- 1. Create the main subscriber account
INSERT INTO subscribers (id, name, email, plan, max_devices)
VALUES (
  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  'Main Operator',
  'operator@yourcompany.com',
  'enterprise',
  999
);

-- 2. Assign all devices to this subscriber
UPDATE gateway_devices
SET subscriber_id = 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
WHERE subscriber_id IS NULL;

-- 3. Verify
SELECT COUNT(*) FROM gateway_devices WHERE subscriber_id IS NULL;
-- Should return 0
```

**Option B: Multi-Subscriber (Complex)**

Devices need to be distributed among multiple subscribers:

```sql
-- 1. Create subscriber accounts
INSERT INTO subscribers (name, email, plan, max_devices) VALUES
  ('Acme Corp', 'admin@acme.com', 'pro', 10),
  ('TechStart Inc', 'admin@techstart.com', 'starter', 2),
  ('MegaCorp', 'admin@megacorp.com', 'enterprise', 100);

-- 2. Assign devices manually based on naming or other criteria
UPDATE gateway_devices
SET subscriber_id = (SELECT id FROM subscribers WHERE email = 'admin@acme.com')
WHERE name LIKE 'Acme%';

UPDATE gateway_devices
SET subscriber_id = (SELECT id FROM subscribers WHERE email = 'admin@techstart.com')
WHERE name LIKE 'TechStart%';

-- 3. Handle unassigned devices
-- Option: Create default subscriber for unclaimed devices
-- Or: Review and assign manually
```

**Option C: Fresh Deployment**

No existing devices - start with BYOD from day 1:

```sql
-- No migration needed
-- Subscribers register devices via the app
```

### 12.2 Rollback Plan

If issues arise, you can rollback the BYOD changes:

**Emergency Rollback:**

```sql
-- 1. Make subscriber_id nullable again
ALTER TABLE gateway_devices
ALTER COLUMN subscriber_id DROP NOT NULL;

-- 2. Remove subscriber_id foreign key constraint
ALTER TABLE gateway_devices
DROP CONSTRAINT fk_gateway_devices_subscriber;

-- 3. Revert to old dispatcher logic
-- (Deploy previous backend version)
```

**Note:** Rollback is only safe if no new subscribers have registered devices under the BYOD model.

### 12.3 Testing Migration

**Staging Environment Checklist:**

1. Create test subscribers
2. Register test devices using new flow
3. Send test messages
4. Verify messages only route to correct subscriber's devices
5. Test device deletion
6. Test quota enforcement
7. Test WebSocket authentication
8. Test failover between devices
9. Verify analytics and reporting
10. Performance test with 100+ concurrent subscribers

**Migration Smoke Tests:**

```bash
# Test 1: Register device
curl -X POST https://api-staging.codereply.app/v1/devices/registration-token \
  -H "Authorization: Bearer $SUBSCRIBER_JWT"

# Test 2: List devices
curl -X GET https://api-staging.codereply.app/v1/devices \
  -H "Authorization: Bearer $SUBSCRIBER_JWT"

# Test 3: Send message
curl -X POST https://api-staging.codereply.app/v1/messages \
  -H "Authorization: Bearer $SUBSCRIBER_JWT" \
  -d '{"to": "+639171234567", "body": "Test"}'

# Test 4: Verify cross-subscriber isolation (should fail)
curl -X GET https://api-staging.codereply.app/v1/devices/$OTHER_SUBSCRIBER_DEVICE_ID \
  -H "Authorization: Bearer $SUBSCRIBER_JWT"
# Should return 403 Forbidden
```

---

## 13. Summary

The BYOD architecture represents a fundamental shift in CodeReply's operational model:

**Key Benefits:**
- True multi-tenancy with device isolation
- Subscribers control their own infrastructure
- Reduced operational costs for operators
- Better security boundaries
- Clear scaling model per subscriber

**Key Challenges:**
- More complex onboarding
- Subscriber must manage devices
- Support burden shifts to device setup
- Requires robust authentication

**Critical Implementation Points:**
1. ALWAYS filter database queries by `subscriber_id`
2. Device selection MUST be subscriber-scoped
3. Registration tokens are one-time use
4. Device quotas enforced at DB + application layer
5. WebSocket connections validated against device ownership

**Success Metrics:**
- 100% of queries include `subscriber_id` filter
- Zero cross-subscriber access incidents
- Device registration success rate > 95%
- Message routing accuracy 100%
- Failover time < 5 seconds

---

**Document Version:** 1.0.0
**Last Updated:** April 2, 2026
**Status:** Ready for Implementation
**Next Review:** After Phase 8 completion

---

**Related Documents:**
- `CodeReply_Technical_Document.md` - Original system design
- `/src/backend/database/migrations/001_add_subscriber_to_devices.sql` - Database migration
- `/src/backend/database/migrations/002_migrate_device_ownership.sql` - Data migration
- `docs/API_REFERENCE.md` - API endpoint documentation (to be updated)
- `docs/SECURITY_AUDIT.md` - Security review (to be created)
