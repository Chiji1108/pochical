package app.pochical

import android.content.Intent
import app.pochical.kit.PochicalKit

/** A release build takes nothing from the intent that launched it: only a debug build has options. */
@Suppress("UNUSED_PARAMETER", "RedundantSuspendModifier")
suspend fun takeLaunchOptions(intent: Intent, kit: PochicalKit) = Unit
