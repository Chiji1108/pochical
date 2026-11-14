package app.pochical

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
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
 * and a phone on its side, wide but short.
 */
@RunWith(RobolectricTestRunner::class)
class WindowSizesTest {
  @get:Rule val compose = createComposeRule()

  private fun window(qualifiers: String) = RuntimeEnvironment.setQualifiers(qualifiers)

  /** グループ with a chat open, as RootScreen lays it out: the tabs, and the page over or beside them. */
  private fun groupsWithAPage() = tabWithAPage(RootTab.Groups, RootPage.Chat("g", "t"))

  /** [tab] with [page] open, as RootScreen lays it out. */
  private fun tabWithAPage(tab: RootTab, page: RootPage) {
    val navigator = RootNavigator(NavBackStack(page), mutableStateOf(tab))
    compose.setContent {
      NavDisplay(backStack = navigator.routes, onBack = navigator::back, sceneStrategies = listOf(rememberTabPanes(navigator.tab, navigator.routes.last()))) { route ->
        NavEntry(route, route.toString(), paneOf(route) { navigator.tab }) {
          Text(if (route == Tabs) "tabs" else "page", Modifier.fillMaxSize())
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
}

private val DpRect.across
  get() = (right - left).value

private val DpRect.down
  get() = (bottom - top).value
