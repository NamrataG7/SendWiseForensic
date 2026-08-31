package com.sendwiseforensic.supervisedkeyboard.tamper

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.sendwiseforensic.supervisedkeyboard.BuildConfig
import com.sendwiseforensic.supervisedkeyboard.authorization.AuthorizationState
import com.sendwiseforensic.supervisedkeyboard.authorization.CollectionGate
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.Instant

/**
 * Best-effort tamper reporter. Registered in the manifest for
 * `ACTION_PACKAGE_FULLY_REMOVED` and `ACTION_PACKAGE_CHANGED` filtered on
 * OUR own package.
 *
 * Behaviour:
 *   - If [CollectionGate] is NOT [AuthorizationState.Active], no report.
 *   - If Active, do a synchronous best-effort POST of a small tamper
 *     event (kind, occurredAt, no content) to the forensic-console
 *     tamper endpoint.
 *
 * This runs inside [onReceive]; broadcast receivers are limited to ~10s
 * of work and the process can be torn down at any moment (uninstall).
 * We therefore keep the payload tiny and use plain [HttpURLConnection]
 * on the receiver thread — no coroutine handoff.
 *
 * TODO(WIRE-TO-FORENSIC-CONSOLE) real implementation must:
 *   - carry a hardware-attested signature (see
 *     [com.sendwiseforensic.supervisedkeyboard.evidence.EvidenceSigner]);
 *   - be queued in a durable outbox so an uninstall-fully-removed event
 *     is retried post-reinstall (docs/PROTOTYPE_NOTICE.md item 4).
 */
class SelfTamperReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        val action = intent.action ?: return
        val ownPkg = context.packageName
        val targetPkg = intent.data?.schemeSpecificPart
        if (targetPkg != null && targetPkg != ownPkg) return

        val state = CollectionGate.currentState()
        if (state !is AuthorizationState.Active) return

        val kind = when (action) {
            Intent.ACTION_PACKAGE_FULLY_REMOVED -> "UNINSTALL_ATTEMPT"
            Intent.ACTION_PACKAGE_CHANGED -> "PACKAGE_CHANGED"
            else -> return
        }

        // COLLECTION_GATE_ONLY — only reachable when CollectionGate
        // reports Active. Payload is metadata; no user content.
        postTamperEventBestEffort(kind = kind, sessionId = state.sessionId)
    }

    // COLLECTION_GATE_ONLY
    private fun postTamperEventBestEffort(kind: String, sessionId: String) {
        val verdict = RuntimeIntegrityChecker.check()
        val payload = JSONObject()
            .put("kind", kind)
            .put("sessionId", sessionId)
            .put("occurredAt", Instant.now().toString())
            .put("clientVersion", BuildConfig.VERSION_NAME)
            .put(
                "verdict",
                JSONObject()
                    .put("isEmulator", verdict.isEmulator)
                    .put("isRootedProbable", verdict.isRootedProbable),
            )
            .toString()

        try {
            val conn = (URL("${BuildConfig.BACKEND_URL}/api/evidence/tamper").openConnection()
                as HttpURLConnection).apply {
                requestMethod = "POST"
                doOutput = true
                connectTimeout = 5_000
                readTimeout = 5_000
                setRequestProperty("Content-Type", "application/json")
            }
            conn.outputStream.use { it.write(payload.toByteArray()) }
            val code = conn.responseCode
            Log.i(TAG, "tamper event $kind posted status=$code")
            conn.disconnect()
        } catch (t: Throwable) {
            Log.w(TAG, "tamper POST failed: ${t.message}")
        }
    }

    companion object {
        private const val TAG = "SelfTamperReceiver"
    }
}
