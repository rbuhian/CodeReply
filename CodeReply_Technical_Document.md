# CodeReply — Technical Document

**Version:** 2.0.0
**Date:** April 2, 2026
**Audience:** Engineering / Development Team
**Status:** Draft

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Goals & Non-Goals](#2-goals--non-goals)
3. [System Architecture](#3-system-architecture)
4. [Android Gateway App](#4-android-gateway-app)
5. [Backend & API Server](#5-backend--api-server)
6. [Subscriber Integration](#6-subscriber-integration)
7. [Message Queue & Delivery Pipeline](#7-message-queue--delivery-pipeline)
8. [Database Design](#8-database-design)
9. [Security & Authentication](#9-security--authentication)
10. [Deployment & Infrastructure](#10-deployment--infrastructure)
11. [Error Handling & Reliability](#11-error-handling--reliability)
12. [Testing Strategy](#12-testing-strategy)
13. [Billing & Rate Limiting](#13-billing--rate-limiting)
14. [Future Roadmap](#14-future-roadmap)

---

## 1. Project Overview

**CodeReply** is an Android-based SMS gateway platform — a self-hosted, carrier-independent alternative to services like Twilio or AWS SNS. It enables third-party applications (subscribers) to programmatically send SMS messages (such as OTPs, alerts, and notifications) through a physical Android device equipped with a SIM card.

Instead of routing messages through expensive carrier-level APIs, CodeReply leverages the Android device's native SMS capabilities to send messages directly, dramatically reducing cost while maintaining reliability.

### How It Works — Summary

```
Subscriber App  ──▶  CodeReply API  ──▶  Message Queue  ──▶  Android Gateway Device  ──▶  End User (SMS)
                                                                       │
                          Delivery Webhook  ◀──────────────────────────┘
```

1. A **subscriber app** (e.g., a banking or e-commerce app) calls the CodeReply REST API to request an SMS be sent to a phone number.
2. The **CodeReply backend** authenticates the request, queues the message, and pushes it to an available **Android gateway device** via a persistent WebSocket connection.
3. The **Android app** receives the instruction and uses Android's `SmsManager` to physically send the SMS from its SIM card.
4. Delivery status (sent, delivered, failed) is reported back to the backend, which notifies the subscriber app via a **webhook callback**.

### Comparison to Twilio

| Feature | Twilio | CodeReply |
|---|---|---|
| SMS Sending | Carrier-grade infrastructure | Android device + SIM card |
| Cost | Per-message pricing ($0.0079+) | Self-hosted; pay only for SIM plan |
| Setup | Sign up + API key | Deploy backend + register Android device |
| Scalability | Elastic | Scale by adding more Android gateway devices |
| Control | Vendor-managed | Fully self-controlled |
| Compliance | Twilio-managed | Operator is responsible |

---

## 2. Goals & Non-Goals

### Goals

- Allow subscriber apps to send SMS messages via a simple REST API
- Use physical Android devices as SMS gateways (no carrier API dependency)
- Support multiple Android gateway devices per account for redundancy and load balancing
- Provide real-time delivery receipts and webhook callbacks to subscriber apps
- Offer a developer-friendly dashboard for managing devices, subscribers, and message logs
- Support multi-tenancy — multiple subscriber apps with isolated API keys and quotas

### Non-Goals

- CodeReply is **not** a two-way SMS platform in v1.0 (no inbound message handling)
- It does **not** support MMS (multimedia messaging) in v1.0
- It does **not** replace carrier-grade infrastructure for enterprise-scale (millions/day) sending
- It does **not** manage SIM card provisioning — operators manage their own SIM cards
- It is **not** a consumer-facing messaging app

---

## 3. System Architecture

### 3.1 High-Level System Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Subscriber Applications                      │
│                                                                     │
│   ┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐   │
│   │  Banking App │   │  E-Commerce  │   │  Auth / Identity App │   │
│   └──────┬───────┘   └──────┬───────┘   └──────────┬───────────┘   │
└──────────┼─────────────────┼──────────────────────┼───────────────┘
           │                 │  HTTPS REST API       │
           └─────────────────┴──────────┬────────────┘
                                        │
                        ┌───────────────▼────────────────┐
                        │       CodeReply Backend        │
                        │                                │
                        │  ┌────────────┐  ┌──────────┐  │
                        │  │ REST API   │  │ Auth /   │  │
                        │  │ Server     │  │ API Keys │  │
                        │  └─────┬──────┘  └──────────┘  │
                        │        │                        │
                        │  ┌─────▼──────────────────┐    │
                        │  │   Message Queue         │    │
                        │  │   (Redis / BullMQ)      │    │
                        │  └─────┬──────────────────┘    │
                        │        │                        │
                        │  ┌─────▼──────────────────┐    │
                        │  │  WebSocket Manager      │    │
                        │  │  (Device Dispatcher)    │    │
                        │  └─────┬──────────────────┘    │
                        │        │                        │
                        │  ┌─────▼──────────────────┐    │
                        │  │  PostgreSQL Database    │    │
                        │  └────────────────────────┘    │
                        └───────────────┬────────────────┘
                                        │ WebSocket (WSS)
              ┌─────────────────────────┼──────────────────────────┐
              │                         │                          │
   ┌──────────▼──────────┐  ┌───────────▼─────────┐  ┌────────────▼────────┐
   │  Android Gateway #1 │  │ Android Gateway #2  │  │ Android Gateway #N  │
   │  (SIM Card - Net A) │  │ (SIM Card - Net B)  │  │ (SIM Card - Net X)  │
   └──────────┬──────────┘  └───────────┬─────────┘  └────────────┬────────┘
              │                         │                          │
              └─────────────────────────┼──────────────────────────┘
                                        │  Physical SMS
                               ┌────────▼───────┐
                               │   End Users    │
                               │  (Recipients)  │
                               └────────────────┘
```

### 3.2 Technology Stack

| Layer | Technology |
|---|---|
| Android Gateway App | Kotlin, Android SDK (API 26+), SmsManager, WorkManager, OkHttp WebSocket |
| Backend API | Node.js + Express (or Python + FastAPI) |
| Message Queue | Redis + BullMQ |
| Real-time Dispatch | WebSocket (ws / Socket.IO) |
| Database | PostgreSQL |
| Authentication | JWT + API Keys (SHA-256 hashed) |
| Webhooks | HTTPS POST + HMAC-SHA256 signing |
| Caching | Redis |
| CI/CD | GitHub Actions |
| Hosting | AWS / Railway / Render |

---

## 4. Android Gateway App

The Android app is the **physical SMS sender**. It runs on a dedicated Android device with an active SIM card and maintains a persistent connection to the CodeReply backend, awaiting outbound SMS instructions.

### 4.1 Minimum Requirements

| Property | Value |
|---|---|
| Min SDK | API 26 (Android 8.0 Oreo) |
| Target SDK | API 35 (Android 15) |
| Language | Kotlin |
| Architecture | MVVM + Clean Architecture |
| Connection to Backend | WebSocket (WSS) |

### 4.2 Project Structure

```
app/
├── data/
│   ├── local/              # Room DB — message log, device config
│   ├── remote/
│   │   ├── websocket/      # WebSocket client & message handling
│   │   └── api/            # HTTP client for status reporting
│   └── repository/
├── domain/
│   ├── model/              # OutboundMessage, DeliveryReport, DeviceStatus
│   ├── repository/
│   └── usecase/
├── presentation/
│   ├── ui/                 # Dashboard, log screen, settings (Jetpack Compose)
│   └── viewmodel/
├── service/
│   ├── GatewayService.kt   # Foreground service — keeps WebSocket alive
│   └── SmsDispatcher.kt    # Sends SMS via SmsManager
├── receiver/
│   └── SmsDeliveryReceiver.kt  # Receives delivery reports from Android
└── util/
    ├── DeviceInfo.kt       # SIM status, signal strength, device ID
    └── MessageQueue.kt     # Local queue for offline buffering
```

### 4.3 Key Components

#### GatewayService (Foreground Service)

This is the core of the Android app. It runs persistently in the foreground, maintains the WebSocket connection to the CodeReply backend, and processes incoming send instructions.

```kotlin
class GatewayService : Service() {

    private lateinit var webSocketClient: GatewayWebSocketClient

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        startForeground(NOTIFICATION_ID, buildNotification())
        webSocketClient = GatewayWebSocketClient(
            serverUrl = prefs.getServerUrl(),
            deviceToken = prefs.getDeviceToken(),
            onMessageReceived = { message -> handleOutboundRequest(message) }
        )
        webSocketClient.connect()
        return START_STICKY  // Restart if killed by OS
    }

    private fun handleOutboundRequest(message: OutboundMessage) {
        SmsDispatcher.send(
            context = this,
            messageId = message.id,
            recipient = message.to,
            body = message.body,
            onSent = { reportStatus(message.id, "SENT") },
            onDelivered = { reportStatus(message.id, "DELIVERED") },
            onFailed = { error -> reportStatus(message.id, "FAILED", error) }
        )
    }
}
```

#### GatewayWebSocketClient

Manages a persistent, auto-reconnecting WebSocket connection to the backend dispatcher.

**Connection Lifecycle:**
- Connects on app start using a device token (JWT)
- Sends a `DEVICE_ONLINE` heartbeat every 30 seconds
- Auto-reconnects with exponential backoff on disconnect
- Buffers messages locally (Room DB) if connection drops mid-delivery

**Incoming Message Format (from backend):**
```json
{
  "type": "SEND_SMS",
  "messageId": "msg-uuid-1234",
  "to": "+639171234567",
  "body": "Your OTP is 483921. Valid for 5 minutes. Do not share this code.",
  "priority": "HIGH",
  "ttl": 300
}
```

**Outgoing Message Format (to backend):**
```json
{
  "type": "DELIVERY_REPORT",
  "messageId": "msg-uuid-1234",
  "status": "DELIVERED",
  "timestamp": 1743580800000
}
```

#### SmsDispatcher

Uses Android's `SmsManager` API to physically send SMS messages from the device's SIM card.

```kotlin
object SmsDispatcher {

    fun send(
        context: Context,
        messageId: String,
        recipient: String,
        body: String,
        onSent: () -> Unit,
        onDelivered: () -> Unit,
        onFailed: (String) -> Unit
    ) {
        val smsManager = context.getSystemService(SmsManager::class.java)

        val sentIntent = PendingIntent.getBroadcast(
            context, 0,
            Intent("SMS_SENT_$messageId"),
            PendingIntent.FLAG_IMMUTABLE
        )
        val deliveredIntent = PendingIntent.getBroadcast(
            context, 0,
            Intent("SMS_DELIVERED_$messageId"),
            PendingIntent.FLAG_IMMUTABLE
        )

        // Register receivers for delivery tracking
        context.registerReceiver(object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                when (resultCode) {
                    Activity.RESULT_OK -> onSent()
                    else -> onFailed("Send failed: resultCode=$resultCode")
                }
            }
        }, IntentFilter("SMS_SENT_$messageId"))

        context.registerReceiver(object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                onDelivered()
            }
        }, IntentFilter("SMS_DELIVERED_$messageId"))

        // Handle long messages (>160 chars) automatically
        val parts = smsManager.divideMessage(body)
        if (parts.size == 1) {
            smsManager.sendTextMessage(recipient, null, body, sentIntent, deliveredIntent)
        } else {
            smsManager.sendMultipartTextMessage(
                recipient, null, parts,
                arrayListOf(sentIntent), arrayListOf(deliveredIntent)
            )
        }
    }
}
```

#### Device Registration Flow

On first launch, the Android app registers itself with the backend to receive a device token:

```
Android App                         Backend
    │                                   │
    │── POST /devices/register ────────▶│
    │   { deviceName, simInfo,          │
    │     fcmToken, appVersion }        │── Create device record
    │                                   │── Generate device JWT
    │◀── { deviceToken, serverWssUrl } ─│
    │                                   │
    │── WSS Connect (deviceToken) ────▶ │
    │◀── { type: "CONNECTED" } ──────── │
    │                                   │
    │── Heartbeat every 30s ─────────▶  │
```

### 4.4 Local Message Buffer (Room DB)

Messages are buffered locally to prevent loss during temporary connectivity issues.

```kotlin
@Entity(tableName = "outbound_messages")
data class OutboundMessageEntity(
    @PrimaryKey val id: String,
    val to: String,
    val body: String,
    val priority: String,
    val ttl: Int,
    val status: String,       // QUEUED, SENDING, SENT, DELIVERED, FAILED, EXPIRED
    val retryCount: Int = 0,
    val receivedAt: Long,
    val sentAt: Long? = null,
    val deliveredAt: Long? = null,
    val error: String? = null
)
```

### 4.5 Required Permissions

| Permission | Purpose |
|---|---|
| `SEND_SMS` | Core — send SMS messages from the device |
| `INTERNET` | WebSocket connection to backend |
| `FOREGROUND_SERVICE` | Keep GatewayService running |
| `RECEIVE_BOOT_COMPLETED` | Auto-start service after device reboot |
| `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` | Prevent Android from killing the service |
| `POST_NOTIFICATIONS` | Show persistent gateway status notification (API 33+) |
| `READ_PHONE_STATE` | Read SIM card info (carrier, signal) for device registration |

### 4.6 Gateway Dashboard UI

The app UI is minimal and operator-focused:

| Screen | Description |
|---|---|
| **Status Dashboard** | Connection status (Online/Offline), SIM info, messages sent today, success rate |
| **Message Log** | Scrollable list of all processed messages with status and timestamps |
| **Settings** | Backend URL, device name, device token, battery optimization prompt |
| **Diagnostics** | Signal strength, SIM carrier, latency to backend, WebSocket ping |

---

## 5. Backend & API Server

The backend is the central broker. It authenticates subscriber apps, queues outbound SMS requests, dispatches them to available Android gateway devices, and manages delivery reporting and webhooks.

### 5.1 Base URL

```
https://api.codereply.app/v1
```

### 5.2 Core Modules

| Module | Responsibility |
|---|---|
| **Auth Service** | Issue and validate API keys and JWTs for subscribers and devices |
| **Message Service** | Accept SMS send requests, validate, enqueue |
| **Dispatcher** | Pull from queue and push to appropriate gateway device via WebSocket |
| **Delivery Tracker** | Receive delivery reports from devices, update message records |
| **Webhook Service** | Notify subscriber apps of delivery status changes |
| **Device Manager** | Register, monitor, and manage gateway devices |
| **Subscriber Manager** | Manage subscriber accounts, API keys, quotas |

### 5.3 REST API Reference

#### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/auth/token` | Exchange API key for a short-lived JWT |
| `POST` | `/auth/refresh` | Refresh an expired JWT |

**Request — POST `/auth/token`:**
```json
{
  "apiKey": "cr_live_xxxxxxxxxxxxxxxxxxxxxxxx"
}
```

**Response:**
```json
{
  "accessToken": "<JWT>",
  "expiresIn": 3600,
  "tokenType": "Bearer"
}
```

---

#### Messages (Subscriber-Facing)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/messages` | Submit a new outbound SMS request |
| `GET` | `/messages` | List messages (paginated, filterable by status/date) |
| `GET` | `/messages/:id` | Get status and details of a specific message |
| `DELETE` | `/messages/:id` | Cancel a queued message (only if not yet dispatched) |

**Request — POST `/messages`:**
```json
{
  "to": "+639171234567",
  "body": "Your OTP is 483921. Valid for 5 minutes. Do not share this code.",
  "senderId": "device-uuid",
  "webhookUrl": "https://myapp.com/hooks/sms-delivery",
  "metadata": {
    "userId": "user_abc123",
    "purpose": "otp"
  }
}
```

**Response — 202 Accepted:**
```json
{
  "messageId": "msg-uuid-1234",
  "status": "QUEUED",
  "to": "+639171234567",
  "queuedAt": "2026-04-02T10:00:00Z",
  "estimatedDispatch": "2026-04-02T10:00:03Z"
}
```

**Message Status Values:**

| Status | Description |
|---|---|
| `QUEUED` | Accepted and waiting in queue |
| `DISPATCHED` | Sent to Android gateway device |
| `SENT` | Device confirmed SMS handed off to carrier |
| `DELIVERED` | Carrier confirmed delivery to handset |
| `FAILED` | All retry attempts exhausted |
| `EXPIRED` | TTL elapsed before dispatch |
| `CANCELLED` | Cancelled by subscriber before dispatch |

---

#### Devices (Operator-Facing)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/devices/register` | Register a new Android gateway device |
| `GET` | `/devices` | List all registered devices and their status |
| `GET` | `/devices/:id` | Get a specific device's details and stats |
| `PUT` | `/devices/:id` | Update device name or configuration |
| `DELETE` | `/devices/:id` | Deregister a device |

**Response — GET `/devices`:**
```json
{
  "devices": [
    {
      "id": "device-uuid-1",
      "name": "Gateway PH-1",
      "simCarrier": "Globe Telecom",
      "simNumber": "+639171234567",
      "status": "ONLINE",
      "lastHeartbeat": "2026-04-02T09:59:55Z",
      "messagesSentToday": 142,
      "successRate": 0.98
    }
  ]
}
```

---

#### Webhooks

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/webhooks` | List registered webhooks |
| `POST` | `/webhooks` | Register a webhook endpoint |
| `DELETE` | `/webhooks/:id` | Remove a webhook |

**Webhook Delivery Payload (sent to subscriber):**
```json
{
  "event": "message.delivered",
  "messageId": "msg-uuid-1234",
  "to": "+639171234567",
  "status": "DELIVERED",
  "timestamp": "2026-04-02T10:00:08Z",
  "gatewayDeviceId": "device-uuid-1",
  "metadata": {
    "userId": "user_abc123",
    "purpose": "otp"
  }
}
```

All webhook requests include an `X-CodeReply-Signature` header for payload verification:
```
X-CodeReply-Signature: sha256=<HMAC_HEX_DIGEST>
```

---

#### Subscribers (Admin)

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/subscribers` | Create a new subscriber (app registration) |
| `GET` | `/subscribers/:id` | Get subscriber details and usage stats |
| `POST` | `/subscribers/:id/keys` | Generate a new API key |
| `DELETE` | `/subscribers/:id/keys/:keyId` | Revoke an API key |

---

### 5.4 WebSocket Protocol (Backend ↔ Android Device)

The backend maintains a WebSocket server that Android gateway devices connect to.

**Endpoint:**
```
wss://ws.codereply.app/gateway?token=<DEVICE_JWT>
```

**Message Types (Backend → Device):**

| Type | Description |
|---|---|
| `SEND_SMS` | Instruction to send an SMS |
| `CANCEL_SMS` | Cancel a previously queued message |
| `PING` | Heartbeat check |
| `CONFIG_UPDATE` | Push updated device configuration |

**Message Types (Device → Backend):**

| Type | Description |
|---|---|
| `DEVICE_ONLINE` | Device connected and ready |
| `DEVICE_OFFLINE` | Graceful disconnect notification |
| `DELIVERY_REPORT` | Status update for a message |
| `HEARTBEAT` | Periodic keep-alive |
| `DEVICE_STATUS` | SIM info, signal strength, battery level |

---

## 6. Subscriber Integration

### 6.1 Onboarding Flow

1. Operator registers the subscriber app in the CodeReply dashboard
2. An API key is generated (`cr_live_xxxx...`)
3. Subscriber adds CodeReply as an SMS provider in their app
4. Subscriber exchanges API key for JWT on each session
5. Subscriber calls `POST /messages` to send SMS

### 6.2 SDK (Optional Helper Library)

For common languages, a lightweight SDK wraps the REST API:

**JavaScript/Node.js:**
```javascript
const CodeReply = require('@codereply/sdk');

const client = new CodeReply({ apiKey: 'cr_live_xxxxxxxx' });

const message = await client.messages.send({
  to: '+639171234567',
  body: `Your OTP is 483921. Valid for 5 minutes.`,
  webhookUrl: 'https://myapp.com/hooks/sms'
});

console.log(message.messageId); // "msg-uuid-1234"
console.log(message.status);    // "QUEUED"
```

**Python:**
```python
from codereply import CodeReplyClient

client = CodeReplyClient(api_key="cr_live_xxxxxxxx")

message = client.messages.send(
    to="+639171234567",
    body="Your OTP is 483921. Valid for 5 minutes.",
    webhook_url="https://myapp.com/hooks/sms"
)

print(message.message_id)  # "msg-uuid-1234"
print(message.status)      # "QUEUED"
```

**PHP:**
```php
$client = new \CodeReply\Client(['api_key' => 'cr_live_xxxxxxxx']);

$message = $client->messages->send([
    'to'          => '+639171234567',
    'body'        => 'Your OTP is 483921. Valid for 5 minutes.',
    'webhook_url' => 'https://myapp.com/hooks/sms'
]);

echo $message->messageId; // "msg-uuid-1234"
```

### 6.3 Webhook Signature Verification

Subscribers must verify that incoming webhook calls originate from CodeReply:

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(payload))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

---

## 7. Message Queue & Delivery Pipeline

### 7.1 Pipeline Stages

```
POST /messages
     │
     ▼
┌─────────────────────┐
│  Validation         │  Phone number format, body length, subscriber quota
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Persist to DB      │  Save message record with status = QUEUED
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Enqueue (Redis)    │  Push to BullMQ queue with priority & TTL
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Device Selection   │  Pick optimal online gateway device
│  (Dispatcher)       │  (round-robin, least-load, or carrier-match)
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  WebSocket Dispatch │  Push SEND_SMS instruction to selected device
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Delivery Report    │  Device reports SENT / DELIVERED / FAILED
└─────────┬───────────┘
          │
          ▼
┌─────────────────────┐
│  Webhook Notify     │  POST delivery status to subscriber webhook URL
└─────────────────────┘
```

### 7.2 Device Selection Strategy

The dispatcher selects a gateway device based on the following criteria, in order:

1. **Carrier Match** — prefer a device whose SIM matches the recipient's carrier (reduces cross-network fees and improves delivery)
2. **Least Load** — among matching-carrier devices, select the one with the fewest in-flight messages
3. **Round-Robin** — if no carrier match, distribute evenly across all online devices
4. **Failover** — if the selected device goes offline before dispatch, re-queue to another device

### 7.3 TTL and Expiry

Each message carries a `ttl` (time-to-live) in seconds. If the message has not been dispatched within the TTL window, it is marked `EXPIRED` and no SMS is sent. The default TTL is 300 seconds (5 minutes), which is appropriate for OTP use cases.

### 7.4 Retry Policy

If a device reports a `FAILED` status, the message is automatically re-queued with the following backoff:

| Attempt | Delay | Notes |
|---|---|---|
| 1st retry | 15 seconds | Try same device |
| 2nd retry | 60 seconds | Try different device |
| 3rd retry | 5 minutes | Final attempt |
| After 3 failures | Mark `FAILED` | Fire failure webhook |

---

## 8. Database Design

### 8.1 PostgreSQL Schema

#### `subscribers`
```sql
CREATE TABLE subscribers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  plan          TEXT DEFAULT 'free',
  daily_quota   INT DEFAULT 100,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);
```

#### `api_keys`
```sql
CREATE TABLE api_keys (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id   UUID REFERENCES subscribers(id) ON DELETE CASCADE,
  key_hash        TEXT UNIQUE NOT NULL,  -- SHA-256 hash of the actual key
  key_prefix      TEXT NOT NULL,         -- e.g. "cr_live_xxxx" (for display only)
  label           TEXT,
  is_active       BOOLEAN DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);
```

#### `gateway_devices`
```sql
CREATE TABLE gateway_devices (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  device_token    TEXT UNIQUE NOT NULL,   -- Hashed JWT signing secret
  sim_carrier     TEXT,
  sim_number      TEXT,
  status          TEXT DEFAULT 'OFFLINE', -- ONLINE, OFFLINE, DEGRADED
  last_heartbeat  TIMESTAMPTZ,
  app_version     TEXT,
  android_version TEXT,
  registered_at   TIMESTAMPTZ DEFAULT NOW()
);
```

#### `messages`
```sql
CREATE TABLE messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscriber_id    UUID REFERENCES subscribers(id),
  gateway_id       UUID REFERENCES gateway_devices(id),
  to_number        TEXT NOT NULL,
  body             TEXT NOT NULL,
  status           TEXT DEFAULT 'QUEUED',
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
```

#### `webhook_deliveries`
```sql
CREATE TABLE webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id    UUID REFERENCES messages(id),
  url           TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status_code   INT,
  attempt       INT DEFAULT 1,
  delivered_at  TIMESTAMPTZ,
  error         TEXT
);
```

### 8.2 Indexes

```sql
CREATE INDEX idx_messages_subscriber_id  ON messages(subscriber_id);
CREATE INDEX idx_messages_status         ON messages(status);
CREATE INDEX idx_messages_queued_at      ON messages(queued_at DESC);
CREATE INDEX idx_messages_gateway_id     ON messages(gateway_id);
CREATE INDEX idx_gateway_devices_status  ON gateway_devices(status);
```

---

## 9. Security & Authentication

### 9.1 API Key Design

- API keys follow the format: `cr_live_<32-char-random-hex>`
- Only the SHA-256 hash is stored on the server — raw keys are shown once at creation
- Keys are passed in the `Authorization` header or exchanged for a JWT

### 9.2 Device Authentication

Each Android gateway device authenticates using a device token (issued at registration). The token is stored in Android `EncryptedSharedPreferences` (AES-256-GCM) and is used to establish the WebSocket connection.

### 9.3 Transport Security

- All HTTP traffic uses **TLS 1.2+**
- WebSocket connections use **WSS** (WebSocket Secure)
- Android app implements **certificate pinning** on the WebSocket client to prevent MITM attacks

### 9.4 Webhook Security

Webhook payloads are signed using HMAC-SHA256 with a per-subscriber secret:

```
X-CodeReply-Signature: sha256=<HMAC_HEX_DIGEST>
X-CodeReply-Timestamp: 1743580800
```

Subscribers should reject webhooks where the timestamp is more than 5 minutes old to prevent replay attacks.

### 9.5 Phone Number Validation

All `to` numbers are validated using the E.164 format before enqueueing:

- Must match pattern: `^\+[1-9]\d{1,14}$`
- Country code must be in the supported list
- Invalid numbers are rejected with `400 Bad Request` before any processing

### 9.6 Message Body Constraints

| Constraint | Value |
|---|---|
| Max body length | 918 characters (6 SMS segments) |
| Supported encoding | UTF-8 (GSM-7 auto-detected for efficiency) |
| Forbidden content | Validated against spam keyword list (configurable) |

---

## 10. Deployment & Infrastructure

### 10.1 Backend Deployment

**Recommended Stack:**

| Service | Provider |
|---|---|
| App Server | AWS EC2 / Railway / Render |
| Database | AWS RDS PostgreSQL / Supabase |
| Redis | AWS ElastiCache / Upstash |
| WebSocket Server | Same app server (or dedicated ws server) |
| Secrets Management | AWS Secrets Manager / Doppler |
| Monitoring | Datadog / BetterStack |
| Logging | Logtail / Papertrail |

### 10.2 Scaling Strategy

CodeReply scales horizontally at two levels:

**Backend Scaling:**
- Stateless API servers can be scaled behind a load balancer
- WebSocket connections are maintained by a dedicated dispatcher service
- Redis pub/sub coordinates dispatch across multiple backend nodes

**Gateway Scaling:**
- Add more Android devices to increase SMS throughput
- Each device can handle ~50–100 SMS/min (carrier-dependent)
- Devices can be distributed by carrier to optimize delivery rates

### 10.3 Environment Variables

```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:pass@host:5432/codereply
REDIS_URL=redis://host:6379
JWT_SECRET=<RS256_PRIVATE_KEY>
JWT_EXPIRY=3600
DEVICE_JWT_EXPIRY=2592000
API_KEY_HASH_ALGO=sha256
WEBHOOK_SIGNING_SECRET=<random_32_bytes_hex>
MAX_RETRY_ATTEMPTS=3
DEFAULT_MESSAGE_TTL=300
```

### 10.4 Android Device Setup Requirements

For production gateway devices:

- Dedicated Android phone (not a personal device)
- Active SIM card with SMS-enabled plan
- Battery optimization disabled for CodeReply
- Auto-start enabled (vendor-specific setting)
- Stable Wi-Fi or mobile data connection
- Device plugged in (charging) 24/7

---

## 11. Error Handling & Reliability

### 11.1 API Error Response Format

```json
{
  "error": {
    "code": "INVALID_PHONE_NUMBER",
    "message": "The 'to' field must be a valid E.164 phone number.",
    "status": 400,
    "requestId": "req-uuid-5678"
  }
}
```

**Standard Error Codes:**

| Code | HTTP Status | Description |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid API key / JWT |
| `FORBIDDEN` | 403 | Subscriber not allowed to perform this action |
| `INVALID_PHONE_NUMBER` | 400 | Phone number fails E.164 validation |
| `BODY_TOO_LONG` | 400 | Message body exceeds 918-character limit |
| `QUOTA_EXCEEDED` | 429 | Daily message quota reached |
| `RATE_LIMITED` | 429 | Too many requests per second |
| `NO_GATEWAY_AVAILABLE` | 503 | No online gateway device to handle the request |
| `MESSAGE_NOT_FOUND` | 404 | Message ID does not exist |
| `INTERNAL_ERROR` | 500 | Unhandled server error |

### 11.2 No Gateway Available

When no Android device is online, the backend returns `503 Service Unavailable`. Messages are **not** automatically queued indefinitely in this case — the subscriber must retry. This behavior can be overridden with `queueWhenOffline: true` in the request body, in which case the message waits in queue for up to the specified TTL.

### 11.3 Delivery Guarantee

CodeReply provides **at-least-once delivery** semantics:

- Messages are persisted to PostgreSQL before being pushed to Redis
- If the backend crashes after enqueue but before dispatch, messages are recovered on restart
- If a device disconnects after receiving but before sending, the message is re-queued

---

## 12. Testing Strategy

### 12.1 Android Testing

| Test Type | Tool | Target Coverage |
|---|---|---|
| Unit Tests | JUnit 5, MockK | Domain & use case layer — 80%+ |
| Integration Tests | Robolectric | Repository & Room DAO |
| Service Tests | Robolectric | GatewayService lifecycle |
| SMS Dispatcher Tests | Mock SmsManager | Send/failure scenarios |
| WebSocket Tests | MockWebServer (OkHttp) | Connection, reconnect, message parsing |

### 12.2 Backend Testing

| Test Type | Tool | Target Coverage |
|---|---|---|
| Unit Tests | Jest / Pytest | Business logic — 80%+ |
| API Integration Tests | Supertest / HTTPX | All REST endpoints |
| Queue Tests | BullMQ test harness | Enqueue, dequeue, retry |
| WebSocket Tests | ws test client | Device connection & dispatch |
| DB Tests | Testcontainers (PostgreSQL) | All repository methods |
| Load Tests | k6 | `POST /messages` — 500 RPS target |

### 12.3 End-to-End Testing

A test mode allows end-to-end verification without sending real SMS:

- Set `"testMode": true` in the message request
- The system processes the message through the full pipeline
- The gateway device intercepts the instruction and reports `SENT` without calling `SmsManager`
- Useful for CI/CD pipeline integration tests

---

## 13. Billing & Rate Limiting

### 13.1 Plans

| Plan | Messages/Day | Devices | API Keys | Webhooks |
|---|---|---|---|---|
| **Free** | 100 | 1 | 1 | 1 |
| **Starter** | 1,000 | 2 | 3 | 5 |
| **Pro** | 10,000 | 10 | 10 | Unlimited |
| **Enterprise** | Custom | Custom | Custom | Custom |

### 13.2 Rate Limit Headers

Every API response includes:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 857
X-RateLimit-Reset: 1743624000
X-RateLimit-Window: daily
```

### 13.3 Per-Second Burst Limit

To protect gateway devices from being overwhelmed:

- Free / Starter: 5 messages/second per subscriber
- Pro: 50 messages/second per subscriber
- Enterprise: Negotiated

---

## 14. Future Roadmap

| Version | Feature |
|---|---|
| **v1.1** | Inbound SMS support (receive and forward SMS to subscriber via webhook) |
| **v1.2** | Multi-SIM device support (dual-SIM Android phones as gateways) |
| **v1.3** | Carrier-aware routing with automatic failover |
| **v1.4** | Web dashboard for subscribers (message logs, analytics, webhook config) |
| **v2.0** | Official SDKs for Node.js, Python, PHP, Java, and Go |
| **v2.1** | Self-hosted deployment package (Docker Compose for the backend) |
| **v2.2** | USSD support |
| **v2.3** | WhatsApp Business API as an optional fallback channel |

---

## Appendix A — Glossary

| Term | Definition |
|---|---|
| **Gateway Device** | A physical Android phone with a SIM card that physically sends SMS messages |
| **Subscriber** | A third-party application that integrates with CodeReply to send SMS |
| **Dispatcher** | The backend component that routes queued messages to available gateway devices |
| **TTL** | Time-to-live — how long a message waits before being discarded if undelivered |
| **E.164** | International phone number format standard (e.g., +639171234567) |
| **HMAC** | Hash-based Message Authentication Code — used for webhook signing |
| **BullMQ** | A Redis-based message queue for Node.js |
| **WSS** | WebSocket Secure — encrypted WebSocket connection |
| **SmsManager** | Android system API used to programmatically send SMS messages |

---

## Appendix B — References

- [Android SmsManager API](https://developer.android.com/reference/android/telephony/SmsManager)
- [Android Foreground Services](https://developer.android.com/guide/components/foreground-services)
- [BullMQ Documentation](https://docs.bullmq.io/)
- [E.164 Phone Number Format](https://www.itu.int/rec/T-REC-E.164/)
- [OWASP Mobile Security Testing Guide](https://owasp.org/www-project-mobile-security-testing-guide/)
- [Google Play SMS Permission Policy](https://support.google.com/googleplay/android-developer/answer/9047303)
- [Twilio SMS API (reference)](https://www.twilio.com/docs/sms/api)

---

*CodeReply Technical Document — v2.0.0 — Confidential & Internal Use Only*
