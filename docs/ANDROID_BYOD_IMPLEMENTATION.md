# Android BYOD Implementation Guide

**Version:** 1.0.0
**Date:** April 2, 2026
**Author:** Leonard (Android Developer)
**Status:** Implementation Guide

---

## Table of Contents

1. [Overview](#1-overview)
2. [Registration Flow](#2-registration-flow)
3. [API Key Login Implementation](#3-api-key-login-implementation)
4. [QR Code Scanner](#4-qr-code-scanner)
5. [Device Registration](#5-device-registration)
6. [Secure Token Storage](#6-secure-token-storage)
7. [WebSocket Authentication](#7-websocket-authentication)
8. [UI Implementation](#8-ui-implementation)
9. [Testing Guide](#9-testing-guide)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Overview

The BYOD (Bring Your Own Device) model shifts device ownership from operators to subscribers. Subscribers register their own Android devices using an API key from the web dashboard.

### Key Changes from Operator Model

| Aspect | Before (Operator) | After (BYOD) |
|--------|------------------|--------------|
| **Registration** | Operator registers devices | Subscriber registers via app |
| **Authentication** | Operator-generated token | API key → Registration token → Device token |
| **Token Content** | `{ device_id }` | `{ device_id, subscriber_id }` |
| **UI** | Generic device status | Show subscriber name, quota |
| **Security** | Plain SharedPreferences | EncryptedSharedPreferences |

### Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                 Subscriber Web Dashboard                 │
│                                                          │
│  1. Login to account                                     │
│  2. Navigate to "Devices"                                │
│  3. Click "Add Device"                                   │
│  4. Generate API key (or use existing)                   │
│  5. Display QR code with API key                         │
└────────────────────┬─────────────────────────────────────┘
                     │
                     │ API Key (cr_live_xxxxx)
                     │ or QR Code
                     ▼
┌──────────────────────────────────────────────────────────┐
│              Android Gateway App                         │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Login Screen                                       │  │
│  │ - Enter API key manually                           │  │
│  │ - OR scan QR code from dashboard                   │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
│                     │ Step 1: Generate Registration Token│
│                     ▼                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ POST /devices/registration-token                   │  │
│  │ Authorization: Bearer cr_live_xxxxx                │  │
│  │                                                    │  │
│  │ Response:                                          │  │
│  │ {                                                  │  │
│  │   registrationToken: "cr_reg_yyy...",              │  │
│  │   expiresAt: "2026-04-02T11:00:00Z"                │  │
│  │ }                                                  │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
│                     │ Step 2: Collect Device Info        │
│                     ▼                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Device Info Collection                             │  │
│  │ - Device name (Build.MODEL)                        │  │
│  │ - SIM carrier (TelephonyManager)                   │  │
│  │ - SIM number (if available)                        │  │
│  │ - Android version                                  │  │
│  │ - App version                                      │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
│                     │ Step 3: Register Device             │
│                     ▼                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ POST /devices/register                             │  │
│  │ {                                                  │  │
│  │   registrationToken: "cr_reg_yyy...",              │  │
│  │   deviceName: "Samsung Galaxy S21",                │  │
│  │   simCarrier: "Globe Telecom",                     │  │
│  │   simNumber: "+639171234567",                      │  │
│  │   androidVersion: "13",                            │  │
│  │   appVersion: "1.0.0"                              │  │
│  │ }                                                  │  │
│  │                                                    │  │
│  │ Response:                                          │  │
│  │ {                                                  │  │
│  │   deviceId: "device-abc-123",                      │  │
│  │   deviceToken: "eyJhbG...",  // JWT               │  │
│  │   websocketUrl: "wss://...",                       │  │
│  │   subscriberId: "sub-xyz-789",                     │  │
│  │   subscriberName: "Acme Corp"                      │  │
│  │ }                                                  │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
│                     │ Step 4: Store Credentials Securely │
│                     ▼                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ EncryptedSharedPreferences                         │  │
│  │ - device_token: "eyJhbG..."                        │  │
│  │ - device_id: "device-abc-123"                      │  │
│  │ - subscriber_id: "sub-xyz-789"                     │  │
│  │ - subscriber_name: "Acme Corp"                     │  │
│  └──────────────────┬─────────────────────────────────┘  │
│                     │                                     │
│                     │ Step 5: Connect WebSocket          │
│                     ▼                                     │
│  ┌────────────────────────────────────────────────────┐  │
│  │ WebSocket Connection                               │  │
│  │ wss://ws.codereply.app/gateway                     │  │
│  │ Authorization: Bearer eyJhbG...                    │  │
│  │                                                    │  │
│  │ → Device is now ONLINE                             │  │
│  │ → Ready to receive SMS send instructions           │  │
│  └────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Registration Flow

### 2.1 User Journey

1. **Download App**: User downloads CodeReply Gateway from Play Store
2. **Open App**: First launch shows login screen
3. **Get API Key**: User logs into web dashboard, generates API key
4. **Register Device**:
   - Option A: Scan QR code from dashboard
   - Option B: Manually enter API key
5. **Device Registration**: App automatically registers device with backend
6. **Start Service**: App connects to WebSocket and goes online

### 2.2 State Flow

```kotlin
sealed class RegistrationState {
    object Idle : RegistrationState()
    object Loading : RegistrationState()
    object ScanningQr : RegistrationState()
    data class Success(val response: DeviceRegistrationResponse) : RegistrationState()
    data class Error(val message: String) : RegistrationState()
}
```

### 2.3 Navigation Flow

```
MainActivity
    │
    ├─ Not Registered? → LoginScreen
    │                       │
    │                       ├─ Enter API Key → RegistrationViewModel
    │                       └─ Scan QR Code → QrScannerScreen
    │                                              │
    │                                              └─ Success → DashboardScreen
    │
    └─ Already Registered? → DashboardScreen
```

---

## 3. API Key Login Implementation

### 3.1 Login Screen UI (Jetpack Compose)

```kotlin
// File: app/src/main/java/com/codereply/gateway/presentation/ui/login/LoginScreen.kt

@Composable
fun LoginScreen(
    viewModel: RegistrationViewModel = hiltViewModel(),
    onNavigateToDashboard: () -> Unit,
    onNavigateToQrScanner: () -> Unit
) {
    var apiKey by remember { mutableStateOf("") }
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("CodeReply Gateway") }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            // Logo
            Image(
                painter = painterResource(id = R.drawable.logo),
                contentDescription = "CodeReply Logo",
                modifier = Modifier
                    .size(120.dp)
                    .padding(bottom = 32.dp)
            )

            // Title
            Text(
                text = "Register Your Device",
                style = MaterialTheme.typography.headlineMedium,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            Text(
                text = "Enter your API key from the dashboard",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                modifier = Modifier.padding(bottom = 32.dp)
            )

            // API Key Input
            OutlinedTextField(
                value = apiKey,
                onValueChange = { apiKey = it },
                label = { Text("API Key") },
                placeholder = { Text("cr_live_xxxxxxxxxxxxx") },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 16.dp),
                singleLine = true,
                leadingIcon = {
                    Icon(Icons.Default.Key, contentDescription = "API Key")
                },
                enabled = uiState !is RegistrationState.Loading
            )

            // Register Button
            Button(
                onClick = { viewModel.registerWithApiKey(apiKey) },
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = apiKey.isNotBlank() && uiState !is RegistrationState.Loading
            ) {
                if (uiState is RegistrationState.Loading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(24.dp),
                        color = MaterialTheme.colorScheme.onPrimary
                    )
                } else {
                    Text("Register Device")
                }
            }

            // Divider
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 24.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                HorizontalDivider(modifier = Modifier.weight(1f))
                Text(
                    text = "OR",
                    modifier = Modifier.padding(horizontal = 16.dp),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                HorizontalDivider(modifier = Modifier.weight(1f))
            }

            // QR Scanner Button
            OutlinedButton(
                onClick = onNavigateToQrScanner,
                modifier = Modifier
                    .fillMaxWidth()
                    .height(56.dp),
                enabled = uiState !is RegistrationState.Loading
            ) {
                Icon(
                    Icons.Default.QrCodeScanner,
                    contentDescription = "QR Code",
                    modifier = Modifier.padding(end = 8.dp)
                )
                Text("Scan QR Code")
            }

            // Error Display
            AnimatedVisibility(visible = uiState is RegistrationState.Error) {
                Card(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(top = 16.dp),
                    colors = CardDefaults.cardColors(
                        containerColor = MaterialTheme.colorScheme.errorContainer
                    )
                ) {
                    Row(
                        modifier = Modifier.padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = "Error",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(end = 8.dp)
                        )
                        Text(
                            text = (uiState as? RegistrationState.Error)?.message ?: "",
                            style = MaterialTheme.typography.bodyMedium,
                            color = MaterialTheme.colorScheme.onErrorContainer
                        )
                    }
                }
            }

            // Help Link
            TextButton(
                onClick = { /* Open help docs */ },
                modifier = Modifier.padding(top = 16.dp)
            ) {
                Text("How do I get an API key?")
            }
        }
    }

    // Navigate to dashboard on success
    LaunchedEffect(uiState) {
        if (uiState is RegistrationState.Success) {
            onNavigateToDashboard()
        }
    }
}
```

### 3.2 Registration ViewModel

```kotlin
// File: app/src/main/java/com/codereply/gateway/presentation/viewmodel/RegistrationViewModel.kt

@HiltViewModel
class RegistrationViewModel @Inject constructor(
    private val apiClient: CodeReplyApiClient,
    private val credentialsStore: CredentialsStore,
    private val deviceInfoProvider: DeviceInfoProvider
) : ViewModel() {

    private val _uiState = MutableStateFlow<RegistrationState>(RegistrationState.Idle)
    val uiState: StateFlow<RegistrationState> = _uiState.asStateFlow()

    fun registerWithApiKey(apiKey: String) {
        viewModelScope.launch {
            _uiState.value = RegistrationState.Loading

            try {
                // Validate API key format
                if (!apiKey.startsWith("cr_live_") && !apiKey.startsWith("cr_test_")) {
                    throw InvalidApiKeyException("API key must start with cr_live_ or cr_test_")
                }

                // Step 1: Exchange API key for registration token
                val tokenResponse = apiClient.generateRegistrationToken(apiKey)

                // Step 2: Collect device information
                val deviceInfo = deviceInfoProvider.collectDeviceInfo()

                // Step 3: Register device with backend
                val registrationResponse = apiClient.registerDevice(
                    registrationToken = tokenResponse.registrationToken,
                    deviceName = deviceInfo.deviceName,
                    simCarrier = deviceInfo.simCarrier,
                    simNumber = deviceInfo.simNumber,
                    androidVersion = deviceInfo.androidVersion,
                    appVersion = BuildConfig.VERSION_NAME
                )

                // Step 4: Store credentials securely
                credentialsStore.saveCredentials(
                    deviceToken = registrationResponse.deviceToken,
                    deviceId = registrationResponse.deviceId,
                    subscriberId = registrationResponse.subscriberId,
                    subscriberName = registrationResponse.subscriberName,
                    subscriberPlan = registrationResponse.subscriberPlan,
                    websocketUrl = registrationResponse.websocketUrl
                )

                _uiState.value = RegistrationState.Success(registrationResponse)

            } catch (e: Exception) {
                _uiState.value = RegistrationState.Error(
                    message = when (e) {
                        is DeviceQuotaExceededException -> {
                            "Device quota exceeded. You have ${e.current}/${e.max} devices. " +
                                "Please upgrade your plan or remove an existing device."
                        }
                        is InvalidApiKeyException -> {
                            "Invalid API key. Please check your API key and try again."
                        }
                        is InvalidRegistrationTokenException -> {
                            "Registration token expired or invalid. Please try again."
                        }
                        is NetworkException -> {
                            "Network error. Please check your internet connection."
                        }
                        else -> {
                            "Registration failed: ${e.message}"
                        }
                    }
                )
            }
        }
    }

    fun registerWithQrToken(qrToken: String) {
        // QR token is the registration token itself (cr_reg_xxx)
        viewModelScope.launch {
            _uiState.value = RegistrationState.Loading

            try {
                val deviceInfo = deviceInfoProvider.collectDeviceInfo()

                val registrationResponse = apiClient.registerDevice(
                    registrationToken = qrToken,
                    deviceName = deviceInfo.deviceName,
                    simCarrier = deviceInfo.simCarrier,
                    simNumber = deviceInfo.simNumber,
                    androidVersion = deviceInfo.androidVersion,
                    appVersion = BuildConfig.VERSION_NAME
                )

                credentialsStore.saveCredentials(
                    deviceToken = registrationResponse.deviceToken,
                    deviceId = registrationResponse.deviceId,
                    subscriberId = registrationResponse.subscriberId,
                    subscriberName = registrationResponse.subscriberName,
                    subscriberPlan = registrationResponse.subscriberPlan,
                    websocketUrl = registrationResponse.websocketUrl
                )

                _uiState.value = RegistrationState.Success(registrationResponse)

            } catch (e: Exception) {
                _uiState.value = RegistrationState.Error(
                    message = "QR registration failed: ${e.message}"
                )
            }
        }
    }
}

sealed class RegistrationState {
    object Idle : RegistrationState()
    object Loading : RegistrationState()
    object ScanningQr : RegistrationState()
    data class Success(val response: DeviceRegistrationResponse) : RegistrationState()
    data class Error(val message: String) : RegistrationState()
}
```

---

## 4. QR Code Scanner

### 4.1 Add ML Kit Dependency

```kotlin
// File: app/build.gradle.kts

dependencies {
    // ML Kit Barcode Scanning
    implementation("com.google.android.gms:play-services-mlkit-barcode-scanning:18.3.0")

    // Camera X (for custom scanner, optional)
    implementation("androidx.camera:camera-camera2:1.3.0")
    implementation("androidx.camera:camera-lifecycle:1.3.0")
    implementation("androidx.camera:camera-view:1.3.0")
}
```

### 4.2 QR Scanner Screen

```kotlin
// File: app/src/main/java/com/codereply/gateway/presentation/ui/scanner/QrScannerScreen.kt

@Composable
fun QrScannerScreen(
    viewModel: RegistrationViewModel = hiltViewModel(),
    onNavigateBack: () -> Unit,
    onNavigateToDashboard: () -> Unit
) {
    val context = LocalContext.current
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(Unit) {
        // Request camera permission if needed
        // Then launch scanner
        scanQrCode(context) { result ->
            result.onSuccess { token ->
                if (token.startsWith("cr_reg_")) {
                    viewModel.registerWithQrToken(token)
                } else {
                    // Invalid QR code format
                }
            }.onFailure { error ->
                // Handle scan failure
            }
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Scan QR Code") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                }
            )
        }
    ) { paddingValues ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues),
            contentAlignment = Alignment.Center
        ) {
            when (uiState) {
                is RegistrationState.Loading -> {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator()
                        Text(
                            text = "Registering device...",
                            modifier = Modifier.padding(top = 16.dp)
                        )
                    }
                }
                is RegistrationState.Success -> {
                    LaunchedEffect(Unit) {
                        onNavigateToDashboard()
                    }
                }
                is RegistrationState.Error -> {
                    Column(
                        horizontalAlignment = Alignment.CenterHorizontally,
                        modifier = Modifier.padding(16.dp)
                    ) {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = "Error",
                            tint = MaterialTheme.colorScheme.error,
                            modifier = Modifier.size(64.dp)
                        )
                        Text(
                            text = (uiState as RegistrationState.Error).message,
                            color = MaterialTheme.colorScheme.error,
                            textAlign = TextAlign.Center,
                            modifier = Modifier.padding(top = 16.dp)
                        )
                        Button(
                            onClick = onNavigateBack,
                            modifier = Modifier.padding(top = 16.dp)
                        ) {
                            Text("Try Again")
                        }
                    }
                }
                else -> {
                    Text("Point camera at QR code from dashboard")
                }
            }
        }
    }
}

private suspend fun scanQrCode(
    context: Context,
    onResult: (Result<String>) -> Unit
) {
    val scanner = GmsBarcodeScanning.getClient(context)

    scanner.startScan()
        .addOnSuccessListener { barcode ->
            val rawValue = barcode.rawValue
            if (rawValue != null) {
                onResult(Result.success(rawValue))
            } else {
                onResult(Result.failure(Exception("Empty QR code")))
            }
        }
        .addOnFailureListener { e ->
            onResult(Result.failure(e))
        }
        .addOnCanceledListener {
            onResult(Result.failure(CancellationException("Scan cancelled")))
        }
}
```

---

## 5. Device Registration

### 5.1 API Client (Retrofit)

```kotlin
// File: app/src/main/java/com/codereply/gateway/data/remote/CodeReplyApiClient.kt

interface CodeReplyApi {

    @POST("v1/devices/registration-token")
    suspend fun generateRegistrationToken(
        @Header("Authorization") apiKey: String
    ): RegistrationTokenResponse

    @POST("v1/devices/register")
    suspend fun registerDevice(
        @Body request: DeviceRegistrationRequest
    ): DeviceRegistrationResponse
}

@Singleton
class CodeReplyApiClient @Inject constructor(
    private val api: CodeReplyApi
) {
    suspend fun generateRegistrationToken(apiKey: String): RegistrationTokenResponse {
        return try {
            api.generateRegistrationToken("Bearer $apiKey")
        } catch (e: HttpException) {
            when (e.code()) {
                401 -> throw InvalidApiKeyException("Invalid API key")
                403 -> throw DeviceQuotaExceededException(
                    "Device quota exceeded",
                    current = 0,  // Extract from error response
                    max = 0
                )
                else -> throw NetworkException("HTTP ${e.code()}: ${e.message()}")
            }
        } catch (e: IOException) {
            throw NetworkException("Network error: ${e.message}")
        }
    }

    suspend fun registerDevice(
        registrationToken: String,
        deviceName: String,
        simCarrier: String?,
        simNumber: String?,
        androidVersion: String,
        appVersion: String
    ): DeviceRegistrationResponse {
        val request = DeviceRegistrationRequest(
            registrationToken = registrationToken,
            deviceName = deviceName,
            simCarrier = simCarrier,
            simNumber = simNumber,
            androidVersion = androidVersion,
            appVersion = appVersion
        )

        return try {
            api.registerDevice(request)
        } catch (e: HttpException) {
            when (e.code()) {
                401 -> throw InvalidRegistrationTokenException("Invalid or expired token")
                403 -> throw DeviceQuotaExceededException(
                    "Device quota exceeded",
                    current = 0,
                    max = 0
                )
                else -> throw NetworkException("HTTP ${e.code()}: ${e.message()}")
            }
        } catch (e: IOException) {
            throw NetworkException("Network error: ${e.message}")
        }
    }
}
```

### 5.2 Data Models

```kotlin
// File: app/src/main/java/com/codereply/gateway/data/remote/models/RegistrationModels.kt

@Serializable
data class RegistrationTokenResponse(
    val registrationToken: String,
    val expiresAt: String,
    val qrCode: String? = null
)

@Serializable
data class DeviceRegistrationRequest(
    val registrationToken: String,
    val deviceName: String,
    val simCarrier: String?,
    val simNumber: String?,
    val androidVersion: String,
    val appVersion: String
)

@Serializable
data class DeviceRegistrationResponse(
    val deviceId: String,
    val deviceToken: String,
    val websocketUrl: String,
    val subscriberId: String,
    val subscriberName: String,
    val subscriberPlan: String,
    val dailyQuota: Int,
    val deviceQuota: DeviceQuotaInfo
)

@Serializable
data class DeviceQuotaInfo(
    val current: Int,
    val max: Int
)
```

### 5.3 Device Info Provider

```kotlin
// File: app/src/main/java/com/codereply/gateway/data/DeviceInfoProvider.kt

@Singleton
class DeviceInfoProvider @Inject constructor(
    @ApplicationContext private val context: Context
) {
    fun collectDeviceInfo(): DeviceInfo {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as TelephonyManager

        return DeviceInfo(
            deviceName = "${Build.MANUFACTURER} ${Build.MODEL}",
            simCarrier = getSimCarrier(telephonyManager),
            simNumber = getSimNumber(telephonyManager),
            androidVersion = Build.VERSION.RELEASE,
            sdkVersion = Build.VERSION.SDK_INT
        )
    }

    @SuppressLint("HardwareIds", "MissingPermission")
    private fun getSimNumber(telephonyManager: TelephonyManager): String? {
        return try {
            if (hasPhoneStatePermission()) {
                telephonyManager.line1Number
            } else {
                null
            }
        } catch (e: Exception) {
            null
        }
    }

    private fun getSimCarrier(telephonyManager: TelephonyManager): String? {
        return try {
            telephonyManager.networkOperatorName.takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            null
        }
    }

    private fun hasPhoneStatePermission(): Boolean {
        return ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED
    }
}

data class DeviceInfo(
    val deviceName: String,
    val simCarrier: String?,
    val simNumber: String?,
    val androidVersion: String,
    val sdkVersion: Int
)
```

---

## 6. Secure Token Storage

### 6.1 EncryptedSharedPreferences Implementation

```kotlin
// File: app/src/main/java/com/codereply/gateway/data/preferences/CredentialsStore.kt

@Singleton
class CredentialsStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val encryptedPrefs: SharedPreferences by lazy {
        createEncryptedPreferences()
    }

    private fun createEncryptedPreferences(): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()

        return EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    fun saveCredentials(
        deviceToken: String,
        deviceId: String,
        subscriberId: String,
        subscriberName: String,
        subscriberPlan: String,
        websocketUrl: String
    ) {
        encryptedPrefs.edit {
            putString(KEY_DEVICE_TOKEN, deviceToken)
            putString(KEY_DEVICE_ID, deviceId)
            putString(KEY_SUBSCRIBER_ID, subscriberId)
            putString(KEY_SUBSCRIBER_NAME, subscriberName)
            putString(KEY_SUBSCRIBER_PLAN, subscriberPlan)
            putString(KEY_WEBSOCKET_URL, websocketUrl)
            putLong(KEY_REGISTERED_AT, System.currentTimeMillis())
        }
    }

    fun getDeviceToken(): String? {
        return encryptedPrefs.getString(KEY_DEVICE_TOKEN, null)
    }

    fun getDeviceId(): String? {
        return encryptedPrefs.getString(KEY_DEVICE_ID, null)
    }

    fun getSubscriberId(): String? {
        return encryptedPrefs.getString(KEY_SUBSCRIBER_ID, null)
    }

    fun getSubscriberName(): String? {
        return encryptedPrefs.getString(KEY_SUBSCRIBER_NAME, null)
    }

    fun getSubscriberPlan(): String? {
        return encryptedPrefs.getString(KEY_SUBSCRIBER_PLAN, null)
    }

    fun getWebsocketUrl(): String? {
        return encryptedPrefs.getString(KEY_WEBSOCKET_URL, null)
    }

    fun isRegistered(): Boolean {
        return getDeviceToken() != null && getDeviceId() != null
    }

    fun clearCredentials() {
        encryptedPrefs.edit {
            clear()
        }
    }

    companion object {
        private const val PREFS_NAME = "device_credentials"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_SUBSCRIBER_ID = "subscriber_id"
        private const val KEY_SUBSCRIBER_NAME = "subscriber_name"
        private const val KEY_SUBSCRIBER_PLAN = "subscriber_plan"
        private const val KEY_WEBSOCKET_URL = "websocket_url"
        private const val KEY_REGISTERED_AT = "registered_at"
    }
}
```

### 6.2 Add Security Dependency

```kotlin
// File: app/build.gradle.kts

dependencies {
    // Jetpack Security for EncryptedSharedPreferences
    implementation("androidx.security:security-crypto:1.1.0-alpha06")
}
```

---

## 7. WebSocket Authentication

### 7.1 WebSocket Client with Device Token

```kotlin
// File: app/src/main/java/com/codereply/gateway/data/remote/GatewayWebSocketClient.kt

@Singleton
class GatewayWebSocketClient @Inject constructor(
    private val credentialsStore: CredentialsStore,
    private val okHttpClient: OkHttpClient
) {
    private var webSocket: WebSocket? = null
    private val _connectionState = MutableStateFlow<ConnectionState>(ConnectionState.Disconnected)
    val connectionState: StateFlow<ConnectionState> = _connectionState.asStateFlow()

    fun connect() {
        val deviceToken = credentialsStore.getDeviceToken()
            ?: throw IllegalStateException("No device token found. Please register device first.")

        val websocketUrl = credentialsStore.getWebsocketUrl()
            ?: throw IllegalStateException("No WebSocket URL found.")

        val request = Request.Builder()
            .url(websocketUrl)
            .addHeader("Authorization", "Bearer $deviceToken")
            .build()

        _connectionState.value = ConnectionState.Connecting

        webSocket = okHttpClient.newWebSocket(request, webSocketListener)
    }

    fun disconnect() {
        webSocket?.close(1000, "Client disconnect")
        webSocket = null
        _connectionState.value = ConnectionState.Disconnected
    }

    fun sendMessage(message: WebSocketMessage) {
        val json = Json.encodeToString(message)
        webSocket?.send(json)
    }

    private val webSocketListener = object : WebSocketListener() {
        override fun onOpen(webSocket: WebSocket, response: Response) {
            Log.d(TAG, "WebSocket connected")
            _connectionState.value = ConnectionState.Connected
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            handleIncomingMessage(text)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            Log.e(TAG, "WebSocket connection failed", t)
            _connectionState.value = ConnectionState.Error(t.message ?: "Connection failed")
            scheduleReconnect()
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket closing: $code - $reason")
            _connectionState.value = ConnectionState.Disconnected
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            Log.d(TAG, "WebSocket closed: $code - $reason")
            _connectionState.value = ConnectionState.Disconnected
        }
    }

    private fun handleIncomingMessage(json: String) {
        try {
            val message = Json.decodeFromString<WebSocketMessage>(json)

            when (message.type) {
                "SEND_SMS" -> handleSendSmsRequest(message)
                "CONNECTED" -> handleConnectedConfirmation(message)
                "PING" -> handlePing()
                "CONFIG_UPDATE" -> handleConfigUpdate(message)
                "DEVICE_REVOKED" -> handleDeviceRevoked()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to parse WebSocket message", e)
        }
    }

    private fun handleDeviceRevoked() {
        // Device was deleted/revoked by subscriber
        credentialsStore.clearCredentials()
        _connectionState.value = ConnectionState.Revoked
        disconnect()
    }

    private fun scheduleReconnect() {
        // Implement exponential backoff reconnection logic
        // See BYOD_ARCHITECTURE.md for details
    }

    companion object {
        private const val TAG = "GatewayWebSocketClient"
    }
}

sealed class ConnectionState {
    object Disconnected : ConnectionState()
    object Connecting : ConnectionState()
    object Connected : ConnectionState()
    object Revoked : ConnectionState()
    data class Error(val message: String) : ConnectionState()
}
```

---

## 8. UI Implementation

### 8.1 Dashboard Screen with Subscriber Info

```kotlin
// File: app/src/main/java/com/codereply/gateway/presentation/ui/dashboard/DashboardScreen.kt

@Composable
fun DashboardScreen(
    viewModel: DashboardViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("CodeReply Gateway") },
                actions = {
                    IconButton(onClick = { /* Navigate to settings */ }) {
                        Icon(Icons.Default.Settings, "Settings")
                    }
                }
            )
        }
    ) { paddingValues ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(paddingValues)
                .padding(16.dp)
        ) {
            // Connection Status Card
            ConnectionStatusCard(
                connectionState = uiState.connectionState,
                subscriberName = uiState.subscriberName,
                subscriberPlan = uiState.subscriberPlan
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Quota Usage Card
            QuotaUsageCard(
                messagesSentToday = uiState.messagesSentToday,
                dailyQuota = uiState.dailyQuota
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Device Stats Card
            DeviceStatsCard(
                simCarrier = uiState.simCarrier,
                simNumber = uiState.simNumber,
                signalStrength = uiState.signalStrength
            )

            Spacer(modifier = Modifier.height(16.dp))

            // Recent Messages
            Text(
                text = "Recent Messages",
                style = MaterialTheme.typography.titleMedium,
                modifier = Modifier.padding(bottom = 8.dp)
            )

            LazyColumn {
                items(uiState.recentMessages) { message ->
                    MessageListItem(message = message)
                }
            }
        }
    }
}

@Composable
fun ConnectionStatusCard(
    connectionState: ConnectionState,
    subscriberName: String,
    subscriberPlan: String
) {
    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically
            ) {
                // Status Indicator
                Box(
                    modifier = Modifier
                        .size(12.dp)
                        .background(
                            color = when (connectionState) {
                                is ConnectionState.Connected -> Color.Green
                                is ConnectionState.Connecting -> Color.Yellow
                                else -> Color.Red
                            },
                            shape = CircleShape
                        )
                )

                Spacer(modifier = Modifier.width(8.dp))

                Text(
                    text = when (connectionState) {
                        is ConnectionState.Connected -> "Online"
                        is ConnectionState.Connecting -> "Connecting..."
                        is ConnectionState.Disconnected -> "Offline"
                        is ConnectionState.Error -> "Error"
                        is ConnectionState.Revoked -> "Device Revoked"
                    },
                    style = MaterialTheme.typography.titleMedium
                )
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Connected to: $subscriberName",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Text(
                text = "Plan: $subscriberPlan",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
fun QuotaUsageCard(
    messagesSentToday: Int,
    dailyQuota: Int
) {
    Card(
        modifier = Modifier.fillMaxWidth()
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Text(
                text = "Daily Quota",
                style = MaterialTheme.typography.titleMedium
            )

            Spacer(modifier = Modifier.height(8.dp))

            LinearProgressIndicator(
                progress = (messagesSentToday.toFloat() / dailyQuota.toFloat()).coerceIn(0f, 1f),
                modifier = Modifier.fillMaxWidth()
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "$messagesSentToday / $dailyQuota messages sent today",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            if (messagesSentToday >= dailyQuota) {
                Text(
                    text = "Daily quota reached",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.error
                )
            }
        }
    }
}
```

---

## 9. Testing Guide

### 9.1 Test Registration Flow

```kotlin
// File: app/src/test/java/com/codereply/gateway/viewmodel/RegistrationViewModelTest.kt

@ExperimentalCoroutinesTest
class RegistrationViewModelTest {

    @get:Rule
    val mainDispatcherRule = MainDispatcherRule()

    private lateinit var viewModel: RegistrationViewModel
    private lateinit var mockApiClient: CodeReplyApiClient
    private lateinit var mockCredentialsStore: CredentialsStore
    private lateinit var mockDeviceInfoProvider: DeviceInfoProvider

    @Before
    fun setup() {
        mockApiClient = mockk()
        mockCredentialsStore = mockk(relaxed = true)
        mockDeviceInfoProvider = mockk()

        viewModel = RegistrationViewModel(
            apiClient = mockApiClient,
            credentialsStore = mockCredentialsStore,
            deviceInfoProvider = mockDeviceInfoProvider
        )
    }

    @Test
    fun `registerWithApiKey success flow`() = runTest {
        // Given
        val apiKey = "cr_live_test123"
        val deviceInfo = DeviceInfo(
            deviceName = "Test Device",
            simCarrier = "Test Carrier",
            simNumber = "+1234567890",
            androidVersion = "13",
            sdkVersion = 33
        )

        val tokenResponse = RegistrationTokenResponse(
            registrationToken = "cr_reg_token123",
            expiresAt = "2026-04-02T11:00:00Z"
        )

        val registrationResponse = DeviceRegistrationResponse(
            deviceId = "device-123",
            deviceToken = "eyJhbGc...",
            websocketUrl = "wss://test.com",
            subscriberId = "sub-123",
            subscriberName = "Test Subscriber",
            subscriberPlan = "Pro",
            dailyQuota = 1000,
            deviceQuota = DeviceQuotaInfo(current = 1, max = 2)
        )

        coEvery { mockDeviceInfoProvider.collectDeviceInfo() } returns deviceInfo
        coEvery { mockApiClient.generateRegistrationToken(apiKey) } returns tokenResponse
        coEvery {
            mockApiClient.registerDevice(
                registrationToken = tokenResponse.registrationToken,
                deviceName = deviceInfo.deviceName,
                simCarrier = deviceInfo.simCarrier,
                simNumber = deviceInfo.simNumber,
                androidVersion = deviceInfo.androidVersion,
                appVersion = any()
            )
        } returns registrationResponse

        // When
        viewModel.registerWithApiKey(apiKey)

        // Then
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state).isInstanceOf(RegistrationState.Success::class.java)

        verify {
            mockCredentialsStore.saveCredentials(
                deviceToken = registrationResponse.deviceToken,
                deviceId = registrationResponse.deviceId,
                subscriberId = registrationResponse.subscriberId,
                subscriberName = registrationResponse.subscriberName,
                subscriberPlan = registrationResponse.subscriberPlan,
                websocketUrl = registrationResponse.websocketUrl
            )
        }
    }

    @Test
    fun `registerWithApiKey handles invalid API key`() = runTest {
        // Given
        val apiKey = "invalid_key"

        // When
        viewModel.registerWithApiKey(apiKey)

        // Then
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state).isInstanceOf(RegistrationState.Error::class.java)
        assertThat((state as RegistrationState.Error).message)
            .contains("API key must start with")
    }

    @Test
    fun `registerWithApiKey handles quota exceeded`() = runTest {
        // Given
        val apiKey = "cr_live_test123"

        coEvery { mockApiClient.generateRegistrationToken(apiKey) } throws
            DeviceQuotaExceededException("Quota exceeded", current = 2, max = 2)

        // When
        viewModel.registerWithApiKey(apiKey)

        // Then
        advanceUntilIdle()

        val state = viewModel.uiState.value
        assertThat(state).isInstanceOf(RegistrationState.Error::class.java)
        assertThat((state as RegistrationState.Error).message)
            .contains("quota exceeded")
    }
}
```

---

## 10. Troubleshooting

### 10.1 Common Issues

#### Registration Fails with "Invalid API Key"
- **Cause**: API key format is incorrect or key is invalid
- **Solution**:
  - Verify API key starts with `cr_live_` or `cr_test_`
  - Check API key is copied correctly (no extra spaces)
  - Generate new API key from web dashboard

#### Device Quota Exceeded
- **Cause**: Subscriber has reached maximum device limit
- **Solution**:
  - Remove unused devices from web dashboard
  - Upgrade subscriber plan to increase device quota

#### WebSocket Connection Fails
- **Cause**: Device token invalid or device was revoked
- **Solution**:
  - Check device token exists in EncryptedSharedPreferences
  - Verify device wasn't deleted from web dashboard
  - Re-register device if necessary

#### QR Scanner Not Working
- **Cause**: Camera permission not granted
- **Solution**:
  - Request CAMERA permission in runtime
  - Check if ML Kit Barcode Scanning is properly initialized

### 10.2 Debug Logging

```kotlin
// Enable debug logging for troubleshooting
class RegistrationViewModel @Inject constructor(
    // ... dependencies
) : ViewModel() {

    fun registerWithApiKey(apiKey: String) {
        viewModelScope.launch {
            Log.d(TAG, "Starting registration with API key: ${apiKey.take(15)}...")

            try {
                Log.d(TAG, "Step 1: Generating registration token")
                val tokenResponse = apiClient.generateRegistrationToken(apiKey)
                Log.d(TAG, "Registration token received, expires: ${tokenResponse.expiresAt}")

                Log.d(TAG, "Step 2: Collecting device info")
                val deviceInfo = deviceInfoProvider.collectDeviceInfo()
                Log.d(TAG, "Device info: $deviceInfo")

                Log.d(TAG, "Step 3: Registering device")
                val registrationResponse = apiClient.registerDevice(...)
                Log.d(TAG, "Device registered successfully: ${registrationResponse.deviceId}")

                Log.d(TAG, "Step 4: Storing credentials")
                credentialsStore.saveCredentials(...)
                Log.d(TAG, "Credentials stored securely")

                _uiState.value = RegistrationState.Success(registrationResponse)
            } catch (e: Exception) {
                Log.e(TAG, "Registration failed", e)
                _uiState.value = RegistrationState.Error(...)
            }
        }
    }

    companion object {
        private const val TAG = "RegistrationViewModel"
    }
}
```

---

## Summary

This implementation guide covers the complete Android BYOD registration flow:

1. **Login UI**: API key input and QR scanner
2. **Registration**: Two-step process (token generation → device registration)
3. **Security**: EncryptedSharedPreferences for credential storage
4. **WebSocket**: Subscriber-scoped device authentication
5. **UI**: Dashboard showing subscriber info and quota usage

### Key Files to Create

- `/app/src/main/java/com/codereply/gateway/presentation/ui/login/LoginScreen.kt`
- `/app/src/main/java/com/codereply/gateway/presentation/ui/scanner/QrScannerScreen.kt`
- `/app/src/main/java/com/codereply/gateway/presentation/viewmodel/RegistrationViewModel.kt`
- `/app/src/main/java/com/codereply/gateway/data/remote/CodeReplyApiClient.kt`
- `/app/src/main/java/com/codereply/gateway/data/preferences/CredentialsStore.kt`
- `/app/src/main/java/com/codereply/gateway/data/DeviceInfoProvider.kt`

### Next Steps

1. Review this guide with the team
2. Use `@leonard` to implement each component
3. Test registration flow on physical device
4. Add comprehensive error handling
5. Create UI mockups for approval
6. Write unit and integration tests
