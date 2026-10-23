package app.pochical.calendar

import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import app.pochical.DeviceSettings
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
import java.time.LocalDate
import java.time.YearMonth
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CalendarScreenTest {
  @get:Rule val compose = createComposeRule()

  private val today = LocalDate.now()

  private fun show() {
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides SampleDays(today),
      ) {
        PochicalTheme(settings) { CalendarScreen() }
      }
    }
  }

  private fun heading(month: YearMonth) = "${month.year}年${month.monthValue}月"

  @Test
  fun opensOnThisMonthWithItsMemos() {
    show()
    compose.onNodeWithContentDescription(heading(YearMonth.from(today))).assertIsDisplayed()
    val memos =
      compose
        .onAllNodes(hasContentDescription("メモあり", substring = true))
        .fetchSemanticsNodes()
        .map { it.config[SemanticsProperties.ContentDescription].single() }
    // The sample's memos fall on the 8th and the 16th of this month.
    for (day in listOf(8, 16)) {
      assertTrue(memos.toString(), memos.any { it.startsWith("${today.monthValue}月${day}日、") })
    }
  }

  @Test
  fun aSwipeTurnsTheMonthAndThisMonthBringsItBack() {
    show()
    compose.onNodeWithText("今月").assertDoesNotExist()
    compose.onRoot().performTouchInput { swipeLeft() }
    compose.waitForIdle()
    compose.onNodeWithContentDescription(heading(YearMonth.from(today).plusMonths(1))).assertIsDisplayed()
    compose.onNodeWithText("今月").performClick()
    compose.waitForIdle()
    compose.onNodeWithContentDescription(heading(YearMonth.from(today))).assertIsDisplayed()
    compose.onNodeWithText("今月").assertDoesNotExist()
  }
}
