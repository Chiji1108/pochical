package app.pochical

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.ExperimentalMaterial3AdaptiveApi
import androidx.compose.material3.adaptive.currentWindowAdaptiveInfoV2
import androidx.compose.material3.adaptive.layout.calculatePaneScaffoldDirective
import androidx.compose.material3.adaptive.navigation.BackNavigationBehavior
import androidx.compose.material3.adaptive.navigation3.ListDetailSceneStrategy
import androidx.compose.material3.adaptive.navigation3.rememberListDetailSceneStrategy
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.navigation3.scene.SceneStrategy

/**
 * On a wide window (an expanded width: a tablet, a folding phone opened up, a window made wide)
 * グループ and 設定 keep the tabs at the start and open their pages beside them, as Material's
 * list-detail layout has it; a narrower window, a folding phone folded included, keeps one page
 * over the tabs, as a phone does. One window's panes side by side only: never stacked, as Material
 * would stack them on a tall narrow one or a phone half folded.
 */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
@Composable
fun rememberTabPanes(): SceneStrategy<RootRoute> {
  val directive = calculatePaneScaffoldDirective(currentWindowAdaptiveInfoV2()).copy(maxVerticalPartitions = 1, verticalPartitionSpacerSize = 0.dp)
  // A back takes the page on top, so the side beside the tabs closes its pages one by one, as on a phone.
  return rememberListDetailSceneStrategy(backNavigationBehavior = BackNavigationBehavior.PopLatest, directive = directive)
}

/** Where [route] goes on a wide window while [tab] shows: the tabs and their pages side by side, or nowhere apart. */
@OptIn(ExperimentalMaterial3AdaptiveApi::class)
fun paneOf(route: RootRoute, tab: RootTab): Map<String, Any> {
  val noneOpen = tab.noneOpen ?: return emptyMap()
  return when (route) {
    Tabs ->
      ListDetailSceneStrategy.listPane(detailPlaceholder = { NoneOpenPane(noneOpen) }) +
        ListDetailSceneStrategy.preferredPaneSize(width = TABS_WIDTH)
    is RootPage -> ListDetailSceneStrategy.detailPane()
  }
}

/**
 * How wide the tabs stay beside their pages: the navigation rail's 96dp, and beside it the tab as
 * wide as a phone's screen (360dp, Material's compact width at its most common), as iOS keeps its
 * column as wide as a phone's.
 */
private val TABS_WIDTH = 96.dp + 360.dp

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
