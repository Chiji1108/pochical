package app.pochical

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.calculateEndPadding
import androidx.compose.foundation.layout.calculateStartPadding
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.MediumFlexibleTopAppBar
import androidx.compose.material3.Scaffold
import androidx.compose.material3.ScaffoldDefaults
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.material3.TopAppBarScrollBehavior
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/**
 * A page with Material 3 Expressive's flexible app bar, its title large over the list and drawn
 * into the bar as the list scrolls under it, the words under the title when it has some, ← back
 * (✕ for a page that [closes], opened over the one under it to be filled in or looked at and
 * closed) and the actions at the bar's end; then what it holds, which scrolls, in a
 * [PageScaffold]. [large] is a tab's own page, 設定, whose title stands larger. A page that does
 * not scroll as a list (a calendar to fill in, a form) or has no title keeps Material's small bar,
 * pinned: [collapsing] false. Its [bottomBar], the page's actions, stays under what scrolls, which
 * ends above it at its height.
 */
@Composable
fun SettingsPage(
  title: String,
  onBack: (() -> Unit)?,
  modifier: Modifier = Modifier,
  subtitle: String? = null,
  large: Boolean = false,
  collapsing: Boolean = title.isNotEmpty(),
  closes: Boolean = false,
  snackbar: SnackbarHostState? = null,
  actions: @Composable RowScope.() -> Unit = {},
  bottomBar: (@Composable () -> Unit)? = null,
  content: @Composable (PaddingValues) -> Unit,
) {
  val scroll = if (collapsing) TopAppBarDefaults.exitUntilCollapsedScrollBehavior() else TopAppBarDefaults.pinnedScrollBehavior()
  val back: @Composable () -> Unit = { if (onBack != null) BackButton(onBack, closes) }
  val sub: (@Composable () -> Unit)? = subtitle?.let { { Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis) } }
  PageScaffold(
    topBar = {
      if (!collapsing) {
        PageBar(title, onBack, scroll, subtitle, closes, actions)
      } else if (large) {
        LargeFlexibleTopAppBar(title = { Text(title) }, subtitle = sub, navigationIcon = back, actions = actions, scrollBehavior = scroll)
      } else {
        MediumFlexibleTopAppBar(title = { Text(title) }, subtitle = sub, navigationIcon = back, actions = actions, scrollBehavior = scroll)
      }
    },
    modifier = modifier.nestedScroll(scroll.nestedScrollConnection),
    bottomBar = bottomBar,
    snackbar = snackbar,
    content = content,
  )
}

/**
 * A page's small bar, Material's, pinned: [title] with the words under it when it has some, ←
 * back (✕ for a page that [closes]) and its [actions]; over what scrolls, taking the scrolled color
 * as it goes under ([scrollBehavior], its page's nestedScroll). [SettingsPage]'s, and that of a
 * page laid out on a scaffold of its own (みんなのシフト's, over its sheet).
 */
@Composable
fun PageBar(
  title: String,
  onBack: (() -> Unit)?,
  scrollBehavior: TopAppBarScrollBehavior? = null,
  subtitle: String? = null,
  closes: Boolean = false,
  actions: @Composable RowScope.() -> Unit = {},
) {
  val back: @Composable () -> Unit = { if (onBack != null) BackButton(onBack, closes) }
  if (subtitle != null) {
    TopAppBar(
      title = { Text(title) },
      subtitle = { Text(subtitle, maxLines = 2, overflow = TextOverflow.Ellipsis) },
      navigationIcon = back,
      actions = actions,
      scrollBehavior = scrollBehavior,
    )
  } else {
    TopAppBar(title = { Text(title) }, navigationIcon = back, actions = actions, scrollBehavior = scrollBehavior)
  }
}

/** ← back, or ✕ for a page that [closes]. */
@Composable
private fun BackButton(onBack: () -> Unit, closes: Boolean) {
  val label = stringResource(if (closes) R.string.close else R.string.back)
  Tip(label) { IconButton(onClick = onBack) { Icon(painterResource(if (closes) R.drawable.ic_close else R.drawable.ic_back), label) } }
}

/**
 * Every page's scaffold, over the tabs or beside them: its [topBar] across the whole width, and
 * under it what the page holds, [content] and its [bottomBar] no wider than [PageMaxWidth], in the
 * middle, so that on a tablet, upright or in the side beside the tabs, a page's buttons and text
 * fields never stretch across the screen, as Material's Buttons and Text fields have it in their
 * adaptive design (and the large-screen quality's UI_Secondary_Elements). On a phone nothing
 * changes, as none is wider. The room beside it is the [content]'s padding, so what scrolls still
 * scrolls from the window's edges. A page whose content is the screen's to fill, the chat's lines
 * and the photos' grid as Messages and Photos fill a tablet, [fillsWidth]. A screen with no bar
 * (はじめの画面, the one for a session the server no longer knows, the one erasing the device, グループ
 * with no group yet) is a page too, laid out here with none, so its buttons keep to the same width.
 */
@Composable
fun PageScaffold(
  topBar: @Composable () -> Unit = {},
  modifier: Modifier = Modifier,
  bottomBar: (@Composable () -> Unit)? = null,
  snackbar: SnackbarHostState? = null,
  contentWindowInsets: WindowInsets = pageInsets,
  fillsWidth: Boolean = false,
  content: @Composable (PaddingValues) -> Unit,
) {
  Scaffold(
    modifier,
    topBar = topBar,
    // Only a page with a foot has one: Scaffold takes any bottom bar, however short, as what the
    // content ends above, in place of the window's insets.
    bottomBar = {
      when {
        bottomBar == null -> Unit
        fillsWidth -> bottomBar()
        else -> Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) { Box(Modifier.widthIn(max = PageMaxWidth)) { bottomBar() } }
      }
    },
    snackbarHost = { if (snackbar != null) SnackbarHost(snackbar) },
    contentWindowInsets = contentWindowInsets,
  ) { padding ->
    if (fillsWidth) {
      content(padding)
    } else {
      BoxWithConstraints {
        val direction = LocalLayoutDirection.current
        val start = padding.calculateStartPadding(direction)
        val end = padding.calculateEndPadding(direction)
        // The room left once the content is as wide as it may be, half on each side.
        val beside = ((maxWidth - start - end - PageMaxWidth) / 2).coerceAtLeast(0.dp)
        content(PaddingValues(start = start + beside, top = padding.calculateTopPadding(), end = end + beside, bottom = padding.calculateBottomPadding()))
      }
    }
  }
}

/**
 * The widest a page's content stands: 600dp, where Material's compact window class ends, so a page
 * is never laid out wider than on the widest phone it is made for, and as wide as Material's
 * snackbar may be, which shows over it.
 */
val PageMaxWidth = 600.dp

/**
 * What a page's content keeps clear of: the system's bars and the keyboard, as the screens make
 * room for it themselves (adjustResize), so a field low on a page scrolls up clear of it.
 */
val pageInsets: WindowInsets
  @Composable get() = ScaffoldDefaults.contentWindowInsets.union(WindowInsets.ime)
