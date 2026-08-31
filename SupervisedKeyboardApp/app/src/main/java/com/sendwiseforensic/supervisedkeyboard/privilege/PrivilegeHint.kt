package com.sendwiseforensic.supervisedkeyboard.privilege

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import com.sendwiseforensic.supervisedkeyboard.evidence.PrivilegeFlag
import org.json.JSONArray
import org.json.JSONException

/**
 * On-device privilege classifier.
 *
 * Produces a [PrivilegeFlag] HINT for each captured batch. The
 * authoritative privilege decision is made server-side by the
 * independent Filter Team (docs/PROTOTYPE_NOTICE.md item 6,
 * TODO(FILTER-TEAM-INDEPENDENCE)). The device tags to route the batch
 * into the correct server-side quarantine queue only.
 *
 * Two signals are combined:
 *   1. A cached list of hashed contact identifiers with category labels,
 *      persisted in [EncryptedSharedPreferences]. Populated by the
 *      forensic-console server; see TODO(WIRE-TO-FORENSIC-CONSOLE) below.
 *   2. A hard-coded package allowlist of legal/medical/faith apps as a
 *      fallback while the remote registry is unavailable. This list is
 *      INTENTIONALLY conservative — false positives are safe (they route
 *      to Filter Team review); false negatives are not.
 *      TODO(PRIVILEGE-REGISTRY-VERIFICATION) validate every entry against
 *      the Bar Council / Medical Council registries before pilot.
 */
class PrivilegeHint(private val context: Context) {

    private val prefs by lazy {
        EncryptedSharedPreferences.create(
            context.applicationContext,
            PREFS_FILE,
            MasterKey.Builder(context.applicationContext)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build(),
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    /**
     * Classify a batch given its foreground app package and (optional)
     * SHA-256-hashed recipient identifier.
     *
     * Semantics:
     *   - App-based match wins first (deterministic, cheap).
     *   - Then the hashed-recipient list.
     *   - If neither matched and the batch has no recipient at all
     *     (e.g. a keystroke batch typed into an editor with no addressee
     *     yet) return [PrivilegeFlag.UNKNOWN]. Server-side filter must
     *     treat UNKNOWN as "possibly privileged, review".
     *   - Otherwise [PrivilegeFlag.NONE].
     */
    fun classify(contextAppPackage: String?, recipientHashHex: String?): PrivilegeFlag {
        val pkg = contextAppPackage?.lowercase().orEmpty()
        if (pkg.isNotEmpty()) {
            LEGAL_APP_PACKAGES.firstOrNull { pkg.contains(it) }?.let {
                return PrivilegeFlag.LEGAL
            }
            MEDICAL_APP_PACKAGES.firstOrNull { pkg.contains(it) }?.let {
                return PrivilegeFlag.MEDICAL
            }
            CLERGY_APP_PACKAGES.firstOrNull { pkg.contains(it) }?.let {
                return PrivilegeFlag.CLERGY
            }
        }

        if (!recipientHashHex.isNullOrBlank()) {
            val fromRegistry = lookupRegistry(recipientHashHex.lowercase())
            if (fromRegistry != null) return fromRegistry
            return PrivilegeFlag.NONE
        }

        // No recipient signal at all — err on the side of quarantine.
        return PrivilegeFlag.UNKNOWN
    }

    private fun lookupRegistry(recipientHashHex: String): PrivilegeFlag? {
        val raw = prefs.getString(KEY_REGISTRY_JSON, null) ?: return null
        return try {
            val arr = JSONArray(raw)
            for (i in 0 until arr.length()) {
                val e = arr.optJSONObject(i) ?: continue
                val h = e.optString("hashedIdentifierHex", "").lowercase()
                if (h == recipientHashHex) {
                    val cat = e.optString("category", "")
                    return when (cat.uppercase()) {
                        "LEGAL" -> PrivilegeFlag.LEGAL
                        "MEDICAL" -> PrivilegeFlag.MEDICAL
                        "CLERGY" -> PrivilegeFlag.CLERGY
                        "SPOUSAL" -> PrivilegeFlag.SPOUSAL
                        else -> null
                    }
                }
            }
            null
        } catch (e: JSONException) {
            Log.w(TAG, "corrupt privilege registry blob: ${e.message}")
            null
        }
    }

    /**
     * Overwrite the local hashed-contact registry. Callers must supply a
     * JSON array of `{ hashedIdentifierHex, category, source }` objects.
     *
     * TODO(WIRE-TO-FORENSIC-CONSOLE) this is currently only invoked from
     * developer test hooks. The real sync path (authenticated pull from
     * the forensic-console with signature verification) is not
     * implemented in this PR.
     */
    fun replaceRegistry(json: String) {
        prefs.edit().putString(KEY_REGISTRY_JSON, json).apply()
    }

    companion object {
        private const val TAG = "PrivilegeHint"
        private const val PREFS_FILE = "supervised_privilege_registry"
        private const val KEY_REGISTRY_JSON = "registry_v1"

        // TODO(PRIVILEGE-REGISTRY-VERIFICATION) verify every entry
        // against the corresponding statutory registry before pilot.
        private val LEGAL_APP_PACKAGES = listOf(
            "in.gov.digilocker",
            "com.legallybest",
            "in.mylegal",
            "com.vakilsearch",
        )

        // TODO(PRIVILEGE-REGISTRY-VERIFICATION) verify.
        private val MEDICAL_APP_PACKAGES = listOf(
            "com.practo",
            "com.aranoah.healthkart.plus", // 1mg
            "com.tatadigitalhealth", // Tata 1mg
            "in.tatahealth.consumer",
            "com.medlife.customer",
        )

        // TODO(PRIVILEGE-REGISTRY-VERIFICATION) verify.
        private val CLERGY_APP_PACKAGES = listOf<String>(
            // Intentionally empty in the prototype — no widely-used
            // clergy-specific app to allowlist without risking overreach.
        )
    }
}
