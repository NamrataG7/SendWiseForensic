package com.sendwiseforensic.supervisedkeyboard.notify

import android.app.Activity
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.widget.LinearLayout
import android.widget.TextView

/**
 * Placeholder info screen shown when the subject taps the persistent
 * "Judicial Supervision Active" notification.
 *
 * Prototype: a single explanatory TextView. Real implementation must show
 * warrant id, issuing authority, scope summary, expiry, and a link to the
 * subject / counsel portal (docs/PROTOTYPE_NOTICE.md TODO(COUNSEL-PORTAL)).
 */
class SupervisionInfoActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(48, 96, 48, 48)
            setBackgroundColor(Color.WHITE)
            gravity = Gravity.TOP or Gravity.START
        }

        val text = TextView(this).apply {
            text = buildString {
                append("This device is currently under judicial supervision.\n\n")
                append(
                    "A court-issued warrant authorizes limited on-device collection " +
                        "of activity from this keyboard, within a defined scope and " +
                        "for a limited time period.\n\n"
                )
                append(
                    "This notification is shown continuously while supervision is " +
                        "active. When the warrant expires or is revoked, collection " +
                        "stops automatically and this notification disappears.\n\n"
                )
                append(
                    "For details of the scope, duration, or to contact your legal " +
                        "counsel, please consult the supervision order document you " +
                        "were served, or your appointed counsel.\n\n"
                )
                append("Prototype build — see PROTOTYPE_NOTICE.md.")
            }
            textSize = 15f
            setTextColor(Color.parseColor("#1B1F3B"))
        }
        root.addView(text)
        setContentView(root)
        title = "Judicial Supervision"
    }
}
