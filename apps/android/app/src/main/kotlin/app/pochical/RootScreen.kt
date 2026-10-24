package app.pochical

import androidx.activity.compose.BackHandler
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffoldValue
import androidx.compose.material3.adaptive.navigationsuite.rememberNavigationSuiteScaffoldState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.ui.NavDisplay
import app.pochical.calendar.CalendarScreen
import app.pochical.calendar.ShiftChoicePage
import app.pochical.groups.GroupsActions
import app.pochical.groups.GroupsScreen
import app.pochical.groups.NewGroupPage
import java.time.LocalDate

/**
 * The tabs, under the pages `navigator` has over them: a page slides in from
 * the end over the screen under it, and a predictive back is Android's own.
 */
@Composable
fun RootScreen(navigator: RootNavigator) {
  NavDisplay(
    backStack = navigator.routes,
    onBack = navigator::back,
    transitionSpec = { slideInHorizontally { it } togetherWith slideOutHorizontally { -it / 4 } },
    popTransitionSpec = { slideInHorizontally { -it / 4 } togetherWith slideOutHorizontally { it } },
  ) { route ->
    when (route) {
      Tabs -> NavEntry(route) { TabsScreen(navigator, rememberPageNavigation(navigator)) }
      RootPage.Account -> NavEntry(route) { AccountPage(onBack = rememberPageNavigation(navigator)::back) }
      RootPage.Appearance ->
        NavEntry(route) { AppearancePage(onBack = rememberPageNavigation(navigator)::back) }
      RootPage.NewGroup ->
        NavEntry(route) { NewGroupPage(onBack = rememberPageNavigation(navigator)::back, onMade = { navigator.showGroup(it) }) }
      is RootPage.ShiftChoice ->
        NavEntry(route) {
          ShiftChoicePage(LocalDate.parse(route.date), onBack = rememberPageNavigation(navigator)::back)
        }
    }
  }
}

/** The tab shown, over the tab bar, each tab keeping what it showed as another is gone to. */
@Composable
private fun TabsScreen(navigator: RootNavigator, navigation: PageNavigation) {
  val tabStates = rememberSaveableStateHolder()
  BackHandler(enabled = navigator.backGoesToFirstTab, onBack = navigator::back)
  // The tab bar gives way to a day's week, as iOS's and /design's do.
  var barHidden by rememberSaveable { mutableStateOf(false) }
  val suite =
    rememberNavigationSuiteScaffoldState(
      if (barHidden) NavigationSuiteScaffoldValue.Hidden else NavigationSuiteScaffoldValue.Visible
    )
  LaunchedEffect(barHidden) { if (barHidden) suite.hide() else suite.show() }
  NavigationSuiteScaffold(
    state = suite,
    navigationSuiteItems = {
      RootTab.entries.forEach { tab ->
        val selected = tab == navigation.tab
        item(
          selected = selected,
          onClick = { navigation.select(tab) },
          icon = {
            Icon(painterResource(if (selected) tab.selectedIcon else tab.icon), contentDescription = null)
          },
          label = { Text(stringResource(tab.title)) },
        )
      }
    },
  ) {
    tabStates.SaveableStateProvider(navigation.tab) {
      when (navigation.tab) {
        RootTab.Calendar -> CalendarScreen(open = navigation::open, onDayOpen = { barHidden = it })
        RootTab.Groups ->
          GroupsScreen(navigator.openGroup, { navigator.openGroup = it }, GroupsActions(onNew = { navigation.open(RootPage.NewGroup) }))
        RootTab.Settings -> SettingsScreen(open = navigation::open)
      }
    }
  }
}
