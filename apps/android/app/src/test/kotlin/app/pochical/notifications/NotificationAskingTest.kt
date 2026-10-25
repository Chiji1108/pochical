package app.pochical.notifications

import androidx.compose.runtime.mutableStateOf
import org.junit.Assert.assertEquals
import org.junit.Test

/** The system's question whether the app may notify, put the first time a notification is wanted. */
class NotificationAskingTest {
  private val asked = mutableStateOf(NotificationAsking.Asked(mayAsk = true, asked = false))
  private var put = 0
  private val asking = NotificationAsking(asked) { put += 1 }

  @Test
  fun theFirstTimeANotificationIsWantedTheQuestionIsPut() {
    // The first line sent in a chat.
    asking.askOnce()
    assertEquals(1, put)
  }

  @Test
  fun onceAskedItIsNotPutAgainUnasked() {
    asked.value = NotificationAsking.Asked(mayAsk = true, asked = true)
    asking.askOnce()
    // Allowed, or turned down for good: nothing to put.
    asked.value = NotificationAsking.Asked(mayAsk = false, asked = false)
    asking.askOnce()
    assertEquals(0, put)
  }
}
