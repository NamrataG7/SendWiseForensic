package com.sendwiseforensic.supervisedkeyboard.evidence

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import android.util.Log
import java.security.KeyPairGenerator
import java.security.KeyStore
import java.security.PrivateKey
import java.security.PublicKey
import java.security.Signature

/**
 * Signs [EvidenceBatch] payloads with a per-device RSA-2048 key kept in
 * the AndroidKeyStore. StrongBox is requested first; if the device does
 * not have a StrongBox chip the code falls back to a TEE-backed key.
 *
 * TODO(HARDWARE-KEYSTORE) the fallback path is documented in
 * docs/PROTOTYPE_NOTICE.md item 5 — production must reject devices where
 * [isHardwareBacked] cannot be established.
 *
 * The key is created once and reused. If the AndroidKeyStore already
 * holds a key with [KEY_ALIAS], we load and reuse it (no rotation in the
 * prototype).
 *
 * Concurrency: [Signature] is not thread-safe. Every call to [sign]
 * allocates a fresh [Signature] instance, so parallel calls are safe.
 */
class EvidenceSigner private constructor(
    private val privateKey: PrivateKey,
    private val publicKey: PublicKey,
    /** True iff the underlying key material lives in StrongBox. */
    val isHardwareBacked: Boolean,
) {

    /** Base64(no wrap) of the X.509 SubjectPublicKeyInfo of the signing key. */
    fun publicKeyBase64(): String =
        Base64.encodeToString(publicKey.encoded, Base64.NO_WRAP)

    /**
     * Returns an RSA-2048 signature over [bytes] using SHA-256 + PKCS#1.
     */
    fun sign(bytes: ByteArray): ByteArray {
        val sig = Signature.getInstance(SIGNATURE_ALGORITHM)
        sig.initSign(privateKey)
        sig.update(bytes)
        return sig.sign()
    }

    companion object {
        private const val TAG = "EvidenceSigner"
        private const val ANDROID_KEYSTORE = "AndroidKeyStore"
        private const val KEY_ALIAS = "sendwise_forensic_evidence_v1"
        private const val SIGNATURE_ALGORITHM = "SHA256withRSA"

        /**
         * Initialise or load the signing key. Idempotent — safe to call
         * more than once per process; on the second call reuses the
         * existing key material.
         */
        @Synchronized
        fun init(): EvidenceSigner {
            val ks = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            val existing = ks.getEntry(KEY_ALIAS, null) as? KeyStore.PrivateKeyEntry
            if (existing != null) {
                val cert = existing.certificate
                Log.i(TAG, "reusing existing signing key alias=$KEY_ALIAS")
                return EvidenceSigner(
                    privateKey = existing.privateKey,
                    publicKey = cert.publicKey,
                    isHardwareBacked = detectHardwareBacked(existing.privateKey),
                )
            }

            // No existing key — generate one, preferring StrongBox.
            try {
                val gen = KeyPairGenerator.getInstance(
                    KeyProperties.KEY_ALGORITHM_RSA,
                    ANDROID_KEYSTORE,
                )
                gen.initialize(buildSpec(strongBox = true))
                val kp = gen.generateKeyPair()
                Log.i(TAG, "generated StrongBox-backed signing key alias=$KEY_ALIAS")
                return EvidenceSigner(
                    privateKey = kp.private,
                    publicKey = kp.public,
                    isHardwareBacked = true,
                )
            } catch (e: StrongBoxUnavailableException) {
                Log.w(
                    TAG,
                    "StrongBox unavailable; falling back to TEE-backed key. " +
                        "TODO(HARDWARE-KEYSTORE) production must gate on StrongBox " +
                        "availability or an equivalent hardware attestation.",
                )
            } catch (e: Exception) {
                Log.w(
                    TAG,
                    "StrongBox key generation failed (${e.javaClass.simpleName}: ${e.message}); " +
                        "falling back to TEE-backed key. TODO(HARDWARE-KEYSTORE)",
                )
            }

            val gen = KeyPairGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_RSA,
                ANDROID_KEYSTORE,
            )
            gen.initialize(buildSpec(strongBox = false))
            val kp = gen.generateKeyPair()
            Log.i(TAG, "generated TEE-backed signing key alias=$KEY_ALIAS")
            return EvidenceSigner(
                privateKey = kp.private,
                publicKey = kp.public,
                isHardwareBacked = false,
            )
        }

        private fun buildSpec(strongBox: Boolean): KeyGenParameterSpec {
            val b = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN or KeyProperties.PURPOSE_VERIFY,
            )
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setSignaturePaddings(KeyProperties.SIGNATURE_PADDING_RSA_PKCS1)
                .setKeySize(2048)
                .setUserAuthenticationRequired(false)
            if (strongBox && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.P) {
                b.setIsStrongBoxBacked(true)
            }
            return b.build()
        }

        private fun detectHardwareBacked(key: PrivateKey): Boolean {
            return try {
                val factory = java.security.KeyFactory.getInstance(
                    key.algorithm,
                    ANDROID_KEYSTORE,
                )
                @Suppress("UNCHECKED_CAST")
                val infoClass = Class.forName("android.security.keystore.KeyInfo")
                    as Class<java.security.spec.KeySpec>
                val info = factory.getKeySpec(key, infoClass)
                val m = info.javaClass.getMethod("isInsideSecureHardware")
                m.invoke(info) as Boolean
            } catch (t: Throwable) {
                Log.w(TAG, "could not probe key hardware backing: ${t.message}")
                false
            }
        }
    }
}
