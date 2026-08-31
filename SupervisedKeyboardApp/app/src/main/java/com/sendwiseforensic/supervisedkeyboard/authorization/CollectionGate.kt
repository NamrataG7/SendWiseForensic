package com.sendwiseforensic.supervisedkeyboard.authorization

import android.util.Log
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.time.Clock

/**
 * The ONLY sanctioned persistence/upload gate in this app.
 *
 * Every code path that would write authorization-relevant data to disk or
 * send it over the network MUST call [canCollect] first, with the correct
 * [DataCategory] and, where meaningful, the current foreground app package.
 * Any bypass is a bug — no exceptions, no "just this once", no debug
 * shortcuts.
 *
 * Invariants (see docs/ENTITY_MODEL.md §3, rules 1 and 3):
 *   - Collection is denied unless the current state is [AuthorizationState.Active].
 *   - The category must be a member of `scope.dataCategories`.
 *   - The foreground package (if provided) must be in `scope.contextApps`
 *     when that set is non-empty. An empty set means "any app".
 *   - The wall clock must fall inside at least one `scope.timeWindows`
 *     entry. An empty list means "any time".
 *   - No collection is ever allowed under Inactive / Suspended / Expired /
 *     Revoked.
 *
 * Threading: internal state is a [MutableStateFlow]; reads and writes are
 * atomic. [canCollect] is a pure read of the current state snapshot.
 *
 * Design note: this object is a singleton so IME code, the foreground
 * service, and any future WorkManager workers all share one authoritative
 * gate. It must be initialised exactly once per process via [bind].
 */
object CollectionGate {

    private const val TAG = "CollectionGate"

    private val _state: MutableStateFlow<AuthorizationState> =
        MutableStateFlow(AuthorizationState.Inactive)

    /** For observers (foreground service, IME UI) that need to react. */
    val state: StateFlow<AuthorizationState> = _state.asStateFlow()

    @Volatile
    private var bound: Boolean = false

    /** Clock used for time-window checks. Overridable for tests. */
    @Volatile
    var clock: Clock = Clock.systemUTC()
        internal set

    /**
     * Subscribe this gate to a client. Safe to call more than once; later
     * calls replace the subscription. [appScope] should be an
     * application-lifetime scope (not tied to any Activity or Service).
     */
    fun bind(client: AuthorizationClient, appScope: CoroutineScope) {
        bound = true
        appScope.launch {
            client.observeState().collect { newState ->
                _state.value = newState
            }
        }
    }

    /** Current state snapshot. Non-blocking. */
    fun currentState(): AuthorizationState = _state.value

    /**
     * The sole gate check. Returns true iff collection of [category] is
     * currently authorized under the active warrant scope.
     *
     * @param contextAppPackage foreground app package name, or null if the
     *   caller is not app-scoped (e.g. a global heartbeat). If null and
     *   scope.contextApps is non-empty, this returns false — a scoped
     *   warrant is not satisfied by a call site that cannot prove its
     *   context.
     */
    fun canCollect(category: DataCategory, contextAppPackage: String?): Boolean {
        val s = _state.value
        if (s !is AuthorizationState.Active) return false

        // Expiry safety net: if the wall clock has already passed
        // expiresAt but we have not yet received a state transition, deny.
        if (!clock.instant().isBefore(s.expiresAt)) return false

        val scope = s.scope
        if (category !in scope.dataCategories) return false

        if (scope.contextApps.isNotEmpty()) {
            if (contextAppPackage.isNullOrEmpty()) return false
            if (contextAppPackage !in scope.contextApps) return false
        }

        if (scope.timeWindows.isNotEmpty()) {
            val inAWindow = scope.timeWindows.any { it.containsNow(clock) }
            if (!inAWindow) return false
        }

        return true
    }

    /**
     * For callers that have already checked [canCollect] and want to
     * proceed with an Active-typed handle. Throws if the gate is not
     * currently Active. Never use this without a prior [canCollect].
     */
    fun requireActiveOrThrow(): AuthorizationState.Active {
        val s = _state.value
        check(s is AuthorizationState.Active) {
            "CollectionGate.requireActiveOrThrow called but state=$s"
        }
        return s
    }

    /** Test / debug hook — replaces state directly. Do not use in prod code paths. */
    internal fun setStateForTestOrDebug(state: AuthorizationState) {
        if (!bound) Log.w(TAG, "setStateForTestOrDebug called before bind()")
        _state.value = state
    }
}
