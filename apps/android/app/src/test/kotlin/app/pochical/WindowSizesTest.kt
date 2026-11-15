package app.pochical

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.mutableStateOf
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.DpRect
import androidx.compose.ui.unit.dp
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.ui.NavDisplay
import app.pochical.calendar.Pattern
import app.pochical.calendar.PatternKeys
import app.pochical.calendar.rememberKeyPages
import app.pochical.design.Metrics
import app.pochical.kit.DeviceSettings
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment

/**
 * The layouts that change with the window, at each of Material's width classes (spec/chat.md, The
 * chat's page): a phone's (compact), a tablet upright (medium), a tablet on its side (expanded),
 * and a phone on its side, wide but short; and a page's content, kept to its width on all but a phone.
 */
@RunWith(RobolectricTestRunner::class)
class WindowSizesTest {
  @get:Rule val compose = createComposeRule()

  private fun window(qualifiers: String) = RuntimeEnvironment.setQualifiers(qualifiers)

  /** グループ with a chat open, as RootScreen lays it out: the tabs, and the page over or beside them. */
  private fun groupsWithAPage(page: @Composable () -> Unit = { Text("page", Modifier.fillMaxSize()) }) =
    tabWithAPage(RootTab.Groups, RootPage.Chat("g", "t"), page)

  /** [tab] with [route] open, as RootScreen lays it out, [route] showing [page]. */
  private fun tabWithAPage(tab: RootTab, route: RootPage, page: @Composable () -> Unit = { Text("page", Modifier.fillMaxSize()) }) {
    val navigator = RootNavigator(NavBackStack(route), mutableStateOf(tab))
    compose.setContent {
      NavDisplay(backStack = navigator.routes, onBack = navigator::back, sceneStrategies = listOf(rememberTabPanes(navigator.tab, navigator.routes.last()))) { route ->
        NavEntry(route, route.toString(), paneOf(route) { navigator.tab }) {
          if (route == Tabs) Text("tabs", Modifier.fillMaxSize()) else page()
        }
      }
    }
  }

  @Test
  fun aPhoneShowsThePageOverTheTabs() {
    window("w411dp-h891dp")
    groupsWithAPage()
    compose.onNodeWithText("page").assertIsDisplayed()
    compose.onNodeWithText("tabs").assertDoesNotExist()
  }

  @Test
  fun aTabletUprightKeepsAPhonesLayout() {
    window("w800dp-h1280dp")
    groupsWithAPage()
    compose.onNodeWithText("page").assertIsDisplayed()
    compose.onNodeWithText("tabs").assertDoesNotExist()
  }

  @Test
  fun aTabletOnItsSideOpensThePageBesideTheTabs() {
    window("w1280dp-h800dp")
    groupsWithAPage()
    val tabs = compose.onNodeWithText("tabs").assertIsDisplayed().getUnclippedBoundsInRoot()
    val page = compose.onNodeWithText("page").assertIsDisplayed().getUnclippedBoundsInRoot()
    // Side by side, never stacked: the tabs as wide as the rail and a phone's screen.
    assertEquals(456.dp.value, tabs.across, 1f)
    assertTrue(page.left >= tabs.right)
    assertEquals(tabs.top, page.top)
  }

  @Test
  fun aTabletOnItsSideOpensTheShiftListInTheCalendarsPane() {
    window("w1280dp-h800dp")
    tabWithAPage(RootTab.Calendar, RootPage.ShiftChoice("2026-11-20"))
    val tabs = compose.onNodeWithText("tabs").assertIsDisplayed().getUnclippedBoundsInRoot()
    val page = compose.onNodeWithText("page").assertIsDisplayed().getUnclippedBoundsInRoot()
    // The list as wide as the calendar's own pane, the tabs taking the rest (spec/calendar.md, On a wide screen).
    assertEquals(SUPPORTING_PANE_WIDTH.value, page.across, 1f)
    assertTrue(tabs.across > 456f)
    assertTrue(page.left >= tabs.right)
  }

  @Test
  fun aTabletUprightPushesTheShiftListOverTheCalendar() {
    window("w800dp-h1280dp")
    tabWithAPage(RootTab.Calendar, RootPage.ShiftChoice("2026-11-20"))
    compose.onNodeWithText("page").assertIsDisplayed()
    compose.onNodeWithText("tabs").assertDoesNotExist()
  }

  /** A page as every page is laid out, a field across what it holds. */
  @Composable
  private fun aPage(fillsWidth: Boolean = false) =
    PageScaffold(topBar = { Text("bar", Modifier.fillMaxWidth().testTag("bar")) }, fillsWidth = fillsWidth) { padding ->
      Text("field", Modifier.fillMaxWidth().padding(padding).testTag("field"))
    }

  private fun aPageIn(qualifiers: String, fillsWidth: Boolean = false): Pair<DpRect, DpRect> {
    window(qualifiers)
    compose.setContent { aPage(fillsWidth) }
    return compose.onNodeWithTag("bar").getUnclippedBoundsInRoot() to compose.onNodeWithTag("field").getUnclippedBoundsInRoot()
  }

  @Test
  fun aPageFillsAPhone() {
    val (bar, field) = aPageIn("w411dp-h891dp")
    assertEquals(411f, bar.across, 1f)
    assertEquals(411f, field.across, 1f)
  }

  @Test
  fun aPageKeepsToItsWidthInTheMiddleOfATabletUpright() {
    val (bar, field) = aPageIn("w800dp-h1280dp")
    // The bar across the window, what the page holds no wider than PageMaxWidth, in the middle.
    assertEquals(800f, bar.across, 1f)
    assertEquals(PageMaxWidth.value, field.across, 1f)
    assertEquals(100f, field.left.value, 1f)
  }

  @Test
  fun aPageThatFillsTheWidthFillsATablet() {
    val (_, field) = aPageIn("w800dp-h1280dp", fillsWidth = true)
    assertEquals(800f, field.across, 1f)
  }

  @Test
  fun aPageBesideTheTabsKeepsToItsWidthInTheMiddleOfItsSide() {
    window("w1280dp-h800dp")
    groupsWithAPage { aPage() }
    val tabs = compose.onNodeWithText("tabs").getUnclippedBoundsInRoot()
    val bar = compose.onNodeWithTag("bar").getUnclippedBoundsInRoot()
    val field = compose.onNodeWithTag("field").getUnclippedBoundsInRoot()
    assertTrue(bar.left >= tabs.right)
    assertTrue(bar.across > PageMaxWidth.value)
    assertEquals(PageMaxWidth.value, field.across, 1f)
    assertEquals((bar.left + bar.right).value / 2, (field.left + field.right).value / 2, 1f)
  }

  @Test
  fun aPagesFootKeepsToItsWidthWithWhatItHolds() {
    window("w800dp-h1280dp")
    compose.setContent {
      PageScaffold(topBar = {}, bottomBar = { Text("foot", Modifier.fillMaxWidth().testTag("foot")) }) { padding ->
        Text("field", Modifier.fillMaxWidth().padding(padding).testTag("field"))
      }
    }
    val foot = compose.onNodeWithTag("foot").getUnclippedBoundsInRoot()
    val field = compose.onNodeWithTag("field").getUnclippedBoundsInRoot()
    assertEquals(PageMaxWidth.value, foot.across, 1f)
    assertEquals(field.left.value, foot.left.value, 1f)
  }

  @Test
  fun aPageWithoutAFootEndsAboveTheWindowsInsets() {
    window("w800dp-h1280dp")
    compose.setContent {
      PageScaffold(topBar = {}, contentWindowInsets = WindowInsets(bottom = 48.dp)) { padding ->
        Box(Modifier.fillMaxSize().padding(padding).testTag("field"))
      }
    }
    assertEquals(1280f - 48f, compose.onNodeWithTag("field").getUnclippedBoundsInRoot().bottom.value, 1f)
  }

  private fun pageDialog() =
    compose.setContent { PageDialog(onDismissRequest = {}) { Text("dialog", Modifier.fillMaxSize().testTag("dialog")) } }

  @Test
  fun aPageDialogFillsAPhone() {
    window("w411dp-h891dp")
    pageDialog()
    val bounds = compose.onNodeWithTag("dialog").getUnclippedBoundsInRoot()
    assertEquals(411f, bounds.across, 1f)
  }

  private fun aBasicDialogIn(qualifiers: String) {
    window(qualifiers)
    pageDialog()
    val bounds = compose.onNodeWithTag("dialog").getUnclippedBoundsInRoot()
    assertEquals(560f, bounds.across, 1f)
    assertEquals(720f, bounds.down, 1f)
  }

  @Test fun aPageDialogIsABasicDialogOnATabletUpright() = aBasicDialogIn("w800dp-h1280dp")

  @Test fun aPageDialogIsABasicDialogOnATabletOnItsSide() = aBasicDialogIn("w1280dp-h800dp")

  @Test
  fun aPageDialogFillsAPhoneOnItsSide() {
    window("w891dp-h411dp")
    pageDialog()
    val bounds = compose.onNodeWithTag("dialog").getUnclippedBoundsInRoot()
    assertEquals(891f, bounds.across, 1f)
  }

  /** 設定's 繰り返し row, its value 6日ごと, in a window of [qualifiers]. */
  private fun aSettingsRowIn(qualifiers: String): Pair<DpRect, DpRect> {
    window(qualifiers)
    compose.setContent { SettingsRow("繰り返し", R.drawable.ic_repeat, onClick = {}, value = "6日ごと") }
    // The row reads as one, so its words are found in the tree unmerged.
    return compose.onNodeWithText("繰り返し", useUnmergedTree = true).getUnclippedBoundsInRoot() to
      compose.onNodeWithText("6日ごと", useUnmergedTree = true).getUnclippedBoundsInRoot()
  }

  @Test
  fun aSettingsRowsValueEndsItOnAPhone() {
    val (headline, value) = aSettingsRowIn("w360dp-h780dp")
    // Beside the headline, on its line (spec/calendar.md, In a narrow window).
    assertTrue(value.left >= headline.right)
    assertTrue(value.top < headline.bottom)
  }

  @Test
  fun aSettingsRowsValueGoesUnderItsHeadlineInAWindowNarrowerThanAPhone() {
    val (headline, value) = aSettingsRowIn("w280dp-h780dp")
    // Under the headline, from where it starts, which keeps to one line.
    assertTrue(value.top >= headline.bottom)
    assertEquals(headline.left.value, value.left.value, 1f)
    assertTrue(headline.down < 2 * value.down)
  }

  @Test
  fun aSettingsRowsControlStaysAtItsEndInAWindowNarrowerThanAPhone() {
    window("w280dp-h780dp")
    compose.setContent { SettingsRow("リマインド", R.drawable.ic_repeat, onClick = null, endContent = { Text("switch") }) }
    val headline = compose.onNodeWithText("リマインド", useUnmergedTree = true).getUnclippedBoundsInRoot()
    val control = compose.onNodeWithText("switch", useUnmergedTree = true).getUnclippedBoundsInRoot()
    // A switch, a handle or a spinner ends the row at every width, beside the headline.
    assertTrue(control.left >= headline.right)
    assertTrue(control.top < headline.bottom)
  }

  /** ポチポチ入力's keys for ten patterns, k1 to k10, at the screen's margins in a window of [qualifiers]. */
  private fun tenKeysIn(qualifiers: String) {
    window(qualifiers)
    val patterns = (1..10).map { Pattern(id = "k$it", name = "k$it", icon = "", emoji = "", symbol = "k", color = 0, time = null, countsAsOff = false) }
    compose.setContent {
      CompositionLocalProvider(LocalDeviceSettings provides DeviceSettingsState(DeviceSettings()) {}) {
        Box(Modifier.padding(horizontal = 16.dp)) { PatternKeys(patterns, rememberKeyPages(patterns.size)) {} }
      }
    }
  }

  @Test
  fun aPhonesTrayHoldsTenKeysOnAPage() {
    tenKeysIn("w360dp-h780dp")
    compose.onNodeWithText("k10").assertIsDisplayed()
  }

  @Test
  fun aTrayInAWindowNarrowerThanAPhoneHoldsFewerKeysAFingerWide() {
    tenKeysIn("w280dp-h780dp")
    // Four columns of two rows, the rest on the next page (spec/calendar.md, In a narrow window).
    compose.onNodeWithText("k8").assertIsDisplayed()
    compose.onNodeWithText("k9").assertDoesNotExist()
    assertTrue(compose.onNodeWithText("k1").getUnclippedBoundsInRoot().across >= Metrics.touch.value)
  }
}

private val DpRect.across
  get() = (right - left).value

private val DpRect.down
  get() = (bottom - top).value
