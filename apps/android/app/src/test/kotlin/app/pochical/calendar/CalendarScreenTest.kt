package app.pochical.calendar

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.test.swipeLeft
import app.pochical.DeviceSettings
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
import app.pochical.RootPage
import java.time.LocalDate
import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
// A phone's screen, so a day's detail shows whole under its week.
@Config(qualifiers = "w411dp-h891dp")
class CalendarScreenTest {
  @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

  private val today = LocalDate.now()
  private val days = SampleDays(today)
  private val opened = mutableListOf<RootPage>()
  private var dayOpen = false

  private fun show() {
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides days,
      ) {
        PochicalTheme(settings) { CalendarScreen(open = { opened += it }, onDayOpen = { dayOpen = it }) }
      }
    }
  }

  private fun heading(month: YearMonth) = "${month.year}年${month.monthValue}月"

  /** Taps `day`'s cell on the month shown. */
  private fun tap(day: LocalDate) {
    compose.onAllNodes(hasContentDescription("${day.monthDayText}、", substring = true)).onFirst().performClick()
    compose.waitForIdle()
  }

  private fun back() {
    compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
    compose.waitForIdle()
  }

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

  @Test
  fun aDayOpensUnderItsWeekAndABackClosesIt() {
    show()
    val day = today.withDayOfMonth(8)
    tap(day)
    assertTrue(dayOpen)
    compose.onNodeWithText(day.fullText).assertIsDisplayed()
    compose.onNodeWithText("棚卸し").assertIsDisplayed()
    compose.onNodeWithText("残業").assertIsDisplayed()
    back()
    assertEquals(false, dayOpen)
    compose.onNodeWithText(day.fullText).assertDoesNotExist()
  }

  @Test
  fun pullingTheWeekDownUnfoldsTheMonthWithoutPressingADay() {
    show()
    val day = today.withDayOfMonth(8)
    tap(day)
    compose
      .onAllNodes(hasContentDescription("${day.plusDays(1).monthDayText}、", substring = true))
      .onFirst()
      .performTouchInput { swipeDown(startY = centerY, endY = centerY + 1500f, durationMillis = 600) }
    compose.waitForIdle()
    assertEquals(false, dayOpen)
    compose.onNodeWithText(day.fullText).assertDoesNotExist()
    compose.onNodeWithText(day.plusDays(1).fullText).assertDoesNotExist()
  }

  @Test
  fun theNextAndPreviousDayGoPastTheWeeksEnd() {
    show()
    val day = today.withDayOfMonth(8)
    tap(day)
    repeat(7) { compose.onNodeWithContentDescription("次の日").performClick() }
    compose.waitForIdle()
    compose.onNodeWithText(day.plusDays(7).fullText).assertIsDisplayed()
    compose.onNodeWithContentDescription("前の日").performClick()
    compose.waitForIdle()
    compose.onNodeWithText(day.plusDays(6).fullText).assertIsDisplayed()
  }

  @Test
  fun aMemoIsKeptAsItsDayCloses() {
    show()
    val day = today.withDayOfMonth(20)
    tap(day)
    compose.onNode(hasSetTextAction()).performTextReplacement("早めに出る")
    // Not on each letter: only as the day closes.
    assertNull(days.calendar.value.note(day))
    compose.onNodeWithContentDescription("閉じる").performClick()
    compose.waitForIdle()
    assertEquals("早めに出る", days.calendar.value.note(day))
  }

  @Test
  fun clearingAShiftWithItsOwnHoursAsksFirstAndKeepsTheMemo() {
    show()
    val day = today.withDayOfMonth(8)
    tap(day)
    compose.onNodeWithText("この日のシフトを消す").performClick()
    compose.onNodeWithText("時間の変更も消えます。").assertIsDisplayed()
    compose.onNodeWithText("消す").performClick()
    compose.waitForIdle()
    assertNull(days.calendar.value.shown(day, day)[day])
    assertEquals("棚卸し", days.calendar.value.note(day))
  }

  @Test
  fun theShiftOpensItsOwnPageForTheDay() {
    show()
    val day = today.withDayOfMonth(8)
    tap(day)
    compose.onNodeWithText("シフト").performClick()
    assertEquals(listOf<RootPage>(RootPage.ShiftChoice(day.toString())), opened)
  }
}
