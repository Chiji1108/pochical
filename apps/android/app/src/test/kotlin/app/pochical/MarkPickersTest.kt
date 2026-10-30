package app.pochical

import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.test.assert
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.test.performTextReplacement
import app.pochical.kit.DeviceSettings
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class MarkPickersTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun aChoiceIsReadByItsLabelAlone() {
    var picked = ""
    compose.setContent {
      PochicalTheme(DeviceSettings()) {
        MarkChoiceGrid(listOf("🏠", "🎓"), "🏠", { "家" }, { picked = it }) { Text(it) }
      }
    }
    assertEquals(2, compose.onAllNodesWithContentDescription("家").fetchSemanticsNodes().size)
    compose.onNodeWithText("🎓").assertDoesNotExist()
    compose.onAllNodesWithContentDescription("家")[1].performClick()
    assertEquals("🎓", picked)
  }

  @Test
  fun aLetterChangedFromOutsideShowsInTheField() {
    var letter by mutableStateOf("さ")
    compose.setContent {
      PochicalTheme(DeviceSettings()) { MarkLetterField(letter, limit = 2) {} }
    }
    compose.onNode(hasSetTextAction()).assert(hasText("さ"))
    letter = "家"
    compose.onNode(hasSetTextAction()).assert(hasText("家"))
  }

  @Test
  fun lettersTypedOneAfterAnotherStayInTheirOrder() {
    var letter by mutableStateOf("さ")
    compose.setContent {
      PochicalTheme(DeviceSettings()) { MarkLetterField(letter, limit = 2) { letter = it } }
    }
    compose.onNode(hasSetTextAction()).performTextReplacement("家")
    compose.onNode(hasSetTextAction()).performTextInput("族")
    assertEquals("家族", letter)
  }
}
