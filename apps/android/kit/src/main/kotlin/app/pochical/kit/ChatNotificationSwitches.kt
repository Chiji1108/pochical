package app.pochical.kit

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.mapNotNull
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

/**
 * The user's chat notifications as the switches show them (spec/chat.md, Notifications): what
 * their User DO sent, with each change the user asked for laid over it until the device hears that
 * switch change, the server's answer or any other device's after it. The server keeps them
 * (`SetChatMuted`, `SetChatNotifications`) and sends each change on the user's socket, so the
 * device's own record is only what came there. This outlives the screens that turn them, so a
 * change shows wherever the chat does until it is heard, and one another device makes after it
 * shows as it comes.
 */
class ChatNotificationSwitches(
  heard: Flow<ChatNotificationState>,
  private val sendMuted: suspend (groupId: String, threadId: String, muted: Boolean) -> Unit,
  private val sendMentionsWhenMuted: suspend (on: Boolean) -> Unit,
  scope: CoroutineScope,
) {
  /** The changes asked for and not heard yet. */
  private data class Asked(val muted: Map<ChatKey, Boolean> = emptyMap(), val mentionsWhenMuted: Boolean? = null) {
    /** What is left asked once the device heard [now] after [was]: a switch heard to change is the server's again. */
    fun heard(was: ChatNotificationState, now: ChatNotificationState): Asked {
      val changed = (was.muted - now.muted) + (now.muted - was.muted)
      return Asked(muted - changed, mentionsWhenMuted.takeIf { was.mentionsWhenMuted == now.mentionsWhenMuted })
    }

    /** [heard] with what is asked over it. */
    fun over(heard: ChatNotificationState) =
      ChatNotificationState(
        muted = heard.muted - muted.filterValues { !it }.keys + muted.filterValues { it }.keys,
        mentionsWhenMuted = mentionsWhenMuted ?: heard.mentionsWhenMuted,
      )
  }

  /** What was heard last, and what is asked over it, changed together. */
  private data class Switches(val heard: ChatNotificationState? = null, val asked: Asked = Asked())

  private val switches = MutableStateFlow(Switches())

  init {
    scope.launch {
      heard.collect { now ->
        switches.update { switches -> Switches(now, switches.heard?.let { switches.asked.heard(it, now) } ?: switches.asked) }
      }
    }
  }

  /** The chat notifications as the switches show them, once the device has read what it heard. */
  val state: Flow<ChatNotificationState> = switches.mapNotNull { it.heard?.let(it.asked::over) }.distinctUntilChanged()

  /** Turns the chat off ([muted]) or on again: shown at once, and as heard again should the server not take it. */
  suspend fun setMuted(groupId: String, threadId: String, muted: Boolean) {
    val key = ChatKey(groupId, threadId)
    ask { it.copy(muted = it.muted + (key to muted)) }
    try {
      sendMuted(groupId, threadId, muted)
    } catch (e: Throwable) {
      ask { if (it.muted[key] == muted) it.copy(muted = it.muted - key) else it }
      throw e
    }
  }

  /** Sets メンションはいつも通知: shown at once, and as heard again should the server not take it. */
  suspend fun setMentionsWhenMuted(on: Boolean) {
    ask { it.copy(mentionsWhenMuted = on) }
    try {
      sendMentionsWhenMuted(on)
    } catch (e: Throwable) {
      ask { if (it.mentionsWhenMuted == on) it.copy(mentionsWhenMuted = null) else it }
      throw e
    }
  }

  private fun ask(change: (Asked) -> Asked) = switches.update { it.copy(asked = change(it.asked)) }
}
