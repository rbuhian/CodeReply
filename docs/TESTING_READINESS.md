# Testing Readiness - Critical Actions Required

**Date**: April 7, 2026
**Project Manager**: Stuart
**Purpose**: Identify critical actions needed to test BYOD features

---

## 🎯 Executive Summary

**Current Testing Status**:
- ✅ Test infrastructure exists (70% complete)
- ❌ Zero test cases written
- ❌ Most features not implemented (can't be tested)
- ⚠️ Database migrations can be tested TODAY

**What Can Be Tested NOW**: Database only
**What CANNOT Be Tested Yet**: Backend API, Android App, Web Dashboard

---

## 📊 Testing Readiness Matrix

| Component | Can Test? | Readiness % | Blocker | ETA to Testable |
|-----------|-----------|-------------|---------|-----------------|
| **Database Migrations** | ✅ YES | 100% | None - ready now | 0 days |
| **Database Functions** | ✅ YES | 100% | None - ready now | 0 days |
| **Backend API** | ❌ NO | 0% | No server, no endpoints | 2-3 days |
| **Android App** | ❌ NO | 0% | No UI, no MainActivity | 4-5 days |
| **Web Dashboard** | ❌ NO | 0% | No build config, no pages | 3-4 days |
| **Integration (E2E)** | ❌ NO | 0% | All components needed | 2-3 weeks |

---

## 🔥 CRITICAL ACTION #1: Test Database Migrations (DO THIS TODAY)

### Status: ✅ **READY TO TEST NOW**

### What You Have
- ✅ Complete migration scripts (11 files)
- ✅ Test script (`test_migrations.sh`)
- ✅ Docker Compose for PostgreSQL
- ✅ Test data factories
- ✅ Rollback scripts

### What You Need

#### Prerequisites (30 minutes setup)
```bash
# 1. Install Docker (if not already installed)
# Windows: https://docs.docker.com/desktop/install/windows-install/
# Mac: https://docs.docker.com/desktop/install/mac-install/
# Linux: sudo apt-get install docker.io docker-compose

# 2. Verify Docker is running
docker --version
docker-compose --version

# 3. Start PostgreSQL container
cd /mnt/e/Program/CodeReply
docker-compose up -d db

# 4. Wait for PostgreSQL to be ready
docker-compose logs -f db
# Look for: "database system is ready to accept connections"
```

#### Run Tests (5 minutes)
```bash
# Make script executable
chmod +x src/backend/database/test_migrations.sh

# Run all migration tests
./src/backend/database/test_migrations.sh
```

### Expected Test Results

**✅ What Should Pass:**
1. Migration 001: Add subscriber_id to devices
2. Migration 002: Create registration_tokens table
3. Migration 003: Add database triggers
4. Device count trigger (auto-increment on insert)
5. Quota enforcement trigger (block when quota exceeded)
6. Soft delete trigger (decrement count on soft delete)
7. Cross-subscriber security trigger (prevent unauthorized routing)
8. `get_available_devices()` function
9. `can_add_device()` function

**🔴 What Might Fail:**
- Docker not installed/running
- Port 5432 already in use (another PostgreSQL instance)
- Incorrect database credentials
- Migration syntax errors (unlikely, but possible)

### What to Do After Testing

```bash
# If all tests pass:
✅ Mark database as "Production Ready"
✅ Update TESTING_READINESS.md with results
✅ Proceed to backend API development

# If tests fail:
🔴 Document the failure in TESTING_READINESS.md
🔴 Create bug report with:
   - Failed test name
   - Error message
   - Expected vs. actual result
   - Screenshots if applicable
🔴 Fix the issue
🔴 Re-run tests
```

### Manual Database Testing (Optional - 15 minutes)

After automated tests pass, you can manually verify:

```bash
# Connect to database
docker-compose exec db psql -U codereply -d codereply

# Verify schema
\dt                                    # List all tables
\d gateway_devices                     # Describe devices table
\d subscribers                         # Describe subscribers table

# Test subscriber isolation (should work)
SELECT * FROM gateway_devices WHERE subscriber_id = '11111111-1111-1111-1111-111111111111';

# Test cross-subscriber security (should fail)
-- Try to insert message from subscriber 1 via subscriber 2's device
-- Should raise SECURITY_VIOLATION error

# Test quota enforcement (should fail)
-- Try to add 2nd device to free subscriber (max_devices = 1)
-- Should raise DEVICE_QUOTA_EXCEEDED error

# Exit PostgreSQL
\q
```

---

## 🔥 CRITICAL ACTION #2: Implement Backend Server (BLOCKER FOR ALL API TESTING)

### Status: ❌ **BLOCKING - Cannot Test API Without This**

### What You Need (6-8 hours of work)

#### Step 1: Create Server Entry Point (1 hour)

**File**: `src/backend/src/index.ts`

```typescript
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { Pool } from 'pg';
import Redis from 'redis';

// Environment configuration
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://codereply:codereply_dev_password@localhost:5432/codereply';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

// Initialize Express app
const app = express();

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan('combined'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Database connection
const db = new Pool({
  connectionString: DATABASE_URL,
  max: 20,
});

// Redis connection
const redis = Redis.createClient({
  url: REDIS_URL,
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal Server Error' });
});

// Start server
db.connect()
  .then(() => console.log('✅ Database connected'))
  .then(() => redis.connect())
  .then(() => console.log('✅ Redis connected'))
  .then(() => {
    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error('❌ Startup failed:', error);
    process.exit(1);
  });

export { app, db, redis };
```

**Test it**:
```bash
cd src/backend
npm run dev
# Should see:
# ✅ Database connected
# ✅ Redis connected
# ✅ Server running on http://localhost:3000

# Test health endpoint
curl http://localhost:3000/health
# Should return: {"status":"ok","timestamp":"2026-04-07T..."}
```

#### Step 2: Create Environment Configuration (30 minutes)

**File**: `src/backend/.env`

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://codereply:codereply_dev_password@localhost:5432/codereply
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev_jwt_secret_CHANGE_IN_PRODUCTION
```

**File**: `src/backend/.env.example`

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:password@host:5432/database
REDIS_URL=redis://host:6379
JWT_SECRET=your_jwt_secret_here
```

#### Step 3: Implement Registration Token Endpoint (2 hours)

**File**: `src/backend/src/routes/devices.ts`

```typescript
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'crypto';
import qrcode from 'qrcode';
import { db } from '../index';

const router = Router();

// POST /v1/devices/registration-token
router.post('/registration-token', async (req, res) => {
  try {
    // TODO: Validate API key (for now, hardcode a subscriber)
    const subscriberId = '11111111-1111-1111-1111-111111111111';

    // Check if subscriber can add more devices
    const { rows } = await db.query(
      'SELECT can_add_device($1) AS can_add',
      [subscriberId]
    );

    if (!rows[0].can_add) {
      return res.status(403).json({
        error: {
          code: 'DEVICE_QUOTA_EXCEEDED',
          message: 'Device quota exceeded. Upgrade your plan to add more devices.'
        }
      });
    }

    // Generate registration token
    const token = `cr_reg_${crypto.randomBytes(16).toString('hex')}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store in database
    await db.query(
      `INSERT INTO registration_tokens (subscriber_id, token_hash, expires_at)
       VALUES ($1, $2, $3)`,
      [subscriberId, tokenHash, expiresAt]
    );

    // Generate QR code
    const qrCodeDataUrl = await qrcode.toDataURL(token);

    res.status(200).json({
      data: {
        registrationToken: token,
        expiresAt: expiresAt.toISOString(),
        qrCode: qrCodeDataUrl
      }
    });
  } catch (error) {
    console.error('Registration token error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

**File**: `src/backend/src/index.ts` (add routes)

```typescript
// Import routes
import devicesRoutes from './routes/devices';

// Mount routes
app.use('/v1/devices', devicesRoutes);
```

**Test it**:
```bash
# Start server
npm run dev

# Test registration token generation
curl -X POST http://localhost:3000/v1/devices/registration-token

# Should return:
# {
#   "data": {
#     "registrationToken": "cr_reg_abc123...",
#     "expiresAt": "2026-04-07T11:00:00.000Z",
#     "qrCode": "data:image/png;base64,..."
#   }
# }
```

#### Step 4: Write API Tests (2 hours)

**File**: `src/backend/tests/integration/devices.api.test.ts`

```typescript
import request from 'supertest';
import { app, db } from '../../src/index';
import { TestDatabase } from '../helpers/testDatabaseSetup';

describe('Device Registration API', () => {
  let testDb: TestDatabase;

  beforeAll(async () => {
    testDb = await TestDatabase.getInstance();
  });

  beforeEach(async () => {
    await testDb.clearDatabase();
  });

  afterAll(async () => {
    await db.end();
  });

  describe('POST /v1/devices/registration-token', () => {
    it('should generate registration token', async () => {
      const response = await request(app)
        .post('/v1/devices/registration-token')
        .expect(200);

      expect(response.body.data).toHaveProperty('registrationToken');
      expect(response.body.data.registrationToken).toMatch(/^cr_reg_[a-f0-9]{32}$/);
      expect(response.body.data).toHaveProperty('expiresAt');
      expect(response.body.data).toHaveProperty('qrCode');
    });

    it('should reject when device quota exceeded', async () => {
      // Create subscriber with quota 1
      const subscriber = await testDb.createSubscriber({
        plan: 'free',
        max_devices: 1,
        device_count: 1
      });

      // Try to generate token (should fail)
      const response = await request(app)
        .post('/v1/devices/registration-token')
        .expect(403);

      expect(response.body.error.code).toBe('DEVICE_QUOTA_EXCEEDED');
    });
  });
});
```

**Run tests**:
```bash
npm test
```

#### Step 5: Add More Endpoints (3 hours)

Implement these in order:
1. ✅ POST /v1/devices/registration-token (done above)
2. POST /v1/devices/register
3. GET /v1/devices
4. GET /v1/devices/:id
5. DELETE /v1/devices/:id

### Testing Checklist After Implementation

```bash
# Unit Tests
[ ] Test device service functions
[ ] Test validation schemas
[ ] Test error handlers

# Integration Tests
[ ] Test registration token generation
[ ] Test device registration
[ ] Test device listing
[ ] Test device deletion

# Security Tests
[ ] Test unauthorized access (no API key)
[ ] Test invalid API key
[ ] Test cross-subscriber access attempts
[ ] Test quota enforcement

# Performance Tests
[ ] Test 100 concurrent requests
[ ] Test database query performance
[ ] Test Redis connection pooling
```

---

## 🔥 CRITICAL ACTION #3: Implement Android UI (BLOCKER FOR ANDROID TESTING)

### Status: ❌ **BLOCKING - Cannot Test App Without UI**

### What You Need (8-12 hours of work)

#### Step 1: Create AndroidManifest.xml (30 minutes)

**File**: `src/android/app/src/main/AndroidManifest.xml`

```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <!-- Permissions -->
    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.SEND_SMS" />
    <uses-permission android:name="android.permission.READ_PHONE_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />

    <application
        android:name=".GatewayApplication"
        android:allowBackup="true"
        android:icon="@mipmap/ic_launcher"
        android:label="@string/app_name"
        android:theme="@style/Theme.CodeReplyGateway">

        <activity
            android:name=".MainActivity"
            android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>

    </application>

</manifest>
```

#### Step 2: Create MainActivity (1 hour)

**File**: `src/android/app/src/main/java/com/codereply/gateway/MainActivity.kt`

```kotlin
package com.codereply.gateway

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Surface {
                    LoginScreen()
                }
            }
        }
    }
}

@Composable
fun LoginScreen() {
    var apiKey by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Text("CodeReply Gateway", style = MaterialTheme.typography.headlineMedium)
        Spacer(modifier = Modifier.height(32.dp))

        OutlinedTextField(
            value = apiKey,
            onValueChange = { apiKey = it },
            label = { Text("API Key") },
            placeholder = { Text("cr_live_xxxxx") }
        )

        Spacer(modifier = Modifier.height(16.dp))

        Button(onClick = { /* TODO */ }) {
            Text("Register Device")
        }
    }
}
```

#### Step 3: Build and Run (1 hour)

```bash
cd src/android

# Build APK
./gradlew assembleDebug

# Install on device/emulator
./gradlew installDebug

# Or run directly
./gradlew run
```

**Manual Test**:
1. App launches ✅
2. Shows login screen ✅
3. Can enter API key ✅
4. Button exists (doesn't do anything yet) ✅

#### Step 4: Implement RegistrationViewModel (3 hours)

**File**: `src/android/app/src/main/java/com/codereply/gateway/presentation/viewmodel/RegistrationViewModel.kt`

```kotlin
package com.codereply.gateway.presentation.viewmodel

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.codereply.gateway.data.preferences.CredentialsStore
import com.codereply.gateway.data.remote.api.ApiClient
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class RegistrationViewModel @Inject constructor(
    private val apiClient: ApiClient,
    private val credentialsStore: CredentialsStore
) : ViewModel() {

    private val _uiState = MutableStateFlow<RegistrationState>(RegistrationState.Idle)
    val uiState: StateFlow<RegistrationState> = _uiState

    fun registerWithApiKey(apiKey: String) {
        viewModelScope.launch {
            _uiState.value = RegistrationState.Loading

            try {
                // Step 1: Exchange API key for registration token
                val tokenResponse = apiClient.generateRegistrationToken(apiKey)

                // Step 2: Register device
                val deviceInfo = collectDeviceInfo()
                val registrationResponse = apiClient.registerDevice(
                    registrationToken = tokenResponse.registrationToken,
                    deviceName = deviceInfo.deviceName,
                    simCarrier = deviceInfo.simCarrier,
                    simNumber = deviceInfo.simNumber,
                    androidVersion = deviceInfo.androidVersion,
                    appVersion = "1.0.0"
                )

                // Step 3: Save credentials
                credentialsStore.saveDeviceToken(registrationResponse.deviceToken)
                credentialsStore.saveDeviceId(registrationResponse.deviceId)
                credentialsStore.saveSubscriberInfo(
                    subscriberId = registrationResponse.subscriberId,
                    subscriberName = registrationResponse.subscriberName,
                    subscriberPlan = registrationResponse.subscriberPlan,
                    dailyQuota = registrationResponse.dailyQuota
                )

                _uiState.value = RegistrationState.Success
            } catch (e: Exception) {
                _uiState.value = RegistrationState.Error(e.message ?: "Registration failed")
            }
        }
    }

    private fun collectDeviceInfo(): DeviceInfo {
        // TODO: Use DeviceInfoProvider
        return DeviceInfo(
            deviceName = "Test Device",
            simCarrier = "Test Carrier",
            simNumber = null,
            androidVersion = "14"
        )
    }
}

sealed class RegistrationState {
    object Idle : RegistrationState()
    object Loading : RegistrationState()
    object Success : RegistrationState()
    data class Error(val message: String) : RegistrationState()
}

data class DeviceInfo(
    val deviceName: String,
    val simCarrier: String?,
    val simNumber: String?,
    val androidVersion: String
)
```

#### Step 5: Write Android Tests (2 hours)

**File**: `src/android/app/src/test/java/com/codereply/gateway/RegistrationViewModelTest.kt`

```kotlin
class RegistrationViewModelTest {
    @get:Rule
    val instantExecutorRule = InstantTaskExecutorRule()

    private lateinit var viewModel: RegistrationViewModel
    private lateinit var mockApiClient: ApiClient
    private lateinit var mockCredentialsStore: CredentialsStore

    @Before
    fun setup() {
        mockApiClient = mockk()
        mockCredentialsStore = mockk(relaxed = true)
        viewModel = RegistrationViewModel(mockApiClient, mockCredentialsStore)
    }

    @Test
    fun `registerWithApiKey should succeed with valid API key`() = runTest {
        // Given
        val apiKey = "cr_live_test123"
        coEvery { mockApiClient.generateRegistrationToken(apiKey) } returns
            RegistrationTokenResponse("cr_reg_abc123", "2026-04-07T11:00:00Z", null)

        coEvery { mockApiClient.registerDevice(any()) } returns
            DeviceRegistrationResponse(/* ... */)

        // When
        viewModel.registerWithApiKey(apiKey)

        // Then
        val state = viewModel.uiState.value
        assertTrue(state is RegistrationState.Success)
        verify { mockCredentialsStore.saveDeviceToken(any()) }
    }
}
```

**Run tests**:
```bash
./gradlew test
```

### Android Testing Checklist

```bash
# Unit Tests
[ ] CredentialsStore tests
[ ] ApiClient tests
[ ] DeviceInfoProvider tests
[ ] RegistrationViewModel tests

# UI Tests
[ ] LoginScreen displays correctly
[ ] API key input validation
[ ] Registration button click
[ ] Error messages display

# Integration Tests
[ ] Complete registration flow
[ ] Credential storage
[ ] Navigation after registration

# Manual Tests (Physical Device)
[ ] Camera permission request
[ ] SMS permission request
[ ] QR code scanner
[ ] Actual SMS sending
```

---

## 🔥 CRITICAL ACTION #4: Initialize Web Project (BLOCKER FOR WEB TESTING)

### Status: ❌ **BLOCKING - Cannot Test Web Without Build Config**

### What You Need (4-6 hours of work)

#### Step 1: Initialize Package.json (30 minutes)

```bash
cd src/web

# Initialize project
npm init -y

# Install dependencies
npm install react react-dom react-router-dom zustand axios socket.io-client
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom
npm install -D tailwindcss postcss autoprefixer
npm install -D eslint prettier
```

**File**: `src/web/package.json`

```json
{
  "name": "codereply-web",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc && vite build",
    "preview": "vite preview",
    "lint": "eslint src --ext ts,tsx",
    "test": "vitest"
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
    "tailwindcss": "^3.3.6",
    "postcss": "^8.4.32",
    "autoprefixer": "^10.4.16"
  }
}
```

#### Step 2: Configure Vite + TypeScript (30 minutes)

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

**File**: `src/web/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "useDefineForClassFields": true,
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

#### Step 3: Create Basic App (1 hour)

**File**: `src/web/src/main.tsx`

```typescript
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

**File**: `src/web/src/App.tsx`

```typescript
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
```

**File**: `src/web/src/pages/Dashboard.tsx`

```typescript
function Dashboard() {
  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold">CodeReply Dashboard</h1>
      <p className="mt-4">BYOD SMS Gateway</p>
    </div>
  );
}

export default Dashboard;
```

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

#### Step 4: Test It (15 minutes)

```bash
cd src/web

# Install dependencies
npm install

# Start dev server
npm run dev

# Open browser
# http://localhost:5173
```

**Manual Test**:
1. Page loads ✅
2. Shows dashboard ✅
3. Tailwind CSS working ✅

### Web Testing Checklist

```bash
# Component Tests (Vitest)
[ ] Button component
[ ] Input component
[ ] Card component
[ ] DeviceCard component

# Page Tests
[ ] Dashboard renders
[ ] Messages page renders
[ ] Devices page renders

# Integration Tests
[ ] API calls work
[ ] WebSocket connection
[ ] State updates

# E2E Tests (Playwright)
[ ] User can register device
[ ] User can view devices
[ ] User can send message
```

---

## 📋 TESTING PRIORITY ORDER

### Week 1 (Sprint 1)
1. ✅ **Test database migrations** (DO THIS TODAY - 30 min)
2. ✅ **Test database functions** (DO THIS TODAY - 15 min)
3. ⏳ **Implement backend server** (Days 2-3)
4. ⏳ **Test registration token API** (Day 4)

### Week 2 (Sprint 2)
5. ⏳ **Test device registration endpoint** (Days 6-7)
6. ⏳ **Test message sending endpoint** (Day 8)
7. ⏳ **Test Android registration flow** (Days 9-10)

### Week 3 (Sprint 3)
8. ⏳ **Test Web dashboard** (Days 11-13)
9. ⏳ **Integration tests** (Days 14-15)

---

## 🎯 IMMEDIATE NEXT STEPS (Today/Tomorrow)

### Today (4 hours)

```bash
# 1. Test Database (30 minutes)
docker-compose up -d db
./src/backend/database/test_migrations.sh

# 2. Initialize Backend Server (2 hours)
cd src/backend
# Create src/index.ts (see Step 1 above)
npm run dev
curl http://localhost:3000/health

# 3. Implement Registration Token Endpoint (1.5 hours)
# Create src/routes/devices.ts (see Step 3 above)
# Test with curl

# 4. Document Results
# Update TESTING_READINESS.md with pass/fail results
```

### Tomorrow (6 hours)

```bash
# 1. Write API Tests (2 hours)
# Create integration tests for registration token

# 2. Implement Android MainActivity (2 hours)
# Create MainActivity.kt and AndroidManifest.xml

# 3. Initialize Web Project (2 hours)
cd src/web
npm init -y
# Setup Vite, React, TypeScript
npm run dev
```

---

## 📊 SUCCESS CRITERIA

### Database Testing ✅
- [ ] All 11 migrations apply successfully
- [ ] All 5 triggers work correctly
- [ ] All 4 database functions return expected results
- [ ] Security triggers prevent cross-subscriber access
- [ ] Quota triggers enforce limits

### Backend API Testing
- [ ] Server starts without errors
- [ ] Health endpoint responds
- [ ] Database connection works
- [ ] Redis connection works
- [ ] Registration token endpoint returns valid token
- [ ] Quota enforcement works
- [ ] API tests pass (>80% coverage)

### Android App Testing
- [ ] App builds without errors
- [ ] App launches on device/emulator
- [ ] Login screen displays
- [ ] API key input works
- [ ] Registration flow completes
- [ ] Credentials stored securely

### Web Dashboard Testing
- [ ] Build completes successfully
- [ ] Dev server starts
- [ ] Dashboard page loads
- [ ] API client makes requests
- [ ] Routing works

---

**Last Updated**: April 7, 2026
**Next Review**: End of Day 2 (after database testing)
**Status**: Database ready to test NOW, everything else needs implementation first
