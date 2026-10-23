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
  /** 外観, from 設定's 表示. */
  @Serializable data object Appearance : RootPage
}

/**
 * The tab shown and the pages over it, bottom first, and the way to open
 * more: every page over the tabs is pushed through it. The tabs are always
 * the root, so no page can go under them and a back cannot take them away.
 */
@Stable
class RootNavigator(private val pages: NavBackStack<RootPage>, tab: MutableState<RootTab>) {
  var tab by tab
    private set

  /** The tabs, then the pages over them, as the navigation shows them. */
  val routes: List<RootRoute>
    get() = listOf(Tabs) + pages

  /** Opens `page` over those open. */
  fun open(page: RootPage) {
    pages.add(page)
  }

  /** Goes to `tab`, as a tap on it does; the pages, none while the tab bar shows, stay. */
  fun select(tab: RootTab) {
    this.tab = tab
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

  fun select(tab: RootTab) = whenSettled { navigator.select(tab) }

  fun back() = whenSettled { navigator.back() }

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
  return remember(pages, tab) { RootNavigator(pages, tab) }
}
