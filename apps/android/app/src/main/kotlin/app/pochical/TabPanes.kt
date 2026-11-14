package app.pochical

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.material3.adaptive.layout.PaneScaffoldDirective
import androidx.compose.material3.adaptive.layout.calculatePaneScaffoldDirective
import androidx.compose.material3.adaptive.navigation.BackNavigationBehavior
import androidx.compose.material3.adaptive.navigation3.ListDetailSceneStrategy
import androidx.compose.material3.adaptive.navigation3.LocalListDetailSceneScope
import androidx.compose.material3.adaptive.navigation3.LocalSupportingPaneSceneScope
import androidx.compose.material3.adaptive.navigation3.SupportingPaneSceneStrategy
import androidx.compose.material3.adaptive.navigation3.rememberListDetailSceneStrategy
import androidx.compose.material3.adaptive.navigation3.rememberSupportingPaneSceneStrategy
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation3.scene.SceneStrategy

/**
 * How the window is split into panes, the same for the tabs' pages and the calendar's day: two side
 * by side from an expanded width (a tablet on its side, a folding phone opened up, a window made
 * wide), one below it, a tablet upright and a folding phone folded included, and at a separating
 * hinge, as a book-style foldable's, one each side of it. Never stacked, as Material would stack
 * them on a tall narrow window or a phone half folded.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun paneDirective(): PaneScaffoldDirective =
  calculatePaneScaffoldDirective(currentWindowAdaptiveInfoV2()).copy(maxVerticalPartitions = 1, verticalPartitionSpacerSize = 0.dp)

/**
 * On a wide window グループ and 設定 keep the tabs at the start and open their pages beside them, as
 * Material's list-detail layout has it, while [tab] is one of them; the calendar keeps its day in a
 * supporting pane of its own (CalendarScreen), whose place シフト's list takes, as Material's
 * supporting pane layout has it (spec/calendar.md, On a wide screen), only while that list is [top],
 * as Material's scene would otherwise lay the tabs out alone beside an empty pane. A narrower window
 * keeps one page over the tabs, as a phone does.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun rememberTabPanes(tab: RootTab, top: RootRoute): SceneStrategy<RootRoute> {
  val directive = paneDirective()
  // A back takes the page on top, so the side beside the tabs closes its pages one by one, as on a phone.
  val list = rememberListDetailSceneStrategy<RootRoute>(backNavigationBehavior = BackNavigationBehavior.PopLatest, directive = directive)
  val supporting = rememberSupportingPaneSceneStrategy<RootRoute>(backNavigationBehavior = BackNavigationBehavior.PopLatest, directive = directive)
  val none = remember { SceneStrategy<RootRoute> { null } }
  return when {
    tab == RootTab.Calendar -> if (top is RootPage.ShiftChoice) supporting else none
    tab.noneOpen != null -> list
    else -> none
  }
}

/**
 * Where [route] goes on a wide window: the tabs at the start, saying what [tab] says while nothing
 * is open beside them, and the pages beside them; with the calendar, the tabs the main pane and
 * シフト's list the supporting one, in the place of the calendar's own pane. The tabs say both, as
 * an entry keeps what it was made with while another tab is gone to; the strategy for the tab
 * picks which is read, and the supporting scene's main pane takes the room its supporting one
 * leaves, whatever width the list-detail one asks of it.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
fun paneOf(route: RootRoute, tab: () -> RootTab): Map<String, Any> =
  when {
    route == Tabs ->
      ListDetailSceneStrategy.listPane(detailPlaceholder = { tab().noneOpen?.let { NoneOpenPane(it) } }) +
        ListDetailSceneStrategy.preferredPaneSize(width = TABS_WIDTH) +
        SupportingPaneSceneStrategy.mainPane()
    route is RootPage.ShiftChoice -> SupportingPaneSceneStrategy.supportingPane() + SupportingPaneSceneStrategy.preferredPaneSize(width = SUPPORTING_PANE_WIDTH)
    else -> ListDetailSceneStrategy.detailPane()
  }

/**
 * [route]'s screen, which in a pane keeps clear only of the window's edges it touches: the tabs of
 * those at the start, a page beside them of those at the end, so neither is set in from a cutout
 * or a navigation bar on the window's far side.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun InPane(route: RootRoute, content: @Composable () -> Unit) {
  val far =
    when {
      LocalListDetailSceneScope.current == null && LocalSupportingPaneSceneScope.current == null -> null
      route is Tabs -> WindowInsetsSides.End
      else -> WindowInsetsSides.Start
    }
  Box(if (far == null) Modifier else Modifier.consumeWindowInsets(WindowInsets.safeDrawing.only(far))) { content() }
}

/**
 * How wide the tabs stay beside their pages: the navigation rail's 96dp, and beside it the tab as
 * wide as a phone's screen (360dp, Material's compact width at its most common), as iOS keeps its
 * column as wide as a phone's.
 */
private val TABS_WIDTH = 96.dp + 360.dp

/**
 * How wide a supporting pane stands, the calendar's day and シフト's list in its place: Material's
 * fixed pane width, a phone's screen (spec/calendar.md, On a wide screen), the month taking the rest.
 */
val SUPPORTING_PANE_WIDTH = 360.dp

/** The side beside the tabs while none of their pages is open, as Material's empty states say it. */
@Composable
private fun NoneOpenPane(noneOpen: NoneOpen) {
  val colors = LocalThemeColors.current
  Column(
    Modifier.fillMaxSize(),
    verticalArrangement = Arrangement.Center,
    horizontalAlignment = Alignment.CenterHorizontally,
  ) {
    Icon(painterResource(noneOpen.icon), contentDescription = null, Modifier.size(48.dp), tint = colors.textTertiary)
    Text(stringResource(noneOpen.text), Modifier.padding(top = 12.dp), style = MaterialTheme.typography.titleMedium, color = colors.textSecondary)
  }
}
