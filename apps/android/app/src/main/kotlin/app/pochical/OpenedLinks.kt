package app.pochical

import android.content.Intent
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.openedInviteCode
import app.pochical.notifications.ChatNotifier

/** Where something opening the app asks it to go. */
sealed interface Opened {
  /**
   * An invitation's join screen: the site's アプリで開く (pochical://invite/{code}) or
   * https://pochical.app/invite/{code}, which the app holds as an App Link (spec/sync-protocol.md,
   * Groups).
   */
  data class Invite(val code: String) : Opened

  /** A chat, from its notification's tap (spec/chat.md, Notifications). */
  data class Chat(val groupId: String, val threadId: String) : Opened
}

/** Where the intent opening the app asks it to go; null for an intent that asks nowhere. */
fun openedOf(intent: Intent?): Opened? {
  if (intent?.action == ChatNotifier.ACTION_OPEN_CHAT) {
    val groupId = intent.getStringExtra(ChatNotifier.EXTRA_GROUP_ID) ?: return null
    return Opened.Chat(groupId, intent.getStringExtra(ChatNotifier.EXTRA_THREAD_ID).orEmpty())
  }
  return intent?.dataString?.let(::openedInviteCode)?.let(Opened::Invite)
}

/** Where the last intent opening the app asked to go, waiting for the screens to go there. */
@Stable
class OpenedLinks {
  /** Where to go, until the screens take it. */
  var pending by mutableStateOf<Opened?>(null)
    private set

  /** Notes where [intent] asks the app to go, if anywhere. */
  fun take(intent: Intent?) {
    openedOf(intent)?.let { pending = it }
  }

  /** Where to go, taken once. */
  fun consume(): Opened? = pending.also { pending = null }
}

val LocalOpenedLinks = staticCompositionLocalOf { OpenedLinks() }
