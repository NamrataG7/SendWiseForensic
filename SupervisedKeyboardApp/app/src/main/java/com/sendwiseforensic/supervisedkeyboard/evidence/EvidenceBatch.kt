package com.sendwiseforensic.supervisedkeyboard.evidence

import com.sendwiseforensic.supervisedkeyboard.authorization.DataCategory
import java.time.Instant
import java.util.UUID

/**
 * A single hash-chained batch of evidence produced on-device.
 *
 * Mirrors docs/ENTITY_MODEL.md §1 Evidence with two forensic-important
 * pre-computations that happen before the batch leaves the device:
 *
 *   1. [prevBatchHashHex] links this batch to the previous one in the
 *      same MonitoringSession. The very first batch of a session uses a
 *      64-character all-zero placeholder.
 *   2. [batchHashHex] is `SHA-256(prevBatchHashHex || payloadBytes ||
 *      canonicalMetadata)` — canonical meaning `sessionId|category|
 *      capturedAtIso|contextAppPackage|privilegeFlag`.
 *
 * The chain hash + a hardware-backed signature ([EvidenceSigner]) together
 * satisfy the BSA §63 chain-of-custody requirement
 * (docs/LEGAL_FRAMEWORK_IN.md §4).
 *
 * IMPORTANT: never construct or persist an [EvidenceBatch] outside
 * [EvidenceRecorder]. That is the only class that checks
 * [com.sendwiseforensic.supervisedkeyboard.authorization.CollectionGate]
 * before allowing capture.
 */
data class EvidenceBatch(
    val batchId: UUID,
    val sessionId: String,
    val capturedAt: Instant,
    val category: DataCategory,
    val payloadBytes: ByteArray,
    val prevBatchHashHex: String,
    val batchHashHex: String,
    val privilegeFlag: PrivilegeFlag,
    val contextAppPackage: String?,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is EvidenceBatch) return false
        return batchId == other.batchId &&
            sessionId == other.sessionId &&
            capturedAt == other.capturedAt &&
            category == other.category &&
            payloadBytes.contentEquals(other.payloadBytes) &&
            prevBatchHashHex == other.prevBatchHashHex &&
            batchHashHex == other.batchHashHex &&
            privilegeFlag == other.privilegeFlag &&
            contextAppPackage == other.contextAppPackage
    }

    override fun hashCode(): Int {
        var r = batchId.hashCode()
        r = 31 * r + sessionId.hashCode()
        r = 31 * r + capturedAt.hashCode()
        r = 31 * r + category.hashCode()
        r = 31 * r + payloadBytes.contentHashCode()
        r = 31 * r + prevBatchHashHex.hashCode()
        r = 31 * r + batchHashHex.hashCode()
        r = 31 * r + privilegeFlag.hashCode()
        r = 31 * r + (contextAppPackage?.hashCode() ?: 0)
        return r
    }

    companion object {
        /** Placeholder previous-hash for the first batch of a session. */
        const val GENESIS_PREV_HASH_HEX: String =
            "0000000000000000000000000000000000000000000000000000000000000000"
    }
}

/**
 * Privilege category as flagged on-device by [PrivilegeHint]. Mirrors the
 * server-side privilegeFlag enum in packages/legal-framework schemas.ts.
 *
 * On-device tagging is a HINT — the authoritative privilege decision is
 * made by the independent Filter Team on the server
 * (docs/PROTOTYPE_NOTICE.md item 6, TODO(FILTER-TEAM-INDEPENDENCE)).
 */
enum class PrivilegeFlag {
    NONE,
    LEGAL,
    MEDICAL,
    CLERGY,
    SPOUSAL,
    UNKNOWN,
}
