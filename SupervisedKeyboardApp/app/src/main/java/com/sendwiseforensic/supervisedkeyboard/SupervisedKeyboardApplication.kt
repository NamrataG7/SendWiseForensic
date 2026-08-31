package com.sendwiseforensic.supervisedkeyboard

import android.app.Application
import android.util.Log
import com.sendwiseforensic.supervisedkeyboard.authorization.AuthorizationState
import com.sendwiseforensic.supervisedkeyboard.authorization.CollectionGate
import com.sendwiseforensic.supervisedkeyboard.authorization.StubAuthorizationClient
import com.sendwiseforensic.supervisedkeyboard.notify.SupervisionForegroundService
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * Application entry point. Wires the [CollectionGate] to an
 * [com.sendwiseforensic.supervisedkeyboard.authorization.AuthorizationClient]
 * and drives the persistent supervision foreground service in response to
 * state changes.
 *
 * The gate itself is the ONLY sanctioned decision point for persistence
 * or upload of authorization-relevant data. This class only wires it up.
 */
class SupervisedKeyboardApplication : Application() {

    private val appScope = CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate)

    override fun onCreate() {
        super.onCreate()

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
    }
}
