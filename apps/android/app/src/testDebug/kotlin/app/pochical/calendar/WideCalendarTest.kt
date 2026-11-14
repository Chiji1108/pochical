package app.pochical.calendar

import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.StateRestorationTester
import androidx.compose.ui.test.junit4.v2.createAndroidComposeRule
import androidx.compose.ui.test.onFirst
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PochicalTheme
import app.pochical.RootPage
import app.pochical.kit.DeviceSettings
import app.pochical.notifications.LocalNotificationAsking
import app.pochical.notifications.NotificationAsking
import java.time.LocalDate
import java.time.YearMonth
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** The calendar on a wide window: the month never folds and the day stands in a pane beside it (spec/calendar.md, On a wide screen). */
@RunWith(RobolectricTestRunner::class)
// A tablet on its side, an expanded width.
@Config(qualifiers = "w1280dp-h800dp")
class WideCalendarTest {
  @get:Rule val compose = createAndroidComposeRule<ComponentActivity>()

  private val today = LocalDate.now()
  private val test = sampleDays(today)
  private val days = test.days
  private val opened = mutableListOf<RootPage>()
  private var tabBarHidden = false
  private val asking = NotificationAsking(mutableStateOf(NotificationAsking.Asked(mayAsk = false, asked = false))) {}

  @After fun close() = test.close()

  private fun show() {
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides days,
        LocalNotificationAsking provides asking,
      ) {
        PochicalTheme(settings) { CalendarScreen(open = { opened += it }, hidesTabBar = { tabBarHidden = it }, closePane = {}) }
      }
    }
  }

  private fun tap(day: LocalDate) {
    compose.onAllNodes(hasContentDescription("${day.monthDayText}(", substring = true)).onFirst().performClick()
    compose.waitForIdle()
  }

  private fun back() {
    compose.runOnUiThread { compose.activity.onBackPressedDispatcher.onBackPressed() }
    compose.waitForIdle()
  }

  @Test
  fun todaysDetailStandsBesideTheMonthWithoutATap() {
    show()
    compose.onNodeWithContentDescription(YearMonth.from(today).yearMonthText).assertIsDisplayed()
    compose.onNodeWithText(today.fullText).assertIsDisplayed()
    compose.onNodeWithText("ポチポチ入力").assertIsDisplayed()
    // Always there: no ×, and the rail stays.
    compose.onNodeWithContentDescription("閉じる").assertDoesNotExist()
    assertEquals(false, tabBarHidden)
  }

  @Test
  fun aDayOpensInThePaneAndABackGoesBackToToday() {
    show()
    val day = today.withDayOfMonth(if (today.dayOfMonth == 8) 9 else 8)
    tap(day)
    compose.onNodeWithText(day.fullText).assertIsDisplayed()
    // The month stays, unfolded, its heading the month's.
    compose.onNodeWithContentDescription(YearMonth.from(today).yearMonthText).assertIsDisplayed()
    assertEquals(false, tabBarHidden)
    back()
    compose.onNodeWithText(today.fullText).assertIsDisplayed()
    compose.onNodeWithText(day.fullText).assertDoesNotExist()
  }

  @Test
  fun enteringClosesTheDayOpenSoTheTrayStaysOnceNarrowed() {
    val settings = DeviceSettings()
    val restoration = StateRestorationTester(compose)
    restoration.setContent {
      CompositionLocalProvider(
        LocalDeviceSettings provides DeviceSettingsState(settings) {},
        LocalOwnDays provides days,
        LocalNotificationAsking provides asking,
      ) {
        PochicalTheme(settings) { CalendarScreen(open = { opened += it }, hidesTabBar = { tabBarHidden = it }, closePane = {}) }
      }
    }
    val day = today.withDayOfMonth(if (today.dayOfMonth == 8) 9 else 8)
    tap(day)
    compose.onNodeWithText("ポチポチ入力").performClick()
    compose.waitForIdle()
    compose.onNodeWithText(day.fullText).assertDoesNotExist()
    // Made again, as a window narrowed is: entering is all that is kept, so a phone's layout shows
    // its tray rather than a day's detail, and a back ends entering.
    restoration.emulateSavedInstanceStateRestore()
    compose.waitForIdle()
    compose.onNodeWithText("完了").assertIsDisplayed()
    compose.onNodeWithText("翌日へ").assertIsDisplayed()
    compose.onNodeWithText(day.fullText).assertDoesNotExist()
    back()
    compose.onNodeWithText("完了").assertDoesNotExist()
  }

  @Test
  fun theNextDayPastThePageTurnsToItsMonth() {
    show()
    val month = YearMonth.from(today)
    tap(month.atEndOfMonth())
    // The next month's first days are on this page's last week, faded; a week on, the page turns.
    repeat(7) {
      compose.onNodeWithContentDescription("次の日").performClick()
      compose.waitForIdle()
    }
    compose.onNodeWithText(month.atEndOfMonth().plusDays(7).fullText).assertIsDisplayed()
    compose.onNodeWithContentDescription(month.plusMonths(1).yearMonthText).assertIsDisplayed()
  }
}
