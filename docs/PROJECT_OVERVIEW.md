# CodeReply - Project Overview

## What is CodeReply?

CodeReply is an Android-based SMS gateway platform that allows third-party applications to send SMS messages programmatically through physical Android devices equipped with SIM cards. It's a self-hosted, cost-effective alternative to services like Twilio or AWS SNS.

## Key Benefits

- **Cost-Effective**: Pay only for your SIM plan, not per-message
- **Self-Controlled**: Fully self-hosted infrastructure
- **Scalable**: Add more Android gateway devices as needed
- **Simple API**: REST API similar to Twilio
- **Real-Time**: WebSocket-based communication for instant message dispatch

## System Architecture

```
Subscriber App → REST API → Message Queue → WebSocket → Android Gateway → SMS → End User
                     ↓                                          ↓
                 Database                              Delivery Report
                                                              ↓
                                                         Webhook
```

### Components

1. **Backend API Server** (Node.js/Python)
   - REST API for message sending
   - WebSocket server for device communication
   - Message queue (Redis + BullMQ)
   - PostgreSQL database
   - Webhook delivery system

2. **Android Gateway App** (Kotlin)
   - Foreground service maintaining WebSocket connection
   - SMS sending via Android SmsManager
   - Delivery report tracking
   - Local message buffering (Room DB)

3. **Web Dashboard** (React/Vue)
   - Subscriber interface for monitoring messages
   - Operator panel for managing devices
   - Analytics and reporting

## Project Structure

```
CodeReply/
├── .claude/
│   └── agents/              # AI development agents
│       ├── sheldon.md       # Backend architect
│       ├── leonard.md       # Android developer
│       ├── penny.md         # Frontend developer
│       ├── howard.md        # DevOps engineer
│       ├── raj.md           # Database architect
│       ├── amy.md           # QA engineer
│       └── bernadette.md    # API integration specialist
├── docs/
│   ├── AGENTS_README.md
│   ├── PROJECT_OVERVIEW.md
│   └── DEVELOPMENT_GUIDE.md
├── src/
│   ├── backend/             # Node.js/Python backend
│   │   ├── api/             # REST API endpoints
│   │   ├── websocket/       # WebSocket server
│   │   ├── queue/           # Message queue workers
│   │   ├── database/        # Database models & migrations
│   │   └── services/        # Business logic
│   ├── android/             # Kotlin Android app
│   │   └── app/
│   │       ├── data/        # Data layer
│   │       ├── domain/      # Business logic
│   │       ├── presentation/# UI layer
│   │       └── service/     # Background services
│   ├── web/                 # React/Vue web dashboard
│   │   ├── components/
│   │   ├── pages/
│   │   └── services/
│   └── sdk/                 # Client SDKs
│       ├── nodejs/
│       ├── python/
│       └── php/
├── tests/                   # Test suites
├── docker/                  # Docker configurations
└── scripts/                 # Deployment & utility scripts
```

## Technology Stack

### Backend
- **Runtime**: Node.js 18+ or Python 3.11+
- **Framework**: Express.js or FastAPI
- **Database**: PostgreSQL 15+
- **Queue**: Redis + BullMQ
- **WebSocket**: ws or Socket.IO
- **Authentication**: JWT + API Keys

### Android
- **Language**: Kotlin
- **Min SDK**: API 26 (Android 8.0)
- **Architecture**: MVVM + Clean Architecture
- **UI**: Jetpack Compose
- **Database**: Room
- **Networking**: OkHttp + Retrofit

### Web Dashboard
- **Framework**: React with TypeScript
- **Styling**: Tailwind CSS
- **State**: Redux Toolkit or Zustand
- **Charts**: Recharts or Chart.js
- **API Client**: Axios with React Query

### DevOps
- **Containers**: Docker + Docker Compose
- **CI/CD**: GitHub Actions
- **Cloud**: AWS / Railway / Render
- **Monitoring**: Datadog or BetterStack
- **Logging**: Structured JSON logging

## Core Features

### Phase 1 (MVP)
- [x] REST API for sending SMS
- [x] Android gateway app with WebSocket connection
- [x] Message queue and dispatch system
- [x] Delivery tracking and reporting
- [x] Webhook notifications
- [x] Basic web dashboard

### Phase 2
- [ ] Multiple device support per account
- [ ] Carrier-aware routing
- [ ] Advanced analytics
- [ ] API rate limiting
- [ ] Multi-tenancy support

### Phase 3 (Future)
- [ ] Inbound SMS support
- [ ] Multi-SIM device support
- [ ] USSD support
- [ ] Official SDKs (Node.js, Python, PHP)
- [ ] WhatsApp Business integration

## Getting Started

### For Developers

1. **Clone the repository**
2. **Review the technical document**: `CodeReply_Technical_Document.md`
3. **Set up local environment**: See `DEVELOPMENT_GUIDE.md`
4. **Use AI agents**: See `AGENTS_README.md` for help with development

### For Operators

1. **Deploy the backend**: Follow deployment guide
2. **Register Android device**: Install gateway app
3. **Create subscriber account**: Generate API key
4. **Test message sending**: Use Postman or SDK

## Key Concepts

### Message Lifecycle

1. **QUEUED**: Message accepted by API
2. **DISPATCHED**: Sent to Android gateway device
3. **SENT**: Device handed off to carrier
4. **DELIVERED**: Carrier confirmed delivery
5. **FAILED**: All retry attempts exhausted

### Device Selection Strategy

1. **Carrier Match**: Prefer device with matching SIM carrier
2. **Least Load**: Select device with fewest in-flight messages
3. **Round-Robin**: Distribute evenly across available devices
4. **Failover**: Re-queue if selected device goes offline

### Webhook Flow

1. Message status changes (SENT, DELIVERED, FAILED)
2. Backend generates webhook payload
3. Signs payload with HMAC-SHA256
4. POSTs to subscriber's webhook URL
5. Retries with exponential backoff if failed

## API Example

### Send a Message

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

## Documentation

- **Technical Specification**: `CodeReply_Technical_Document.md`
- **Development Guide**: `docs/DEVELOPMENT_GUIDE.md`
- **API Reference**: `docs/API_REFERENCE.md` (to be created)
- **Agent Guide**: `docs/AGENTS_README.md`

## Contributing

This is a private project. Development is assisted by specialized AI agents:

- Backend work: @sheldon, @bernadette
- Android development: @leonard
- Frontend: @penny
- Database: @raj
- Testing: @amy
- DevOps: @howard

See `AGENTS_README.md` for details on working with these agents.

## License

Proprietary - All rights reserved

## Support

For technical questions or issues, consult the appropriate development agent or review the technical documentation.

---

**Version**: 1.0.0
**Last Updated**: April 2, 2026
**Status**: In Development
