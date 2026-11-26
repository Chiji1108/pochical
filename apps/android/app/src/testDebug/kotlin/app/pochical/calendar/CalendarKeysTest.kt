package app.pochical.calendar

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.isFocused
import androidx.compose.ui.test.isRoot
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performKeyInput
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeLeft
import androidx.compose.ui.test.pressKey
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
import app.pochical.kit.DeviceSettings
import app.pochical.notifications.LocalNotificationAsking
import app.pochical.notifications.NotificationAsking
import java.time.LocalDate
import java.time.YearMonth
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The calendar from a keyboard (spec/calendar.md, Keys): Tab and the arrow keys keep to the month
 * shown, never reaching into the months the pager lays out beside it, and Enter opens a day.
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w411dp-h891dp")
class CalendarKeysTest {
  @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

  private val today = LocalDate.now()
  private val month = YearMonth.from(today)
  private val test = sampleDays(today)

  @After fun close() = test.close()

  private val asking = NotificationAsking(mutableStateOf(NotificationAsking.Asked(mayAsk = false, asked = false))) {}

  private fun show() {
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides test.days,
        LocalNotificationAsking provides asking,
      ) {
        PochicalTheme(settings) { CalendarScreen(open = {}, hidesTabBar = {}, closePane = {}) }
      }
    }
  }

  /** Pressed in the activity's window, under a button's tooltip should one show as Tab reaches it. */
  private fun press(key: Key) {
    compose.onAllNodes(isRoot()).onFirst().performKeyInput { pressKey(key) }
    compose.waitForIdle()
  }

  /** What the focused element says, a day's date and shift, or null for one that says nothing. */
  private fun focused(): String? =
    compose
      .onAllNodes(isFocused(), useUnmergedTree = true)
      .fetchSemanticsNodes()
      .singleOrNull()
      ?.config
      ?.getOrElseNullable(SemanticsProperties.ContentDescription) { null }
      ?.single()

  private fun LocalDate.said() = "$monthDayText("

  private fun theMonthIsStill(month: YearMonth) =
    compose.onNodeWithContentDescription(month.yearMonthText).assertIsDisplayed()

  /** Tabs to [day] from the top of the screen, the month staying put on the way. */
  private fun tabTo(day: LocalDate) {
    repeat(MAX_TABS) {
      press(Key.Tab)
      theMonthIsStill(month)
      if (focused()?.startsWith(day.said()) == true) return
    }
    error("Tab never reached ${day.said()}")
  }

  @Test
  fun tabGoesFromTheHeadingToTheMonthsFirstDayAndThroughItsDays() {
    show()
    tabTo(month.atDay(1))
    tabTo(month.atEndOfMonth())
  }

  @Test
  @Config(qualifiers = "w1280dp-h800dp")
  fun tabKeepsToTheMonthOnAWideScreen() {
    show()
    tabTo(month.atDay(1))
    tabTo(month.atEndOfMonth())
  }

  @Test
  fun tabLeavesTheMonthRatherThanTurningIt() {
    show()
    tabTo(month.atEndOfMonth())
    // On past the month's own days and the next month's faded at its end, back to the heading.
    repeat(MAX_TABS) {
      press(Key.Tab)
      theMonthIsStill(month)
      if (focused() == month.yearMonthText) return
    }
    error("Tab never left the month")
  }

  @Test
  fun theArrowsMoveBetweenDaysAndStopAtTheMonthsEdge() {
    show()
    val first = month.atDay(1)
    tabTo(first)
    press(Key.DirectionDown)
    assertTrue(focused().toString(), focused()!!.startsWith(first.plusWeeks(1).said()))
    // To the week's end, and no further: the next month is not turned to.
    repeat(7) { press(Key.DirectionRight) }
    val weeksEnd = focused()
    press(Key.DirectionRight)
    theMonthIsStill(month)
    assertEquals(weeksEnd, focused())
    // And back to its start, the month before not turned to either.
    repeat(7) { press(Key.DirectionLeft) }
    val weeksStart = focused()
    press(Key.DirectionLeft)
    theMonthIsStill(month)
    assertEquals(weeksStart, focused())
    // Up from the first week, to the heading.
    press(Key.DirectionUp)
    press(Key.DirectionUp)
    theMonthIsStill(month)
    assertTrue(focused().toString(), focused()?.contains("日(") != true)
  }

  @Test
  fun enterOpensTheFocusedDay() {
    show()
    val day = month.atDay(8)
    tabTo(day)
    press(Key.Enter)
    compose.onNodeWithText(day.fullText).assertIsDisplayed()
  }

  @Test
  fun aSwipeUnderAKeysFocusTakesItToTheMonthShown() {
    show()
    tabTo(month.atDay(8))
    compose.onRoot().performTouchInput { swipeLeft() }
    compose.waitForIdle()
    theMonthIsStill(month.plusMonths(1))
    // On a day of the page shown, inside the screen, rather than on the page that went.
    val width = compose.onRoot().fetchSemanticsNode().boundsInRoot.width
    val day = compose.onAllNodes(isFocused(), useUnmergedTree = true).fetchSemanticsNodes().single()
    val bounds = day.boundsInRoot
    assertTrue(bounds.toString(), bounds.width > 0f && bounds.left >= 0f && bounds.right <= width)
    assertTrue(focused().toString(), focused()?.contains("日(") == true)
  }

  private companion object {
    /** More than the heading's controls and six weeks of days. */
    const val MAX_TABS = 60
  }
}
