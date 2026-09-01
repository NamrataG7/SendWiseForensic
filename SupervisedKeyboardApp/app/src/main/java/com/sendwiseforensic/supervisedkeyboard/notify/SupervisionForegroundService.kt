package com.sendwiseforensic.supervisedkeyboard.notify

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.sendwiseforensic.supervisedkeyboard.R
import com.sendwiseforensic.supervisedkeyboard.authorization.AuthorizationState
import com.sendwiseforensic.supervisedkeyboard.authorization.CollectionGate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.cancel
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import java.time.Duration
import java.time.Instant

/**
 * Foreground service that renders the persistent "Judicial Supervision
 * Active" notification while [CollectionGate] is in [AuthorizationState.Active].
 *
 * Rationale: docs/LEGAL_FRAMEWORK_IN.md §9 open question 4 flags whether
 * an on-device persistent monitoring indicator is required; the prototype
 * chooses to show one on the theory that the more transparent choice is
 * the safer default until the law settles. The indicator is:
 *   - ongoing (non-dismissible)
 *   - low priority (silent, no vibration)
 *   - tappable, opens [SupervisionInfoActivity] with an explanation.
 *
 * Lifecycle:
 *   - Started when CollectionGate observes Active.
 *   - Stopped on any non-Active transition (Suspended / Expired / Revoked /
 *     Inactive) or when the process ends.
 *
 * TODO(WIRE-TO-FORENSIC-CONSOLE) once the client is real, also surface
 * server-provided reason strings (revocation reason, suspension reason)
 * on the info activity.
 */
class SupervisionForegroundService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var tickerJob: Job? = null
    private var lastExpiresAt: Instant? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel()
        val state = CollectionGate.currentState()
        if (state !is AuthorizationState.Active) {
            Log.i(TAG, "started but state is not Active; stopping")
            stopSelf()
            return START_NOT_STICKY
        }
        lastExpiresAt = state.expiresAt
        startForegroundCompat(buildNotification(state.expiresAt))
        startTicker()
        return START_STICKY
    }

    private fun startTicker() {
        tickerJob?.cancel()
        tickerJob = serviceScope.launch {
            while (true) {
                delay(60_000L)
                val expiresAt = lastExpiresAt ?: break
                val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                nm.notify(NOTIFICATION_ID, buildNotification(expiresAt))
            }
        }
    }

    private fun startForegroundCompat(notification: Notification) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(
                NOTIFICATION_ID,
                notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC,
            )
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    private fun buildNotification(expiresAt: Instant): Notification {
        val hoursLeft = hoursUntil(expiresAt).coerceAtLeast(0)
        val subtitle = if (hoursLeft <= 1) {
            "Warrant expires in under 1 hour"
        } else {
            "Warrant expires in $hoursLeft hours"
        }

        val tapIntent = Intent(this, SupervisionInfoActivity::class.java).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        }
        val pi = PendingIntent.getActivity(
            this,
            0,
            tapIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_shield_warning)
            .setContentTitle("Judicial Supervision Active")
            .setContentText(subtitle)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setContentIntent(pi)
            .setShowWhen(false)
            .build()
    }

    private fun hoursUntil(expiresAt: Instant): Long {
        val d = Duration.between(Instant.now(), expiresAt)
        return d.toHours()
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(CHANNEL_ID) != null) return
        val ch = NotificationChannel(
            CHANNEL_ID,
            "Supervision Active",
            // High importance so the OS keeps it prominent; we still avoid
            // sound / vibration explicitly on the notification builder.
            NotificationManager.IMPORTANCE_HIGH,
        ).apply {
            description = "Persistent indicator while judicial supervision is active."
            setSound(null, null)
            enableVibration(false)
            setShowBadge(false)
        }
        nm.createNotificationChannel(ch)
    }

    override fun onDestroy() {
        tickerJob?.cancel()
        serviceScope.cancel()
        super.onDestroy()
    }

    companion object {
        const val CHANNEL_ID = "supervision_active"
        private const val NOTIFICATION_ID = 42_101
        private const val TAG = "SupervisionFgService"

        /** Start the service. Safe to call redundantly. */
        fun start(context: Context) {
            val i = Intent(context, SupervisionForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(i)
            } else {
                context.startService(i)
            }
        }

        /** Stop the service. Safe to call redundantly. */
        fun stop(context: Context) {
            val i = Intent(context, SupervisionForegroundService::class.java)
            context.stopService(i)
        }
    }
}
