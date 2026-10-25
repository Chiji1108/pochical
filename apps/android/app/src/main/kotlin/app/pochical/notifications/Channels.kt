package app.pochical.notifications

import android.content.Context
import androidx.core.app.NotificationChannelCompat
import androidx.core.app.NotificationManagerCompat
import app.pochical.R

/**
 * The notification channels, what iOS's notification categories are on Android, each of which the
 * person can turn off or quiet in the system's settings: the chats' lines, and the answers from
 * Pochical's people.
 */
object Channels {
  const val CHAT = "chat"
  const val SUPPORT = "support"

  /** Makes the channels, or names them again in the app's words; as the app starts. */
  fun create(context: Context) {
    NotificationManagerCompat.from(context)
      .createNotificationChannelsCompat(
        listOf(
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
