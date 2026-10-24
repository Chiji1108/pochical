package app.pochical.patterns

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollToNode
import androidx.compose.ui.test.performTextReplacement
import androidx.compose.ui.test.hasScrollToNodeAction
import androidx.compose.ui.test.hasText
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.LifecycleRegistry
import androidx.navigation3.runtime.NavBackStack
import app.pochical.DeviceSettings
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.PageNavigation
import app.pochical.PochicalTheme
import app.pochical.RootNavigator
import app.pochical.RootPage
import app.pochical.RootRoute
import app.pochical.RootTab
import app.pochical.Tabs
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.TestDays
import app.pochical.kit.ShownDay
import app.pochical.v1.pattern
import app.pochical.v1.repeatOrder
import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PatternPagesTest {
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

  /** The pages once a save that goes back has, after its write, gone back. */
  private fun awaitRoutes(vararg routes: RootRoute) = compose.waitUntil { navigator.routes == routes.toList() }

  /** 日勤 in an order from January, 遅番 in none, and 遅番 on two days of October. */
  private fun dayInAnOrderAndLateOnTwoDays() = runBlocking {
    test.edits.savePattern("day", pattern {
      name = "日勤"
      emoji = "☀️"
      symbol = "日"
      icon = "sun"
    })
    test.edits.savePattern("late", pattern {
      name = "遅番"
      emoji = "🌇"
      symbol = "遅"
      icon = "cloudMoon"
    })
    test.edits.setRepeatOrders(listOf(repeatOrder {
      start = "2026-01-01"
      sequence += "day"
      holidayCountry = "JP"
    }))
    test.edits.setDays(mapOf(LocalDate.parse("2026-10-02") to ShownDay("late"), LocalDate.parse("2026-10-03") to ShownDay("late")))
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

  private fun scrollTo(text: String) {
    compose.onNode(hasScrollToNodeAction()).performScrollToNode(hasText(text))
  }

  @Test
  fun aReadyPatternAddedBringsItsNextDay() {
    show(listOf(RootPage.Patterns, RootPage.AddPattern)) { AddPatternPage(navigation) }
    compose.onNodeWithText("当番").performClick()
    compose.onNodeWithText("追加").performClick()
    compose.waitForIdle()
    val calendar = test.awaitCalendar { it.patterns.size == 2 }
    assertEquals(listOf("duty" to "offDuty", "offDuty" to null), calendar.patterns.map { it.id to it.nextDay })
    awaitRoutes(Tabs, RootPage.Patterns)
  }

  @Test
  fun aPatternTheOrderInUseHasCanBeNeitherTurnedOffNorDeleted() {
    dayInAnOrderAndLateOnTwoDays()
    show(listOf(RootPage.Patterns, RootPage.PatternEditor("day"))) { PatternEditor("day", isNew = false, navigation) }
    scrollTo("入力に出す")
    compose.onNodeWithText("入力に出す").assertIsNotEnabled()
    compose.onNodeWithText("繰り返しの並びに入っているので、オフにしたり削除したりできません。先に「繰り返し」で並びを変えてください。").assertExists()
    compose.onNodeWithText("このパターンを削除").assertDoesNotExist()
  }

  @Test
  fun turningInputOffArchivesThePattern() {
    dayInAnOrderAndLateOnTwoDays()
    show(listOf(RootPage.Patterns, RootPage.PatternEditor("late"))) { PatternEditor("late", isNew = false, navigation) }
    scrollTo("入力に出す")
    compose.onNodeWithText("入力に出す").performClick()
    compose.onNodeWithText("保存").performClick()
    compose.waitForIdle()
    assertEquals(true, test.awaitCalendar { it.patterns.find { p -> p.id == "late" }?.archived == true }.patterns.last().archived)
    awaitRoutes(Tabs, RootPage.Patterns)
  }

  @Test
  fun deletingAPatternOnDaysSaysHowManyFirst() {
    dayInAnOrderAndLateOnTwoDays()
    show(listOf(RootPage.Patterns, RootPage.PatternEditor("late"))) { PatternEditor("late", isNew = false, navigation) }
    scrollTo("このパターンを削除")
    compose.onNodeWithText("このパターンを削除").performClick()
    compose.waitUntil { compose.onAllNodes(hasText("2日の予定", substring = true)).fetchSemanticsNodes().isNotEmpty() }
    compose.onNodeWithText("削除").performClick()
    compose.waitForIdle()
    assertEquals(listOf("day"), test.awaitCalendar { it.patterns.size == 1 }.patterns.map { it.id })
  }

  @Test
  fun aPatternMadeFromScratchTakesItsMarkFromItsNameAndGoesBackPastAdd() {
    show(listOf(RootPage.Patterns, RootPage.AddPattern, RootPage.PatternEditor("mine", isNew = true))) {
      PatternEditor("mine", isNew = true, navigation)
    }
    compose.onNode(hasSetTextAction()).performTextReplacement("夜勤")
    compose.onNodeWithText("追加").performClick()
    compose.waitForIdle()
    val made = test.awaitCalendar { it.patterns.isNotEmpty() }.patterns.single()
    assertEquals(listOf("夜勤", "🌙", "moon", "夜"), listOf(made.name, made.emoji, made.icon, made.symbol))
    awaitRoutes(Tabs, RootPage.Patterns)
  }
}
