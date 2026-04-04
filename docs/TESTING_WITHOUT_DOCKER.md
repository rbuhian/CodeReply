# Testing CodeReply BYOD Without Docker

**Project Manager**: Stuart
**Created**: April 7, 2026
**Purpose**: Complete guide to test all features using native installations (no Docker required)

---

## 📋 Table of Contents

1. [Prerequisites Installation](#prerequisites-installation)
2. [Database Setup (PostgreSQL)](#database-setup-postgresql)
3. [Redis Setup](#redis-setup)
4. [Testing Database Migrations](#testing-database-migrations)
5. [Testing Backend API](#testing-backend-api)
   - [Step 9: Test Validation Schemas](#step-9-test-validation-schemas-recommended)
   - [Step 10: Test Authentication Middleware](#step-10-test-authentication-middleware-recommended)
6. [Testing Android App](#testing-android-app)
7. [Testing Web Dashboard](#testing-web-dashboard)
8. [Troubleshooting](#troubleshooting)

---

## 🔧 Prerequisites Installation

### Option A: Windows (WSL2 - Recommended)

Since you're already using WSL2 (based on your environment), you can install everything natively in Linux:

```bash
# Update package lists
sudo apt update

# Install PostgreSQL 15
sudo apt install postgresql-15 postgresql-contrib-15

# Install Redis
sudo apt install redis-server

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs

# Verify installations
psql --version       # Should show: psql (PostgreSQL) 15.x
redis-server --version  # Should show: Redis server v=7.x
node --version       # Should show: v18.x
npm --version        # Should show: 9.x or higher
```

### Option B: Windows (Native)

```powershell
# 1. Install PostgreSQL
# Download from: https://www.postgresql.org/download/windows/
# Run installer, set password for 'postgres' user

# 2. Install Redis (Windows port)
# Download from: https://github.com/microsoftarchive/redis/releases
# Or use Chocolatey:
choco install redis-64

# 3. Install Node.js
# Download from: https://nodejs.org/en/download/
# Run installer
```

### Option C: macOS

```bash
# Using Homebrew (install from https://brew.sh if needed)

# Install PostgreSQL 15
brew install postgresql@15
brew services start postgresql@15

# Install Redis
brew install redis
brew services start redis

# Install Node.js
brew install node

# Verify installations
psql --version
redis-server --version
node --version
```

### Option D: Linux (Ubuntu/Debian)

```bash
# Install PostgreSQL 15
sudo sh -c 'echo "deb http://apt.postgresql.org/pub/repos/apt $(lsb_release -cs)-pgdg main" > /etc/apt/sources.list.d/pgdg.list'
wget --quiet -O - https://www.postgresql.org/media/keys/ACCC4CF8.asc | sudo apt-key add -
sudo apt update
sudo apt install postgresql-15

# Install Redis
sudo apt install redis-server

# Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt install -y nodejs
```

---

## 🗄️ Database Setup (PostgreSQL)

### Step 1: Start PostgreSQL Service

**Windows (WSL2/Linux):**
```bash
sudo service postgresql start

# Or
sudo systemctl start postgresql
```

**macOS:**
```bash
brew services start postgresql@15
```

**Windows (Native):**
```powershell
# PostgreSQL service should start automatically
# Or use Services app (services.msc) to start "postgresql-x64-15"
```

### Step 2: Create Database and User

**WSL2/Linux/macOS:**
```bash
# Switch to postgres user
sudo -u postgres psql

# Inside PostgreSQL shell, run:
CREATE USER codereply WITH PASSWORD 'codereply_dev_password';
CREATE DATABASE codereply OWNER codereply;
GRANT ALL PRIVILEGES ON DATABASE codereply TO codereply;
\q
```

**Windows (Native):**
```powershell
# Open Command Prompt as Administrator
# Navigate to PostgreSQL bin directory
cd "C:\Program Files\PostgreSQL\15\bin"

# Connect to PostgreSQL
psql -U postgres

# Inside PostgreSQL shell, run:
CREATE USER codereply WITH PASSWORD 'codereply_dev_password';
CREATE DATABASE codereply OWNER codereply;
GRANT ALL PRIVILEGES ON DATABASE codereply TO codereply;
\q
```

### Step 3: Test Database Connection

```bash
# Test connection (all platforms)
psql -U codereply -d codereply -h localhost

# You should see:
# codereply=>

# Type \q to exit
```

### Step 4: Configure PostgreSQL for Local Access

**Find and edit `pg_hba.conf`:**

**WSL2/Linux:**
```bash
sudo nano /etc/postgresql/15/main/pg_hba.conf

# Add this line (if not present):
# local   all             codereply                               md5
# host    all             codereply       127.0.0.1/32            md5

# Save and restart PostgreSQL
sudo service postgresql restart
```

**macOS:**
```bash
# Find config file
psql -U postgres -c 'SHOW config_file'

# Edit the pg_hba.conf file
# Add similar entries as above

# Restart
brew services restart postgresql@15
```

**Windows:**
```
# Location: C:\Program Files\PostgreSQL\15\data\pg_hba.conf
# Edit with Notepad as Administrator
# Add: host all codereply 127.0.0.1/32 md5
# Restart PostgreSQL service
```

---

## 📦 Redis Setup

### Step 1: Start Redis Server

**WSL2/Linux:**
```bash
# Start Redis
sudo service redis-server start

# Or
redis-server --daemonize yes

# Check status
redis-cli ping
# Should return: PONG
```

**macOS:**
```bash
# Start Redis
brew services start redis

# Test connection
redis-cli ping
# Should return: PONG
```

**Windows (Native):**
```powershell
# If installed via installer, Redis should be running as a service
# Test connection
redis-cli ping

# If not running, start manually:
redis-server
```

### Step 2: Test Redis Connection

```bash
# Connect to Redis
redis-cli

# Test commands
127.0.0.1:6379> SET test "Hello"
OK
127.0.0.1:6379> GET test
"Hello"
127.0.0.1:6379> exit
```

---

## 🧪 Testing Database Migrations

### Using the Existing Test Script

The test script `src/backend/database/test_migrations.sh` already exists and works with both Docker and native PostgreSQL installations.

**Key Difference**:
- **With Docker**: No environment variables needed
- **With Native PostgreSQL**: Set `PGPASSWORD` environment variable

### Step 1: Run Migration Tests

```bash
# Set PostgreSQL password environment variable
export PGPASSWORD='codereply_dev_password'

# Make script executable (first time only)
chmod +x src/backend/database/test_migrations.sh

# Run tests
./src/backend/database/test_migrations.sh
```

**Expected Output**:
```
========================================
All Tests Passed! ✓
========================================
Migrations are ready for production deployment.
```

**What Gets Tested**:
- ✅ All 4 database migrations
- ✅ Device count trigger (auto-increment/decrement)
- ✅ Device quota enforcement
- ✅ Soft delete trigger
- ✅ Cross-subscriber security
- ✅ Database functions

### Step 2: Manual Testing (Optional)

```bash
# Connect to database
psql -U codereply -d codereply -h localhost

# Verify tables exist
\dt

# Check a table structure
\d gateway_devices

# Query data
SELECT * FROM subscribers;
SELECT * FROM gateway_devices;

# Test a function
SELECT * FROM get_available_devices('11111111-1111-1111-1111-111111111111');

# Exit
\q
```

---

## 🚀 Testing Backend API

### Step 1: Install Backend Dependencies

```bash
cd src/backend

# Install all dependencies
npm install

# Verify installation
npm list --depth=0
```

### Step 2: Create Environment Configuration

**File**: `src/backend/.env`

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://codereply:codereply_dev_password@localhost:5432/codereply
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_jwt_secret_CHANGE_IN_PRODUCTION
API_KEY_HASH_SECRET=dev_api_key_secret_CHANGE_IN_PRODUCTION
```

### Step 3: Create Basic Server (If Not Exists)

**File**: `src/backend/src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import Redis from 'redis';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const db = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
});

// Redis connection
const redis = Redis.createClient({
  url: process.env.REDIS_URL,
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'connected',
    redis: redis.isReady ? 'connected' : 'disconnected'
  });
});

// Test database query
app.get('/test/database', async (req, res) => {
  try {
    const result = await db.query('SELECT NOW() as current_time');
    res.json({
      success: true,
      current_time: result.rows[0].current_time
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Test Redis
app.get('/test/redis', async (req, res) => {
  try {
    await redis.set('test_key', 'Hello from Redis');
    const value = await redis.get('test_key');
    res.json({
      success: true,
      value
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Start server
async function startServer() {
  try {
    // Test database connection
    await db.query('SELECT 1');
    console.log('✅ Database connected');

    // Connect Redis
    await redis.connect();
    console.log('✅ Redis connected');

    // Start Express server
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📊 Health check: http://localhost:${PORT}/health`);
      console.log(`🗄️  Database test: http://localhost:${PORT}/test/database`);
      console.log(`📦 Redis test: http://localhost:${PORT}/test/redis`);
    });
  } catch (error) {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  }
}

startServer();

export { app, db, redis };
```

### Step 4: Start Backend Server

```bash
# Make sure you're in the backend directory
cd src/backend

# Start development server with hot reload
npm run dev

# You should see:
# ✅ Database connected
# ✅ Redis connected
# ✅ Server running on http://localhost:3000
```

**Expected Output:**
```
========================================
  CodeReply Backend API Server
========================================
  Environment: development
  Server:      http://localhost:3000
  Health:      http://localhost:3000/health
  Detailed:    http://localhost:3000/health/detailed
========================================
```

### Step 5: Test Backend Endpoints

#### **Option A: Using curl (Command Line)**

**1. Basic Health Check:**
```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-03T11:02:36.931Z",
  "uptime": 44.65,
  "environment": "development",
  "version": "2.0.0"
}
```

**2. Detailed Health Check (Database + Redis + Memory):**
```bash
curl http://localhost:3000/health/detailed | python3 -m json.tool
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2026-04-03T11:02:36.931Z",
  "uptime": 50.59,
  "environment": "development",
  "version": "2.0.0",
  "services": {
    "database": {
      "status": "connected",
      "info": {
        "totalCount": 1,
        "idleCount": 1,
        "waitingCount": 0
      }
    },
    "redis": {
      "status": "connected",
      "info": {
        "redis_version": "7.0.15",
        "redis_mode": "standalone"
      }
    }
  },
  "memory": {
    "used": 33,
    "total": 47,
    "rss": 79
  }
}
```

**3. Test Database Connection:**
```bash
curl http://localhost:3000/test/database | python3 -m json.tool
```

Expected response:
```json
{
  "success": true,
  "current_time": "2026-04-03T11:02:36.931Z",
  "postgresql_version": "18.3",
  "pool": {
    "totalCount": 1,
    "idleCount": 1,
    "waitingCount": 0
  }
}
```

**4. Test Redis Connection (Set/Get):**
```bash
curl http://localhost:3000/test/redis | python3 -m json.tool
```

Expected response:
```json
{
  "success": true,
  "test_key": "test_key_1775214163701",
  "set_value": "Hello from Redis at 2026-04-03T11:02:43.701Z",
  "retrieved_value": "Hello from Redis at 2026-04-03T11:02:43.701Z",
  "match": true,
  "redis_info": {
    "redis_version": "7.0.15",
    "redis_mode": "standalone"
  }
}
```

#### **Option B: Using Web Browser**

Open these URLs in your browser:
- **Basic Health**: http://localhost:3000/health
- **Detailed Health**: http://localhost:3000/health/detailed
- **Test Database**: http://localhost:3000/test/database
- **Test Redis**: http://localhost:3000/test/redis

You should see JSON responses in your browser.

---

### Step 6: Available Endpoints Summary

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/health` | GET | Basic server health check | ✅ Working |
| `/health/detailed` | GET | Detailed health (DB + Redis + Memory) | ✅ Working |
| `/test/database` | GET | Test PostgreSQL connection | ✅ Working |
| `/test/redis` | GET | Test Redis set/get operations | ✅ Working |
| `/api/v1/*` | - | API endpoints (to be implemented) | 🔄 Planned |

---

### Step 7: Verify Server Logs

The server logs show all requests:

```
[0mGET /health [32m200[0m 3.227 ms - 122[0m
[0mGET /health/detailed [32m200[0m 5.954 ms - 5697[0m
[0mGET /test/database [32m200[0m 2.105 ms - 186[0m
[0mGET /test/redis [32m200[0m 3.821 ms - 324[0m
```

- **Green `200`** = Success
- **Yellow `404`** = Not found
- **Red `500`** = Server error

---

### Step 8: Run Backend Tests (Optional)

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

---

### Step 9: Test Validation Schemas (Recommended)

The validation schemas are the foundation for all API request validation. Testing them ensures data integrity across the entire system.

**What Validation Schemas Cover:**
- ✅ Device registration and management
- ✅ SMS message sending and querying
- ✅ API key authentication
- ✅ User registration and login
- ✅ All request parameter validation

#### Quick Validation Test

```bash
cd src/backend

# Run all validation tests (141 tests)
npm test -- --testPathPattern=validation

# Expected output:
# Test Suites: 3 passed, 3 total
# Tests:       141 passed, 141 total
# Time:        ~30s
```

#### Run Specific Schema Tests

```bash
# Device validation only (54 tests)
npm test -- tests/unit/validation/deviceSchemas.test.ts

# Message validation only (52 tests)
npm test -- tests/unit/validation/messageSchemas.test.ts

# Authentication validation only (35 tests)
npm test -- tests/unit/validation/authSchemas.test.ts
```

#### Run Tests with Detailed Output

```bash
# Verbose mode - see each test name
npm test -- --testPathPattern=validation --verbose

# Watch mode - auto-rerun on file changes
npm test -- --testPathPattern=validation --watch

# Coverage report
npm test -- --testPathPattern=validation --coverage
```

#### What Gets Tested

**Device Validation (deviceSchemas.test.ts):**
```
✓ Registration token format (cr_reg_XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX)
✓ Device name constraints (alphanumeric, spaces, hyphens, underscores)
✓ E.164 phone number validation for SIM cards
✓ Android version format (13.0, 13.0.1, etc.)
✓ Semantic versioning for app version (1.0.0)
✓ Device heartbeat status (ONLINE/OFFLINE/DEGRADED)
✓ Battery and signal strength ranges (0-100)
✓ Query parameter validation (pagination, sorting, filtering)
```

**Message Validation (messageSchemas.test.ts):**
```
✓ E.164 phone number validation using libphonenumber-js
✓ Message body length limit (918 chars = 6 SMS segments)
✓ Webhook URL validation and length limits
✓ Metadata size constraints (5KB JSON stringified)
✓ TTL (Time To Live) ranges (60-86400 seconds)
✓ Priority levels (LOW, NORMAL, HIGH)
✓ Batch message limits (max 100 messages)
✓ Date range validation for message queries
```

**Authentication Validation (authSchemas.test.ts):**
```
✓ API key format (cr_live_* or cr_test_* with 32 chars)
✓ Password strength requirements (min 8 chars, uppercase + lowercase + number)
✓ Email address validation
✓ Permission array validation
✓ Token expiration date constraints
✓ Password confirmation matching
```

#### Expected Test Output

```
PASS unit tests/unit/validation/deviceSchemas.test.ts (13.082 s)
  CreateRegistrationTokenSchema
    ✓ should accept valid registration token request (4 ms)
    ✓ should accept empty request (label is optional) (1 ms)
    ✓ should reject label exceeding 100 characters (5 ms)
  RegisterDeviceSchema
    ✓ should accept valid device registration (2 ms)
    ✓ should accept minimal valid registration (only required fields) (1 ms)
    ✓ should reject invalid registration token format (8 ms)
    ... (48 more tests)

PASS unit tests/unit/validation/messageSchemas.test.ts (14.422 s)
  SendMessageSchema
    ✓ should accept valid message with all fields (3 ms)
    ✓ should accept minimal valid message (2 ms)
    ✓ should reject invalid E.164 phone number (missing +) (6 ms)
    ... (49 more tests)

PASS unit tests/unit/validation/authSchemas.test.ts (25.383 s)
  ApiKeySchema
    ✓ should accept valid live API key (2 ms)
    ✓ should accept valid test API key (1 ms)
    ✓ should reject API key with wrong prefix (5 ms)
    ... (32 more tests)

Test Suites: 3 passed, 3 total
Tests:       141 passed, 141 total
Snapshots:   0 total
Time:        30.444 s
```

#### Validation Files Location

```
src/backend/
├── validation/                    # Schema definitions
│   ├── deviceSchemas.ts          # Device validation rules
│   ├── messageSchemas.ts         # Message validation rules
│   └── authSchemas.ts            # Auth validation rules
├── middleware/
│   └── validate.ts               # Validation middleware
└── tests/
    └── unit/
        └── validation/           # Validation tests
            ├── deviceSchemas.test.ts
            ├── messageSchemas.test.ts
            └── authSchemas.test.ts
```

#### Manual Testing with HTTP Requests

For interactive testing, use the provided HTTP file:

**File**: `src/backend/tests/manual/test-validation.http`

**Using VS Code REST Client extension:**
```bash
# 1. Install REST Client extension in VS Code
# 2. Open: src/backend/tests/manual/test-validation.http
# 3. Click "Send Request" above any ### section
# 4. View response in new panel
```

**Using curl:**
```bash
# Test valid message
curl -X POST http://localhost:3000/api/test/validate/message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "+639171234567",
    "body": "Hello, test message!",
    "priority": "HIGH"
  }'

# Test invalid phone number (should return 400 error)
curl -X POST http://localhost:3000/api/test/validate/message \
  -H "Content-Type: application/json" \
  -d '{
    "to": "invalid-phone",
    "body": "Test"
  }'
```

#### Troubleshooting Validation Tests

**Problem**: "Cannot find module '../../../validation/deviceSchemas'"

```bash
# Make sure you're in the backend directory
cd src/backend

# Reinstall dependencies
npm install

# Run tests again
npm test -- --testPathPattern=validation
```

**Problem**: Tests timeout

```bash
# Increase Jest timeout
npm test -- --testPathPattern=validation --testTimeout=60000
```

**Problem**: "SyntaxError: Cannot use import statement outside a module"

```bash
# Check tsconfig.test.json exists
ls tsconfig.test.json

# If missing, check jest.config.js has correct ts-jest configuration
cat jest.config.js | grep ts-jest
```

---

### Step 10: Test Authentication Middleware (Recommended)

The authentication middleware is critical for securing all API endpoints. Testing ensures API key validation, permission checking, and rate limiting work correctly.

**Why Test This?**
- ✅ API key authentication with SHA-256 hashing
- ✅ Plan-based permission checking (starter/professional/enterprise)
- ✅ Redis-based rate limiting
- ✅ Subscriber context injection
- ✅ Ownership validation
- ✅ Security: no API keys exposed in errors

**Quick Test Command:**

```bash
# Navigate to backend directory
cd src/backend

# Run all authentication middleware tests (39 tests)
npm test -- --testPathPattern=middleware

# Expected output:
# Test Suites: 2 passed, 2 total
# Tests:       39 passed, 39 total
# Time:        ~17s
```

**Run Specific Test Suites:**

```bash
# Authentication tests only (18 tests)
npm test -- tests/unit/middleware/authenticate.test.ts

# Permission checking tests only (21 tests)
npm test -- tests/unit/middleware/requirePermissions.test.ts
```

**Advanced Testing:**

```bash
# Watch mode (re-run on file changes)
npm test -- --testPathPattern=middleware --watch

# Verbose output (see all test names)
npm test -- --testPathPattern=middleware --verbose

# Coverage report
npm test -- --testPathPattern=middleware --coverage
```

**What's Being Tested:**

**authenticate.test.ts (18 tests):**
- ✓ Valid live and test API keys
- ✓ Missing or invalid Authorization header
- ✓ Malformed API keys (wrong prefix, length, characters)
- ✓ API key not found in database
- ✓ Inactive API keys
- ✓ Database errors and timeouts
- ✓ SHA-256 hashing before database lookup
- ✓ No API key exposure in error messages
- ✓ Optional authentication (pass through without credentials)

**requirePermissions.test.ts (21 tests):**
- ✓ Starter plan permissions (messages:*, devices:*)
- ✓ Professional plan permissions (+ api-keys:*)
- ✓ Enterprise plan permissions (all permissions)
- ✓ Multiple permission requirements
- ✓ Ownership validation (subscriberId matching)
- ✓ Error handling and graceful degradation

**Expected Test Output:**

```
PASS unit tests/unit/middleware/authenticate.test.ts (12.987 s)
  authenticate middleware
    Valid API Keys
      ✓ should authenticate with valid live API key (45 ms)
      ✓ should authenticate with valid test API key (12 ms)
      ✓ should update last_used_at timestamp (28 ms)
    Missing or Invalid Authorization Header
      ✓ should reject request with missing Authorization header (8 ms)
      ✓ should reject request with invalid Authorization format (7 ms)
      ✓ should reject request with wrong bearer scheme (6 ms)
      ✓ should reject request with malformed API key (wrong prefix) (5 ms)
      ✓ should reject request with malformed API key (wrong length) (5 ms)
      ✓ should reject request with malformed API key (invalid characters) (5 ms)
    Invalid API Keys
      ✓ should reject request with API key not found in database (15 ms)
      ✓ should reject request with inactive API key (12 ms)
    Database Errors
      ✓ should handle database errors gracefully (10 ms)
      ✓ should handle database query timeout (9 ms)
    Security
      ✓ should hash API key before database lookup (11 ms)
      ✓ should not expose API key in error messages (10 ms)
  optionalAuthenticate middleware
    ✓ should pass through when no Authorization header provided (5 ms)
    ✓ should authenticate when valid Authorization header provided (14 ms)
    ✓ should reject when invalid API key provided (12 ms)

PASS unit tests/unit/middleware/requirePermissions.test.ts (12.965 s)
  requirePermissions middleware
    No Authentication
      ✓ should reject when no subscriber context (6 ms)
    Starter Plan Permissions
      ✓ should allow messages:read permission (7 ms)
      ✓ should allow messages:write permission (6 ms)
      ✓ should allow devices:read permission (5 ms)
      ✓ should allow devices:write permission (5 ms)
      ✓ should reject api-keys:read permission (not in starter plan) (7 ms)
      ✓ should reject api-keys:write permission (not in starter plan) (6 ms)
      ✓ should allow multiple permissions when all are granted (6 ms)
      ✓ should reject when one required permission is missing (7 ms)
    Professional Plan Permissions
      ✓ should allow all message permissions (6 ms)
      ✓ should allow all device permissions (5 ms)
      ✓ should allow all api-key permissions (6 ms)
      ✓ should allow combination of all permission types (6 ms)
    Enterprise Plan Permissions
      ✓ should allow all permissions (7 ms)
    Unknown Plan
      ✓ should default to starter plan permissions (13 ms)
    Error Handling
      ✓ should handle errors gracefully (8 ms)
  requireOwnership middleware
    No Authentication
      ✓ should reject when no subscriber context (5 ms)
    Ownership Validation
      ✓ should allow access when subscriber ID matches (6 ms)
      ✓ should reject when subscriber ID does not match (7 ms)
      ✓ should pass through when no subscriberId in params (5 ms)
      ✓ should pass through when subscriberId is undefined (6 ms)

Test Suites: 2 passed, 2 total
Tests:       39 passed, 39 total
Snapshots:   0 total
Time:        16.606 s
```

**Files Tested:**

```
src/backend/
├── middleware/                 # Middleware implementations
│   ├── authenticate.ts        # API key authentication (270 lines)
│   ├── requirePermissions.ts  # Permission checking (220 lines)
│   └── rateLimit.ts          # Redis rate limiting (200 lines)
└── tests/
    └── unit/
        └── middleware/        # Middleware tests
            ├── authenticate.test.ts        # Auth tests (400+ lines, 18 tests)
            └── requirePermissions.test.ts  # Permission tests (380+ lines, 21 tests)
```

**Documentation:**

**File**: `docs/AUTHENTICATION_GUIDE.md`

Complete guide covering:
- Quick start examples
- Detailed middleware usage
- Common usage patterns
- Error handling
- Testing instructions
- Security considerations

**Troubleshooting:**

**Problem**: "Cannot find module '../../../config/database'"

```bash
# Make sure you're in the backend directory
cd src/backend

# Reinstall dependencies
npm install

# Run tests again
npm test -- --testPathPattern=middleware
```

**Problem**: Redis connection errors during tests

```bash
# Authentication tests mock Redis, so this shouldn't happen
# If it does, check that Redis is running:
redis-cli ping

# Should return: PONG
```

**Problem**: Tests timeout

```bash
# Increase Jest timeout
npm test -- --testPathPattern=middleware --testTimeout=60000
```

---

## 📱 Testing Android App

### Prerequisites

1. **Android Studio** installed
2. **Android device** with USB debugging enabled OR **Android Emulator**

### Step 1: Open Project in Android Studio

```bash
# Open Android Studio
# File > Open > Navigate to: /mnt/e/Program/CodeReply/src/android

# Wait for Gradle sync to complete
```

### Step 2: Configure Backend URL

**File**: `src/android/app/src/main/java/com/codereply/gateway/data/preferences/CredentialsStore.kt`

Update the default backend URL:

```kotlin
// Change from:
private const val DEFAULT_BACKEND_URL = "https://api.codereply.com"

// To (your local machine IP):
private const val DEFAULT_BACKEND_URL = "http://192.168.1.100:3000"
// Replace 192.168.1.100 with your actual local IP
```

**Find your local IP:**

**Windows/WSL2:**
```bash
# In WSL2
ip addr show eth0 | grep inet

# Or in Windows PowerShell
ipconfig
# Look for "IPv4 Address" under your active network adapter
```

**macOS:**
```bash
ifconfig | grep "inet "
# Look for your local IP (usually 192.168.x.x or 10.0.x.x)
```

**Linux:**
```bash
hostname -I
```

### Step 3: Build and Run

**Option A: Using Android Studio**
1. Click "Run" button (green play icon)
2. Select your device/emulator
3. Wait for app to install and launch

**Option B: Using Command Line**

```bash
cd src/android

# Build APK
./gradlew assembleDebug

# Install on connected device
./gradlew installDebug

# Build and run
./gradlew run
```

### Step 4: Manual Testing Checklist

Once app launches:

```
[ ] App opens without crashing
[ ] Login screen is visible
[ ] Can enter text in API key field
[ ] "Register Device" button is visible
[ ] "Scan QR Code" button is visible (if implemented)

If CredentialsStore test:
[ ] Open Android Studio > Run > Edit Configurations
[ ] Create new "Android JUnit" test
[ ] Select CredentialsStoreTest
[ ] Run test
[ ] All tests should pass
```

### Step 5: Test API Integration

```bash
# Make sure backend is running on your machine
# In backend directory:
npm run dev

# Test from Android app:
# 1. Enter a test API key in the app
# 2. Click "Register Device"
# 3. Check backend console for incoming request
# 4. Check app for response (error or success)
```

### Step 6: Run Android Unit Tests

```bash
cd src/android

# Run all unit tests
./gradlew test

# Run specific test
./gradlew test --tests CredentialsStoreTest

# View test report
# Open: src/android/app/build/reports/tests/testDebugUnitTest/index.html
```

---

## 🌐 Testing Web Dashboard

### Step 1: Initialize Web Project (If Not Done)

```bash
cd src/web

# Check if package.json exists
ls package.json

# If not exists, create it:
cat > package.json <<'EOF'
{
  "name": "codereply-web",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.20.0",
    "zustand": "^4.4.7",
    "axios": "^1.6.2",
    "socket.io-client": "^4.5.4"
  },
  "devDependencies": {
    "@vitejs/plugin-react": "^4.2.1",
    "vite": "^5.0.8",
    "typescript": "^5.2.2",
    "@types/react": "^18.2.43",
    "@types/react-dom": "^18.2.17",
    "tailwindcss": "^3.3.6"
  }
}
EOF

# Install dependencies
npm install
```

### Step 2: Create Vite Configuration (If Not Exists)

**File**: `src/web/vite.config.ts`

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': {
        target: 'http://localhost:3000',
        changeOrigin: true
      }
    }
  }
});
```

### Step 3: Create Entry Point (If Not Exists)

**File**: `src/web/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CodeReply Dashboard</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

**File**: `src/web/src/main.tsx`

```tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

function App() {
  return (
    <div style={{ padding: '2rem' }}>
      <h1>CodeReply Dashboard</h1>
      <p>BYOD SMS Gateway - Testing Mode</p>
      <div style={{ marginTop: '2rem' }}>
        <h2>Backend Status</h2>
        <button onClick={async () => {
          const res = await fetch('http://localhost:3000/health');
          const data = await res.json();
          alert(JSON.stringify(data, null, 2));
        }}>
          Test Backend Connection
        </button>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**File**: `src/web/src/index.css`

```css
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
}

button {
  padding: 10px 20px;
  background: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
}

button:hover {
  background: #0056b3;
}
```

### Step 4: Start Development Server

```bash
cd src/web

# Start Vite dev server
npm run dev

# You should see:
# VITE vx.x.x  ready in xxx ms
# ➜  Local:   http://localhost:5173/
# ➜  Network: use --host to expose
```

### Step 5: Test in Browser

1. Open browser: http://localhost:5173
2. You should see "CodeReply Dashboard"
3. Click "Test Backend Connection" button
4. Should show alert with health check response

### Step 6: Test API Client

**File**: `src/web/src/test-api.ts`

```typescript
import api from './services/api';

async function testAPI() {
  try {
    console.log('Testing API client...');

    // Test health endpoint
    const response = await fetch('http://localhost:3000/health');
    const data = await response.json();
    console.log('Health check:', data);

    // Test if API client is configured
    console.log('API client base URL:', api.defaults.baseURL);

    return true;
  } catch (error) {
    console.error('API test failed:', error);
    return false;
  }
}

testAPI();
```

Add to `src/web/src/main.tsx`:

```tsx
import './test-api';  // Add this import
```

Check browser console for test results.

---

## 🔍 Troubleshooting

### PostgreSQL Issues

**Problem**: "psql: error: connection to server on socket"

```bash
# Check if PostgreSQL is running
sudo service postgresql status

# Start if not running
sudo service postgresql start

# Check if listening on port 5432
sudo netstat -plnt | grep 5432
```

**Problem**: "password authentication failed for user codereply"

```bash
# Reset password
sudo -u postgres psql
ALTER USER codereply WITH PASSWORD 'codereply_dev_password';
\q
```

### Redis Issues

**Problem**: "Could not connect to Redis"

```bash
# Check if Redis is running
redis-cli ping

# If no response, start Redis
sudo service redis-server start

# Or
redis-server --daemonize yes
```

### Backend Issues

**Problem**: "Cannot find module"

```bash
cd src/backend
npm install
```

**Problem**: "Port 3000 already in use"

```bash
# Find and kill process using port 3000
# Linux/macOS:
lsof -ti:3000 | xargs kill -9

# Windows:
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

### Android Issues

**Problem**: "Unable to connect to backend"

- Make sure backend is running
- Use your machine's local IP, not `localhost`
- Check firewall isn't blocking port 3000
- Test from phone browser: `http://YOUR_IP:3000/health`

**Problem**: "Gradle sync failed"

```bash
cd src/android
./gradlew --stop
./gradlew clean
./gradlew build
```

### Web Issues

**Problem**: "npm ERR! code ENOENT"

```bash
# Make sure you're in the right directory
cd src/web

# Remove node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

---

## ✅ Testing Checklist

### Database Tests
- [ ] PostgreSQL installed and running
- [ ] Database `codereply` created
- [ ] User `codereply` created with correct password
- [ ] Can connect: `psql -U codereply -d codereply -h localhost`
- [ ] Migration script runs successfully
- [ ] All triggers work (device count, quota, security)
- [ ] Database functions return correct results

### Backend Tests
- [ ] Redis installed and running
- [ ] Node.js 18+ installed
- [ ] Backend dependencies installed (`npm install`)
- [ ] `.env` file created with correct credentials
- [ ] Server starts without errors
- [ ] Health endpoint returns 200 OK
- [ ] Database test endpoint works
- [ ] Redis test endpoint works

### Validation Tests
- [ ] All validation schema tests pass (`npm test -- --testPathPattern=validation`)
- [ ] Device schema validation (54 tests pass)
- [ ] Message schema validation (52 tests pass)
- [ ] Auth schema validation (35 tests pass)
- [ ] Total 141 tests pass in ~30 seconds
- [ ] No type errors or import issues
- [ ] Validation middleware properly handles errors

### Android Tests
- [ ] Android Studio opens project without errors
- [ ] Gradle sync completes successfully
- [ ] App builds without errors
- [ ] App installs on device/emulator
- [ ] App launches without crashing
- [ ] Login screen displays correctly
- [ ] CredentialsStore unit tests pass

### Web Tests
- [ ] Node.js 18+ installed
- [ ] Web dependencies installed (`npm install`)
- [ ] Vite dev server starts
- [ ] Browser opens http://localhost:5173
- [ ] Dashboard page loads
- [ ] Backend connection test works
- [ ] No console errors

---

## 📊 Expected Results

After completing all tests:

```
✅ Database
   ✅ PostgreSQL running on localhost:5432
   ✅ Database 'codereply' accessible
   ✅ All 11 migrations applied
   ✅ Triggers functioning (device count, quota, security)
   ✅ Functions working (get_available_devices, can_add_device)

✅ Backend
   ✅ Server running on http://localhost:3000
   ✅ Health endpoint: OK
   ✅ Database connection: OK
   ✅ Redis connection: OK

✅ Validation
   ✅ 141 validation tests pass
   ✅ Device schemas: 54 tests pass
   ✅ Message schemas: 52 tests pass
   ✅ Auth schemas: 35 tests pass
   ✅ Phone number validation (E.164 format)
   ✅ Request parameter validation working

✅ Android
   ✅ App builds successfully
   ✅ App installs on device
   ✅ Login screen displays
   ✅ Unit tests pass

✅ Web
   ✅ Dev server running on http://localhost:5173
   ✅ Dashboard loads
   ✅ API client configured
```

---

## 🎯 Quick Start Guide

**Minimum setup to test database (15 minutes):**

```bash
# 1. Install PostgreSQL
sudo apt install postgresql-15

# 2. Start PostgreSQL
sudo service postgresql start

# 3. Create database
sudo -u postgres psql -c "CREATE USER codereply WITH PASSWORD 'codereply_dev_password';"
sudo -u postgres psql -c "CREATE DATABASE codereply OWNER codereply;"

# 4. Run migration tests
chmod +x src/backend/database/test_migrations.sh
./src/backend/database/test_migrations.sh
```

**Full stack testing (1-2 hours):**

Follow all sections in order:
1. Prerequisites Installation (30 min)
2. Database Setup (15 min)
3. Redis Setup (10 min)
4. Testing Database Migrations (5 min)
5. Testing Backend API (20 min)
6. Testing Android App (15 min)
7. Testing Web Dashboard (15 min)

---

**Last Updated**: April 7, 2026
**Maintained by**: Stuart (Project Manager)
**For Support**: Check [Troubleshooting](#troubleshooting) section
