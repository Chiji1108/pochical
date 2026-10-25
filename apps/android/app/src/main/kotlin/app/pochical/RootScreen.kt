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
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.ui.NavDisplay
import app.pochical.calendar.CalendarScreen
import app.pochical.calendar.ShiftChoicePage
import app.pochical.chat.ChatPage
import app.pochical.chat.ChatPhotosPage
import app.pochical.design.Chat
import app.pochical.groups.GroupButtons
import app.pochical.groups.GroupEditPage
import app.pochical.groups.GroupProfilePage
import app.pochical.groups.GroupSettingsPage
import app.pochical.groups.GroupShiftsPage
import app.pochical.groups.GroupsActions
import app.pochical.groups.GroupsScreen
import app.pochical.groups.InvitePage
import app.pochical.groups.JoinScreen
import app.pochical.groups.LocalValues
import app.pochical.kit.AppLink
import app.pochical.groups.NewGroupPage
import app.pochical.groups.ScanScreen
import app.pochical.notifications.ChatNotificationsPage
import app.pochical.patterns.AddPatternPage
import app.pochical.patterns.PatternEditor
import app.pochical.patterns.PatternsPage
import app.pochical.people.CoworkerEditorPage
import app.pochical.people.CoworkersPage
import app.pochical.people.ProfilePage
import app.pochical.reminders.ReminderEditorPage
import app.pochical.reminders.RemindersPage
import app.pochical.repeat.JobChangePage
import app.pochical.repeat.RepeatEditor
import app.pochical.repeat.RepeatPage
import app.pochical.repeat.RepeatPeriodPage
import app.pochical.repeat.StopRepeatPage
import java.time.LocalDate

/**
 * The tabs, under the pages `navigator` has over them: a page slides in from
 * the end over the screen under it, and a predictive back is Android's own.
 */
@Composable
fun RootScreen(navigator: RootNavigator) {
  val links = LocalOpenedLinks.current
  val values = LocalValues.current
  val groups by remember(values) { values.groups() }.collectAsState(null)
  // What a link opens: an invitation over whatever shows; a day in the calendar; a group, at a
  // day in its table, or once the person has left it, グループ on the first of their groups; a
  // chat's notification, the chat over its group in グループ, or Pochical's people's over 設定.
  LaunchedEffect(links.pending, groups) {
    when (val link = links.pending) {
      is AppLink.Invite -> navigator.openOnce(RootPage.Join(link.code))
      is AppLink.Day -> navigator.showDay(link.day)
      is AppLink.Group -> {
        val known = groups ?: return@LaunchedEffect
        if (link.day != null && known.any { it.id == link.groupId }) {
          navigator.showGroup(link.groupId, RootPage.GroupShifts(link.groupId, link.day.toString()))
        } else {
          navigator.showGroup(link.groupId)
        }
      }
      is AppLink.Chat ->
        if (link.groupId == Chat.supportPlace) {
          navigator.showOver(RootTab.Settings, RootPage.Chat(link.groupId, link.threadId))
        } else {
          val known = groups ?: return@LaunchedEffect
          if (known.any { it.id == link.groupId }) {
            navigator.showGroup(link.groupId, RootPage.Chat(link.groupId, link.threadId))
          } else {
            navigator.showGroup(link.groupId)
          }
        }
      null -> return@LaunchedEffect
    }
    links.consume()
  }
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
      RootPage.Style -> NavEntry(route) { StylePage(onBack = rememberPageNavigation(navigator)::back) }
      RootPage.ChatNotifications ->
        NavEntry(route) { ChatNotificationsPage(onBack = rememberPageNavigation(navigator)::back) }
      RootPage.Reminders -> NavEntry(route) { RemindersPage(rememberPageNavigation(navigator)) }
      is RootPage.ReminderEditor -> NavEntry(route) { ReminderEditorPage(route.id, rememberPageNavigation(navigator)) }
      RootPage.CalendarSettings -> NavEntry(route) { CalendarSettingsPage(onBack = rememberPageNavigation(navigator)::back) }
      is RootPage.MonthPicture ->
        NavEntry(route) { MonthPicturePage(java.time.YearMonth.parse(route.month), onBack = rememberPageNavigation(navigator)::back) }
      RootPage.NewGroup ->
        NavEntry(route) {
          NewGroupPage(onBack = rememberPageNavigation(navigator)::back, onMade = { navigator.showGroup(it, RootPage.GroupInvite(it)) })
        }
      RootPage.Scan ->
        NavEntry(route) {
          val navigation = rememberPageNavigation(navigator)
          ScanScreen(onClose = navigation::back, onInvite = { navigation.replace(RootPage.Join(it)) })
        }
      is RootPage.Join ->
        NavEntry(route) {
          JoinScreen(route.code, onClose = rememberPageNavigation(navigator)::back, onGroup = { navigator.showGroup(it) })
        }
      is RootPage.GroupInvite -> NavEntry(route) { InvitePage(route.groupId, onBack = rememberPageNavigation(navigator)::back) }
      is RootPage.GroupSettings ->
        NavEntry(route) {
          val navigation = rememberPageNavigation(navigator)
          GroupSettingsPage(
            route.groupId,
            onBack = navigation::back,
            onEdit = { navigation.open(RootPage.GroupEdit(route.groupId)) },
            onProfile = { navigation.open(RootPage.GroupProfile(route.groupId)) },
            onInvite = { navigation.open(RootPage.GroupInvite(route.groupId)) },
            onLeft = navigator::closePages,
            onMessage = { thread -> navigation.open(RootPage.Chat(route.groupId, thread)) },
          )
        }
      is RootPage.GroupShifts ->
        NavEntry(route) { GroupShiftsPage(route.groupId, route.date?.let(LocalDate::parse), onBack = rememberPageNavigation(navigator)::back) }
      is RootPage.Chat ->
        NavEntry(route) {
          val navigation = rememberPageNavigation(navigator)
          ChatPage(route.groupId, route.threadId, onBack = navigation::back, open = navigation::open)
        }
      is RootPage.ChatPhotos -> NavEntry(route) { ChatPhotosPage(route.groupId, route.threadId, onBack = rememberPageNavigation(navigator)::back) }
      is RootPage.GroupEdit ->NavEntry(route) { GroupEditPage(route.groupId, onBack = rememberPageNavigation(navigator)::back) }
      is RootPage.GroupProfile -> NavEntry(route) { GroupProfilePage(route.groupId, onBack = rememberPageNavigation(navigator)::back) }
      is RootPage.ShiftChoice ->
        NavEntry(route) {
          ShiftChoicePage(LocalDate.parse(route.date), onBack = rememberPageNavigation(navigator)::back)
        }
      RootPage.Patterns -> NavEntry(route) { PatternsPage(rememberPageNavigation(navigator)) }
      RootPage.AddPattern -> NavEntry(route) { AddPatternPage(rememberPageNavigation(navigator)) }
      is RootPage.PatternEditor ->
        NavEntry(route) { PatternEditor(route.id, route.isNew, rememberPageNavigation(navigator)) }
      RootPage.Repeat -> NavEntry(route) { RepeatPage(rememberPageNavigation(navigator)) }
      is RootPage.RepeatPeriod -> NavEntry(route) { RepeatPeriodPage(route.start, rememberPageNavigation(navigator)) }
      is RootPage.RepeatEditor -> NavEntry(route) { RepeatEditor(route.mode, rememberPageNavigation(navigator)) }
      RootPage.StopRepeat -> NavEntry(route) { StopRepeatPage(rememberPageNavigation(navigator)) }
      RootPage.JobChange -> NavEntry(route) { JobChangePage(rememberPageNavigation(navigator)) }
      RootPage.Coworkers -> NavEntry(route) { CoworkersPage(rememberPageNavigation(navigator)) }
      RootPage.Profile -> NavEntry(route) { ProfilePage(rememberPageNavigation(navigator)) }
      is RootPage.CoworkerEditor -> NavEntry(route) { CoworkerEditorPage(route.id, rememberPageNavigation(navigator)) }
    }
  }
}

/** The tab shown, over the tab bar, each tab keeping what it showed as another is gone to. */
@Composable
private fun TabsScreen(navigator: RootNavigator, navigation: PageNavigation) {
  val tabStates = rememberSaveableStateHolder()
  BackHandler(enabled = navigator.backGoesToFirstTab, onBack = navigator::back)
  // The tab bar gives way to a day's week and to ポチポチ入力's tray, as iOS's and /design's do.
  var barHidden by rememberSaveable { mutableStateOf(false) }
  val suite =
    rememberNavigationSuiteScaffoldState(
      if (barHidden) NavigationSuiteScaffoldValue.Hidden else NavigationSuiteScaffoldValue.Visible
    )
  LaunchedEffect(barHidden) { if (barHidden) suite.hide() else suite.show() }
  val badges = rememberTabBadges()
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
          badge = tabBadge(badges[tab] ?: 0),
        )
      }
    },
  ) {
    tabStates.SaveableStateProvider(navigation.tab) {
      when (navigation.tab) {
        RootTab.Calendar ->
          CalendarScreen(
            open = navigation::open,
            hidesTabBar = { barHidden = it },
            opening = navigator.openingDay,
            onOpening = { navigator.openingDay = null },
          )
        RootTab.Groups ->
          GroupsScreen(navigator.openGroup, { navigator.openGroup = it }, GroupsActions(onNew = { navigation.open(RootPage.NewGroup) }, onScan = { navigation.open(RootPage.Scan) }, onShifts = { id, day -> navigation.open(RootPage.GroupShifts(id, day?.toString())) }, onChat = { id, thread -> navigation.open(RootPage.Chat(id, thread)) }) { group -> GroupButtons(group.id, navigation::open) })
        RootTab.Settings -> SettingsScreen(open = navigation::open)
      }
    }
  }
}
