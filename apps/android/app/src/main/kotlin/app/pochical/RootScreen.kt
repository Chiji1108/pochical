package app.pochical

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteItem
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffold
import androidx.compose.material3.adaptive.navigationsuite.NavigationSuiteScaffoldValue
import androidx.compose.material3.adaptive.navigationsuite.rememberNavigationSuiteScaffoldState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSaveableStateHolder
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation3.runtime.NavEntry
import androidx.navigation3.runtime.rememberDecoratedNavEntries
import androidx.navigation3.runtime.rememberSaveableStateHolderNavEntryDecorator
import androidx.navigation3.ui.NavDisplay
import app.pochical.calendar.CalendarScreen
import app.pochical.calendar.LocalOwnDays
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
import app.pochical.groups.NewGroupPage
import app.pochical.groups.ScanScreen
import app.pochical.kit.AppLink
import app.pochical.kit.GROUP_THREAD
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
 * On a wide window グループ's and 設定's pages open beside the tabs instead (TabPanes).
 */
@Composable
fun RootScreen(navigator: RootNavigator) {
  val links = LocalOpenedLinks.current
  val values = LocalValues.current
  val ownDays = LocalOwnDays.current
  val groups by remember(values) { values.groups() }.collectAsStateWithLifecycle(null)
  // What a link opens: an invitation over whatever shows; a day in the calendar, or the next day
  // off as the days are now; a group, at a day in its table, or once the person has left it,
  // グループ on the first of their groups; a chat's notification, the chat over its group in
  // グループ once the device holds the group, or Pochical's people's over 設定.
  LaunchedEffect(links.pending, groups) {
    when (val link = links.pending) {
      is AppLink.Invite -> navigator.openOnce(RootPage.Join(link.code))
      is AppLink.Day -> navigator.showDay(link.day)
      AppLink.Today -> navigator.showDay(LocalDate.now())
      AppLink.NextOff -> navigator.showDay(ownDays.calendar.value.nextDayOff(LocalDate.now()))
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
          // Once the device holds the group, which may come after the notification, as iOS waits.
          if (groups.orEmpty().none { it.id == link.groupId }) return@LaunchedEffect
          navigator.showGroup(link.groupId, RootPage.Chat(link.groupId, link.threadId))
        }
      null -> return@LaunchedEffect
    }
    links.consume()
  }
  val motion = rememberPageMotion()
  val push = remember(motion) { motion.push<RootRoute>() }
  val pop = remember(motion) { motion.pop<RootRoute>() }
  val predictivePop = remember(motion) { motion.predictivePop<RootRoute>() }
  // Made again as the tab changes too, not only the pages, as where the tabs go on a wide window is the tab's.
  val routes = navigator.routes
  val tab = navigator.tab
  val entries =
    remember(routes, tab) {
      routes.map { route -> NavEntry(route, metadata = paneOf(route, tab)) { Page(route, navigator) } }
    }
  NavDisplay(
    entries = rememberDecoratedNavEntries(entries, listOf(rememberSaveableStateHolderNavEntryDecorator())),
    onBack = navigator::back,
    // On the theme's ground, so what shows through as a page fades is the テーマ's, not the window's.
    modifier = Modifier.background(MaterialTheme.colorScheme.background),
    sceneStrategies = listOf(rememberTabPanes()),
    transitionSpec = push,
    popTransitionSpec = pop,
    predictivePopTransitionSpec = predictivePop,
  )
}

/** What [route] shows. */
@Composable
private fun Page(route: RootRoute, navigator: RootNavigator) {
  when (route) {
    Tabs -> TabsScreen(navigator, rememberPageNavigation(navigator))
    RootPage.Account -> AccountPage(onBack = rememberPageNavigation(navigator)::back)
    RootPage.Appearance ->
      AppearancePage(onBack = rememberPageNavigation(navigator)::back)
    RootPage.Style -> StylePage(onBack = rememberPageNavigation(navigator)::back)
    RootPage.ChatNotifications ->
      ChatNotificationsPage(onBack = rememberPageNavigation(navigator)::back)
    RootPage.Reminders -> RemindersPage(rememberPageNavigation(navigator))
    is RootPage.ReminderEditor -> ReminderEditorPage(route.id, rememberPageNavigation(navigator))
    RootPage.CalendarSettings -> CalendarSettingsPage(onBack = rememberPageNavigation(navigator)::back)
    is RootPage.MonthPicture ->
      MonthPicturePage(java.time.YearMonth.parse(route.month), onBack = rememberPageNavigation(navigator)::back)
    is RootPage.DeviceCalendar ->
      DeviceCalendarPage(java.time.YearMonth.parse(route.month), rememberPageNavigation(navigator))
    is RootPage.DeviceCalendarPatterns ->
      DeviceCalendarPatternsPage(java.time.YearMonth.parse(route.month), onBack = rememberPageNavigation(navigator)::back)
    RootPage.NewGroup ->
      {
        NewGroupPage(onBack = rememberPageNavigation(navigator)::back, onMade = { navigator.showGroup(it, RootPage.GroupInvite(it)) })
      }
    RootPage.Scan ->
      {
        val navigation = rememberPageNavigation(navigator)
        ScanScreen(onClose = navigation::back, onInvite = { navigation.replace(RootPage.Join(it)) })
      }
    is RootPage.Join ->
      {
        JoinScreen(route.code, onClose = rememberPageNavigation(navigator)::back, onGroup = { navigator.showGroup(it) })
      }
    is RootPage.GroupInvite -> InvitePage(route.groupId, onBack = rememberPageNavigation(navigator)::back)
    is RootPage.GroupSettings ->
      {
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
      {
        val navigation = rememberPageNavigation(navigator)
        GroupShiftsPage(
          route.groupId,
          route.date?.let(LocalDate::parse),
          onBack = navigation::back,
          onShare = { day -> navigation.openChat(RootPage.Chat(route.groupId, GROUP_THREAD, sharing = day.toString())) },
        )
      }
    is RootPage.Chat ->
      {
        val navigation = rememberPageNavigation(navigator)
        ChatPage(route.groupId, route.threadId, onBack = navigation::back, open = navigation::open, sharing = route.sharing?.let(LocalDate::parse))
      }
    is RootPage.ChatPhotos -> ChatPhotosPage(route.groupId, route.threadId, onBack = rememberPageNavigation(navigator)::back)
    is RootPage.GroupEdit -> GroupEditPage(route.groupId, onBack = rememberPageNavigation(navigator)::back)
    is RootPage.GroupProfile -> GroupProfilePage(route.groupId, onBack = rememberPageNavigation(navigator)::back)
    is RootPage.ShiftChoice ->
      {
        ShiftChoicePage(LocalDate.parse(route.date), onBack = rememberPageNavigation(navigator)::back)
      }
    RootPage.Patterns -> PatternsPage(rememberPageNavigation(navigator))
    RootPage.AddPattern -> AddPatternPage(rememberPageNavigation(navigator))
    is RootPage.PatternEditor ->
      PatternEditor(route.id, route.isNew, rememberPageNavigation(navigator))
    RootPage.Repeat -> RepeatPage(rememberPageNavigation(navigator))
    is RootPage.RepeatPeriod -> RepeatPeriodPage(route.start, rememberPageNavigation(navigator))
    is RootPage.RepeatEditor -> RepeatEditor(route.mode, rememberPageNavigation(navigator))
    RootPage.StopRepeat -> StopRepeatPage(rememberPageNavigation(navigator))
    RootPage.JobChange -> JobChangePage(rememberPageNavigation(navigator))
    RootPage.Coworkers -> CoworkersPage(rememberPageNavigation(navigator))
    RootPage.Profile -> ProfilePage(rememberPageNavigation(navigator))
    is RootPage.CoworkerEditor -> CoworkerEditorPage(route.id, rememberPageNavigation(navigator))
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
  // Read once over the tabs, for their badges and the group rail's.
  val unread = rememberNotifyingUnread()
  val badges = tabBadges(unread)
  // Material 3 Expressive's navigation suite: its short bar on a phone, its wide rail on a larger
  // window, rather than the older bar and rail.
  NavigationSuiteScaffold(
    state = suite,
    navigationItems = {
      RootTab.entries.forEach { tab ->
        val selected = tab == navigation.tab
        NavigationSuiteItem(
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
    CompositionLocalProvider(LocalNotifyingUnread provides unread) {
      tabStates.SaveableStateProvider(navigation.tab) {
        when (navigation.tab) {
          RootTab.Calendar ->
            CalendarScreen(
              open = navigation::show,
              hidesTabBar = { barHidden = it },
              opening = navigator.openingDay,
              onOpening = { navigator.openingDay = null },
            )
          RootTab.Groups ->
            GroupsScreen(navigator.openGroup, navigation::pickGroup, GroupsActions(onNew = { navigation.show(RootPage.NewGroup) }, onScan = { navigation.show(RootPage.Scan) }, onShifts = { id, day -> navigation.show(RootPage.GroupShifts(id, day?.toString())) }, onChat = { id, thread -> navigation.show(RootPage.Chat(id, thread)) }) { group -> GroupButtons(group.id, navigation::show) })
          RootTab.Settings -> SettingsScreen(open = navigation::show)
        }
      }
    }
  }
}
