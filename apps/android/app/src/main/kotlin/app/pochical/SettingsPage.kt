package app.pochical

import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.RowScope
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LargeFlexibleTopAppBar
import androidx.compose.material3.MediumFlexibleTopAppBar
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.input.nestedscroll.nestedScroll
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow

/**
 * A page pushed from 設定: Material 3 Expressive's flexible app bar, its title large over the list
 * and drawn into the bar as the list scrolls under it, the words under the title when it has some,
 * ← back and the actions at the bar's end; then what it holds, which scrolls. [large] is the tab's
 * own page, 設定, whose title stands larger. A page that does not scroll as a list (a calendar to
 * fill in, a form) or has no title keeps Material's small bar, pinned: [collapsing] false.
 */
@Composable
fun SettingsPage(
  title: String,
  onBack: (() -> Unit)?,
  subtitle: String? = null,
  large: Boolean = false,
  collapsing: Boolean = title.isNotEmpty(),
  snackbar: SnackbarHostState? = null,
  actions: @Composable RowScope.() -> Unit = {},
  content: @Composable (PaddingValues) -> Unit,
) {
  val scroll = if (collapsing) TopAppBarDefaults.exitUntilCollapsedScrollBehavior() else TopAppBarDefaults.pinnedScrollBehavior()
  val back: @Composable () -> Unit = {
    if (onBack != null) {
      IconButton(onClick = onBack) {
        Icon(painterResource(R.drawable.ic_back), contentDescription = stringResource(R.string.back))
      }
    }
  }
  val sub: (@Composable () -> Unit)? = subtitle?.let { { Text(it, maxLines = 2, overflow = TextOverflow.Ellipsis) } }
  Scaffold(
    modifier = Modifier.nestedScroll(scroll.nestedScrollConnection),
    topBar = {
      if (!collapsing && sub != null) {
        TopAppBar(title = { Text(title) }, subtitle = sub, navigationIcon = back, actions = actions, scrollBehavior = scroll)
      } else if (!collapsing) {
        TopAppBar(title = { Text(title) }, navigationIcon = back, actions = actions, scrollBehavior = scroll)
      } else if (large) {
        LargeFlexibleTopAppBar(title = { Text(title) }, subtitle = sub, navigationIcon = back, actions = actions, scrollBehavior = scroll)
      } else {
        MediumFlexibleTopAppBar(title = { Text(title) }, subtitle = sub, navigationIcon = back, actions = actions, scrollBehavior = scroll)
      }
    },
    snackbarHost = { if (snackbar != null) SnackbarHost(snackbar) },
    content = content,
  )
}
