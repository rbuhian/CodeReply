package com.codereply.gateway.data.remote.api

import com.codereply.gateway.data.preferences.CredentialsStore
import com.google.gson.annotations.SerializedName
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import okhttp3.logging.HttpLoggingInterceptor
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Retrofit API client for CodeReply Gateway registration and device management.
 */
@Singleton
class ApiClient @Inject constructor(
    private val credentialsStore: CredentialsStore
) {
    private val apiService: ApiService by lazy {
        val baseUrl = credentialsStore.getBackendUrl()

        val loggingInterceptor = HttpLoggingInterceptor().apply {
            level = HttpLoggingInterceptor.Level.BODY
        }

        val authInterceptor = Interceptor { chain ->
            val originalRequest = chain.request()
            val token = credentialsStore.getDeviceToken()

            val newRequest = if (token != null) {
                originalRequest.newBuilder()
                    .addHeader("Authorization", "Bearer $token")
                    .addHeader("X-Device-ID", credentialsStore.getDeviceId() ?: "")
                    .build()
            } else {
                originalRequest
            }

            chain.proceed(newRequest)
        }

        val client = OkHttpClient.Builder()
            .addInterceptor(loggingInterceptor)
            .addInterceptor(authInterceptor)
            .connectTimeout(30, TimeUnit.SECONDS)
            .readTimeout(30, TimeUnit.SECONDS)
            .writeTimeout(30, TimeUnit.SECONDS)
            .build()

        Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(ApiService::class.java)
    }

    /**
     * Step 1: Exchange API key for registration token
     */
    suspend fun generateRegistrationToken(apiKey: String): RegistrationTokenResponse {
        val response = apiService.generateRegistrationToken(
            RegistrationTokenRequest(apiKey = apiKey)
        )

        if (response.isSuccessful) {
            return response.body() ?: throw ApiException("Empty response body")
        } else {
            throw parseErrorResponse(response)
        }
    }

    /**
     * Step 2: Register device with token and metadata
     */
    suspend fun registerDevice(
        registrationToken: String,
        deviceName: String,
        simCarrier: String?,
        simNumber: String?,
        androidVersion: String,
        appVersion: String
    ): DeviceRegistrationResponse {
        val response = apiService.registerDevice(
            DeviceRegistrationRequest(
                registrationToken = registrationToken,
                deviceName = deviceName,
                simCarrier = simCarrier,
                simNumber = simNumber,
                androidVersion = androidVersion,
                appVersion = appVersion,
                deviceType = "android"
            )
        )

        if (response.isSuccessful) {
            return response.body() ?: throw ApiException("Empty response body")
        } else {
            throw parseErrorResponse(response)
        }
    }

    /**
     * Get device status and quota information
     */
    suspend fun getDeviceStatus(): DeviceStatusResponse {
        val response = apiService.getDeviceStatus()

        if (response.isSuccessful) {
            return response.body() ?: throw ApiException("Empty response body")
        } else {
            throw parseErrorResponse(response)
        }
    }

    /**
     * Report device health metrics
     */
    suspend fun reportDeviceHealth(
        signalStrength: Int?,
        batteryLevel: Int,
        isCharging: Boolean,
        networkType: String?
    ) {
        apiService.reportDeviceHealth(
            DeviceHealthRequest(
                signalStrength = signalStrength,
                batteryLevel = batteryLevel,
                isCharging = isCharging,
                networkType = networkType
            )
        )
    }

    private fun parseErrorResponse(response: Response<*>): ApiException {
        return try {
            val errorBody = response.errorBody()?.string()
            ApiException("API Error: ${response.code()} - $errorBody")
        } catch (e: Exception) {
            ApiException("Network error: ${e.message}")
        }
    }
}

interface ApiService {
    @POST("/api/v1/devices/registration-token")
    suspend fun generateRegistrationToken(
        @Body request: RegistrationTokenRequest
    ): Response<RegistrationTokenResponse>

    @POST("/api/v1/devices/register")
    suspend fun registerDevice(
        @Body request: DeviceRegistrationRequest
    ): Response<DeviceRegistrationResponse>

    @GET("/api/v1/devices/status")
    suspend fun getDeviceStatus(): Response<DeviceStatusResponse>

    @POST("/api/v1/devices/health")
    suspend fun reportDeviceHealth(
        @Body request: DeviceHealthRequest
    ): Response<Unit>
}

// Request/Response Models
data class RegistrationTokenRequest(
    @SerializedName("api_key")
    val apiKey: String
)

data class RegistrationTokenResponse(
    @SerializedName("registration_token")
    val registrationToken: String,
    @SerializedName("expires_at")
    val expiresAt: String
)

data class DeviceRegistrationRequest(
    @SerializedName("registration_token")
    val registrationToken: String,
    @SerializedName("device_name")
    val deviceName: String,
    @SerializedName("sim_carrier")
    val simCarrier: String?,
    @SerializedName("sim_number")
    val simNumber: String?,
    @SerializedName("android_version")
    val androidVersion: String,
    @SerializedName("app_version")
    val appVersion: String,
    @SerializedName("device_type")
    val deviceType: String = "android"
)

data class DeviceRegistrationResponse(
    @SerializedName("device_id")
    val deviceId: String,
    @SerializedName("device_token")
    val deviceToken: String,
    @SerializedName("subscriber_id")
    val subscriberId: String,
    @SerializedName("subscriber_name")
    val subscriberName: String,
    @SerializedName("subscriber_plan")
    val subscriberPlan: String,
    @SerializedName("daily_quota")
    val dailyQuota: Int,
    @SerializedName("status")
    val status: String
)

data class DeviceStatusResponse(
    @SerializedName("device_id")
    val deviceId: String,
    @SerializedName("status")
    val status: String,
    @SerializedName("subscriber_name")
    val subscriberName: String,
    @SerializedName("subscriber_plan")
    val subscriberPlan: String,
    @SerializedName("daily_quota")
    val dailyQuota: Int,
    @SerializedName("messages_sent_today")
    val messagesSentToday: Int,
    @SerializedName("quota_reset_at")
    val quotaResetAt: String
)

data class DeviceHealthRequest(
    @SerializedName("signal_strength")
    val signalStrength: Int?,
    @SerializedName("battery_level")
    val batteryLevel: Int,
    @SerializedName("is_charging")
    val isCharging: Boolean,
    @SerializedName("network_type")
    val networkType: String?
)

class ApiException(message: String) : Exception(message)
