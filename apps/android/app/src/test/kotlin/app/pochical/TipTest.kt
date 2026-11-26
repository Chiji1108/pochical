package app.pochical

import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performMouseInput
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A button that shows only a symbol says its name as a pointer rests on it, and to a screen reader. */
@RunWith(RobolectricTestRunner::class)
class TipTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun aPointerRestingOnTheButtonShowsItsName() {
    compose.setContent { Tip("保存") { IconButton(onClick = {}, Modifier.testTag("button")) { Icon(painterResource(R.drawable.ic_download), "保存") } } }
    compose.onAllNodesWithText("保存").assertCountEquals(0)
    compose.onNodeWithTag("button").performMouseInput { moveTo(center) }
    compose.waitForIdle()
    compose.onAllNodesWithText("保存").assertCountEquals(1)
  }

  @Test
  fun aScreenReaderSaysItsName() {
    compose.setContent { Tip("保存") { IconButton(onClick = {}) { Icon(painterResource(R.drawable.ic_download), "保存") } } }
    compose.onNodeWithContentDescription("保存").assertExists()
  }
}
