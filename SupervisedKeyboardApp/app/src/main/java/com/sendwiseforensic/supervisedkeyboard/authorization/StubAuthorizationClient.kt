package com.sendwiseforensic.supervisedkeyboard.authorization

import android.content.Context
import android.util.Log
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import org.json.JSONArray
import org.json.JSONException
import org.json.JSONObject
import java.time.Instant

/**
 * Prototype [AuthorizationClient] backed by [EncryptedSharedPreferences].
 *
 * Persists the last-known [AuthorizationState] as a JSON blob. Does not
 * perform any real network I/O — [refresh] re-reads the same blob so the
 * flow re-emits the current state.
 *
 * Encryption: AES-256-GCM with an Android Keystore master key
 * (androidx.security:security-crypto). minSdk 26 in this module already
 * satisfies the library's requirement.
 *
 * TODO(WIRE-TO-FORENSIC-CONSOLE) replace [refresh] and [reportTamper] with
 * authenticated calls to the forensic-console API, verify a server
 * signature on the returned state, and forward tamper events reliably
 * (queue + retry) instead of the current fire-and-forget local log.
 *
 * TODO(HARDWARE-KEYSTORE) tamper events should carry a hardware-backed
 * device signature so the server can distinguish a tampered app from a
 * legitimate one replaying the report.
 */
class StubAuthorizationClient(context: Context) : AuthorizationClient {

    private val appContext = context.applicationContext

    private val prefs = EncryptedSharedPreferences.create(
        appContext,
        PREFS_FILE,
        MasterKey.Builder(appContext)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
    )

    private val stateFlow: MutableStateFlow<AuthorizationState> =
        MutableStateFlow(readStateFromDisk())

    override fun observeState(): Flow<AuthorizationState> = stateFlow.asStateFlow()

    /**
     * Stub: no network call. Re-reads the persisted blob so that if
     * something (a test hook, a debug menu, a future manual override)
     * mutated it externally, subscribers see the new value.
     *
     * TODO(WIRE-TO-FORENSIC-CONSOLE) fetch state from the forensic-console
     * API, verify server signature, then setState().
     */
    override suspend fun refresh() {
        val fresh = readStateFromDisk()
        stateFlow.value = fresh
    }

    override suspend fun reportTamper(event: String) {
        // Prototype: log locally, append to an on-device audit list. Real
        // implementation must send this to the forensic-console.
        // TODO(WIRE-TO-FORENSIC-CONSOLE) forward tamper event over an
        // authenticated channel with retry.
        val safeEvent = event.take(MAX_TAMPER_EVENT_LEN)
        val existing = prefs.getString(KEY_TAMPER_LOG, null)
        val arr = try {
            if (existing == null) JSONArray() else JSONArray(existing)
        } catch (e: JSONException) {
            JSONArray()
        }
        val entry = JSONObject()
            .put("at", Instant.now().toString())
            .put("event", safeEvent)
        arr.put(entry)
        prefs.edit().putString(KEY_TAMPER_LOG, arr.toString()).apply()
        Log.w(TAG, "tamper reported (stub): $safeEvent")
    }

    // ---- persistence -------------------------------------------------------

    /**
     * Set state and persist. Exposed for test hooks and future debug menus.
     * Callers outside this class should not mutate state directly — use
     * a real refresh() flow instead.
     */
    internal fun setStateForTestOrDebug(state: AuthorizationState) {
        persist(state)
        stateFlow.value = state
    }

    private fun readStateFromDisk(): AuthorizationState {
        val raw = prefs.getString(KEY_STATE, null) ?: return AuthorizationState.Inactive
        return try {
            decode(JSONObject(raw))
        } catch (e: JSONException) {
            Log.w(TAG, "corrupt state blob, defaulting to Inactive: ${e.message}")
            AuthorizationState.Inactive
        }
    }

    private fun persist(state: AuthorizationState) {
        prefs.edit().putString(KEY_STATE, encode(state).toString()).apply()
    }

    // ---- JSON codec (org.json — no new dependency) ------------------------

    private fun encode(state: AuthorizationState): JSONObject {
        val obj = JSONObject()
        when (state) {
            is AuthorizationState.Inactive -> obj.put("type", "Inactive")
            is AuthorizationState.Expired -> obj.put("type", "Expired")
            is AuthorizationState.Suspended -> obj
                .put("type", "Suspended")
                .put("reason", state.reason)
            is AuthorizationState.Revoked -> obj
                .put("type", "Revoked")
                .put("reason", state.reason)
            is AuthorizationState.Active -> obj
                .put("type", "Active")
                .put("sessionId", state.sessionId)
                .put("warrantId", state.warrantId)
                .put("expiresAt", state.expiresAt.toString())
                .put("scope", encodeScope(state.scope))
        }
        return obj
    }

    private fun decode(obj: JSONObject): AuthorizationState {
        return when (val t = obj.optString("type", "Inactive")) {
            "Inactive" -> AuthorizationState.Inactive
            "Expired" -> AuthorizationState.Expired
            "Suspended" -> AuthorizationState.Suspended(obj.optString("reason", ""))
            "Revoked" -> AuthorizationState.Revoked(obj.optString("reason", ""))
            "Active" -> AuthorizationState.Active(
                sessionId = obj.getString("sessionId"),
                warrantId = obj.getString("warrantId"),
                expiresAt = Instant.parse(obj.getString("expiresAt")),
                scope = decodeScope(obj.getJSONObject("scope")),
            )
            else -> {
                Log.w(TAG, "unknown state type '$t', defaulting to Inactive")
                AuthorizationState.Inactive
            }
        }
    }

    private fun encodeScope(scope: AuthorizationScope): JSONObject {
        val dc = JSONArray().apply { scope.dataCategories.forEach { put(it.name) } }
        val devs = JSONArray().apply { scope.authorizedDeviceIds.forEach { put(it) } }
        val tw = JSONArray().apply {
            scope.timeWindows.forEach { w ->
                put(
                    JSONObject()
                        .put("startHourUtc", w.startHourUtc)
                        .put("endHourUtc", w.endHourUtc)
                        .put("daysOfWeekBitmask", w.daysOfWeekBitmask)
                )
            }
        }
        val kw = JSONArray().apply { scope.keywords.forEach { put(it) } }
        val ca = JSONArray().apply { scope.contextApps.forEach { put(it) } }
        return JSONObject()
            .put("dataCategories", dc)
            .put("authorizedDeviceIds", devs)
            .put("timeWindows", tw)
            .put("keywords", kw)
            .put("contextApps", ca)
    }

    private fun decodeScope(obj: JSONObject): AuthorizationScope {
        val dc = mutableSetOf<DataCategory>()
        obj.optJSONArray("dataCategories")?.let { arr ->
            for (i in 0 until arr.length()) {
                val name = arr.optString(i, "")
                try {
                    dc.add(DataCategory.valueOf(name))
                } catch (e: IllegalArgumentException) {
                    Log.w(TAG, "ignoring unknown DataCategory '$name'")
                }
            }
        }
        val devs = mutableSetOf<String>()
        obj.optJSONArray("authorizedDeviceIds")?.let { arr ->
            for (i in 0 until arr.length()) devs.add(arr.optString(i, ""))
        }
        val tw = mutableListOf<TimeWindow>()
        obj.optJSONArray("timeWindows")?.let { arr ->
            for (i in 0 until arr.length()) {
                val w = arr.optJSONObject(i) ?: continue
                tw.add(
                    TimeWindow(
                        startHourUtc = w.optInt("startHourUtc", 0),
                        endHourUtc = w.optInt("endHourUtc", 0),
                        daysOfWeekBitmask = w.optInt("daysOfWeekBitmask", 0),
                    )
                )
            }
        }
        val kw = mutableListOf<String>()
        obj.optJSONArray("keywords")?.let { arr ->
            for (i in 0 until arr.length()) kw.add(arr.optString(i, ""))
        }
        val ca = mutableSetOf<String>()
        obj.optJSONArray("contextApps")?.let { arr ->
            for (i in 0 until arr.length()) ca.add(arr.optString(i, ""))
        }
        return AuthorizationScope(
            dataCategories = dc,
            authorizedDeviceIds = devs,
            timeWindows = tw,
            keywords = kw,
            contextApps = ca,
        )
    }

    companion object {
        private const val TAG = "StubAuthClient"
        private const val PREFS_FILE = "supervised_authorization_state"
        private const val KEY_STATE = "state_json_v1"
        private const val KEY_TAMPER_LOG = "tamper_log_v1"
        private const val MAX_TAMPER_EVENT_LEN = 256
    }
}
