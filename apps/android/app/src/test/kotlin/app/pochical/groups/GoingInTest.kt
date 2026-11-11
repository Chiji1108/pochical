package app.pochical.groups

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.ui.NavDisplay
import app.pochical.kit.GoingIn
import app.pochical.kit.InGroup
import app.pochical.kit.JoinFace
import app.pochical.rememberPageDecorators
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

  /** The pages of a stack as the app's are, "form" waiting on the call. */
  private val stack = mutableStateListOf("list", "form")

  private fun showStack() =
    compose.activityRule.scenario.onActivity { activity ->
      activity.setContent {
        NavDisplay(backStack = stack, onBack = { stack.removeAt(stack.lastIndex) }, entryDecorators = rememberPageDecorators(stack.toSet())) { key ->
          NavEntry(key, contentKey = key) {
            if (key == "form") busy = waitingOn(going, onIn = { opened += it }, onFailed = { failures += it })
            Text(key)
          }
        }
      }
    }

  /**
   * Back while 作る waits, and the screen turned before the page's going is drawn: the page is off
   * the stack as the window is made anew, so it has left for good, and the page opened next takes
   * nothing of the call that ended meanwhile.
   */
  @Test
  fun aPageTakenOffTheStackAsTheWindowIsMadeAnewHasLeftItsCall() {
    showStack()
    compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }
    compose.mainClock.autoAdvance = false
    compose.runOnUiThread { stack.removeAt(stack.lastIndex) }
    compose.activityRule.scenario.recreate()
    compose.mainClock.autoAdvance = true
    showStack()
    compose.waitForIdle()
    answer.complete(InGroup("group-1", faceKept = true))
    compose.waitForIdle()
    assertNull(going.underWay.value)

    busy = true
    compose.runOnUiThread { stack.add("form") }
    compose.runOnIdle {
      assertFalse(busy)
      assertEquals(emptyList<String>(), opened)
    }
  }

  /**
   * A page opened over the form while 作る waits, an invitation's link: the form is on the stack
   * still and has left nothing. The call that ends meanwhile opens nothing over the page that
   * covers it, and the form takes its answer as it shows again.
   */
  @Test
  fun aPageCoveredAsItsCallEndsTakesTheAnswerAsItShowsAgain() {
    showStack()
    val call = compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }
    compose.runOnUiThread { stack.add("join") }
    compose.onNodeWithText("join").assertIsDisplayed()
    answer.complete(InGroup("group-1", faceKept = true))
    compose.runOnIdle {
      assertEquals("Nothing opens while it is covered", emptyList<String>(), opened)
      assertSame("Kept for the form", call, going.underWay.value)
    }

    compose.runOnUiThread { stack.removeAt(stack.lastIndex) }
    compose.runOnIdle {
      assertEquals(listOf("group-1"), opened)
      assertNull(going.underWay.value)
    }
  }

  /** The same for a call that fails while the form is covered: said as the form shows again. */
  @Test
  fun aPageCoveredAsItsCallFailsSaysSoAsItShowsAgain() {
    showStack()
    compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }
    compose.runOnUiThread { stack.add("join") }
    compose.onNodeWithText("join").assertIsDisplayed()
    answer.completeExceptionally(IllegalStateException("offline"))
    compose.runOnIdle { assertEquals(emptyList<String>(), failures.map { it.message }) }

    compose.runOnUiThread { stack.removeAt(stack.lastIndex) }
    compose.runOnIdle {
      assertEquals(listOf("offline"), failures.map { it.message })
      assertFalse(busy)
    }
  }

  /** The form taken off the stack from under the page that covers it has left, though it leaves no screen. */
  @Test
  fun aPageTakenOffTheStackWhileCoveredHasLeftItsCall() {
    showStack()
    compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }
    compose.runOnUiThread { stack.add("join") }
    compose.onNodeWithText("join").assertIsDisplayed()
    compose.runOnUiThread { stack.remove("form") }
    compose.waitForIdle()
    answer.complete(InGroup("group-1", faceKept = true))
    compose.waitForIdle()
    assertNull("Forgotten as it ends", going.underWay.value)

    busy = true
    compose.runOnUiThread { stack.add("form") }
    compose.runOnIdle {
      assertFalse(busy)
      assertEquals(emptyList<String>(), opened)
    }
  }

  /** A page popped while it shows has left: the call that ends then is forgotten, and nothing opens. */
  @Test
  fun aPagePoppedHasLeftItsCall() {
    showStack()
    compose.runOnIdle { going.begin("忘年会", JoinFace.Usual, asUsual = false) }
    compose.runOnUiThread { stack.removeAt(stack.lastIndex) }
    compose.waitForIdle()
    answer.complete(InGroup("group-1", faceKept = true))
    compose.waitForIdle()
    assertNull(going.underWay.value)
    assertEquals(emptyList<String>(), opened)
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
