package app.pochical

import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.ui.NavDisplay
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PageStatesTest {
  @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

  /** The pages on the stack, kept over the activity made anew as the app's are. */
  private val stack = mutableStateListOf("list", "page")
  private var type: (String) -> Unit = {}

  /** The pages, in the activity as it is now: "page" holds a name it saves. */
  private fun show() =
    compose.activityRule.scenario.onActivity { activity ->
      activity.setContent {
        NavDisplay(
          backStack = stack,
          onBack = { stack.removeAt(stack.lastIndex) },
          entryDecorators = listOf(rememberPageStatesDecorator(stack.toSet())),
        ) { key ->
          NavEntry(key, contentKey = key) {
            var name by rememberSaveable { mutableStateOf("") }
            if (key == "page") type = { name = it }
            Text("$key: $name")
          }
        }
      }
    }

  /**
   * The screen turned in the moment a page is taken off the stack, before the screen is drawn
   * again without it: the page next opened under the same key starts anew, as グループを作る opened
   * again after a group was made (#1177).
   */
  @Test
  fun aPageTakenOffTheStackAsTheWindowIsMadeAnewLeavesNothingForTheNextOfItsKey() {
    show()
    compose.runOnIdle { type("忘年会") }
    compose.onNodeWithText("page: 忘年会").assertIsDisplayed()

    compose.mainClock.autoAdvance = false
    compose.runOnUiThread { stack.removeAt(stack.lastIndex) }
    compose.activityRule.scenario.recreate()
    compose.mainClock.autoAdvance = true
    show()

    compose.runOnIdle { stack.add("page") }
    compose.onNodeWithText("page: ").assertIsDisplayed()
  }

  /** The same while the page taken off still slides away, drawn but no longer on the stack. */
  @Test
  fun aPageStillGoingAsTheWindowIsMadeAnewLeavesNothingForTheNextOfItsKey() {
    show()
    compose.runOnIdle { type("忘年会") }
    compose.onNodeWithText("page: 忘年会").assertIsDisplayed()

    // The pop is taken in, and the frames of its going do not run.
    compose.mainClock.autoAdvance = false
    compose.runOnUiThread { stack.removeAt(stack.lastIndex) }
    compose.waitForIdle()
    compose.mainClock.advanceTimeByFrame()
    compose.onNodeWithText("page: 忘年会").assertExists()
    compose.activityRule.scenario.recreate()
    compose.mainClock.autoAdvance = true
    show()

    compose.runOnIdle { stack.add("page") }
    compose.onNodeWithText("page: ").assertIsDisplayed()
  }
}
