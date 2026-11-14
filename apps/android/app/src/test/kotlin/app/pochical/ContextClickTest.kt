package app.pochical

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performMouseInput
import androidx.compose.ui.test.rightClick
import androidx.compose.ui.unit.dp
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ContextClickTest {
  @get:Rule val compose = createComposeRule()

  private var menus = 0
  private var taps = 0

  private fun show() =
    compose.setContent {
      Box(Modifier.size(100.dp).testTag("item").contextClick { menus++ }) {
        Box(Modifier.size(100.dp).clickable { taps++ })
      }
    }

  @Test
  fun aRightClickOpensTheMenuAndIsNoTap() {
    show()
    compose.onNodeWithTag("item").performMouseInput { rightClick() }
    assertEquals(1, menus)
    assertEquals(0, taps)
  }

  @Test
  fun aClickIsTheItemsOwn() {
    show()
    compose.onNodeWithTag("item").performMouseInput { click() }
    assertEquals(0, menus)
    assertEquals(1, taps)
  }
}
