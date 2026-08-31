package com.sendwiseforensic.supervisedkeyboard

import android.app.Application
import android.util.Log
import com.sendwiseforensic.supervisedkeyboard.authorization.AuthorizationState
import com.sendwiseforensic.supervisedkeyboard.authorization.CollectionGate
import com.sendwiseforensic.supervisedkeyboard.authorization.StubAuthorizationClient
import com.sendwiseforensic.supervisedkeyboard.evidence.EvidenceRecorder
import com.sendwiseforensic.supervisedkeyboard.evidence.EvidenceSigner
import com.sendwiseforensic.supervisedkeyboard.notify.SupervisionForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Application entry point.
 *
 * Wires the [CollectionGate] to an [com.sendwiseforensic.supervisedkeyboard.authorization.AuthorizationClient],
 * initialises the [EvidenceSigner] and [EvidenceRecorder], and drives the
 * persistent supervision foreground service in response to state changes.
 *
 * The gate itself is the ONLY sanctioned decision point for persistence
 * or upload of authorization-relevant data. This class only wires it up.
 */
class SupervisedKeyboardApplication : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onCreate() {
        super.onCreate()

        // Evidence signer — one per process, backed by AndroidKeyStore.
        // Runs on Dispatchers.IO so first-launch key generation does not
        // block Main.
        appScope.launch(Dispatchers.IO) {
            try {
                val signer = EvidenceSigner.init()
                EvidenceRecorder.init(this@SupervisedKeyboardApplication, signer)
                signerRef = signer
            } catch (t: Throwable) {
                Log.e(TAG, "EvidenceSigner init failed: ${t.message}", t)
            }
        }

        // TODO(WIRE-TO-FORENSIC-CONSOLE) swap in a real AuthorizationClient
        // that talks to the forensic-console backend.
        val client = StubAuthorizationClient(this)
        CollectionGate.bind(client, appScope)

        // Drive the persistent indicator from state transitions.
        appScope.launch {
            CollectionGate.state.collect { state ->
                Log.i(TAG, "auth state -> ${state.javaClass.simpleName}")
                if (state is AuthorizationState.Active) {
                    SupervisionForegroundService.start(this@SupervisedKeyboardApplication)
                } else {
                    SupervisionForegroundService.stop(this@SupervisedKeyboardApplication)
                }
            }
        }
    }

    companion object {
        private const val TAG = "SupervisedKbApp"

        @Volatile private var signerRef: EvidenceSigner? = null

        /**
         * Returns the base64-encoded X.509 public key of the on-device
         * evidence signer, or empty string if the signer has not been
         * initialised yet. Used by
         * [com.sendwiseforensic.supervisedkeyboard.evidence.EvidenceUploader]
         * to attach the device public key to every upload.
         */
        fun evidenceSignerPublicKeyBase64(): String =
            signerRef?.publicKeyBase64().orEmpty()
    }
}
