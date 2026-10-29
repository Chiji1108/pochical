package app.pochical.chat

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.unit.dp
import app.pochical.design.Chat
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** When the day floats over a chat's lines. */
@RunWith(RobolectricTestRunner::class)
class FloatingDayTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun itShowsAsThePersonScrollsAndFadesOnlyOnceTheyHaveStoppedAWhile() {
    val list = LazyListState(firstVisibleItemIndex = 100)
    var shown = false
    compose.mainClock.autoAdvance = false
    compose.setContent {
      LazyColumn(Modifier.fillMaxSize().testTag("lines"), state = list, reverseLayout = true) {
        items((0 until 200).toList()) { Text("$it", Modifier.height(40.dp)) }
      }
      shown = rememberFloatingDayShown(list)
    }
    compose.onNodeWithTag("lines").performTouchInput { swipeDown() }
    compose.mainClock.advanceTimeBy(200)
    assertTrue(shown)
    // Stopped, then scrolled again before it fades: it stays.
    compose.mainClock.advanceTimeBy(Chat.floatingDayMs / 2L + 1_000)
    compose.onNodeWithTag("lines").performTouchInput { swipeDown() }
    compose.mainClock.advanceTimeBy(Chat.floatingDayMs - 200L)
    assertTrue(shown)
    // Left alone long enough after: gone.
    compose.mainClock.advanceTimeBy(Chat.floatingDayMs + 2_000L)
    assertFalse(shown)
  }
}
