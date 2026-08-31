package com.sendwiseforensic.supervisedkeyboard.authorization

/**
 * Categories of data a warrant scope may authorize collection of.
 *
 * Mirrors the TypeScript `DataCategory` enum used at the Evidence wire
 * level (see packages/legal-framework/src/schemas.ts EvidenceSchema.category).
 *
 * Wire-level categories used across the entity model
 * (docs/ENTITY_MODEL.md Evidence.category):
 *   - KEYSTROKE_BATCH  : a batch of keystrokes captured in-scope
 *   - APP_EVENT        : focus/foreground app change events
 *   - COMMS_METADATA   : recipient handles, timing, no content
 *   - RISK_DETECTION   : classifier output only (no underlying text)
 *
 * NOTE: any change here must be mirrored on the TypeScript side and in the
 * Supabase DB CHECK constraints — the entity model treats
 * MonitoringSession.collectedCategories as a strict subset of
 * Authorization.scope.dataCategories (ENTITY_MODEL.md §3, invariant 3).
 */
enum class DataCategory {
    KEYSTROKE_BATCH,
    APP_EVENT,
    COMMS_METADATA,
    RISK_DETECTION,
}

/**
 * Authorization.scope, per docs/ENTITY_MODEL.md §1.
 *
 * Semantics of empty collections:
 *   - contextApps  empty -> any foreground app is allowed
 *   - timeWindows  empty -> allowed at all times of day
 *   - keywords     empty -> no keyword narrowing (all captures in-scope)
 *   - authorizedDeviceIds empty -> caller should still cross-check on the
 *     server side; on-device we do not restrict since the app runs on
 *     exactly one device.
 *
 * dataCategories is authoritative — an empty set means the gate denies
 * every category.
 */
data class AuthorizationScope(
    val dataCategories: Set<DataCategory>,
    val authorizedDeviceIds: Set<String>,
    val timeWindows: List<TimeWindow>,
    val keywords: List<String>,
    val contextApps: Set<String>,
) {
    companion object {
        val EMPTY: AuthorizationScope = AuthorizationScope(
            dataCategories = emptySet(),
            authorizedDeviceIds = emptySet(),
            timeWindows = emptyList(),
            keywords = emptyList(),
            contextApps = emptySet(),
        )
    }
}
