package com.sendwiseforensic.supervisedkeyboard.evidence

import android.content.Context
import android.util.Base64
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import com.sendwiseforensic.supervisedkeyboard.authorization.AuthorizationState
import com.sendwiseforensic.supervisedkeyboard.authorization.CollectionGate
import com.sendwiseforensic.supervisedkeyboard.authorization.DataCategory
import com.sendwiseforensic.supervisedkeyboard.privilege.PrivilegeHint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import java.security.MessageDigest
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference

/**
 * The ONLY sanctioned entry point for recording evidence on-device.
 *
 * Contract:
 *   - Every call is gated by [CollectionGate.canCollect]. If the gate
 *     denies, this method returns immediately without touching disk or
 *     the network.
 *   - When the gate permits, the payload is hashed (chained to the
 *     previous batch in the session), tagged with a [PrivilegeHint]
 *     verdict, signed by [EvidenceSigner], persisted in [EvidenceStore],
 *     and an [EvidenceUploader] work request is enqueued.
 *
 * Callers MUST NOT bypass this class to persist or upload evidence.
 * Every call site that persists or uploads is annotated
 * `// COLLECTION_GATE_ONLY`.
 */
object EvidenceRecorder {

    private const val TAG = "EvidenceRecorder"

    /** Per-session tail hash for the on-device chain. */
    private val sessionTailHash = AtomicReference<Pair<String, String>?>(null)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    private lateinit var appContext: Context
    private lateinit var signer: EvidenceSigner
    private lateinit var privilege: PrivilegeHint

    @Volatile private var initialised = false

    /**
     * Initialise the recorder. Called from SupervisedKeyboardApplication.
     */
    fun init(context: Context, signer: EvidenceSigner) {
        this.appContext = context.applicationContext
        this.signer = signer
        this.privilege = PrivilegeHint(appContext)
        initialised = true
        Log.i(TAG, "initialised (hardwareBacked=${signer.isHardwareBacked})")
    }

    /**
     * COLLECTION_GATE_ONLY. Record a batch of evidence if — and only if —
     * the [CollectionGate] currently authorizes collection of [category]
     * in [contextAppPackage].
     *
     * The [payloadProducer] is invoked lazily, and only after the gate
     * permits.
     */
    // COLLECTION_GATE_ONLY
    fun record(
        category: DataCategory,
        payloadProducer: () -> ByteArray,
        contextAppPackage: String?,
        recipientHashHex: String? = null,
    ) {
        if (!initialised) return
        if (!CollectionGate.canCollect(category, contextAppPackage)) return
        val active = CollectionGate.currentState() as? AuthorizationState.Active ?: return

        scope.launch {
            try {
                val payload = payloadProducer()
                if (payload.isEmpty()) return@launch

                val capturedAt = Instant.now()
                val privilegeFlag = privilege.classify(contextAppPackage, recipientHashHex)
                val prevHash = tailFor(active.sessionId)
                val batchHashHex = computeBatchHash(
                    prevHashHex = prevHash,
                    payload = payload,
                    sessionId = active.sessionId,
                    category = category,
                    capturedAt = capturedAt,
                    contextAppPackage = contextAppPackage,
                    privilegeFlag = privilegeFlag,
                )
                val batch = EvidenceBatch(
                    batchId = UUID.randomUUID(),
                    sessionId = active.sessionId,
                    capturedAt = capturedAt,
                    category = category,
                    payloadBytes = payload,
                    prevBatchHashHex = prevHash,
                    batchHashHex = batchHashHex,
                    privilegeFlag = privilegeFlag,
                    contextAppPackage = contextAppPackage,
                )
                val signature = signer.sign(payload + batchHashHex.toByteArray())
                val row = EvidenceRow(
                    batchId = batch.batchId.toString(),
                    sessionId = batch.sessionId,
                    capturedAt = batch.capturedAt,
                    category = batch.category,
                    payloadBytes = batch.payloadBytes,
                    prevBatchHashHex = batch.prevBatchHashHex,
                    batchHashHex = batch.batchHashHex,
                    privilegeFlag = batch.privilegeFlag,
                    contextAppPackage = batch.contextAppPackage,
                    signatureBase64 = Base64.encodeToString(signature, Base64.NO_WRAP),
                )
                // COLLECTION_GATE_ONLY — insert into the local spool.
                EvidenceStore.get(appContext).evidenceDao().insert(row)
                advanceTail(active.sessionId, batchHashHex)
                enqueueUploadWorker()
            } catch (t: Throwable) {
                Log.e(TAG, "record failed: ${t.message}", t)
            }
        }
    }

    /**
     * COLLECTION_GATE_ONLY. Kick the uploader worker. Called after every
     * successful [record] and periodically by the worker itself.
     */
    // COLLECTION_GATE_ONLY
    fun enqueueUploadWorker() {
        val constraints = Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build()
        val req = OneTimeWorkRequestBuilder<EvidenceUploader>()
            .setConstraints(constraints)
            .setBackoffCriteria(
                BackoffPolicy.EXPONENTIAL,
                30, TimeUnit.SECONDS,
            )
            .build()
        WorkManager.getInstance(appContext).enqueueUniqueWork(
            EvidenceUploader.WORK_NAME,
            ExistingWorkPolicy.KEEP,
            req,
        )
    }

    private fun tailFor(sessionId: String): String {
        val current = sessionTailHash.get()
        if (current != null && current.first == sessionId) return current.second
        return EvidenceBatch.GENESIS_PREV_HASH_HEX
    }

    private fun advanceTail(sessionId: String, newHashHex: String) {
        sessionTailHash.set(sessionId to newHashHex)
    }

    private fun computeBatchHash(
        prevHashHex: String,
        payload: ByteArray,
        sessionId: String,
        category: DataCategory,
        capturedAt: Instant,
        contextAppPackage: String?,
        privilegeFlag: PrivilegeFlag,
    ): String {
        val md = MessageDigest.getInstance("SHA-256")
        md.update(prevHashHex.toByteArray())
        md.update(payload)
        val meta = buildString {
            append(sessionId)
            append('|')
            append(category.name)
            append('|')
            append(capturedAt.toString())
            append('|')
            append(contextAppPackage.orEmpty())
            append('|')
            append(privilegeFlag.name)
        }
        md.update(meta.toByteArray())
        return md.digest().joinToString("") { "%02x".format(it) }
    }
}
