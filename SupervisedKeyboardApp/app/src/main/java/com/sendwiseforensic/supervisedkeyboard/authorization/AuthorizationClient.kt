package com.sendwiseforensic.supervisedkeyboard.authorization

import kotlinx.coroutines.flow.Flow

/**
 * Abstraction over "where does the current AuthorizationState come from".
 *
 * Real implementation will talk to the forensic-console backend and cache
 * signed state locally. Prototype ships [StubAuthorizationClient] which
 * only reads/writes EncryptedSharedPreferences.
 *
 * TODO(WIRE-TO-FORENSIC-CONSOLE) implement a live client that:
 *   1. Long-polls or receives push updates for authorization status changes.
 *   2. Verifies a server-signed state envelope before applying it.
 *   3. Reports tamper events over an authenticated channel.
 */
interface AuthorizationClient {
    /**
     * Cold flow of the last-known [AuthorizationState]. Every new
     * subscriber gets the current state first, then updates.
     */
    fun observeState(): Flow<AuthorizationState>

    /**
     * Ask the client to refresh from its source of truth. In the stub this
     * is a no-op that re-emits the last stored state. In a real client this
     * hits the forensic-console API.
     */
    suspend fun refresh()

    /**
     * Report a tamper event (screen-recording detected, uninstall attempt,
     * clock rollback, hardware-attestation failure...). The client must
     * persist it locally and, when networked, forward to the server.
     *
     * @param event short event tag; must not contain PII.
     */
    suspend fun reportTamper(event: String)
}
