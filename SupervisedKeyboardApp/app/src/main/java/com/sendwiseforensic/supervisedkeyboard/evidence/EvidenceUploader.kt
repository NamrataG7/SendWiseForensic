package com.sendwiseforensic.supervisedkeyboard.evidence

import android.content.Context
import android.util.Base64
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.sendwiseforensic.supervisedkeyboard.BuildConfig
import com.sendwiseforensic.supervisedkeyboard.SupervisedKeyboardApplication
import com.sendwiseforensic.supervisedkeyboard.attestation.AttestationPayload
import com.sendwiseforensic.supervisedkeyboard.attestation.DeviceAttestation
import com.sendwiseforensic.supervisedkeyboard.utils.UserIdGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * COLLECTION_GATE_ONLY. Reads pending [EvidenceRow]s from
 * [EvidenceStore], POSTs them to the forensic-console evidence-ingest
 * endpoint, and updates row status.
 *
 * Called via WorkManager. Scheduling and retry semantics:
 *   - Kicked off after every [EvidenceRecorder.record].
 *   - Backoff on 5xx / network via WorkManager exponential retry.
 *   - 4xx (except 401) is treated as terminal for the row (dead-letter).
 *   - 401 is transient (auth stub not wired yet); bumps attempt counter.
 *   - 200 marks the row uploaded.
 *
 * TODO(WIRE-TO-FORENSIC-CONSOLE) authentication, request signing, and
 * server-side signature verification are stubs. This uploader posts JSON
 * to a placeholder host and relies on device-side signatures embedded in
 * the payload — no session token, no mutual TLS.
 */
class EvidenceUploader(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {

    // COLLECTION_GATE_ONLY — this worker is only enqueued by
    // EvidenceRecorder after CollectionGate.canCollect() returned true
    // for the batches now in the spool.
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        try {
            val dao = EvidenceStore.get(applicationContext).evidenceDao()
            val batch = dao.pendingBatches(BATCH_LIMIT)
            if (batch.isEmpty()) return@withContext Result.success()

            val attestation = DeviceAttestation.check()
            val deviceId = try {
                UserIdGenerator.getAnonymousUserId(applicationContext)
            } catch (t: Throwable) {
                Log.w(TAG, "device id unavailable: ${t.message}")
                "unknown-device"
            }

            val body = buildBody(
                rows = batch,
                deviceId = deviceId,
                attestation = attestation,
            )
            val (code, errorMsg) = postJson(body)

            when {
                code in 200..299 -> {
                    for (row in batch) dao.markUploaded(row.batchId)
                    Result.success()
                }
                code == 401 -> {
                    for (row in batch) dao.bumpAttempt(row.batchId, "401 unauth")
                    Result.retry()
                }
                code in 400..499 -> {
                    for (row in batch) dao.markDeadLettered(
                        row.batchId,
                        "HTTP $code: ${errorMsg.orEmpty().take(200)}",
                    )
                    // 4xx is terminal for these rows — return success so
                    // the worker does not spin; new rows will re-trigger.
                    Result.success()
                }
                else -> {
                    for (row in batch) dao.bumpAttempt(
                        row.batchId,
                        "HTTP $code: ${errorMsg.orEmpty().take(200)}",
                    )
                    Result.retry()
                }
            }
        } catch (t: Throwable) {
            Log.w(TAG, "upload failed: ${t.message}")
            Result.retry()
        }
    }

    private fun buildBody(
        rows: List<EvidenceRow>,
        deviceId: String,
        attestation: AttestationPayload,
    ): String {
        val batches = JSONArray()
        for (r in rows) {
            batches.put(
                JSONObject()
                    .put("batchId", r.batchId)
                    .put("sessionId", r.sessionId)
                    .put("capturedAt", r.capturedAt.toString())
                    .put("category", r.category.name)
                    .put(
                        "payloadBase64",
                        Base64.encodeToString(r.payloadBytes, Base64.NO_WRAP),
                    )
                    .put("prevBatchHashHex", r.prevBatchHashHex)
                    .put("batchHashHex", r.batchHashHex)
                    .put("privilegeFlag", r.privilegeFlag.name)
                    .put("contextAppPackage", r.contextAppPackage ?: JSONObject.NULL)
                    .put("signatureBase64", r.signatureBase64),
            )
        }
        val device = JSONObject()
            .put("deviceId", deviceId)
            .put(
                "publicKeyBase64",
                SupervisedKeyboardApplication.evidenceSignerPublicKeyBase64(),
            )
            .put(
                "attestation",
                JSONObject()
                    .put("ok", attestation.ok)
                    .put("kind", attestation.kind)
                    .put("verdict", attestation.verdict)
                    .put("isEmulator", attestation.isEmulator)
                    .put("isRootedProbable", attestation.isRootedProbable),
            )
        return JSONObject()
            .put("batches", batches)
            .put("device", device)
            .put("clientVersion", BuildConfig.VERSION_NAME)
            .toString()
    }

    private fun postJson(body: String): Pair<Int, String?> {
        val url = URL("${BuildConfig.BACKEND_URL}/api/evidence/ingest")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            doOutput = true
            connectTimeout = 15_000
            readTimeout = 30_000
            setRequestProperty("Content-Type", "application/json")
        }
        return try {
            conn.outputStream.use { it.write(body.toByteArray()) }
            val code = conn.responseCode
            val err = if (code >= 400) {
                runCatching { conn.errorStream?.bufferedReader()?.readText() }.getOrNull()
            } else null
            code to err
        } catch (t: Throwable) {
            Log.w(TAG, "network error: ${t.message}")
            -1 to t.message
        } finally {
            conn.disconnect()
        }
    }

    companion object {
        private const val TAG = "EvidenceUploader"
        const val WORK_NAME = "sendwise_evidence_upload"
        private const val BATCH_LIMIT = 32
    }
}
