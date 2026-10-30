package app.pochical.calendar

import android.provider.Settings
import androidx.compose.material3.Text
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

@RunWith(RobolectricTestRunner::class)
class ReducedMotionTest {
  @get:Rule val compose = createComposeRule()

  private fun animatorScale(scale: Float) {
    val resolver = RuntimeEnvironment.getApplication().contentResolver
    Settings.Global.putFloat(resolver, Settings.Global.ANIMATOR_DURATION_SCALE, scale)
  }

  @Test
  fun followsAnimationsTurnedOffAndOnWhileShown() {
    animatorScale(1f)
    compose.setContent { Text(if (rememberReducedMotion()) "reduced" else "moving") }
    compose.onNodeWithText("moving").assertExists()
    animatorScale(0f)
    compose.waitForIdle()
    compose.onNodeWithText("reduced").assertExists()
    animatorScale(1f)
    compose.waitForIdle()
    compose.onNodeWithText("moving").assertExists()
  }
}
