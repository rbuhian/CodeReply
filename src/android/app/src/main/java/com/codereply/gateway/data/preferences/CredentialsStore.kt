package com.codereply.gateway.data.preferences

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Secure storage for device credentials and subscriber information.
 * Uses EncryptedSharedPreferences to protect sensitive data at rest.
 */
@Singleton
class CredentialsStore @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val PREFS_NAME = "device_credentials"
        private const val KEY_DEVICE_TOKEN = "device_token"
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_SUBSCRIBER_ID = "subscriber_id"
        private const val KEY_SUBSCRIBER_NAME = "subscriber_name"
        private const val KEY_SUBSCRIBER_PLAN = "subscriber_plan"
        private const val KEY_DAILY_QUOTA = "daily_quota"
        private const val KEY_BACKEND_URL = "backend_url"
        private const val DEFAULT_BACKEND_URL = "https://api.codereply.com"
    }

    private val masterKey: MasterKey by lazy {
        MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
    }

    private val encryptedPrefs: SharedPreferences by lazy {
        EncryptedSharedPreferences.create(
            context,
            PREFS_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    }

    // Device Token
    fun saveDeviceToken(token: String) {
        encryptedPrefs.edit().putString(KEY_DEVICE_TOKEN, token).apply()
    }

    fun getDeviceToken(): String? {
        return encryptedPrefs.getString(KEY_DEVICE_TOKEN, null)
    }

    // Device ID
    fun saveDeviceId(deviceId: String) {
        encryptedPrefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
    }

    fun getDeviceId(): String? {
        return encryptedPrefs.getString(KEY_DEVICE_ID, null)
    }

    // Subscriber Information
    fun saveSubscriberInfo(
        subscriberId: String,
        subscriberName: String,
        subscriberPlan: String,
        dailyQuota: Int
    ) {
        encryptedPrefs.edit().apply {
            putString(KEY_SUBSCRIBER_ID, subscriberId)
            putString(KEY_SUBSCRIBER_NAME, subscriberName)
            putString(KEY_SUBSCRIBER_PLAN, subscriberPlan)
            putInt(KEY_DAILY_QUOTA, dailyQuota)
        }.apply()
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

    fun getDailyQuota(): Int {
        return encryptedPrefs.getInt(KEY_DAILY_QUOTA, 0)
    }

    // Backend URL Configuration
    fun saveBackendUrl(url: String) {
        encryptedPrefs.edit().putString(KEY_BACKEND_URL, url).apply()
    }

    fun getBackendUrl(): String {
        return encryptedPrefs.getString(KEY_BACKEND_URL, DEFAULT_BACKEND_URL) ?: DEFAULT_BACKEND_URL
    }

    // Check if device is registered
    fun isDeviceRegistered(): Boolean {
        return getDeviceToken() != null && getDeviceId() != null
    }

    // Clear all credentials (logout)
    fun clearCredentials() {
        encryptedPrefs.edit().clear().apply()
    }

    // Get all subscriber info as data class
    fun getSubscriberInfo(): SubscriberInfo? {
        val id = getSubscriberId() ?: return null
        val name = getSubscriberName() ?: return null
        val plan = getSubscriberPlan() ?: return null
        val quota = getDailyQuota()

        return SubscriberInfo(
            subscriberId = id,
            subscriberName = name,
            subscriberPlan = plan,
            dailyQuota = quota
        )
    }
}

data class SubscriberInfo(
    val subscriberId: String,
    val subscriberName: String,
    val subscriberPlan: String,
    val dailyQuota: Int
)
