package app.pochical.repeat

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onLast
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.navigation3.runtime.NavBackStack
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PageNavigation
import app.pochical.PochicalTheme
import app.pochical.RootNavigator
import app.pochical.RootPage
import app.pochical.RootTab
import app.pochical.Tabs
import app.pochical.awaitRoutes
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.TestDays
import app.pochical.calendar.markedPattern
import app.pochical.kit.DeviceSettings
import app.pochical.kit.RepeatOrder
import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
// A phone's screen, so the order's month and its keys show whole.
@Config(qualifiers = "w411dp-h891dp")
class RepeatPagesTest {
  @get:Rule val compose = createComposeRule()

  private val test = TestDays()
  private val pages = NavBackStack<RootPage>()
  private val navigator = RootNavigator(pages, mutableStateOf(RootTab.Settings))
  private val owner =
    object : LifecycleOwner {
      override val lifecycle = LifecycleRegistry.createUnsafe(this).apply { currentState = Lifecycle.State.RESUMED }
    }
  private val navigation = PageNavigation(navigator, owner.lifecycle)

  @After fun close() = test.close()

  /** 日勤 and 休み, in an order of 日勤 from January. */
  private fun dayAndOffInAnOrder() = runBlocking {
    test.edits.savePattern("day", markedPattern("日勤"))
    test.edits.savePattern("off", markedPattern("休み") { countsAsOff = true })
    test.edits.putOrder(RepeatOrder(listOf("day"), LocalDate.parse("2026-01-01"), holidayCountry = "JP"))
    test.awaitCalendar { it.patterns.size == 2 && it.orders.isNotEmpty() }
  }

  private fun show(at: List<RootPage>, page: @Composable () -> Unit) {
    pages.addAll(at)
    val settings = DeviceSettings()
    compose.setContent {
      CompositionLocalProvider(LocalDeviceSettings provides DeviceSettingsState(settings) {}, LocalOwnDays provides test.days) {
        PochicalTheme(settings) { page() }
      }
    }
  }

  @Test
  fun aNewOrderTypedOnTheMonthIsPutInFromItsFirstDay() {
    dayAndOffInAnOrder()
    show(listOf(RootPage.Repeat, RootPage.RepeatEditor(RepeatMode.Switch))) { RepeatEditor(RepeatMode.Switch, navigation) }
    // It starts from the newest order's sequence, 日勤 alone: a 休み typed after it makes two days.
    compose.onAllNodesWithText("休み").onLast().performClick()
    compose.onNodeWithText("完了").performClick()
    compose.onNodeWithText("切り替える").performClick()
    compose.waitForIdle()
    val start = nextMonthStart()
    val orders = test.awaitCalendar { it.orders.size == 2 }.orders
    assertEquals(listOf("day", "off") to start, orders.last().sequence to orders.last().start)
    compose.awaitRoutes(navigator, Tabs, RootPage.Repeat)
  }

  /** The order's holidays on as 休み, which then stops counting as off, leaving none that does. */
  private fun holidaysOnAPatternNoLongerOff() = runBlocking {
    dayAndOffInAnOrder()
    test.edits.setHolidaysOff(true, start = LocalDate.parse("2026-01-01"))
    test.edits.savePattern("off", markedPattern("休み"))
    test.awaitCalendar { calendar -> calendar.patterns.none { it.countsAsOff } && calendar.orders.single().holidaysOff }
  }

  @Test
  fun holidaysOnWithNoDayOffLeftCanStillBeTurnedOff() {
    holidaysOnAPatternNoLongerOff()
    show(listOf(RootPage.Repeat, RootPage.RepeatPeriod("2026-01-01"))) { RepeatPeriodPage("2026-01-01", navigation) }
    compose.onNodeWithText("祝日は休みにする").assertIsEnabled().performClick()
    compose.waitForIdle()
    assertEquals(listOf(false to "off"), test.awaitCalendar { !it.orders.single().holidaysOff }.orders.map { it.holidaysOff to it.holidayShift })
  }

  @Test
  fun settingAPeriodAgainKeepsItsHolidayPattern() {
    holidaysOnAPatternNoLongerOff()
    val fix = RepeatMode.Fix("2026-01-01")
    show(listOf(RootPage.Repeat, RootPage.RepeatEditor(fix))) { RepeatEditor(fix, navigation) }
    compose.onNodeWithText("完了").performClick()
    compose.onNodeWithText("入れ直す").performClick()
    compose.waitForIdle()
    compose.awaitRoutes(navigator, Tabs, RootPage.Repeat)
    // Written again, the period now names its anchor.
    assertEquals(listOf(true to "off"), test.awaitCalendar { it.orders.single().anchor != null }.orders.map { it.holidaysOff to it.holidayShift })
  }

  @Test
  fun stoppingPutsInAPeriodWithoutRepeating() {
    dayAndOffInAnOrder()
    show(listOf(RootPage.Repeat, RootPage.StopRepeat)) { StopRepeatPage(navigation) }
    compose.onNodeWithText("から繰り返しをやめる", substring = true).performClick()
    compose.waitForIdle()
    val orders = test.awaitCalendar { it.orders.size == 2 }.orders
    assertEquals(emptyList<String>() to nextMonthStart(), orders.last().sequence to orders.last().start)
  }

  @Test
  fun aNewJobsOrderTakesOverFromItsFirstDay() {
    dayAndOffInAnOrder()
    show(listOf(RootPage.Patterns, RootPage.JobChange)) { JobChangePage(navigation) }
    compose.onNodeWithText("次へ").performClick()
    compose.onNodeWithText("繰り返しがある").performClick()
    compose.onNodeWithText("当番・非番・休み").performClick()
    compose.onNodeWithText("次へ").performClick()
    compose.onNodeWithText("完了").performClick()
    compose.onNodeWithText("切り替える").performClick()
    compose.waitForIdle()
    // The patterns and the orders show from queries of their own, so the last to show is waited for.
    val calendar = test.awaitCalendar { it.orders.size == 2 && it.patterns.size == 4 }
    // 日勤 is still on the days before the switch, so it stays, archived; the person's 休み, on no day before, gives way.
    assertEquals(listOf("duty" to false, "offDuty" to false, "off" to false, "day" to true), calendar.patterns.map { it.id to it.archived })
    assertEquals(listOf("duty", "offDuty", "off") to nextMonthStart(), calendar.orders.last().sequence to calendar.orders.last().start)
    compose.awaitRoutes(navigator, Tabs, RootPage.Patterns)
  }
}
