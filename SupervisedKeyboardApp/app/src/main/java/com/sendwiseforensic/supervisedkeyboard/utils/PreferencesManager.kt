package com.sendwiseforensic.supervisedkeyboard.utils

import android.content.Context
import android.content.SharedPreferences
import androidx.preference.PreferenceManager

/**
 * PreferencesManager - Manages user preferences and settings
 *
 * Settings include:
 * - Enable/disable moderation
 * - Sensitivity threshold
 * - Local statistics
 */
class PreferencesManager(context: Context) {

    private val prefs: SharedPreferences = PreferenceManager.getDefaultSharedPreferences(context)

    companion object {
        private const val KEY_MODERATION_ENABLED = "moderation_enabled"
        private const val KEY_SENSITIVITY_THRESHOLD = "sensitivity_threshold"
        private const val KEY_VIOLATION_COUNT = "violation_count"
        private const val KEY_WARNING_COUNT = "warning_count"
        private const val KEY_LAST_CATEGORY = "last_category"
        private const val KEY_TOS_ACCEPTED = "tos_accepted_v1"
        private const val KEY_TOS_ACCEPTED_TIMESTAMP = "tos_accepted_timestamp"
        private const val KEY_AGE_VERIFIED = "age_verified"
        private const val KEY_PARENTAL_CONSENT = "parental_consent"

        // Parental-link pairing keys
        private const val KEY_PAIRING_CODE = "pairing_code"
        private const val KEY_PAIRING_EXPIRES_AT = "pairing_expires_at"
        private const val KEY_IS_PAIRED = "is_paired"

        // Device enrollment keys (forensic-console)
        private const val KEY_DEVICE_ID = "device_id"
        private const val KEY_INGEST_TOKEN = "ingest_token"
        private const val KEY_IS_ENROLLED = "is_enrolled"

        // Default values
        private const val DEFAULT_MODERATION_ENABLED = true
        private const val DEFAULT_SENSITIVITY_THRESHOLD = 0.5f
    }

    /**
     * Checks if moderation is enabled
     */
    fun isModerationEnabled(): Boolean {
        return prefs.getBoolean(KEY_MODERATION_ENABLED, DEFAULT_MODERATION_ENABLED)
    }

    /**
     * Sets moderation enabled/disabled
     */
    fun setModerationEnabled(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_MODERATION_ENABLED, enabled).apply()
    }

    /**
     * Gets the sensitivity threshold (0.0 to 1.0)
     */
    fun getSensitivityThreshold(): Float {
        // SeekBarPreference persists as Int (0..100). Older builds may have
        // persisted as Float (0.0..1.0). Read robustly so we never throw
        // ClassCastException on a mixed-type preference file.
        val raw = try { prefs.all[KEY_SENSITIVITY_THRESHOLD] } catch (t: Throwable) { null }
        val normalized: Float = when (raw) {
            is Int -> raw / 100f
            is Long -> raw / 100f
            is Float -> if (raw > 1.5f) raw / 100f else raw
            is Double -> if (raw > 1.5) (raw / 100f).toFloat() else raw.toFloat()
            is Number -> raw.toFloat() / 100f
            is String -> raw.toFloatOrNull()?.let { if (it > 1.5f) it / 100f else it } ?: DEFAULT_SENSITIVITY_THRESHOLD
            else -> DEFAULT_SENSITIVITY_THRESHOLD
        }
        return normalized.coerceIn(0f, 1f)
    }

    /**
     * Sets the sensitivity threshold
     */
    fun setSensitivityThreshold(threshold: Float) {
        val clampedThreshold = threshold.coerceIn(0f, 1f)
        prefs.edit().putFloat(KEY_SENSITIVITY_THRESHOLD, clampedThreshold).apply()
    }

    /**
     * Gets the local violation count
     */
    fun getViolationCount(): Int {
        return prefs.getInt(KEY_VIOLATION_COUNT, 0)
    }

    /**
     * Increments the violation count
     */
    fun incrementViolationCount(amount: Int = 1) {
        val currentCount = getViolationCount()
        prefs.edit().putInt(KEY_VIOLATION_COUNT, currentCount + amount).apply()
    }

    /**
     * Gets the local warning count
     */
    fun getWarningCount(): Int {
        return prefs.getInt(KEY_WARNING_COUNT, 0)
    }

    /**
     * Increments the warning count
     */
    fun incrementWarningCount(amount: Int = 1) {
        val currentCount = getWarningCount()
        prefs.edit().putInt(KEY_WARNING_COUNT, currentCount + amount).apply()
    }

    /**
     * Gets the last detected category
     */
    fun getLastCategory(): String? {
        return prefs.getString(KEY_LAST_CATEGORY, null)
    }

    /**
     * Sets the last detected category
     */
    fun setLastCategory(category: String) {
        prefs.edit().putString(KEY_LAST_CATEGORY, category).apply()
    }

    /**
     * Resets all statistics
     */
    fun resetStatistics() {
        prefs.edit()
            .putInt(KEY_VIOLATION_COUNT, 0)
            .putInt(KEY_WARNING_COUNT, 0)
            .remove(KEY_LAST_CATEGORY)
            .apply()
    }

    /**
     * Checks if Terms of Service have been accepted
     */
    fun isToSAccepted(): Boolean {
        return prefs.getBoolean(KEY_TOS_ACCEPTED, false)
    }

    /**
     * Sets Terms of Service acceptance
     */
    fun setToSAccepted(accepted: Boolean) {
        prefs.edit()
            .putBoolean(KEY_TOS_ACCEPTED, accepted)
            .putLong(KEY_TOS_ACCEPTED_TIMESTAMP, System.currentTimeMillis())
            .apply()
    }

    /**
     * Gets ToS acceptance timestamp
     */
    fun getToSAcceptanceTimestamp(): Long {
        return prefs.getLong(KEY_TOS_ACCEPTED_TIMESTAMP, 0)
    }

    /**
     * Checks if age has been verified
     */
    fun isAgeVerified(): Boolean {
        return prefs.getBoolean(KEY_AGE_VERIFIED, false)
    }

    /**
     * Sets age verification status
     */
    fun setAgeVerified(verified: Boolean) {
        prefs.edit().putBoolean(KEY_AGE_VERIFIED, verified).apply()
    }

    /**
     * Checks if parental consent was given (for users under 13)
     */
    fun hasParentalConsent(): Boolean {
        return prefs.getBoolean(KEY_PARENTAL_CONSENT, false)
    }

    /**
     * Sets parental consent status
     */
    fun setParentalConsent(given: Boolean) {
        prefs.edit().putBoolean(KEY_PARENTAL_CONSENT, given).apply()
    }

    // ----------------------------------------------------------------------
    // Parental-link pairing
    // ----------------------------------------------------------------------

    /** Returns the currently stored 6-digit pairing code, or null if none. */
    fun getPairingCode(): String? {
        return prefs.getString(KEY_PAIRING_CODE, null)
    }

    /** Returns the epoch-ms expiry of the stored pairing code, or 0 if none. */
    fun getPairingExpiresAt(): Long {
        return prefs.getLong(KEY_PAIRING_EXPIRES_AT, 0L)
    }

    /** Persists a freshly issued pairing code and its expiry timestamp. */
    fun setPairingCode(code: String, expiresAtEpochMs: Long) {
        prefs.edit()
            .putString(KEY_PAIRING_CODE, code)
            .putLong(KEY_PAIRING_EXPIRES_AT, expiresAtEpochMs)
            .apply()
    }

    /** Removes any stored pairing code (used on unlink or expiry). */
    fun clearPairingCode() {
        prefs.edit()
            .remove(KEY_PAIRING_CODE)
            .remove(KEY_PAIRING_EXPIRES_AT)
            .apply()
    }

    /** True iff a pairing code exists and has not yet expired. */
    fun hasUnexpiredPairingCode(): Boolean {
        val code = getPairingCode() ?: return false
        return code.isNotEmpty() && getPairingExpiresAt() > System.currentTimeMillis()
    }

    /** True iff this device has been linked to a parent dashboard account. */
    fun isPaired(): Boolean {
        return prefs.getBoolean(KEY_IS_PAIRED, false)
    }

    /** Sets the paired state. When unlinking, the pairing code is also cleared. */
    fun setPaired(paired: Boolean) {
        val editor = prefs.edit().putBoolean(KEY_IS_PAIRED, paired)
        if (!paired) {
            editor.remove(KEY_PAIRING_CODE).remove(KEY_PAIRING_EXPIRES_AT)
        }
        editor.apply()
    }

    // ----------------------------------------------------------------------
    // Device enrollment (forensic-console)
    // ----------------------------------------------------------------------

    /** Returns the stored device ID issued by POST /api/devices/enroll, or null if none. */
    fun getDeviceId(): String? {
        return prefs.getString(KEY_DEVICE_ID, null)
    }

    /** Persists the device ID returned by the enrollment response. */
    fun setDeviceId(deviceId: String) {
        prefs.edit().putString(KEY_DEVICE_ID, deviceId).apply()
    }

    /**
     * Returns the stored per-device ingest token (Bearer credential for
     * future evidence-ingest submission), or null if none. This is a real
     * security secret — never display it on screen after initial receipt.
     */
    fun getIngestToken(): String? {
        return prefs.getString(KEY_INGEST_TOKEN, null)
    }

    /** Persists the raw ingest token returned (once) by the enrollment response. */
    fun setIngestToken(token: String) {
        prefs.edit().putString(KEY_INGEST_TOKEN, token).apply()
    }

    /** True iff this device has successfully completed enrollment. */
    fun isEnrolled(): Boolean {
        return prefs.getBoolean(KEY_IS_ENROLLED, false)
    }

    /** Sets the enrollment state. When un-enrolling, device ID + token are also cleared. */
    fun setEnrolled(enrolled: Boolean) {
        val editor = prefs.edit().putBoolean(KEY_IS_ENROLLED, enrolled)
        if (!enrolled) {
            editor.remove(KEY_DEVICE_ID).remove(KEY_INGEST_TOKEN)
        }
        editor.apply()
    }

    /**
     * Gets all preferences for export/debugging
     */
    fun getAllPreferences(): Map<String, Any?> {
        return mapOf(
            "moderationEnabled" to isModerationEnabled(),
            "sensitivityThreshold" to getSensitivityThreshold(),
            "violationCount" to getViolationCount(),
            "warningCount" to getWarningCount(),
            "lastCategory" to getLastCategory(),
            "tosAccepted" to isToSAccepted(),
            "ageVerified" to isAgeVerified(),
            "parentalConsent" to hasParentalConsent()
        )
    }
}
