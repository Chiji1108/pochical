package app.pochical

import android.content.Intent
import android.provider.CalendarContract
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.AppLink
import app.pochical.kit.appLink
import app.pochical.notifications.ChatNotifier

/** The place a link or a notification opening the app names, waiting for the screens to open it. */
@Stable
class OpenedLinks {
  /** The last place a link opened, until the screens take it. */
  var pending by mutableStateOf<AppLink?>(null)
    private set

  /**
   * Notes the place [intent] opens the app on, if it names one: a chat's notification tapped, a
   * link, or an event Pochical put in a calendar, by the app's own link it carries; the place.
   */
  fun take(intent: Intent?): AppLink? {
    intent ?: return null
    val link =
      if (intent.action == CalendarContract.ACTION_HANDLE_CUSTOM_EVENT) {
        intent.getStringExtra(CalendarContract.EXTRA_CUSTOM_APP_URI)
      } else {
        intent.dataString
      }
    return (ChatNotifier.openedChat(intent) ?: link?.let(::appLink))?.also { pending = it }
  }

  /** The place waiting, taken once. */
  fun consume(): AppLink? = pending.also { pending = null }
}

val LocalOpenedLinks = staticCompositionLocalOf { OpenedLinks() }
