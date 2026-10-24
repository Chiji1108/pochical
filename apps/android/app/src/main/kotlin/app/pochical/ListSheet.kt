package app.pochical

import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.add
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
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
 * month of blank days): its [title] as a heading, then [content], over the navigation bar.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ListSheet(
  onDismiss: () -> Unit,
  title: String? = null,
  titleStyle: TextStyle = MaterialTheme.typography.titleLarge,
  sheetState: SheetState = rememberModalBottomSheetState(),
  content: LazyListScope.() -> Unit,
) {
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheetState) {
    LazyColumn(contentPadding = WindowInsets.navigationBars.add(WindowInsets(bottom = 16.dp)).asPaddingValues()) {
      if (title != null) {
        item(key = TITLE) { Text(title, Modifier.padding(horizontal = 24.dp, vertical = 8.dp).semantics { heading() }, style = titleStyle) }
      }
      content()
    }
  }
}

private const val TITLE = "title"
