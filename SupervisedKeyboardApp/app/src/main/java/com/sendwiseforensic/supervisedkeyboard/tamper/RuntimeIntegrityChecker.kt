package com.sendwiseforensic.supervisedkeyboard.tamper

import android.os.Build
import java.io.File

/**
 * Cheap on-device integrity probes. NOT a substitute for Play Integrity
 * (docs/PROTOTYPE_NOTICE.md item 4, TODO(PLAY-INTEGRITY)) — these are
 * additional signals attached to every evidence upload so the server can
 * downgrade or reject batches from suspicious environments.
 */
object RuntimeIntegrityChecker {

    data class Verdict(
        val isEmulator: Boolean,
        val isRootedProbable: Boolean,
        val notes: List<String>,
    )

    fun check(): Verdict {
        val notes = mutableListOf<String>()

        val fingerprint = safeGet { Build.FINGERPRINT }.lowercase()
        val hardware = safeGet { Build.HARDWARE }.lowercase()
        val model = safeGet { Build.MODEL }.lowercase()
        val product = safeGet { Build.PRODUCT }.lowercase()
        val manufacturer = safeGet { Build.MANUFACTURER }.lowercase()

        val emulatorSignals = listOf(
            fingerprint.contains("generic"),
            fingerprint.contains("unknown"),
            hardware.contains("goldfish"),
            hardware.contains("ranchu"),
            product.contains("sdk"),
            model.contains("emulator"),
            model.contains("android sdk built for"),
            manufacturer.contains("genymotion"),
        )
        val isEmulator = emulatorSignals.any { it }
        if (isEmulator) {
            notes += "emulator markers: fp=$fingerprint hw=$hardware model=$model"
        }

        val rootPaths = listOf(
            "/system/xbin/su",
            "/system/bin/su",
            "/sbin/su",
            "/su/bin/su",
            "/system/app/Superuser.apk",
            "/system/xbin/busybox",
        )
        val suPresent = rootPaths.any { safeExists(it) }
        if (suPresent) notes += "su/busybox binary present"

        // Common root-management packages (compile-time signal only; we
        // do not query PackageManager here to avoid QUERY_ALL_PACKAGES).
        // Referenced so the list survives dead-code elimination and can
        // be used by a future integrity check.
        // TODO(PLAY-INTEGRITY) replace with Play Integrity verdict.
        val knownRootPkgs = listOf(
            "com.topjohnwu.magisk",
            "eu.chainfire.supersu",
            "com.koushikdutta.superuser",
            "com.thirdparty.superuser",
        )
        if (knownRootPkgs.isEmpty()) notes += "no root packages tracked"

        val isRootedProbable = suPresent

        return Verdict(
            isEmulator = isEmulator,
            isRootedProbable = isRootedProbable,
            notes = notes.toList(),
        )
    }

    private inline fun safeGet(f: () -> String?): String =
        try { f().orEmpty() } catch (_: Throwable) { "" }

    private fun safeExists(path: String): Boolean =
        try { File(path).exists() } catch (_: Throwable) { false }
}
