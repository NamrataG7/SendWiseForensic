package com.sendwiseforensic.supervisedkeyboard.authorization

import java.time.Clock
import java.time.DayOfWeek
import java.time.ZoneOffset
import java.time.ZonedDateTime

/**
 * A single allowed time-of-day window, UTC.
 *
 * @property startHourUtc inclusive, 0..23
 * @property endHourUtc   exclusive-ish: if endHourUtc <= startHourUtc the
 *                        window is treated as wrapping past midnight
 *                        (e.g. 22..6 covers 22:00..05:59 UTC).
 * @property daysOfWeekBitmask bit 0 = Monday .. bit 6 = Sunday
 *                             (matches java.time.DayOfWeek.value - 1).
 *                             0 or negative means "every day".
 *
 * TODO(WIRE-TO-FORENSIC-CONSOLE) the server-side scope schema currently
 * uses simple startHour/endHour ints (packages/legal-framework schemas.ts).
 * When we start wiring real scopes over the network, extend the TS side to
 * carry daysOfWeek as well and re-verify serializer parity.
 */
data class TimeWindow(
    val startHourUtc: Int,
    val endHourUtc: Int,
    val daysOfWeekBitmask: Int = 0,
) {
    /**
     * Returns true if [clock]'s current instant falls inside this window.
     * All comparisons are in UTC. Empty-list semantics (allow-all) are
     * enforced by the caller (CollectionGate), not here.
     */
    fun containsNow(clock: Clock = Clock.systemUTC()): Boolean {
        val now: ZonedDateTime = ZonedDateTime.ofInstant(clock.instant(), ZoneOffset.UTC)
        val hour = now.hour
        val hourOk = if (endHourUtc > startHourUtc) {
            hour in startHourUtc until endHourUtc
        } else if (endHourUtc == startHourUtc) {
            // degenerate — treat as "never" to be conservative.
            false
        } else {
            // wraps midnight: [start, 24) or [0, end)
            hour >= startHourUtc || hour < endHourUtc
        }
        if (!hourOk) return false

        if (daysOfWeekBitmask <= 0) return true
        val dow: DayOfWeek = now.dayOfWeek
        val bit = 1 shl (dow.value - 1) // Monday=bit0
        return (daysOfWeekBitmask and bit) != 0
    }
}
