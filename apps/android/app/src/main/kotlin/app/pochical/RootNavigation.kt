package app.pochical

import androidx.annotation.DrawableRes
import androidx.annotation.StringRes
import androidx.compose.runtime.Composable
import androidx.compose.runtime.MutableState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSerializable
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.navigation3.runtime.NavBackStack
import androidx.navigation3.runtime.NavKey
import androidx.navigation3.runtime.serialization.NavBackStackSerializer
import app.pochical.repeat.RepeatMode
import java.time.LocalDate
import kotlinx.serialization.Serializable

// The app's one navigation, as iOS's RootNavigation: every page is pushed
// over the tabs rather than inside one, so the tab bar goes away with the
// screen under it as the page comes, and comes back as it goes, a
// predictive back included (spec/chat.md, The chat's page).

/** The app's tabs, as /design's tab bar has them, the first the one the app opens on. */
enum class RootTab(
  @param:StringRes val title: Int,
  @param:DrawableRes val icon: Int,
  @param:DrawableRes val selectedIcon: Int,
) {
  Calendar(R.string.tab_calendar, R.drawable.ic_calendar, R.drawable.ic_calendar_filled),
  Groups(R.string.tab_groups, R.drawable.ic_groups, R.drawable.ic_groups_filled),
  Settings(R.string.tab_settings, R.drawable.ic_settings, R.drawable.ic_settings_filled),
}

/** What the navigation shows: the tabs at its root, and the pages over them. */
sealed interface RootRoute

/** The tabs, under every page. */
data object Tabs : RootRoute

/** A page over the tabs. */
@Serializable
sealed interface RootPage : RootRoute, NavKey {
  /** アカウント, from 設定. */
  @Serializable data object Account : RootPage

  /** 外観, from 設定's 表示. */
  @Serializable data object Appearance : RootPage

  /** スタイル, from 設定's 表示. */
  @Serializable data object Style : RootPage

  /** カレンダー, from 設定's 表示. */
  @Serializable data object CalendarSettings : RootPage

  /** チャット, from 設定's 通知. */
  @Serializable data object ChatNotifications : RootPage

  /** リマインド, from 設定's 通知. */
  @Serializable data object Reminders : RootPage

  /** A reminder `id` to change, or none to add one, from リマインド. */
  @Serializable data class ReminderEditor(val id: String?) : RootPage

  /** 画像で保存 for `month` ("YYYY-MM"), from the calendar's heading. */
  @Serializable data class MonthPicture(val month: String) : RootPage

  /** シフト for the day `date` ("YYYY-MM-DD"), from its detail. */
  @Serializable data class ShiftChoice(val date: String) : RootPage

  /** グループを作る, from グループ. */
  @Serializable data object NewGroup : RootPage

  /** メンバーを招待, from a group's bar or its settings, and once it is made. */
  @Serializable data class GroupInvite(val groupId: String) : RootPage

  /** グループの設定, from a group's bar. */
  @Serializable data class GroupSettings(val groupId: String) : RootPage

  /** グループを編集, from its settings. */
  @Serializable data class GroupEdit(val groupId: String) : RootPage

  /** このグループでのあなた, from its settings. */
  @Serializable data class GroupProfile(val groupId: String) : RootPage

  /** みんなのシフト, from the group's hub: on `date` ("YYYY-MM-DD") with its sheet up when given. */
  @Serializable data class GroupShifts(val groupId: String, val date: String? = null) : RootPage

  /**
   * A chat of the group's, `threadId` its own (全体チャット) or a one-to-one chat, from its hub; with
   * `sharing` ("YYYY-MM-DD") from みんなのシフト's 全体チャットで共有, the day set over its composer.
   */
  @Serializable data class Chat(val groupId: String, val threadId: String, val sharing: String? = null) : RootPage

  /** 写真, the photos of a chat alone, from its ⋯. */
  @Serializable data class ChatPhotos(val groupId: String, val threadId: String) : RootPage

  /** QRコードで参加, from グループ. */
  @Serializable data object Scan : RootPage

  /** 参加の画面 for the invitation `code`, from its link or its QR code. */
  @Serializable data class Join(val code: String) : RootPage

  /** シフトパターン, from 設定. */
  @Serializable data object Patterns : RootPage

  /** パターンを追加, from シフトパターン. */
  @Serializable data object AddPattern : RootPage

  /** パターンを編集 for the pattern `id`, or with `isNew` a pattern made from scratch under that id. */
  @Serializable data class PatternEditor(val id: String, val isNew: Boolean = false) : RootPage

  /** 繰り返し, from 設定. */
  @Serializable data object Repeat : RootPage

  /** The period of 繰り返し starting on `start` ("YYYY-MM-DD"). */
  @Serializable data class RepeatPeriod(val start: String) : RootPage

  /** An order typed on the calendar, set as `mode` says. */
  @Serializable data class RepeatEditor(val mode: RepeatMode) : RootPage

  /** 繰り返しをやめる, from 繰り返し. */
  @Serializable data object StopRepeat : RootPage

  /** プロフィール, from 設定. */
  @Serializable data object Profile : RootPage

  /** 一緒に働く人, from 設定. */
  @Serializable data object Coworkers : RootPage

  /** Someone of 一緒に働く人, by `id`. */
  @Serializable data class CoworkerEditor(val id: String) : RootPage

  /** 新しい仕事にする, from シフトパターン. */
  @Serializable data object JobChange : RootPage
}

/**
 * The tab shown and the pages over it, bottom first, and the way to open
 * more: every page over the tabs is pushed through it. The tabs are always
 * the root, so no page can go under them and a back cannot take them away.
 */
@Stable
class RootNavigator(
  private val pages: NavBackStack<RootPage>,
  tab: MutableState<RootTab>,
  openGroup: MutableState<String?> = mutableStateOf(null),
) {
  var tab by tab
    private set

  /** The group open in グループ, picked there; the first while none is, or once the one picked is gone. */
  var openGroup by openGroup

  /** The tabs, then the pages over them, as the navigation shows them. */
  val routes: List<RootRoute>
    get() = listOf(Tabs) + pages

  /** Opens `page` over those open. */
  fun open(page: RootPage) {
    pages.add(page)
  }

  /** Opens `page` unless it is the one on top already, as a link opened twice is. */
  fun openOnce(page: RootPage) {
    if (pages.lastOrNull() != page) pages.add(page)
  }

  /** Puts `page` in place of the top page, as a code read opens its join screen in the scanner's place. */
  fun replace(page: RootPage) {
    if (pages.isNotEmpty()) pages.removeAt(pages.lastIndex)
    pages.add(page)
  }

  /** Goes to `tab`, as a tap on it does; the pages, none while the tab bar shows, stay. */
  fun select(tab: RootTab) {
    this.tab = tab
  }

  /**
   * Shows the group [groupId] in グループ, as one made or joined is, with [page] over the tabs in
   * place of the pages open, or none.
   */
  fun showGroup(groupId: String, page: RootPage? = null) {
    showOver(RootTab.Groups, page)
    openGroup = groupId
  }

  /** Shows [page], or none, over [tab] alone, in place of the pages open, as a notification's chat opens. */
  fun showOver(tab: RootTab, page: RootPage?) {
    pages.clear()
    page?.let(pages::add)
    this.tab = tab
  }

  /** The day a link asks the calendar to open, until it has. */
  var openingDay by mutableStateOf<LocalDate?>(null)

  /** Shows [day] in the calendar, opened as a tap opens it, in place of the pages open (spec/widgets.md, Opening the app). */
  fun showDay(day: LocalDate) {
    pages.clear()
    tab = RootTab.Calendar
    openingDay = day
  }

  /** Takes away every page, back to the tabs, as leaving a group does from its pages. */
  fun closePages() {
    pages.clear()
  }

  /** Whether a back on the tabs, no page over them, goes to the first tab rather than leaving the app. */
  val backGoesToFirstTab: Boolean
    get() = pages.isEmpty() && tab != RootTab.entries.first()

  /**
   * Takes away the top page; with none, goes to the first tab, as Android's
   * tabs go back to the one the app opens on before the app goes.
   */
  fun back() {
    if (pages.isNotEmpty()) pages.removeAt(pages.lastIndex) else tab = RootTab.entries.first()
  }

  /** Takes away the top `count` pages at once, as a page made from the one under it goes back past both. */
  fun back(count: Int) {
    repeat(minOf(count, pages.size)) { pages.removeAt(pages.lastIndex) }
  }
}

/**
 * The navigation as a page asks it: what the page asks while it is not
 * settled in front, coming or going, is dropped, so a second tap while a
 * page comes cannot open it twice (Navigation 3's dropUnlessResumed).
 */
class PageNavigation(private val navigator: RootNavigator, private val lifecycle: Lifecycle) {
  val tab: RootTab
    get() = navigator.tab

  fun open(page: RootPage) = whenSettled { navigator.open(page) }

  fun replace(page: RootPage) = whenSettled { navigator.replace(page) }

  fun select(tab: RootTab) = whenSettled { navigator.select(tab) }

  fun back() = whenSettled { navigator.back() }

  fun back(count: Int) = whenSettled { navigator.back(count) }

  private fun whenSettled(action: () -> Unit) {
    if (lifecycle.currentState.isAtLeast(Lifecycle.State.RESUMED)) action()
  }
}

/** The navigation as the page this is in asks it. */
@Composable
fun rememberPageNavigation(navigator: RootNavigator): PageNavigation {
  val lifecycle = LocalLifecycleOwner.current.lifecycle
  return remember(navigator, lifecycle) { PageNavigation(navigator, lifecycle) }
}

/** A navigator kept across a configuration change and the process's death. */
@Composable
fun rememberRootNavigator(): RootNavigator {
  val pages =
    rememberSerializable(serializer = NavBackStackSerializer(RootPage.serializer())) {
      NavBackStack<RootPage>()
    }
  val tab = rememberSaveable { mutableStateOf(RootTab.entries.first()) }
  val openGroup = rememberSaveable { mutableStateOf<String?>(null) }
  return remember(pages, tab, openGroup) { RootNavigator(pages, tab, openGroup) }
}
