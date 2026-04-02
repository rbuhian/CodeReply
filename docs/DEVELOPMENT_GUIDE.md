# CodeReply Development Guide

This guide will help you set up your development environment and start contributing to the CodeReply project.

## Prerequisites

### Backend Development
- Node.js 18+ or Python 3.11+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (recommended)

### Android Development
- Android Studio (latest stable)
- JDK 17+
- Android SDK with API 26-35
- Physical Android device with SIM card (for testing)

### Frontend Development
- Node.js 18+
- npm or yarn

## Initial Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd CodeReply
```

### 2. Install Dependencies

#### Backend (Node.js)
```bash
cd src/backend
npm install
```

#### Backend (Python)
```bash
cd src/backend
pip install -r requirements.txt
```

#### Frontend
```bash
cd src/web
npm install
```

#### Android
Open `src/android` in Android Studio and sync Gradle.

### 3. Environment Configuration

Create `.env` file in `src/backend`:

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://postgres:password@localhost:5432/codereply_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-dev-secret-key
DEVICE_JWT_EXPIRY=2592000
API_KEY_HASH_ALGO=sha256
WEBHOOK_SIGNING_SECRET=dev-webhook-secret
MAX_RETRY_ATTEMPTS=3
DEFAULT_MESSAGE_TTL=300
LOG_LEVEL=debug
```

### 4. Database Setup

#### Using Docker Compose (Recommended)

```bash
docker-compose up -d postgres redis
```

#### Manual Setup

**PostgreSQL**:
```bash
psql -U postgres
CREATE DATABASE codereply_dev;
```

**Redis**:
```bash
redis-server
```

#### Run Migrations

```bash
cd src/backend
npm run migrate
# or
python manage.py migrate
```

### 5. Start Development Servers

#### Backend
```bash
cd src/backend
npm run dev
# or
python main.py
```

#### Frontend
```bash
cd src/web
npm run dev
```

#### Android
1. Open project in Android Studio
2. Connect Android device or start emulator
3. Run the app (Shift+F10)

## Development Workflow

### Working with AI Agents

CodeReply uses specialized AI agents for different aspects of development. See `AGENTS_README.md` for details.

#### Example: Implementing a New Feature

```
1. @sheldon Design the backend API for [feature]
2. @leonard Create the Android implementation
3. @bernadette Build the REST endpoint and SDK method
4. @penny Create the UI for managing [feature]
5. @raj Add necessary database tables
6. @amy Write tests for all components
```

### Code Structure

#### Backend (src/backend)

```
backend/
├── src/
│   ├── api/
│   │   ├── routes/
│   │   │   ├── auth.ts
│   │   │   ├── messages.ts
│   │   │   ├── devices.ts
│   │   │   └── webhooks.ts
│   │   └── middleware/
│   │       ├── auth.ts
│   │       ├── validation.ts
│   │       └── errorHandler.ts
│   ├── services/
│   │   ├── messageService.ts
│   │   ├── authService.ts
│   │   ├── webhookService.ts
│   │   └── dispatcherService.ts
│   ├── database/
│   │   ├── models/
│   │   ├── repositories/
│   │   └── migrations/
│   ├── websocket/
│   │   ├── server.ts
│   │   ├── deviceManager.ts
│   │   └── messageDispatcher.ts
│   ├── queue/
│   │   ├── workers/
│   │   └── jobs/
│   └── utils/
│       ├── validation.ts
│       ├── crypto.ts
│       └── logger.ts
├── tests/
├── package.json
└── tsconfig.json
```

#### Android (src/android)

```
app/
├── src/
│   ├── main/
│   │   ├── java/com/codereply/gateway/
│   │   │   ├── data/
│   │   │   │   ├── local/
│   │   │   │   │   ├── dao/
│   │   │   │   │   ├── database/
│   │   │   │   │   └── entity/
│   │   │   │   ├── remote/
│   │   │   │   │   ├── api/
│   │   │   │   │   └── websocket/
│   │   │   │   └── repository/
│   │   │   ├── domain/
│   │   │   │   ├── model/
│   │   │   │   ├── repository/
│   │   │   │   └── usecase/
│   │   │   ├── presentation/
│   │   │   │   ├── ui/
│   │   │   │   └── viewmodel/
│   │   │   ├── service/
│   │   │   │   ├── GatewayService.kt
│   │   │   │   └── SmsDispatcher.kt
│   │   │   ├── receiver/
│   │   │   └── util/
│   │   └── AndroidManifest.xml
│   └── test/
└── build.gradle.kts
```

#### Frontend (src/web)

```
web/
├── src/
│   ├── components/
│   │   ├── common/
│   │   ├── layout/
│   │   ├── messages/
│   │   ├── devices/
│   │   └── charts/
│   ├── pages/
│   │   ├── Dashboard.tsx
│   │   ├── Messages.tsx
│   │   ├── Devices.tsx
│   │   └── Settings.tsx
│   ├── hooks/
│   ├── services/
│   │   └── api.ts
│   ├── types/
│   └── utils/
├── package.json
└── tsconfig.json
```

## Testing

### Backend Tests

```bash
cd src/backend

# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run specific test file
npm test -- messages.test.ts

# Watch mode
npm run test:watch
```

### Android Tests

```bash
# Unit tests
./gradlew test

# Integration tests
./gradlew connectedAndroidTest

# With coverage
./gradlew testDebugUnitTestCoverage
```

### Frontend Tests

```bash
cd src/web

# Run tests
npm test

# With coverage
npm run test:coverage

# E2E tests
npm run test:e2e
```

## Code Style

### Backend (TypeScript)
- ESLint + Prettier
- 2-space indentation
- Single quotes
- No semicolons (except when necessary)

```bash
npm run lint
npm run format
```

### Android (Kotlin)
- Follow Kotlin coding conventions
- ktlint for formatting
- 4-space indentation

```bash
./gradlew ktlintCheck
./gradlew ktlintFormat
```

### Frontend (TypeScript/React)
- ESLint + Prettier
- 2-space indentation
- Functional components with hooks
- TypeScript strict mode

```bash
npm run lint
npm run format
```

## Git Workflow

### Branch Naming

- Feature: `feature/message-sending`
- Bug fix: `fix/webhook-retry-logic`
- Hotfix: `hotfix/critical-bug`
- Release: `release/v1.0.0`

### Commit Messages

Follow conventional commits:

```
feat(api): add POST /messages endpoint
fix(android): resolve WebSocket reconnection issue
docs(readme): update setup instructions
test(api): add unit tests for MessageService
chore(deps): upgrade dependencies
```

### Pull Request Process

1. Create feature branch from `develop`
2. Implement feature with help from appropriate agents
3. Write tests (@amy can help)
4. Update documentation if needed
5. Create PR to `develop`
6. Wait for CI/CD checks to pass
7. Request review
8. Merge after approval

## Docker Development

### Full Stack with Docker Compose

```bash
# Start all services
docker-compose up

# Start specific service
docker-compose up backend

# Rebuild after changes
docker-compose up --build

# View logs
docker-compose logs -f backend

# Stop all services
docker-compose down
```

### Docker Compose Configuration

See `docker-compose.yml` in project root (to be created by @howard).

## Debugging

### Backend Debugging

#### VS Code (Node.js)
Add to `.vscode/launch.json`:

```json
{
  "type": "node",
  "request": "launch",
  "name": "Debug Backend",
  "skipFiles": ["<node_internals>/**"],
  "program": "${workspaceFolder}/src/backend/src/index.ts",
  "preLaunchTask": "tsc: build - tsconfig.json",
  "outFiles": ["${workspaceFolder}/src/backend/dist/**/*.js"]
}
```

#### Chrome DevTools (Node.js)
```bash
node --inspect-brk dist/index.js
```

### Android Debugging

1. Set breakpoints in Android Studio
2. Run in debug mode (Shift+F9)
3. Use Logcat for logging

### Frontend Debugging

- React DevTools browser extension
- Redux DevTools
- Chrome DevTools

## Common Tasks

### Create Database Migration

```bash
# Backend (Node.js with node-pg-migrate)
npm run migrate create add_device_status_column

# Backend (Python with Alembic)
alembic revision -m "add_device_status_column"
```

### Generate API Documentation

```bash
cd src/backend
npm run docs:generate
```

### Build for Production

```bash
# Backend
npm run build

# Frontend
npm run build

# Android
./gradlew assembleRelease
```

## Troubleshooting

### Database Connection Issues
```bash
# Check PostgreSQL is running
docker ps | grep postgres

# Test connection
psql -U postgres -h localhost -d codereply_dev
```

### Redis Connection Issues
```bash
# Check Redis is running
docker ps | grep redis

# Test connection
redis-cli ping
```

### Android Build Issues
```bash
# Clean and rebuild
./gradlew clean build

# Invalidate caches (Android Studio)
File > Invalidate Caches / Restart
```

### WebSocket Connection Issues
- Verify backend WebSocket server is running
- Check device token is valid
- Review WebSocket logs
- Test with a WebSocket client (e.g., wscat)

## Performance Optimization

### Backend
- Use Redis caching for frequently accessed data
- Implement database connection pooling
- Add indexes for common queries (@raj can help)
- Use BullMQ for async processing

### Android
- Minimize main thread operations
- Use WorkManager for background tasks
- Implement proper lifecycle management
- Optimize battery usage

### Frontend
- Code splitting and lazy loading
- Memoization with React.memo
- Virtual scrolling for long lists
- Optimize bundle size

## Security Best Practices

1. **Never commit secrets** to version control
2. **Use environment variables** for configuration
3. **Validate all inputs** on both client and server
4. **Hash API keys** before storing
5. **Sign webhooks** with HMAC
6. **Use HTTPS/WSS** in production
7. **Implement rate limiting**
8. **Regular dependency updates**

## Resources

### Documentation
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Android Development](https://developer.android.com)
- [React Documentation](https://react.dev)
- [PostgreSQL Manual](https://www.postgresql.org/docs/)

### Tools
- [Postman](https://www.postman.com) - API testing
- [pgAdmin](https://www.pgadmin.org) - PostgreSQL GUI
- [Redis Insight](https://redis.com/redis-enterprise/redis-insight/) - Redis GUI
- [Flipper](https://fbflipper.com) - Mobile app debugging

## Getting Help

1. **Check the docs**: Start with `CodeReply_Technical_Document.md`
2. **Use AI agents**: See `AGENTS_README.md` for specific expertise
3. **Review existing code**: Look for similar implementations
4. **Ask the team**: For architecture decisions

## Next Steps

1. ✅ Set up local development environment
2. ✅ Familiarize yourself with the codebase
3. ✅ Review the technical specification
4. ✅ Choose a component to work on
5. ✅ Use the appropriate agent for guidance
6. ✅ Write tests for your code
7. ✅ Submit a pull request

Happy coding! 🚀
