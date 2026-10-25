package app.pochical.calendar

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.hasScrollToIndexAction
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToIndex
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipe
import androidx.compose.ui.test.swipeDown
import androidx.compose.ui.test.swipeLeft
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
import app.pochical.RootPage
import app.pochical.kit.DeviceSettings
import app.pochical.notifications.LocalNotificationAsking
import app.pochical.notifications.NotificationAsking
import app.pochical.v1.pattern
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.coroutines.runBlocking
import org.junit.After
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
  private val test = sampleDays(today)
  private val days = test.days

  @After fun close() = test.close()
  private val opened = mutableListOf<RootPage>()
  private var tabBarHidden = false

  /** The question whether the app may notify, which the calendar may not put here. */
  private val asking = NotificationAsking(mutableStateOf(NotificationAsking.Asked(mayAsk = false, asked = false))) {}

  private fun show() {
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides days,
        LocalNotificationAsking provides asking,
      ) {
        PochicalTheme(settings) { CalendarScreen(open = { opened += it }, hidesTabBar = { tabBarHidden = it }) }
      }
    }
  }

  private fun heading(month: YearMonth) = month.yearMonthText

  @Test
  fun aLinkedDayOpensOverADayRestoredOpen() {
    val settings = DeviceSettings()
    val restoration = StateRestorationTester(compose)
    var opening by mutableStateOf<LocalDate?>(null)
    restoration.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides days,
        LocalNotificationAsking provides asking,
      ) {
        PochicalTheme(settings) {
          CalendarScreen(open = { opened += it }, hidesTabBar = { tabBarHidden = it }, opening = opening, onOpening = { opening = null })
        }
      }
    }
    tap(today.withDayOfMonth(8))
    // Made again with the day open: its week shows, and the month's pages are not laid out.
    restoration.emulateSavedInstanceStateRestore()
    val linked = today.plusMonths(2).withDayOfMonth(3)
    opening = linked
    compose.waitForIdle()
    assertNull("the link is taken", opening)
    compose.onNodeWithText(linked.fullText).assertIsDisplayed()
    back()
    compose.onNodeWithContentDescription(heading(YearMonth.from(linked))).assertIsDisplayed()
  }

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
    assertTrue(tabBarHidden)
    compose.onNodeWithText(day.fullText).assertIsDisplayed()
    compose.onNodeWithText("棚卸し").assertIsDisplayed()
    compose.onNodeWithText("残業").assertIsDisplayed()
    back()
    assertEquals(false, tabBarHidden)
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
    assertEquals(false, tabBarHidden)
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
    compose.waitForIdle()
    // Not on each letter: only as the day closes. Edits land in the order they are made, so a memo
    // shown on another day after it shows that nothing was written before.
    val other = today.withDayOfMonth(1).minusMonths(1)
    days.setNote(other, "先月")
    assertNull(test.awaitCalendar { it.note(other) != null }.note(day))
    compose.onNodeWithContentDescription("閉じる").performClick()
    compose.waitForIdle()
    assertEquals("早めに出る", test.awaitCalendar { it.note(day) != null }.note(day))
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
    val calendar = test.awaitCalendar { it.shown(day, day).isEmpty() }
    assertEquals("棚卸し", calendar.note(day))
  }

  @Test
  fun thisWeekComesBackFromADayAtEitherEndOfTheMonths() {
    show()
    for (page in listOf(0, 240)) {
      compose.onNode(hasScrollToIndexAction()).performScrollToIndex(page)
      compose.waitForIdle()
      val month = YearMonth.from(today).plusMonths(page - 120L)
      val day = if (page == 0) month.atDay(1) else month.atEndOfMonth()
      tap(day)
      compose.onNodeWithText(day.fullText).assertIsDisplayed()
      compose.onNodeWithText("今週").performClick()
      compose.waitForIdle()
      compose.onNodeWithText(today.fullText).assertIsDisplayed()
      back()
    }
  }

  @Test
  fun theShiftOpensItsOwnPageForTheDay() {
    show()
    val day = today.withDayOfMonth(8)
    tap(day)
    compose.onNodeWithText("シフト").performClick()
    assertEquals(listOf<RootPage>(RootPage.ShiftChoice(day.toString())), opened)
  }

  private fun startEntering() {
    compose.onNodeWithText("ポチポチ入力").performClick()
    compose.waitForIdle()
  }

  /** What the tray says, which a screen reader hears as it changes. */
  private fun traySays(words: String) = compose.onNodeWithContentDescription(words).assertIsDisplayed()

  @Test
  fun aNightShiftEnteredFillsItsNextDayAndMovesPastIt() {
    show()
    startEntering()
    assertTrue(tabBarHidden)
    // A day in the middle of the month, which no page beside it shows too.
    val night = today.withDayOfMonth(10)
    tap(night)
    traySays("入力する日付：${night.monthDayText}")
    compose.onNodeWithText("夜勤").performClick()
    compose.waitForIdle()
    val after = night.plusDays(1)
    val calendar = test.awaitCalendar { it.shown(night, after)[night]?.shift == "night" }
    assertEquals("after", calendar.shown(after, after)[after]?.shift)
    traySays("${night.monthDayText}、夜勤を入力しました。翌日は明けです。${night.dayOfMonth + 2}日を選択中")
  }

  @Test
  fun theKeysStayOnTheirPageAsDaysAreEntered() {
    // Seven more than the sample's four: a second page of keys.
    runBlocking {
      for (number in 1..7) {
        test.edits.savePattern("extra$number", pattern {
          name = "追加$number"
          emoji = "⭐️"
          symbol = "追"
          icon = "star"
        })
      }
    }
    test.awaitCalendar { it.patterns.size == 11 }
    show()
    startEntering()
    // Further than the key itself, which is narrower than half a page.
    compose.onNodeWithText("日勤").performTouchInput { swipe(centerRight, Offset(centerX - width * 5, centerY)) }
    compose.waitForIdle()
    compose.onNodeWithText("追加7").assertIsDisplayed()
    val day = today.withDayOfMonth(10)
    tap(day)
    repeat(3) {
      compose.onNodeWithText("追加7").performClick()
      compose.waitForIdle()
    }
    compose.onNodeWithText("追加7").assertIsDisplayed()
    traySays("${day.plusDays(2).monthDayText}、追加7を入力しました。${day.plusDays(3).dayText}を選択中")
  }

  @Test
  fun aBackEndsEntering() {
    show()
    startEntering()
    back()
    assertEquals(false, tabBarHidden)
    compose.onNodeWithText("ポチポチ入力").assertIsDisplayed()
  }

  @Test
  fun entersOnTheMonthsLastDayUntilDone() {
    show()
    startEntering()
    val last = YearMonth.from(today).atEndOfMonth()
    tap(last)
    compose.onNodeWithText("日勤").performClick()
    compose.waitForIdle()
    traySays("${last.monthDayText}、日勤を入力しました。月末です。入力が終わったら完了を押してください")
    compose.onNodeWithText("翌日へ").assertIsNotEnabled()
  }

  @Test
  fun doneAsksAboutTheBlankDaysAndFillsThemWithADayOff() {
    show()
    startEntering()
    // Days in the middle of the month, which no page beside it shows too.
    val blanks = listOf(today.withDayOfMonth(12), today.withDayOfMonth(14))
    for (day in blanks) {
      tap(day)
      compose.onNodeWithText("消す").performClick()
    }
    // At once, as a person taps it: 完了 counts the keys whose days the calendar may not show yet.
    compose.onNodeWithText("完了").performClick()
    compose.waitForIdle()
    assertEquals(false, tabBarHidden)
    compose.onNodeWithText("この2日はお休みですか？").assertIsDisplayed()
    compose.onNodeWithText("休みにする").performClick()
    compose.waitForIdle()
    val calendar = test.awaitCalendar { calendar -> blanks.all { calendar.shown(it, it).isNotEmpty() } }
    assertEquals(listOf("off", "off"), blanks.map { calendar.shown(it, it).getValue(it).shift })
    compose.onNodeWithText("この2日はお休みですか？").assertDoesNotExist()
  }
}
