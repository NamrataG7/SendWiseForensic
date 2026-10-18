package com.sendwiseforensic.supervisedkeyboard.ui

import android.os.Bundle
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import com.google.android.material.snackbar.Snackbar
import com.sendwiseforensic.supervisedkeyboard.R
import com.sendwiseforensic.supervisedkeyboard.network.DeviceEnrollRequest
import com.sendwiseforensic.supervisedkeyboard.network.RetrofitClient
import com.sendwiseforensic.supervisedkeyboard.utils.PreferencesManager
import com.sendwiseforensic.supervisedkeyboard.utils.UserIdGenerator
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import java.io.IOException

/**
 * EnrollmentActivity
 *
 * Replaces the old parental-pairing flow (PairingActivity). Where that
 * flow had the device GENERATE a short-lived code for a parent to enter,
 * this screen is a pure CONSUMER: an authorized officer issues a single-use,
 * 30-minute-TTL enrollment code (format XXXX-XXXX) bound to a specific
 * ACTIVE authorization, and the device redeems it here.
 *
 * States (mutually exclusive containers in activity_enrollment.xml):
 *   1. ENTRY    - not yet enrolled: show code entry + submit.
 *   2. ENROLLED - device already enrolled: show confirmation (truncated
 *                 device ID only — the raw ingest token is a real security
 *                 secret and is NEVER re-displayed after initial receipt).
 *
 * Network:
 *   POST /api/devices/enroll
 *     { code, deviceFingerprint, platform: "ANDROID" }
 *     -> { ok: true, data: { deviceId, ingestToken } }
 *   Failures surface inline (tv_status) + a retry-enabled Snackbar, mirroring
 *   PairingActivity's error-display convention.
 *
 * Privacy:
 *   device_fingerprint = UserIdGenerator.getAnonymousUserId() verbatim — the
 *   same anonymous per-install SHA-256 hash used previously, reused as-is
 *   per the accepted Phase 1 design (no PII).
 */
class EnrollmentActivity : AppCompatActivity() {

    private lateinit var prefs: PreferencesManager

    private var stateEntry: View? = null
    private var stateEnrolled: View? = null
    private var progressContainer: View? = null
    private var editCode: EditText? = null
    private var btnEnroll: Button? = null
    private var tvStatus: TextView? = null
    private var tvEnrolledBody: TextView? = null
    private var rootView: View? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_enrollment)

        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.title = getString(R.string.enrollment_title)

        prefs = PreferencesManager(this)

        rootView = findViewById(android.R.id.content)
        stateEntry = findViewById(R.id.state_entry)
        stateEnrolled = findViewById(R.id.state_enrolled)
        progressContainer = findViewById(R.id.progress_container)
        editCode = findViewById(R.id.edit_code)
        btnEnroll = findViewById(R.id.btn_enroll)
        tvStatus = findViewById(R.id.tv_status)
        tvEnrolledBody = findViewById(R.id.tv_enrolled_body)

        btnEnroll?.setOnClickListener { submitEnrollmentCode() }

        renderInitialState()
    }

    override fun onSupportNavigateUp(): Boolean {
        finish()
        return true
    }

    // ---------------------------------------------------------------------
    // State rendering
    // ---------------------------------------------------------------------

    private fun renderInitialState() {
        if (prefs.isEnrolled()) {
            showEnrolledState()
        } else {
            showEntryState()
        }
    }

    private fun showEntryState() {
        stateEntry?.visibility = View.VISIBLE
        stateEnrolled?.visibility = View.GONE
        progressContainer?.visibility = View.GONE
        btnEnroll?.isEnabled = true
    }

    private fun showEnrolledState() {
        stateEntry?.visibility = View.GONE
        stateEnrolled?.visibility = View.VISIBLE
        progressContainer?.visibility = View.GONE

        // Never display the raw ingest token after initial receipt — only a
        // truncated device ID, for user confirmation purposes.
        val deviceId = prefs.getDeviceId()
        val truncated = if (deviceId != null) {
            UserIdGenerator.getShortenedUserId(deviceId)
        } else {
            getString(R.string.enrollment_error_generic)
        }
        tvEnrolledBody?.text = getString(R.string.enrollment_success_body, truncated)
    }

    // ---------------------------------------------------------------------
    // Network
    // ---------------------------------------------------------------------

    private fun submitEnrollmentCode() {
        val rawCode = editCode?.text?.toString()?.trim().orEmpty()
        if (rawCode.isEmpty()) {
            showInlineError(getString(R.string.enrollment_error_empty_code))
            return
        }

        hideInlineError()
        btnEnroll?.isEnabled = false
        progressContainer?.visibility = View.VISIBLE

        val deviceFingerprint = UserIdGenerator.getAnonymousUserId(applicationContext)

        lifecycleScope.launch {
            val outcome: EnrollmentOutcome = try {
                val response = withContext(Dispatchers.IO) {
                    RetrofitClient.enrollmentApiService.enrollDevice(
                        DeviceEnrollRequest(
                            code = rawCode,
                            deviceFingerprint = deviceFingerprint,
                            platform = "ANDROID",
                            hardwareBackedPubKey = null
                        )
                    )
                }
                val body = response.body()
                val deviceId = body?.data?.deviceId
                val ingestToken = body?.data?.ingestToken
                if (response.isSuccessful && body?.ok == true &&
                    !deviceId.isNullOrBlank() && !ingestToken.isNullOrBlank()
                ) {
                    EnrollmentOutcome.Success(deviceId, ingestToken)
                } else {
                    android.util.Log.w(
                        "EnrollmentActivity",
                        "Enrollment failed: http=${response.code()} ok=${body?.ok} " +
                            "error=${body?.error}"
                    )
                    EnrollmentOutcome.Failure(
                        body?.error?.takeIf { it.isNotBlank() }
                            ?: getString(R.string.enrollment_error_generic)
                    )
                }
            } catch (io: IOException) {
                android.util.Log.w("EnrollmentActivity", "Enrollment network error", io)
                EnrollmentOutcome.Failure(getString(R.string.enrollment_error_network))
            } catch (t: Throwable) {
                android.util.Log.w("EnrollmentActivity", "Enrollment unexpected error", t)
                EnrollmentOutcome.Failure(getString(R.string.enrollment_error_generic))
            }

            // UI restore
            progressContainer?.visibility = View.GONE
            btnEnroll?.isEnabled = true

            when (outcome) {
                is EnrollmentOutcome.Success -> {
                    prefs.setDeviceId(outcome.deviceId)
                    prefs.setIngestToken(outcome.ingestToken)
                    prefs.setEnrolled(true)
                    showEnrolledState()
                }
                is EnrollmentOutcome.Failure -> showInlineError(outcome.message)
            }
        }
    }

    private fun showInlineError(message: String) {
        tvStatus?.text = message
        tvStatus?.visibility = View.VISIBLE
        val root = rootView ?: return
        Snackbar.make(root, message, Snackbar.LENGTH_INDEFINITE)
            .setAction(R.string.enrollment_retry) { submitEnrollmentCode() }
            .show()
    }

    private fun hideInlineError() {
        tvStatus?.visibility = View.GONE
    }

    private sealed class EnrollmentOutcome {
        data class Success(val deviceId: String, val ingestToken: String) : EnrollmentOutcome()
        data class Failure(val message: String) : EnrollmentOutcome()
    }
}
