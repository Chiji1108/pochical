package app.pochical.notifications

import androidx.compose.runtime.mutableStateOf
import app.pochical.kit.ChatNotificationState
import app.pochical.kit.ChatNotificationSwitches
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test

/** Turning a chat's notifications on is when one is first wanted; turning them off is not. */
class ChatSwitchingTest {
  private var put = 0
  private val asking = NotificationAsking(mutableStateOf(NotificationAsking.Asked(mayAsk = true, asked = false))) { put += 1 }

  @Test
  fun turningAChatOnAsksAndTurningItOffDoesNot() = runTest {
    val switches =
      ChatNotificationSwitches(MutableStateFlow(ChatNotificationState()), MutableStateFlow("me"), { _, _, _ -> }, {}, backgroundScope)
    val switching = ChatSwitching(switches, asking)
    switching.setMuted("g1", "group", muted = true) {}
    assertEquals(0, put)
    switching.setMuted("g1", "group", muted = false) {}
    assertEquals(1, put)
  }
}
