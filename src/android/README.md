# CodeReply Android Gateway

The Android application that physically sends SMS messages via the device's SIM card under the BYOD (Bring Your Own Device) model.

## Overview

This is a Kotlin Android app that:
- **Subscriber-owned**: Each device is registered and owned by a specific subscriber
- Maintains a persistent WebSocket connection to the backend
- Receives SMS send instructions in real-time from subscriber's messages
- Sends SMS using Android's SmsManager API
- Tracks and reports delivery status
- Buffers messages locally when offline
- Runs as a foreground service for reliability

## Technology Stack

- **Language**: Kotlin
- **Min SDK**: API 26 (Android 8.0 Oreo)
- **Target SDK**: API 35 (Android 15)
- **Architecture**: MVVM + Clean Architecture
- **UI**: Jetpack Compose
- **DI**: Hilt (recommended) or Koin
- **Database**: Room
- **Networking**: OkHttp + Retrofit
- **WebSocket**: OkHttp WebSocket
- **Async**: Kotlin Coroutines + Flow
- **Security**: EncryptedSharedPreferences, Jetpack Security
- **QR Scanning**: ML Kit Barcode Scanning

## BYOD Model

In the BYOD (Bring Your Own Device) architecture:

- **Subscribers own their devices**: Each subscriber manages their own Android gateway devices
- **Device isolation**: Messages only route to the subscriber's own devices
- **Self-service registration**: Subscribers download the app and register with their API key
- **Quota management**: Each subscriber has their own device quota (e.g., max 2 devices for Starter plan)
- **Complete control**: Subscribers can add/remove devices from their web dashboard

## Getting Started

### Prerequisites

- Android Studio (latest stable version)
- JDK 17+
- Android SDK with API 26-35
- Physical Android device with SIM card (for full testing)
- **CodeReply subscriber account** with API key

### Setup for Subscribers

#### Step 1: Get Your API Key

1. Log in to your CodeReply dashboard at https://app.codereply.com
2. Navigate to **Settings** → **API Keys**
3. Click **Create API Key** (if you don't have one)
4. Copy your API key (starts with `cr_live_` or `cr_test_`)
5. Keep this key secure - you'll need it to register your device

#### Step 2: Download the App

**Option A: Google Play Store (Production)**
```
Coming soon: Install from Play Store
https://play.google.com/store/apps/details?id=com.codereply.gateway
```

**Option B: Download APK (Beta/Development)**
```
1. Download the latest APK from releases
2. Enable "Install from unknown sources" in Android settings
3. Install the APK
```

**Option C: Build from Source (Developers)**
```bash
# Clone the repository
git clone https://github.com/your-org/codereply.git
cd codereply/src/android

# Open in Android Studio
# File > Open > Select src/android

# Build and install
./gradlew installDebug
```

#### Step 3: Register Your Device

**Method 1: Scan QR Code (Easiest)**

1. Open the CodeReply Gateway app on your Android device
2. Tap **"Scan QR Code"**
3. In your web dashboard, go to **Devices** → **Add Device**
4. Click **"Show QR Code"**
5. Scan the QR code with your phone
6. The app will automatically register your device

**Method 2: Enter API Key Manually**

1. Open the CodeReply Gateway app
2. Enter your API key in the text field
3. Tap **"Register Device"**
4. Wait for registration to complete

#### Step 4: Grant Permissions

The app will request the following permissions:

- **Send SMS**: Required to send messages
- **Camera**: Required for QR code scanning (optional)
- **Phone State**: To detect SIM card information
- **Notifications**: To show foreground service status

Grant all permissions for full functionality.

#### Step 5: Disable Battery Optimization

To ensure the app stays running:

1. Go to **Settings** → **Apps** → **CodeReply Gateway**
2. Tap **Battery**
3. Select **"Unrestricted"** or **"Don't optimize"**
4. Confirm

This prevents Android from killing the background service.

#### Step 6: Verify Connection

Once registered, you should see:

- **Green status indicator**: Device is online
- **Subscriber name**: Your account name
- **Quota usage**: Messages sent today / daily limit

The device is now ready to send SMS messages!

## Device Registration Flow

### Registration Process

```
┌─────────────────────────────────────────────────────────────┐
│                 Subscriber (You)                            │
│                                                             │
│ 1. Login to web dashboard                                   │
│ 2. Get API key (cr_live_xxxxx)                              │
│ 3. Download CodeReply Gateway app                           │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        │ API Key or QR Code
                        ▼
┌─────────────────────────────────────────────────────────────┐
│                Android Gateway App                          │
│                                                             │
│ Step 1: Enter API key or scan QR code                       │
│                                                             │
│ Step 2: App exchanges API key for registration token        │
│         POST /devices/registration-token                    │
│         Authorization: Bearer cr_live_xxxxx                 │
│                                                             │
│ Step 3: App registers device with registration token        │
│         POST /devices/register                              │
│         {                                                   │
│           registrationToken: "cr_reg_yyy...",               │
│           deviceName: "Samsung Galaxy S21",                 │
│           simCarrier: "Globe Telecom",                      │
│           simNumber: "+639171234567",                       │
│           androidVersion: "13",                             │
│           appVersion: "1.0.0"                               │
│         }                                                   │
│                                                             │
│ Step 4: Backend returns device token (JWT)                  │
│         {                                                   │
│           deviceId: "device-abc-123",                       │
│           deviceToken: "eyJhbGc...",                        │
│           websocketUrl: "wss://ws.codereply.app/gateway",   │
│           subscriberId: "sub-xyz-789",                      │
│           subscriberName: "Acme Corp",                      │
│           dailyQuota: 1000                                  │
│         }                                                   │
│                                                             │
│ Step 5: App stores credentials in EncryptedSharedPrefs      │
│                                                             │
│ Step 6: App connects to WebSocket with device token         │
│         wss://ws.codereply.app/gateway                      │
│         Authorization: Bearer eyJhbGc...                    │
│                                                             │
│ ✅ Device is now ONLINE and ready to send messages          │
└─────────────────────────────────────────────────────────────┘
```

### What Happens Behind the Scenes

1. **API Key Validation**: Your API key is verified against your subscriber account
2. **Quota Check**: Backend checks if you haven't exceeded your device quota (e.g., max 2 devices)
3. **Token Generation**: A unique registration token is generated (valid for 1 hour, one-time use)
4. **Device Registration**: Your device is registered under your subscriber account
5. **Device Token Issued**: A long-lived JWT token is issued (valid for 1 year)
6. **WebSocket Connection**: Device connects using the token, goes online
7. **Ready to Send**: Your device can now receive and send SMS for your account

## Project Structure

```
app/
├── src/
│   ├── main/
│   │   ├── java/com/codereply/gateway/
│   │   │   ├── data/
│   │   │   │   ├── local/          # Room database
│   │   │   │   ├── remote/         # API & WebSocket
│   │   │   │   ├── repository/     # Repository impl
│   │   │   │   └── preferences/    # EncryptedSharedPreferences
│   │   │   ├── domain/
│   │   │   │   ├── model/          # Domain models
│   │   │   │   ├── repository/     # Interfaces
│   │   │   │   └── usecase/        # Business logic
│   │   │   ├── presentation/
│   │   │   │   ├── ui/
│   │   │   │   │   ├── login/      # Login/Registration screens
│   │   │   │   │   ├── dashboard/  # Main dashboard
│   │   │   │   │   └── settings/   # Settings screens
│   │   │   │   └── viewmodel/      # ViewModels
│   │   │   ├── service/
│   │   │   │   ├── GatewayService.kt
│   │   │   │   └── SmsDispatcher.kt
│   │   │   ├── receiver/
│   │   │   │   └── SmsDeliveryReceiver.kt
│   │   │   ├── di/                 # Hilt modules
│   │   │   └── util/
│   │   │       ├── QrScanner.kt
│   │   │       └── TokenValidator.kt
│   │   └── AndroidManifest.xml
│   └── test/                        # Unit tests
│       └── androidTest/             # Integration tests
└── build.gradle.kts
```

## Key Components

### 1. Login & Registration (NEW for BYOD)
- **Login Screen**: Enter API key or scan QR code
- **QR Scanner**: ML Kit barcode scanner for easy setup
- **Registration ViewModel**: Handles API key exchange and device registration
- **Credentials Store**: Secure storage using EncryptedSharedPreferences

### 2. GatewayService (Foreground Service)
- Runs persistently in the foreground
- Maintains WebSocket connection to backend
- Processes incoming SMS send instructions (only for this subscriber)
- Reports device status and heartbeats
- **Displays subscriber name and quota in notification**

### 3. WebSocket Client (Subscriber-Scoped)
- Persistent connection with auto-reconnect
- **Authenticates with device token (contains subscriber_id)**
- Handles incoming messages (SEND_SMS, PING, CONFIG_UPDATE)
- Sends outgoing messages (DELIVERY_REPORT, HEARTBEAT, STATUS)
- **Only receives messages for the subscriber who owns this device**

### 4. SmsDispatcher
- Sends SMS via Android SmsManager
- Handles long messages (multipart SMS)
- Tracks delivery status with broadcast receivers
- Reports success/failure to backend

### 5. Local Database (Room)
- Buffers messages when offline
- Stores delivery history
- Caches device configuration
- **Stores subscriber context locally**

### 6. UI Dashboard (Jetpack Compose)
- **Connection status indicator**
- **Subscriber information**: Name, plan type
- **Quota usage**: Messages sent today / daily limit
- **Device stats**: SIM carrier, signal strength
- **Message log viewer**
- **Settings and diagnostics**

## Permissions Required

The app needs these permissions:

```xml
<!-- Core SMS functionality -->
<uses-permission android:name="android.permission.SEND_SMS" />

<!-- Network connectivity -->
<uses-permission android:name="android.permission.INTERNET" />

<!-- Foreground service -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_DATA_SYNC" />

<!-- Auto-start on device boot -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- Battery optimization exemption -->
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />

<!-- Notifications -->
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />

<!-- SIM card information -->
<uses-permission android:name="android.permission.READ_PHONE_STATE" />

<!-- QR code scanning (optional) -->
<uses-permission android:name="android.permission.CAMERA" />
```

## Development

### Running Tests

```bash
# Unit tests
./gradlew test

# Integration tests (requires device/emulator)
./gradlew connectedAndroidTest

# With coverage
./gradlew testDebugUnitTestCoverage
```

### Code Quality

```bash
# Lint check
./gradlew lint

# Kotlin formatting (ktlint)
./gradlew ktlintCheck
./gradlew ktlintFormat
```

### Building

```bash
# Debug build
./gradlew assembleDebug

# Release build (requires signing config)
./gradlew assembleRelease

# Install on connected device
./gradlew installDebug
```

## WebSocket Message Format (BYOD)

### Incoming (Backend → Device)

```json
{
  "type": "SEND_SMS",
  "messageId": "msg-uuid-1234",
  "to": "+639171234567",
  "body": "Your OTP is 123456",
  "priority": "HIGH",
  "ttl": 300
}
```

### Outgoing (Device → Backend)

```json
{
  "type": "DELIVERY_REPORT",
  "messageId": "msg-uuid-1234",
  "status": "DELIVERED",
  "timestamp": 1743580800000,
  "deviceId": "device-abc-123"
}

{
  "type": "HEARTBEAT",
  "deviceId": "device-abc-123",
  "timestamp": 1743580800000,
  "simInfo": {
    "carrier": "Globe Telecom",
    "number": "+639171234567",
    "signalStrength": 4
  },
  "stats": {
    "messagesSentToday": 142,
    "batteryLevel": 85,
    "wifiConnected": true
  }
}
```

## Production Setup

For production gateway devices:

### 1. Dedicated Device
- Use a dedicated Android phone, not a personal device
- Recommended: Budget Android phone with good battery life
- Examples: Samsung Galaxy A series, Motorola G series

### 2. Active SIM Card
- Install SIM card with active SMS plan
- Choose carrier with good coverage in your area
- Ensure sufficient SMS credits

### 3. Battery Optimization
- **Disable battery optimization** for CodeReply app
- Settings → Apps → CodeReply Gateway → Battery → Unrestricted

### 4. Auto-Start on Boot
- Enable auto-start (vendor-specific settings)
- Xiaomi: Security → Autostart → Enable for CodeReply
- Samsung: Settings → Apps → CodeReply → Battery → Allow background activity
- Huawei: Phone Manager → Protected apps → Enable CodeReply

### 5. Power Management
- Keep device plugged in 24/7
- Use quality charger to prevent battery degradation
- Consider using outlet timer for periodic charging cycles

### 6. Internet Connection
- Ensure stable Wi-Fi or mobile data
- Use Wi-Fi for cost savings (SMS sending doesn't require data)
- Consider backup mobile data connection

### 7. Physical Setup
- Place device in well-ventilated area (prevent overheating)
- Avoid direct sunlight
- Ensure stable surface (prevent falls)

## Troubleshooting

### Registration Issues

#### "Invalid API Key"
- **Cause**: API key format is incorrect or expired
- **Solution**:
  - Verify API key starts with `cr_live_` or `cr_test_`
  - Copy the entire API key (no spaces)
  - Generate new API key from web dashboard

#### "Device Quota Exceeded"
- **Cause**: You've reached the maximum number of devices for your plan
- **Solution**:
  - Check your plan limits (Starter: 1 device, Pro: 2 devices, Enterprise: unlimited)
  - Remove unused devices from web dashboard
  - Upgrade your plan to increase device quota

#### QR Scanner Not Working
- **Cause**: Camera permission not granted or ML Kit not initialized
- **Solution**:
  - Grant Camera permission when prompted
  - Ensure good lighting when scanning
  - Try manual API key entry instead

### Connection Issues

#### WebSocket Connection Fails
- **Cause**: Device token invalid or internet connectivity issues
- **Solution**:
  - Check internet connection (Wi-Fi or mobile data)
  - Verify device wasn't deleted from web dashboard
  - Try restarting the app
  - Check backend URL is correct

#### Device Shows "Offline" on Dashboard
- **Cause**: App not running or WebSocket disconnected
- **Solution**:
  - Open the app and verify it's running
  - Check foreground service notification is visible
  - Disable battery optimization for the app
  - Restart the app

#### "Device Revoked" Error
- **Cause**: Device was deleted from web dashboard
- **Solution**:
  - This device has been removed from your account
  - Clear app data and re-register if needed
  - Use a different device

### SMS Sending Issues

#### SMS Not Sending
- **Cause**: Permission issues or SIM card problems
- **Solution**:
  - Verify SEND_SMS permission is granted
  - Check SIM card is active and has SMS credits
  - Ensure good cellular signal strength
  - Test sending SMS manually from phone app

#### "No SIM Card" Error
- **Cause**: SIM card not detected or airplane mode enabled
- **Solution**:
  - Insert SIM card properly
  - Disable airplane mode
  - Restart device
  - Check SIM card is not locked (PIN)

#### Messages Delayed
- **Cause**: Poor cellular signal or carrier throttling
- **Solution**:
  - Check signal strength indicator
  - Move device to location with better signal
  - Consider using different carrier
  - Check for carrier SMS rate limits

### Service Stops Running

#### App Closes Automatically
- **Cause**: Android battery optimization killing the app
- **Solution**:
  - Disable battery optimization (Settings → Apps → Battery → Unrestricted)
  - Enable auto-start on boot (vendor-specific)
  - Lock app in recent apps (vendor-specific)
  - Use "Don't kill my app" guide for your device: https://dontkillmyapp.com/

#### Service Not Starting on Boot
- **Cause**: Auto-start permission not granted
- **Solution**:
  - Enable "Auto-start" or "Background activity" for the app
  - Check RECEIVE_BOOT_COMPLETED permission is granted
  - Restart device and verify app starts automatically

### Quota Issues

#### "Daily Quota Reached" Error
- **Cause**: You've sent the maximum messages for today
- **Solution**:
  - Wait until midnight (UTC) for quota reset
  - Upgrade your plan for higher daily quota
  - Contact support if you need an emergency quota increase

## Managing Your Device

### View Device Status

1. Log in to web dashboard
2. Navigate to **Devices**
3. See all your registered devices with:
   - Online/offline status
   - Messages sent today
   - Last heartbeat timestamp
   - SIM carrier information

### Remove a Device

1. Log in to web dashboard
2. Navigate to **Devices**
3. Click the **"Delete"** button next to the device
4. Confirm deletion

**Note**: The device will be immediately disconnected and credentials revoked.

### Add Another Device

If you're on a plan that allows multiple devices:

1. Repeat the registration process on another Android device
2. Each device operates independently
3. Messages are load-balanced across your online devices

## Security Considerations

### Secure Credential Storage
- Device tokens are stored in **EncryptedSharedPreferences**
- Never store tokens in plain SharedPreferences
- Credentials are cleared when device is unregistered

### API Key Protection
- Never share your API key publicly
- Don't commit API keys to version control
- Regenerate API key if compromised

### Device Revocation
- You can instantly revoke a device from the web dashboard
- Deleted devices are immediately disconnected
- Re-registration requires new API key exchange

## AI Agent Support

Use **@leonard** for all Android development:

```
@leonard create the login screen with API key input
@leonard implement QR code scanner for registration
@leonard build the registration ViewModel
@leonard implement EncryptedSharedPreferences storage
@leonard update WebSocket client for BYOD authentication
@leonard design the dashboard UI with subscriber info
@leonard write unit tests for registration flow
```

## Next Steps

1. Review the BYOD architecture document at `/docs/BYOD_ARCHITECTURE.md`
2. Check the implementation guide at `/docs/ANDROID_BYOD_IMPLEMENTATION.md`
3. Use `@leonard` to implement BYOD components
4. Test registration flow on physical device with SIM card
5. Add comprehensive error handling
6. Write tests with `@amy`
7. Optimize battery usage

## Resources

- [BYOD Architecture Document](/docs/BYOD_ARCHITECTURE.md)
- [Android BYOD Implementation Guide](/docs/ANDROID_BYOD_IMPLEMENTATION.md)
- [Android SMS Manager](https://developer.android.com/reference/android/telephony/SmsManager)
- [Foreground Services](https://developer.android.com/guide/components/foreground-services)
- [WebSocket with OkHttp](https://square.github.io/okhttp/features/websockets/)
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
- [EncryptedSharedPreferences](https://developer.android.com/reference/androidx/security/crypto/EncryptedSharedPreferences)
- [ML Kit Barcode Scanning](https://developers.google.com/ml-kit/vision/barcode-scanning)
- [Don't Kill My App Guide](https://dontkillmyapp.com/)

## Support

### For Subscribers

If you encounter issues:

1. Check the troubleshooting section above
2. Visit the help center at https://help.codereply.com
3. Contact support at support@codereply.com
4. Join our community Discord: https://discord.gg/codereply

### For Developers

- GitHub Issues: https://github.com/your-org/codereply/issues
- Developer Docs: https://docs.codereply.com/developers
- API Reference: https://docs.codereply.com/api

## License

Copyright 2026 CodeReply. All rights reserved.
