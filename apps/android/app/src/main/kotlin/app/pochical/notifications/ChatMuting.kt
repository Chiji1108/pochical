package app.pochical.notifications

import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalResources
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.R
import app.pochical.kit.ChatNotificationState
import app.pochical.kit.ChatNotificationSwitches

// A chat's notifications turned off and on (spec/chat.md, Notifications), kept by the server: the
// device hears of each as a ChatMute change on the user's socket, as their other devices do, and
// shows what the user asked for until it does (ChatNotificationSwitches), which sends it whatever
// becomes of the screen that asked.

/** The chats' notifications as their switches show them, for the screens: the kit's, at the root. */
val LocalChatNotificationSwitches =
  staticCompositionLocalOf<ChatNotificationSwitches> { error("No chat notifications above this screen") }

/** The user's chat notifications as the switches show them, read again as they change; null until read. */
@Composable
fun rememberChatNotifications(): ChatNotificationState? {
  val switches = LocalChatNotificationSwitches.current
  val state by remember(switches) { switches.state }.collectAsStateWithLifecycle(null)
  return state
}

/**
 * Turns a chat's notifications off or on, and メンションはいつも通知, as a screen asks: turned on, the
 * system's permission asked first if never asked; [done] said whether the server kept it.
 */
class ChatSwitching(private val switches: ChatNotificationSwitches, private val asking: NotificationAsking) {
  fun setMuted(groupId: String, threadId: String, muted: Boolean, done: (kept: Boolean) -> Unit) {
    // Turned on, the system's question first, if never put (spec/chat.md, Notifications).
    if (!muted) asking.askOnce()
    switches.setMuted(groupId, threadId, muted, done)
  }

  fun setMentionsWhenMuted(on: Boolean, done: (kept: Boolean) -> Unit) = switches.setMentionsWhenMuted(on, done)
}

/** [ChatSwitching] for the screen it is in. */
@Composable
fun rememberChatSwitching(): ChatSwitching {
  val switches = LocalChatNotificationSwitches.current
  val asking = LocalNotificationAsking.current
  return remember(switches, asking) { ChatSwitching(switches, asking) }
}

/** Turns the chat's notifications off or on from its ⋯, and [say]s how it went. */
@Composable
fun rememberChatMuting(groupId: String, threadId: String, say: (String) -> Unit): (muted: Boolean) -> Unit {
  val switching = rememberChatSwitching()
  val resources = LocalResources.current
  val saying by rememberUpdatedState(say)
  return remember(switching, resources, groupId, threadId) {
    { muted ->
      switching.setMuted(groupId, threadId, muted) { kept ->
        saying(
          resources.getString(
            when {
              !kept -> R.string.notifications_change_failed
              muted -> R.string.chat_muted_said
              else -> R.string.chat_unmuted_said
            }
          )
        )
      }
    }
  }
}
