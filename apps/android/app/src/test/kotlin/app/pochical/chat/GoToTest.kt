package app.pochical.chat

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.unit.dp
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class GoToTest {
  @get:Rule val compose = createComposeRule()

  private val items = List(200) { ChatItem.DayTitle(LocalDate.of(2026, 10, 25), "line-$it") }

  @Test
  fun goingToTheFootGetsThereThoughTheRequestIsClearedOnTheWay() {
    val list = LazyListState(firstVisibleItemIndex = 150)
    var going by mutableStateOf<Going?>(null)
    var following: Boolean? = null
    compose.setContent {
      LazyColumn(Modifier.fillMaxSize(), state = list, reverseLayout = true) {
        items(items, key = { it.key }) { Text(it.key, Modifier.height(40.dp)) }
      }
      GoTo(going, items, list, reducedMotion = false, moves = ListMoves(), enabled = true) { there ->
        following = there
        going = null
      }
    }
    compose.runOnIdle { going = Going.ToFoot }
    compose.waitForIdle()
    assertEquals(0, list.firstVisibleItemIndex)
    assertEquals(true, following)
    assertNull(going)
  }

  @Test
  fun nothingAskedGoesNowhere() {
    val list = LazyListState(firstVisibleItemIndex = 150)
    compose.setContent {
      LazyColumn(Modifier.fillMaxSize(), state = list, reverseLayout = true) {
        items(items, key = { it.key }) { Text(it.key, Modifier.height(40.dp)) }
      }
      GoTo(null, items, list, reducedMotion = false, moves = ListMoves(), enabled = true) {}
    }
    compose.waitForIdle()
    assertTrue(list.firstVisibleItemIndex >= 150)
  }
}
