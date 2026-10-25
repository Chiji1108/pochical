package app.pochical.notifications

import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.platform.LocalResources
import app.pochical.R
import app.pochical.groups.LocalGroupCalls
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

// A chat's notifications turned off and on (spec/chat.md, Notifications), kept by the server: the
// device hears of each as a ChatMute change on the user's socket, as their other devices do.

/**
 * Turns the chat's notifications off or on from its ⋯, and [say]s how it went. Turned on, it asks
 * for the system's permission first, if never asked.
 */
@Composable
fun rememberChatMuting(groupId: String, threadId: String, say: (String) -> Unit): (muted: Boolean) -> Unit {
  val calls = LocalGroupCalls.current
  val asking = LocalNotificationAsking.current
  val resources = LocalResources.current
  val scope = rememberCoroutineScope()
  val saying by rememberUpdatedState(say)
  return remember(calls, asking, resources, scope, groupId, threadId) {
    { muted ->
      if (!muted && asking.notAsked) asking.ask()
      scope.launch {
        val said =
          try {
            calls.setChatMuted(groupId, threadId, muted)
            resources.getString(if (muted) R.string.chat_muted_said else R.string.chat_unmuted_said)
          } catch (e: CancellationException) {
            throw e
          } catch (_: Exception) {
            resources.getString(R.string.block_failed)
          }
        saying(said)
      }
    }
  }
}

/**
 * Switches the server keeps, as 設定 › 通知 › チャット turns them, as iOS's ServerToggle: each shows as
 * turned at once, until the device hears otherwise than it had (the server's word coming back on
 * the user's socket, or another device's), and goes back should the server not keep it.
 */
@Stable
class ServerSwitches internal constructor(private val scope: CoroutineScope, private val failed: () -> Unit) {
  /** A switch as turned, and what the device had heard as it was. */
  private data class Turned(val on: Boolean, val heard: Boolean)

  private val turned = mutableStateMapOf<Any, Turned>()

  /** Whether [key]'s switch shows on, the device having heard [heard]. */
  fun on(key: Any, heard: Boolean): Boolean = turned[key]?.takeIf { it.heard == heard }?.on ?: heard

  /** Turns [key]'s switch [on] from [heard], [send]ing it to the server. */
  fun turn(key: Any, on: Boolean, heard: Boolean, send: suspend () -> Unit) {
    turned[key] = Turned(on, heard)
    scope.launch {
      try {
        send()
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        turned.remove(key)
        failed()
      }
    }
  }
}

/** [ServerSwitches] for a page, [failed] told of a switch the server did not keep. */
@Composable
fun rememberServerSwitches(failed: () -> Unit): ServerSwitches {
  val scope = rememberCoroutineScope()
  val failing by rememberUpdatedState(failed)
  return remember(scope) { ServerSwitches(scope) { failing() } }
}
