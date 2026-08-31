package com.sendwiseforensic.supervisedkeyboard.attestation

import com.sendwiseforensic.supervisedkeyboard.tamper.RuntimeIntegrityChecker

/**
 * Device attestation payload attached to every evidence upload.
 *
 * Prototype stub. TODO(PLAY-INTEGRITY) replace with a real Play Integrity
 * verdict (docs/PROTOTYPE_NOTICE.md item 4) plus, on API 31+, a
 * hardware-attested key certificate chain from the AndroidKeyStore
 * (docs/PROTOTYPE_NOTICE.md item 5, TODO(HARDWARE-KEYSTORE)).
 */
data class AttestationPayload(
    val ok: Boolean,
    val kind: String,
    val verdict: String,
    val isEmulator: Boolean,
    val isRootedProbable: Boolean,
    val notes: List<String>,
)

object DeviceAttestation {

    /**
     * Compute an [AttestationPayload]. Suspend to permit a real Play
     * Integrity call in a later PR.
     */
    @Suppress("RedundantSuspendModifier")
    suspend fun check(): AttestationPayload {
        val v = RuntimeIntegrityChecker.check()
        val verdict = buildString {
            append("TODO(PLAY-INTEGRITY): replace with real Play Integrity API. ")
            append("emulator=${v.isEmulator} rooted_probable=${v.isRootedProbable}")
            if (v.notes.isNotEmpty()) {
                append(" notes=[")
                append(v.notes.joinToString("; "))
                append("]")
            }
        }
        return AttestationPayload(
            ok = false,
            kind = "PLAY_INTEGRITY_STUB",
            verdict = verdict,
            isEmulator = v.isEmulator,
            isRootedProbable = v.isRootedProbable,
            notes = v.notes,
        )
    }
}
