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
# Start development server with hot reload
npm run dev

# You should see:
# ✅ Database connected
# ✅ Redis connected
# ✅ Server running on http://localhost:3000
```

### Step 5: Test Backend Endpoints

**Using curl (Command Line):**

```bash
# Test health endpoint
curl http://localhost:3000/health

# Expected response:
# {
#   "status": "ok",
#   "timestamp": "2026-04-07T...",
#   "database": "connected",
#   "redis": "connected"
# }

# Test database connection
curl http://localhost:3000/test/database

# Expected response:
# {
#   "success": true,
#   "current_time": "2026-04-07T..."
# }

# Test Redis connection
curl http://localhost:3000/test/redis

# Expected response:
# {
#   "success": true,
#   "value": "Hello from Redis"
# }
```

**Using Web Browser:**

Open these URLs in your browser:
- http://localhost:3000/health
- http://localhost:3000/test/database
- http://localhost:3000/test/redis

### Step 6: Run Backend Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
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
