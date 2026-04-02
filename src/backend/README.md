# CodeReply Backend

The backend server for the CodeReply SMS gateway platform.

## Overview

This is the core server that provides:
- REST API for message sending and management
- WebSocket server for real-time device communication
- Message queue processing for reliable message dispatch
- Database operations for data persistence
- Webhook delivery for status notifications

## Technology Stack

**Choose one of the following:**

### Option 1: Node.js + TypeScript
- Framework: Express.js
- Language: TypeScript (strict mode)
- WebSocket: ws or Socket.IO
- Queue: BullMQ
- ORM: Prisma
- Testing: Jest + Supertest

### Option 2: Python
- Framework: FastAPI
- Language: Python 3.11+
- WebSocket: FastAPI WebSockets
- Queue: BullMQ (via Redis)
- ORM: SQLAlchemy
- Testing: Pytest

## Getting Started

### Prerequisites
- Node.js 18+ or Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker (optional, recommended)

### Setup

1. **Install dependencies**

   Node.js:
   ```bash
   npm install
   ```

   Python:
   ```bash
   pip install -r requirements.txt
   ```

2. **Configure environment**

   Copy `.env.example` to `.env` and update values:
   ```bash
   cp .env.example .env
   ```

3. **Run database migrations**

   Node.js:
   ```bash
   npm run migrate
   ```

   Python:
   ```bash
   alembic upgrade head
   ```

4. **Start development server**

   Node.js:
   ```bash
   npm run dev
   ```

   Python:
   ```bash
   uvicorn main:app --reload
   ```

## Project Structure

```
backend/
├── src/
│   ├── api/              # REST API routes and controllers
│   ├── services/         # Business logic
│   ├── database/         # Database models and repositories
│   ├── websocket/        # WebSocket server and device manager
│   ├── queue/            # Message queue workers
│   ├── middleware/       # Express/FastAPI middleware
│   └── utils/            # Utility functions
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── migrations/           # Database migrations
├── config/               # Configuration files
└── scripts/              # Utility scripts
```

## Key Components

### 1. REST API
Endpoints for:
- Message sending (`POST /v1/messages`)
- Message status (`GET /v1/messages/:id`)
- Device management (`GET /v1/devices`)
- Authentication (`POST /v1/auth/token`)

### 2. WebSocket Server
Real-time communication with Android gateway devices:
- Device connection management
- Message dispatch
- Delivery report handling
- Heartbeat monitoring

### 3. Message Queue
BullMQ-based queue for:
- Message processing
- Retry logic with exponential backoff
- Device selection and load balancing

### 4. Webhook Service
Reliable webhook delivery:
- HMAC-SHA256 signing
- Retry with exponential backoff
- Delivery tracking

## Development

### Running Tests

Node.js:
```bash
npm test                 # All tests
npm run test:unit        # Unit tests only
npm run test:integration # Integration tests
npm run test:coverage    # With coverage report
```

Python:
```bash
pytest                   # All tests
pytest tests/unit        # Unit tests only
pytest --cov             # With coverage
```

### Code Quality

Node.js:
```bash
npm run lint             # ESLint
npm run format           # Prettier
npm run type-check       # TypeScript
```

Python:
```bash
black .                  # Formatting
pylint src               # Linting
mypy src                 # Type checking
```

### Database Operations

```bash
# Create new migration
npm run migrate:create add_new_table

# Run migrations
npm run migrate:up

# Rollback migration
npm run migrate:down
```

## API Documentation

Once the server is running, API documentation is available at:
- Swagger UI: `http://localhost:3000/docs`
- ReDoc: `http://localhost:3000/redoc`

## Environment Variables

See `.env.example` for all available configuration options:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
JWT_SECRET=...
```

## AI Agent Support

Use these agents for help:

- **@sheldon**: Backend architecture, WebSocket, message queue
- **@bernadette**: REST API implementation, webhooks
- **@raj**: Database design, query optimization
- **@amy**: Writing tests, test strategy
- **@howard**: Deployment, Docker configuration

## Next Steps

1. Review `CodeReply_Technical_Document.md` for detailed specifications
2. Use @sheldon to design the backend architecture
3. Implement core services with @sheldon and @bernadette
4. Add database schema with @raj
5. Write tests with @amy
6. Set up deployment with @howard
