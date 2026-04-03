# CodeReply

> An Android-based SMS gateway platform — a self-hosted, cost-effective alternative to Twilio

## Overview

CodeReply enables third-party applications to send SMS messages programmatically through physical Android devices with SIM cards. Instead of expensive carrier-level APIs, leverage Android's native SMS capabilities for dramatically reduced costs.

**NEW**: Now with **BYOD (Bring Your Own Device)** architecture - subscribers can use their own Android phones as SMS gateways!

## Quick Links

- **📋 TODO Tracker**: [docs/TODO.md](docs/TODO.md) - Track all features and implementation status
- **Technical Specification**: [CodeReply_Technical_Document.md](CodeReply_Technical_Document.md)
- **BYOD Architecture**: [docs/BYOD_ARCHITECTURE.md](docs/BYOD_ARCHITECTURE.md)
- **Implementation Summary**: [docs/BYOD_IMPLEMENTATION_SUMMARY.md](docs/BYOD_IMPLEMENTATION_SUMMARY.md)
- **Project Overview**: [docs/PROJECT_OVERVIEW.md](docs/PROJECT_OVERVIEW.md)
- **Development Guide**: [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)
- **AI Agents Guide**: [docs/AGENTS_README.md](docs/AGENTS_README.md)

## Architecture

```
Subscriber App → REST API → Message Queue → WebSocket → Android Gateway → SMS
                    ↓                                          ↓
                Database                              Delivery Report
                                                             ↓
                                                        Webhook
```

### Components

1. **Backend Server** (Node.js/Python)
   - REST API for message sending
   - WebSocket server for device communication
   - Redis + BullMQ message queue
   - PostgreSQL database
   - Webhook delivery system

2. **Android Gateway** (Kotlin)
   - Foreground service with persistent WebSocket
   - SMS sending via Android SmsManager
   - Delivery tracking and reporting
   - Local message buffering (Room DB)

3. **Web Dashboard** (React)
   - Subscriber interface for monitoring
   - Device management (add/remove devices)
   - Real-time analytics and reporting

## BYOD Model (v2.0)

### What Changed

**Before (Operator-Controlled)**:
- Operators owned all gateway devices
- Subscribers only called the API

**After (BYOD)**:
- **Subscribers own their devices**: Download the app, register with API key
- **Device isolation**: Messages only route to subscriber's own devices
- **Self-service**: Complete control over device management
- **Quota-based**: Device limits based on subscription plan

### Quick Start for Subscribers

1. **Get your API key** from the web dashboard
2. **Download** the CodeReply Gateway app on your Android phone
3. **Register** your device:
   - Scan QR code from dashboard, or
   - Enter API key manually
4. **Start sending** SMS via the API!

## Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend | Node.js/Express or Python/FastAPI |
| Database | PostgreSQL 15+ |
| Queue | Redis + BullMQ |
| Android | Kotlin, Jetpack Compose, MVVM |
| Frontend | React + TypeScript, Tailwind CSS |
| WebSocket | ws / Socket.IO |
| Auth | JWT + API Keys |

## Project Structure

```
CodeReply/
├── .claude/
│   └── agents/              # AI development agents (Big Bang Theory themed)
│       ├── sheldon.md       # Backend architect
│       ├── leonard.md       # Android developer
│       ├── penny.md         # Frontend developer
│       ├── howard.md        # DevOps engineer
│       ├── raj.md           # Database architect
│       ├── amy.md           # QA engineer
│       └── bernadette.md    # API integration specialist
├── docs/
│   ├── TODO.md              # 📋 Complete feature tracking
│   ├── AGENTS_README.md     # Guide to using AI agents
│   ├── PROJECT_OVERVIEW.md  # Project overview
│   ├── DEVELOPMENT_GUIDE.md # Development setup guide
│   ├── BYOD_ARCHITECTURE.md # BYOD system architecture
│   ├── BYOD_IMPLEMENTATION_SUMMARY.md # Implementation roadmap
│   └── ANDROID_BYOD_IMPLEMENTATION.md # Android implementation guide
├── src/
│   ├── backend/             # Backend API server
│   ├── android/             # Android gateway app
│   ├── web/                 # Web dashboard
│   └── sdk/                 # Client SDKs (Node.js, Python, PHP)
└── CodeReply_Technical_Document.md
```

## Implementation Status

**Version**: 2.0 (BYOD Model)
**Status**: 🔄 In Development

### Progress Overview

- **Total Tasks**: 87
- **Completed**: 15 (17%) ✅
- **In Progress**: 7 (8%) 🔄
- **Pending**: 65 (75%) ⏸️

See [docs/TODO.md](docs/TODO.md) for detailed task tracking.

### Current Phase

**Phase 2-3**: Database & Backend API Implementation
- Database migrations created ✅
- Backend API in progress 🔄
- Android app in progress 🔄
- Web dashboard in progress 🔄

## Getting Started

### For Developers

1. **Read the documentation**
   - Start with [CodeReply_Technical_Document.md](CodeReply_Technical_Document.md)
   - Review [docs/DEVELOPMENT_GUIDE.md](docs/DEVELOPMENT_GUIDE.md)
   - Check [docs/TODO.md](docs/TODO.md) for current status

2. **Set up your environment**
   ```bash
   # Backend
   cd src/backend
   npm install  # or pip install -r requirements.txt

   # Frontend
   cd src/web
   npm install

   # Android
   # Open src/android in Android Studio
   ```

3. **Use AI Agents for development**
   - See [docs/AGENTS_README.md](docs/AGENTS_README.md)
   - Each agent specializes in different aspects of the project

### For Operators

1. **Deploy the backend**
   - Follow deployment guide in `docs/DEVELOPMENT_GUIDE.md`

2. **Set up Android gateway device**
   - Install the Android app on a device with SIM card
   - Register device with backend
   - Configure and start the gateway service

3. **Create subscriber accounts**
   - Use the web dashboard to create subscribers
   - Generate API keys
   - Configure webhooks

## AI Development Agents

CodeReply uses specialized AI agents for development assistance:

| Agent | Role | Expertise |
|-------|------|-----------|
| **Sheldon** | Backend Architect | Node.js/Python, WebSocket, message queues |
| **Leonard** | Android Developer | Kotlin, MVVM, SMS integration |
| **Penny** | Frontend Developer | React, UI/UX, dashboards |
| **Howard** | DevOps Engineer | Docker, CI/CD, infrastructure |
| **Raj** | Database Architect | PostgreSQL, optimization, analytics |
| **Amy** | QA Engineer | Testing strategy, unit/integration tests |
| **Bernadette** | API Specialist | REST API, SDKs, webhooks |

### Using Agents

Simply mention an agent to get help:

```
@sheldon implement the message routing with subscriber filtering
@leonard create the Android registration UI
@penny design the device management dashboard
@raj optimize these subscriber-scoped database queries
@bernadette build the device registration API endpoints
@amy write tests for cross-subscriber isolation
@howard deploy the BYOD system to staging
```

See [docs/AGENTS_README.md](docs/AGENTS_README.md) for detailed guidance.

## API Example

### Send an SMS

```bash
curl -X POST https://api.codereply.app/v1/messages \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+639171234567",
    "body": "Your OTP is 123456. Valid for 5 minutes.",
    "webhookUrl": "https://yourapp.com/webhook"
  }'
```

### Response

```json
{
  "data": {
    "messageId": "msg-uuid-1234",
    "status": "QUEUED",
    "to": "+639171234567",
    "queuedAt": "2026-04-02T10:00:00Z",
    "estimatedDispatch": "2026-04-02T10:00:03Z"
  }
}
```

## SDK Usage

### Node.js

```typescript
import { CodeReplyClient } from '@codereply/sdk';

const client = new CodeReplyClient({ apiKey: 'cr_live_xxxx' });

const message = await client.messages.send({
  to: '+639171234567',
  body: 'Your OTP is 123456'
});
```

### Python

```python
from codereply import CodeReplyClient

client = CodeReplyClient(api_key='cr_live_xxxx')

message = client.messages.send(
    to='+639171234567',
    body='Your OTP is 123456'
)
```

### PHP

```php
$client = new \CodeReply\Client(['api_key' => 'cr_live_xxxx']);

$message = $client->messages->send([
    'to' => '+639171234567',
    'body' => 'Your OTP is 123456'
]);
```

## Key Features

### Current (MVP)
- ✅ REST API for sending SMS
- ✅ BYOD architecture with subscriber-owned devices
- ✅ Device registration with QR codes
- ✅ Subscriber-scoped message routing
- ✅ Device quota management
- 🔄 Web dashboard (in progress)
- 🔄 Android gateway app (in progress)

### Future Roadmap
- Inbound SMS support
- Multi-SIM device support
- USSD support
- WhatsApp Business integration
- Advanced analytics

## Benefits Over Twilio

| Feature | Twilio | CodeReply |
|---------|--------|-----------|
| Cost | $0.0079+ per message | SIM plan only |
| Setup | Sign up + API key | Self-hosted deployment |
| Control | Vendor-managed | Fully self-controlled |
| Scalability | Elastic | Add more devices |
| Device Ownership | Twilio infrastructure | Your own phones (BYOD) |

## Security

- TLS/SSL for all connections (HTTPS, WSS)
- JWT + API key authentication
- HMAC-SHA256 webhook signing
- Phone number validation (E.164)
- Rate limiting and quotas
- Encrypted secrets storage
- **Subscriber isolation**: Cross-subscriber access prevented at database level

## Development Workflow

1. **Choose your component**: Backend, Android, Web, or SDK
2. **Check TODO.md**: See what needs to be done
3. **Consult the appropriate agent**: See agent guide
4. **Follow the development guide**: Component-specific setup
5. **Write tests**: Use @amy for test strategy
6. **Deploy**: Use @howard for infrastructure

## Documentation

- [TODO Tracker](docs/TODO.md) - **Start here for implementation status**
- [Technical Specification](CodeReply_Technical_Document.md) - Complete system design
- [BYOD Architecture](docs/BYOD_ARCHITECTURE.md) - BYOD system architecture
- [Implementation Summary](docs/BYOD_IMPLEMENTATION_SUMMARY.md) - Implementation roadmap
- [Project Overview](docs/PROJECT_OVERVIEW.md) - High-level overview
- [Development Guide](docs/DEVELOPMENT_GUIDE.md) - Setup and workflow
- [AI Agents Guide](docs/AGENTS_README.md) - Working with agents
- [Backend README](src/backend/README.md) - Backend setup
- [Android README](src/android/README.md) - Android app setup
- [Web README](src/web/README.md) - Frontend setup
- [SDK README](src/sdk/README.md) - SDK development

## Requirements

### Backend
- Node.js 18+ or Python 3.11+
- PostgreSQL 15+
- Redis 7+

### Android Gateway
- Android 8.0+ (API 26+)
- Active SIM card with SMS plan
- Dedicated device (not personal phone)

### Deployment
- AWS / Railway / Render
- Docker support
- CI/CD via GitHub Actions

## Support

- **Documentation**: Check the docs folder
- **AI Agents**: Use @agents for development help
- **TODO Tracker**: See [docs/TODO.md](docs/TODO.md) for progress
- **Technical Questions**: Review the technical document

## License

Proprietary - All rights reserved

---

**Version**: 2.0 (BYOD Model)
**Status**: 🔄 In Development (17% Complete)
**Last Updated**: April 3, 2026

Built with assistance from specialized AI agents: Sheldon, Leonard, Penny, Howard, Raj, Amy, and Bernadette.
