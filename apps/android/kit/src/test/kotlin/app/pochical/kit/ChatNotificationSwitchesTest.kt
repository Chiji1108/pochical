package app.pochical.kit

import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class ChatNotificationSwitchesTest {
  private val chat = ChatKey("g1", GROUP_THREAD)

  /** What the device heard on the user's socket, as the test sends it. */
  private val heard = MutableStateFlow(ChatNotificationState())

  /** The server's answer to each call, as the test gives it. */
  private var answer = CompletableDeferred<Unit>()

  private fun TestScope.switches() =
    ChatNotificationSwitches(
      heard,
      sendMuted = { _, _, _ -> answer.await() },
      sendMentionsWhenMuted = { answer.await() },
      scope = backgroundScope,
    )

  private suspend fun ChatNotificationSwitches.muted() = state.first().isMuted(chat.groupId, chat.threadId)

  @Test
  fun aChangeShowsAtOnceAndAnotherDevicesAfterItShowsAsItComes() = runTest(UnconfinedTestDispatcher()) {
    val switches = switches()
    val turning = launch { switches.setMuted(chat.groupId, chat.threadId, muted = true) }
    // Asked, not yet heard: shown as turned.
    assertTrue(switches.muted())
    answer.complete(Unit)
    turning.join()
    // The server's change comes back on the socket.
    heard.value = ChatNotificationState(muted = setOf(chat))
    assertTrue(switches.muted())
    // Another device turns it on again: shown, and not the change asked before it.
    heard.value = ChatNotificationState()
    assertFalse(switches.muted())
    // And off again from there: shown as heard.
    heard.value = ChatNotificationState(muted = setOf(chat))
    assertTrue(switches.muted())
  }

  @Test
  fun aChangeTheServerDoesNotKeepGoesBack() = runTest(UnconfinedTestDispatcher()) {
    val switches = switches()
    val turning = launch { runCatching { switches.setMentionsWhenMuted(false) } }
    assertFalse(switches.state.first().mentionsWhenMuted)
    answer.completeExceptionally(IllegalStateException("offline"))
    turning.join()
    assertEquals(true, switches.state.first().mentionsWhenMuted)
  }
}
