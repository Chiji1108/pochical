package app.pochical.notifications

import android.Manifest
import android.app.Notification
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import app.pochical.R

/**
 * The notification channels, what iOS's notification categories are on Android, each of which the
 * person can turn off or quiet in the system's settings: the reminders of the person's shifts, the
 * chats' lines, and the answers from Pochical's people.
 */
object Channels {
  const val REMINDER = "reminder"
  const val CHAT = "chat"
  const val SUPPORT = "support"

  /** Makes the channels, or names them again in the app's words; as the app starts. */
  fun create(context: Context) {
    NotificationManagerCompat.from(context)
      .createNotificationChannelsCompat(
        listOf(
          channel(context, REMINDER, R.string.channel_reminder, R.string.channel_reminder_about),
          channel(context, CHAT, R.string.channel_chat, R.string.channel_chat_about),
          channel(context, SUPPORT, R.string.channel_support, R.string.channel_support_about),
        )
      )
  }

  private fun channel(context: Context, id: String, name: Int, about: Int) =
    NotificationChannelCompat.Builder(id, NotificationManagerCompat.IMPORTANCE_HIGH)
      .setName(context.getString(name))
      .setDescription(context.getString(about))
      .build()
}

/**
 * Shows [notification] as [tag]'s [id], while the system lets the app notify: Android 13's
 * permission granted, and notifications not turned off in the system's settings. Whether it did.
 */
fun NotificationManagerCompat.postIfAllowed(context: Context, tag: String, id: Int, notification: Notification): Boolean {
  if (
    !areNotificationsEnabled() ||
      (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
        ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
  ) {
    return false
  }
  notify(tag, id, notification)
  return true
}
