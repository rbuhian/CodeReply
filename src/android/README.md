# CodeReply Android Gateway

The Android application that physically sends SMS messages via the device's SIM card.

## Overview

This is a Kotlin Android app that:
- Maintains a persistent WebSocket connection to the backend
- Receives SMS send instructions in real-time
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

## Getting Started

### Prerequisites
- Android Studio (latest stable version)
- JDK 17+
- Android SDK with API 26-35
- Physical Android device with SIM card (for full testing)

### Setup

1. **Open in Android Studio**
   ```bash
   # Open the android directory in Android Studio
   File > Open > Select src/android
   ```

2. **Sync Gradle**
   - Android Studio will automatically prompt to sync
   - Or: File > Sync Project with Gradle Files

3. **Configure Backend URL**

   Create `local.properties` (if not exists) and add:
   ```properties
   backend.url=ws://10.0.2.2:3000/gateway
   # Use your local IP for physical devices
   # backend.url=ws://192.168.1.100:3000/gateway
   ```

4. **Run the app**
   - Connect Android device or start emulator
   - Click Run (Shift+F10)

## Project Structure

```
app/
├── src/
│   ├── main/
│   │   ├── java/com/codereply/gateway/
│   │   │   ├── data/
│   │   │   │   ├── local/          # Room database
│   │   │   │   ├── remote/         # API & WebSocket
│   │   │   │   └── repository/     # Repository impl
│   │   │   ├── domain/
│   │   │   │   ├── model/          # Domain models
│   │   │   │   ├── repository/     # Interfaces
│   │   │   │   └── usecase/        # Business logic
│   │   │   ├── presentation/
│   │   │   │   ├── ui/             # Compose screens
│   │   │   │   └── viewmodel/      # ViewModels
│   │   │   ├── service/
│   │   │   │   ├── GatewayService.kt
│   │   │   │   └── SmsDispatcher.kt
│   │   │   ├── receiver/
│   │   │   │   └── SmsDeliveryReceiver.kt
│   │   │   ├── di/                 # Hilt modules
│   │   │   └── util/
│   │   └── AndroidManifest.xml
│   └── test/                        # Unit tests
│       └── androidTest/             # Integration tests
└── build.gradle.kts
```

## Key Components

### 1. GatewayService (Foreground Service)
- Runs persistently in the foreground
- Maintains WebSocket connection to backend
- Processes incoming SMS send instructions
- Reports device status and heartbeats

### 2. WebSocket Client
- Persistent connection with auto-reconnect
- Exponential backoff for reconnection
- Handles incoming messages (SEND_SMS, PING, CONFIG_UPDATE)
- Sends outgoing messages (DELIVERY_REPORT, HEARTBEAT, STATUS)

### 3. SmsDispatcher
- Sends SMS via Android SmsManager
- Handles long messages (multipart SMS)
- Tracks delivery status with broadcast receivers
- Reports success/failure to backend

### 4. Local Database (Room)
- Buffers messages when offline
- Stores delivery history
- Caches device configuration

### 5. UI Dashboard
- Connection status indicator
- Messages sent today counter
- Success rate display
- Message log viewer
- Settings and diagnostics

## Permissions Required

The app needs these permissions:

```xml
<uses-permission android:name="android.permission.SEND_SMS" />
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />
<uses-permission android:name="android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS" />
<uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
<uses-permission android:name="android.permission.READ_PHONE_STATE" />
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

# Release build
./gradlew assembleRelease

# Install on connected device
./gradlew installDebug
```

## Device Registration Flow

1. User opens the app for the first time
2. App prompts for backend URL (or uses preconfigured)
3. App collects device info (SIM carrier, number, Android version)
4. App calls `POST /devices/register` on backend
5. Backend returns device token (JWT)
6. App stores token securely in EncryptedSharedPreferences
7. App connects to WebSocket using the device token
8. Backend acknowledges connection
9. App starts listening for SMS send instructions

## WebSocket Message Format

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
  "timestamp": 1743580800000
}
```

## Testing Without Backend

Use a mock WebSocket server for development:

```kotlin
class MockWebSocketServer {
    fun start() {
        // Send test SEND_SMS messages
        // Receive and log DELIVERY_REPORT messages
    }
}
```

## Production Setup

For production gateway devices:

1. **Dedicated Device**: Use a dedicated Android phone, not a personal device
2. **Active SIM**: Install SIM card with active SMS plan
3. **Battery Optimization**: Disable for CodeReply app
4. **Auto-Start**: Enable auto-start on device boot (vendor-specific)
5. **Power**: Keep device plugged in 24/7
6. **Internet**: Ensure stable Wi-Fi or mobile data

## Troubleshooting

### WebSocket Connection Issues
- Check backend URL is correct
- Verify device has internet connection
- Check device token is valid
- Review logcat for errors

### SMS Not Sending
- Verify SEND_SMS permission is granted
- Check SIM card is active
- Ensure SmsManager is available
- Check for carrier restrictions

### Service Stops
- Disable battery optimization for the app
- Enable auto-start (vendor-specific settings)
- Check for Android memory management issues

## AI Agent Support

Use **@leonard** for all Android development:

```
@leonard create the GatewayService foreground service
@leonard implement WebSocket client with auto-reconnect
@leonard build the SmsDispatcher with delivery tracking
@leonard design the Compose UI for the dashboard
@leonard write unit tests for ViewModels
```

## Next Steps

1. Review `CodeReply_Technical_Document.md` section 4 (Android Gateway App)
2. Use @leonard to implement core components
3. Test on physical device with SIM card
4. Add comprehensive error handling
5. Write tests with @amy
6. Optimize battery usage

## Resources

- [Android SMS Manager](https://developer.android.com/reference/android/telephony/SmsManager)
- [Foreground Services](https://developer.android.com/guide/components/foreground-services)
- [WebSocket with OkHttp](https://square.github.io/okhttp/features/websockets/)
- [Jetpack Compose](https://developer.android.com/jetpack/compose)
