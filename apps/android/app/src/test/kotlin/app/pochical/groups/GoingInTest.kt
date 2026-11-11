package app.pochical.groups

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import app.pochical.kit.GoingIn
import app.pochical.kit.InGroup
import app.pochical.kit.JoinFace
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GoingInTest {
  @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

  private val answer = CompletableDeferred<InGroup>()
  private val going = GoingIn<String> { _, _, _ -> answer }
  private val opened = mutableListOf<String>()
  private val failures = mutableListOf<Exception>()
  private var busy = false
  private var open by mutableStateOf(true)

  /** The page, in the activity as it is now, while it is [open]. */
  private fun show() =
    compose.activityRule.scenario.onActivity { activity ->
      activity.setContent { if (open) busy = waitingOn(going, onIn = { opened += it }, onFailed = { failures += it }) }
    }

  /** The screen turned while 作る waits: the page there goes on to the group once it is made (#1178). */
  @Test
  fun thePageGoesOnToTheGroupThoughTheWindowWasMadeAnewWhileItWasMade() {
    show()
    compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }

    compose.activityRule.scenario.recreate()
    show()
    compose.runOnIdle {
      assertTrue("Still under way in the page made anew", busy)
      assertEquals(emptyList<String>(), opened)
    }

    answer.complete(InGroup("group-1", faceKept = true))
    compose.runOnIdle {
      assertEquals(listOf("group-1"), opened)
      assertTrue("Busy still, as the page gives way to the group", busy)
      assertNull("Taken: nothing is under way", going.underWay.value)
    }
  }

  @Test
  fun aCallThatFailsLeavesThePageFreeToAskAgain() {
    show()
    compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }
    answer.completeExceptionally(IllegalStateException("offline"))
    compose.runOnIdle {
      assertEquals(listOf("offline"), failures.map { it.message })
      assertFalse(busy)
      assertEquals(emptyList<String>(), opened)
      assertNull(going.underWay.value)
    }
  }

  /** Back while 作る waits, and the page opened again: it finds the call under way, and takes its answer. */
  @Test
  fun thePageLeftAndOpenedAgainWaitsOnTheSameCall() {
    show()
    val call = compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }
    compose.runOnUiThread { open = false }
    compose.waitForIdle()
    assertSame("Still the kit's, for the page opened again", call, going.underWay.value)

    compose.runOnUiThread { open = true }
    compose.runOnIdle { assertTrue(busy) }
    answer.complete(InGroup("group-1", faceKept = true))
    compose.runOnIdle { assertEquals(listOf("group-1"), opened) }
  }

  /** Back while 作る waits, for good: the call ends with no page to open the group, and is forgotten. */
  @Test
  fun aCallWhosePageWasLeftOpensNothingAsItEnds() {
    show()
    compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }
    compose.runOnUiThread { open = false }
    compose.waitForIdle()
    answer.complete(InGroup("group-1", faceKept = true))
    compose.waitForIdle()

    assertNull(going.underWay.value)
    compose.runOnUiThread { open = true }
    compose.runOnIdle {
      assertFalse(busy)
      assertEquals(emptyList<String>(), opened)
    }
  }
}
