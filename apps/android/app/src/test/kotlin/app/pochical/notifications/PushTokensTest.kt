package app.pochical.notifications

import java.io.IOException
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.UnconfinedTestDispatcher
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// Robolectric, for the log a token not taken writes.
@RunWith(RobolectricTestRunner::class)
@OptIn(ExperimentalCoroutinesApi::class)
class PushTokensTest {
  private val user = MutableStateFlow<String?>(null)
  private val sent = mutableListOf<Pair<String?, String>>()
  private var refusing = false

  private fun TestScope.tokens() =
    PushTokens(backgroundScope, user) { token ->
      if (refusing) throw IOException("offline")
      sent += user.value to token
    }

  @Test
  fun theTokenGoesOnceSignedInWithNotificationsAllowed() = runTest(UnconfinedTestDispatcher()) {
    val tokens = tokens()
    tokens.took("t1")
    tokens.allowed(true)
    assertEquals("not before signing in", emptyList<Any>(), sent)
    user.value = "u1"
    assertEquals(listOf("u1" to "t1"), sent)
  }

  @Test
  fun aNewTokenAndAnotherUserSendItAgain() = runTest(UnconfinedTestDispatcher()) {
    val tokens = tokens()
    user.value = "u1"
    tokens.allowed(true)
    tokens.took("t1")
    tokens.took("t2")
    // Signing out goes on as a new user, whose session the token moves to.
    user.value = null
    user.value = "u2"
    assertEquals(listOf("u1" to "t1", "u1" to "t2", "u2" to "t2"), sent)
  }

  @Test
  fun nothingGoesWhileNotificationsAreNotAllowed() = runTest(UnconfinedTestDispatcher()) {
    val tokens = tokens()
    user.value = "u1"
    tokens.took("t1")
    assertEquals(emptyList<Any>(), sent)
    tokens.allowed(true)
    assertEquals(listOf("u1" to "t1"), sent)
  }

  @Test
  fun oneTheServerDidNotTakeGoesAgainInTheForeground() = runTest(UnconfinedTestDispatcher()) {
    val tokens = tokens()
    refusing = true
    user.value = "u1"
    tokens.allowed(true)
    tokens.took("t1")
    refusing = false
    tokens.foreground()
    tokens.foreground()
    assertEquals("once taken, not again", listOf("u1" to "t1"), sent)
  }
}
