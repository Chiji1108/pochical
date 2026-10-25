package app.pochical.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class OverTheLinesTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun theLinesKeepTheRoomOfWhatFloatsOverThemWhileItIsDrawn() {
    val over = OverTheLines()
    var shown by mutableStateOf(true)
    var px = 0
    compose.setContent {
      px = with(LocalDensity.current) { 64.dp.roundToPx() }
      if (shown) Box(Modifier.height(64.dp).covering(over, "pins"))
    }
    compose.waitForIdle()
    assertEquals(px, over.topPx)
    shown = false
    compose.waitForIdle()
    assertEquals(0, over.topPx)
  }
}
