package app.pochical

import androidx.activity.compose.BackHandler
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.runtime.Composable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.ui.NavDisplay

/** The tabs, under the pages `navigator` has over them. */
@Composable
fun RootScreen(navigator: RootNavigator) {
  NavDisplay(
    backStack = navigator.routes,
    onBack = navigator::back,
  ) { route ->
    when (route) {
      Tabs -> NavEntry(route) { TabsScreen(navigator) }
      RootPage.Appearance -> NavEntry(route) { AppearancePage(onBack = navigator::back) }
    }
  }
}

/** The tab shown, over the tab bar, each tab keeping what it showed as another is gone to. */
@Composable
private fun TabsScreen(navigator: RootNavigator) {
  val tabStates = rememberSaveableStateHolder()
  BackHandler(enabled = navigator.canGoBack, onBack = navigator::back)
  NavigationSuiteScaffold(
    navigationSuiteItems = {
      RootTab.entries.forEach { tab ->
        val selected = tab == navigator.tab
        item(
          selected = selected,
          onClick = { navigator.select(tab) },
          icon = {
            Icon(painterResource(if (selected) tab.selectedIcon else tab.icon), contentDescription = null)
          },
          label = { Text(stringResource(tab.title)) },
        )
      }
    },
  ) {
    tabStates.SaveableStateProvider(navigator.tab) {
      when (navigator.tab) {
        RootTab.Calendar -> CalendarScreen()
        RootTab.Groups -> GroupsScreen()
        RootTab.Settings -> SettingsScreen(open = navigator::open)
      }
    }
  }
}
