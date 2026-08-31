package com.sendwiseforensic.supervisedkeyboard.authorization

import java.time.Instant

/**
 * On-device projection of Authorization.status
 * (docs/ENTITY_MODEL.md §1 — Authorization.status).
 *
 * Server-side statuses DRAFT and PENDING_REVIEW never reach the device;
 * from the device's perspective either a warrant is live (Active) or it
 * is not. Terminal states (Expired, Revoked) are surfaced separately from
 * Inactive so the UI can explain why collection stopped.
 *
 * Invariant (enforced by CollectionGate, ENTITY_MODEL.md §3 rule 1):
 *   No persistence or upload of any DataCategory may happen unless the
 *   current state is Active AND the category is in scope.dataCategories.
 */
sealed class AuthorizationState {
    /** No live authorization known to this device. Default at first launch. */
    object Inactive : AuthorizationState()

    /**
     * Active judicial supervision.
     *
     * @property sessionId  server-issued MonitoringSession id
     * @property expiresAt  end of validity — must be <= warrant.expiresOn
     *                      (ENTITY_MODEL.md §3 invariant 2)
     * @property scope      authoritative scope for collection decisions
     * @property warrantId  Authorization id (for BSA §63 certificate chain)
     */
    data class Active(
        val sessionId: String,
        val expiresAt: Instant,
        val scope: AuthorizationScope,
        val warrantId: String,
    ) : AuthorizationState()

    /**
     * Server has told us to pause collection (e.g. subject objection under
     * review by the Review Committee) but the warrant has not expired or
     * been revoked. Collection is denied until we transition back to Active.
     */
    data class Suspended(val reason: String) : AuthorizationState()

    /** Warrant validity window has passed. Terminal. */
    object Expired : AuthorizationState()

    /** Warrant revoked (by court, Review Committee, or Competent Authority). Terminal. */
    data class Revoked(val reason: String) : AuthorizationState()
}
