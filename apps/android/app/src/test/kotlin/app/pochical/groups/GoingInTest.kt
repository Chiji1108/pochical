package app.pochical.groups

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import app.pochical.kit.InGroup
import kotlinx.coroutines.CompletableDeferred
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GoingInTest {
  @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

  private val opened = mutableListOf<String>()
  private val failures = mutableListOf<Exception>()
  private lateinit var going: GoingIn

  /** The page, in the activity as it is now. */
  private fun show() =
    compose.activityRule.scenario.onActivity { activity ->
      activity.setContent { going = rememberGoingIn(onIn = { opened += it }, onFailed = { failures += it }) }
    }

  /** The screen turned while 作る waits: the page there goes on to the group once it is made (#1178). */
  @Test
  fun thePageGoesOnToTheGroupThoughTheWindowWasMadeAnewWhileItWasMade() {
    val call = CompletableDeferred<InGroup>()
    show()
    compose.runOnIdle { going.begin(call) }

    compose.activityRule.scenario.recreate()
    show()
    compose.runOnIdle {
      assertTrue("Still under way in the page made anew", going.busy)
      assertEquals(emptyList<String>(), opened)
    }

    call.complete(InGroup("group-1", faceKept = true))
    compose.runOnIdle {
      assertEquals(listOf("group-1"), opened)
      assertTrue("Busy still, as the page gives way to the group", going.busy)
    }
  }

  @Test
  fun aCallThatFailsLeavesThePageFreeToAskAgain() {
    val call = CompletableDeferred<InGroup>()
    show()
    compose.runOnIdle { going.begin(call) }
    call.completeExceptionally(IllegalStateException("offline"))
    compose.runOnIdle {
      assertEquals(listOf("offline"), failures.map { it.message })
      assertFalse(going.busy)
      assertEquals(emptyList<String>(), opened)
    }
  }
}
