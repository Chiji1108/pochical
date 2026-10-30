package app.pochical

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.add
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SheetState
import androidx.compose.material3.Text
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.dp

/**
 * A Material bottom sheet whose contents scroll within it: a LazyColumn, which the sheet's nested
 * scroll drags and scrolls as one. A sheet's contents go through this piece, so none grows past the
 * screen with its last rows out of reach (a whole group of GROUP_MAX_MEMBERS, a poll's days, a
 * month of blank days): its [title] as a heading, then [content], over the navigation bar. A
 * [footer], the sheet's one action, stays at its foot under the rows as they scroll, as iOS keeps a
 * sheet's button at its bottom: with a [sheetState] that opens whole (skipPartiallyExpanded), as a
 * half-open sheet would leave its foot below the screen.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListSheet(
  onDismiss: () -> Unit,
  title: String? = null,
  titleStyle: TextStyle = MaterialTheme.typography.titleLarge,
  sheetState: SheetState = rememberModalBottomSheetState(),
  footer: (@Composable () -> Unit)? = null,
  content: LazyListScope.() -> Unit,
) {
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
    val foot = WindowInsets.navigationBars.add(WindowInsets(bottom = 16.dp))
    LazyColumn(
      Modifier.weight(1f, fill = false),
      contentPadding = if (footer == null) foot.asPaddingValues() else PaddingValues(bottom = 16.dp),
    ) {
      if (title != null) {
        item(key = TITLE) { Text(title, Modifier.padding(horizontal = 24.dp, vertical = 8.dp).semantics { heading() }, style = titleStyle) }
      }
      content()
    }
    if (footer != null) Box(Modifier.windowInsetsPadding(foot).padding(horizontal = 24.dp)) { footer() }
  }
}

private const val TITLE = "title"
