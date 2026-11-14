package app.pochical

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
 * and a phone on its side, wide but short; and a page's content, kept to its width on all but a phone.
 */
@RunWith(RobolectricTestRunner::class)
class WindowSizesTest {
  @get:Rule val compose = createComposeRule()

  private fun window(qualifiers: String) = RuntimeEnvironment.setQualifiers(qualifiers)

  /** グループ with a chat open, as RootScreen lays it out: the tabs, and the page over or beside them. */
  private fun groupsWithAPage(page: @Composable () -> Unit = { Text("page", Modifier.fillMaxSize()) }) {
    val navigator = RootNavigator(NavBackStack(RootPage.Chat("g", "t")), mutableStateOf(RootTab.Groups))
    compose.setContent {
      NavDisplay(backStack = navigator.routes, onBack = navigator::back, sceneStrategies = listOf(rememberTabPanes(navigator.tab))) { route ->
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
