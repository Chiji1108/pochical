package app.pochical.notifications

import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.platform.LocalResources
import app.pochical.R
import app.pochical.kit.ChatNotificationState
import app.pochical.kit.ChatNotificationSwitches
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.launch

// A chat's notifications turned off and on (spec/chat.md, Notifications), kept by the server: the
// device hears of each as a ChatMute change on the user's socket, as their other devices do, and
// shows what the user asked for until it does (ChatNotificationSwitches).

/** The chats' notifications as their switches show them, for the screens: the kit's, at the root. */
val LocalChatNotificationSwitches =
  staticCompositionLocalOf<ChatNotificationSwitches> { error("No chat notifications above this screen") }

/** The user's chat notifications as the switches show them, read again as they change. */
@Composable
fun rememberChatNotifications(): ChatNotificationState {
  val switches = LocalChatNotificationSwitches.current
  val state by remember(switches) { switches.state }.collectAsState(ChatNotificationState())
  return state
}

/**
 * Turning a chat's notifications off and on, and メンションはいつも通知, for a screen: shown at once,
 * the system's permission asked first as a chat is turned on if never asked, and [failed] told
 * should the server not keep it.
 */
class ChatSwitching(
  /** Turns the chat off ([muted]) or on, then says how it went: whether the server kept it. */
  val setMuted: (groupId: String, threadId: String, muted: Boolean, done: (kept: Boolean) -> Unit) -> Unit,
  /** Sets メンションはいつも通知, then says whether the server kept it. */
  val setMentionsWhenMuted: (on: Boolean, done: (kept: Boolean) -> Unit) -> Unit,
)

/** [ChatSwitching] for the screen it is in, its calls outliving a recomposition but not the screen. */
@Composable
fun rememberChatSwitching(): ChatSwitching {
  val switches = LocalChatNotificationSwitches.current
  val asking = LocalNotificationAsking.current
  val scope = rememberCoroutineScope()
  return remember(switches, asking, scope) {
    fun launch(send: suspend () -> Unit, done: (Boolean) -> Unit) {
      scope.launch {
        val kept =
          try {
            send()
            true
          } catch (e: CancellationException) {
            throw e
          } catch (_: Exception) {
            false
          }
        done(kept)
      }
    }
    ChatSwitching(
      setMuted = { groupId, threadId, muted, done ->
        // Turned on, the system's question first, if never put (spec/chat.md, Notifications).
        if (!muted && asking.notAsked) asking.ask()
        launch({ switches.setMuted(groupId, threadId, muted) }, done)
      },
      setMentionsWhenMuted = { on, done -> launch({ switches.setMentionsWhenMuted(on) }, done) },
    )
  }
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
              !kept -> R.string.block_failed
              muted -> R.string.chat_muted_said
              else -> R.string.chat_unmuted_said
            }
          )
        )
      }
    }
  }
}
