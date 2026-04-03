package com.codereply.gateway.util

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.telephony.TelephonyManager
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Collects device metadata for registration.
 * Handles permissions for sensitive data gracefully.
 */
@Singleton
class DeviceInfoProvider @Inject constructor(
    @ApplicationContext private val context: Context
) {
    /**
     * Collect all device information for registration.
     * Returns sanitized info if permissions are not granted.
     */
    fun collectDeviceInfo(): DeviceInfo {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager

        val hasPhoneStatePermission = ContextCompat.checkSelfPermission(
            context,
            Manifest.permission.READ_PHONE_STATE
        ) == PackageManager.PERMISSION_GRANTED

        return DeviceInfo(
            deviceName = getDeviceName(),
            androidVersion = getAndroidVersion(),
            simCarrier = if (hasPhoneStatePermission) getSimCarrier(telephonyManager) else null,
            simNumber = if (hasPhoneStatePermission) getSimNumber(telephonyManager) else null,
            manufacturer = Build.MANUFACTURER,
            model = Build.MODEL,
            sdkVersion = Build.VERSION.SDK_INT
        )
    }

    /**
     * Get a user-friendly device name (e.g., "Samsung Galaxy S21", "Pixel 6 Pro")
     */
    private fun getDeviceName(): String {
        val manufacturer = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
        val model = Build.MODEL

        return if (model.startsWith(manufacturer, ignoreCase = true)) {
            model
        } else {
            "$manufacturer $model"
        }
    }

    /**
     * Get Android version string (e.g., "Android 13")
     */
    private fun getAndroidVersion(): String {
        return "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
    }

    /**
     * Get SIM carrier name if available
     */
    private fun getSimCarrier(telephonyManager: TelephonyManager?): String? {
        return try {
            telephonyManager?.networkOperatorName?.takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Get SIM phone number if available (often returns null on modern Android)
     */
    private fun getSimNumber(telephonyManager: TelephonyManager?): String? {
        return try {
            telephonyManager?.line1Number?.takeIf { it.isNotBlank() }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Get current signal strength (requires permission)
     */
    fun getSignalStrength(): Int? {
        // This would require PhoneStateListener or CellInfo API
        // For now, return null - can be implemented later
        return null
    }

    /**
     * Get network type (WiFi, 4G, 5G, etc.)
     */
    fun getNetworkType(): String? {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager

        return try {
            when (telephonyManager?.networkType) {
                TelephonyManager.NETWORK_TYPE_LTE -> "4G LTE"
                TelephonyManager.NETWORK_TYPE_NR -> "5G"
                TelephonyManager.NETWORK_TYPE_HSDPA,
                TelephonyManager.NETWORK_TYPE_HSUPA,
                TelephonyManager.NETWORK_TYPE_HSPA -> "3G"
                TelephonyManager.NETWORK_TYPE_EDGE,
                TelephonyManager.NETWORK_TYPE_GPRS -> "2G"
                else -> "Unknown"
            }
        } catch (e: Exception) {
            null
        }
    }

    /**
     * Check if device has active SIM card
     */
    fun hasActiveSim(): Boolean {
        val telephonyManager = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
        return try {
            telephonyManager?.simState == TelephonyManager.SIM_STATE_READY
        } catch (e: Exception) {
            false
        }
    }
}

data class DeviceInfo(
    val deviceName: String,
    val androidVersion: String,
    val simCarrier: String?,
    val simNumber: String?,
    val manufacturer: String,
    val model: String,
    val sdkVersion: Int
)
