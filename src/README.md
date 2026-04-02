# CodeReply Source Code

This directory contains all the source code for the CodeReply platform.

## Directory Structure

### `/backend`
The Node.js or Python backend server that handles:
- REST API endpoints for message sending
- WebSocket server for device communication
- Message queue processing (Redis + BullMQ)
- Database operations (PostgreSQL)
- Webhook delivery system

**Agent**: Use @sheldon for backend architecture and implementation

### `/android`
The Kotlin Android gateway application that:
- Maintains WebSocket connection to backend
- Physically sends SMS via Android SmsManager
- Tracks delivery status
- Runs as a foreground service

**Agent**: Use @leonard for Android development

### `/web`
The React/Vue web dashboard for:
- Subscriber interface (view messages, manage API keys)
- Operator panel (manage devices, view analytics)
- Real-time status updates

**Agent**: Use @penny for frontend development

### `/sdk`
Client SDKs in multiple languages:
- `nodejs/` - Node.js/TypeScript SDK
- `python/` - Python SDK
- `php/` - PHP SDK

**Agent**: Use @bernadette for SDK development

## Getting Started

1. Review the technical document: `CodeReply_Technical_Document.md`
2. Read the development guide: `docs/DEVELOPMENT_GUIDE.md`
3. Choose a component to work on
4. Use the appropriate AI agent for guidance (see `docs/AGENTS_README.md`)

## Development Workflow

Each component has its own README with specific setup instructions:
- Backend: `src/backend/README.md`
- Android: `src/android/README.md`
- Web: `src/web/README.md`
- SDKs: `src/sdk/README.md`

## AI Agent Support

- **Backend**: @sheldon, @bernadette
- **Android**: @leonard
- **Frontend**: @penny
- **Database**: @raj
- **Testing**: @amy
- **DevOps**: @howard

See `docs/AGENTS_README.md` for details on working with each agent.
