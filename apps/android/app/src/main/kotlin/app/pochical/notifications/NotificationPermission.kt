package app.pochical.notifications

import android.content.Context
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.core.app.NotificationManagerCompat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Whether the system lets the app show notifications, which the server's notifications ([Push]),
 * the reminders and the pages asking for it all follow: Android 13's permission, and notifications
 * not turned off in the system's settings.
 */
class NotificationPermission(private val context: Context) {
  private val mutableAllowed = MutableStateFlow(enabled())

  /** Whether the app may notify, as the system last said. */
  val allowed = mutableAllowed.asStateFlow()

  /** Reads it again: it may have changed in the system's settings, or been answered. */
  fun read() {
    mutableAllowed.value = enabled()
  }

  private fun enabled() = NotificationManagerCompat.from(context).areNotificationsEnabled()
}

/** Whether the app may notify, for the screens. */
val LocalNotificationPermission =
  staticCompositionLocalOf<NotificationPermission> { error("No notification permission above this screen") }
