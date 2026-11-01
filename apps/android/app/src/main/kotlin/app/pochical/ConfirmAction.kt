package app.pochical

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp

/**
 * What a page, a mode or a sheet is for, confirmed at the end of its bar: 保存, 追加, 作る, 完了,
 * 送る. Material 3 Expressive's one high-visibility action in an app bar, drawn as Google's own
 * apps draw Save (Contacts' new contact): a filled button with its word, Material's small size
 * and round, squaring a little while pressed. One to a bar; the bar's other actions stay icon or
 * text buttons. It stands 16dp in from the bar's end, as the way back's arrow does from its start.
 * [busy] puts Material's spinner in its place while what it started is under way.
 */
@Composable
fun ConfirmAction(label: String, onClick: () -> Unit, enabled: Boolean = true, busy: Boolean = false) {
  if (busy) {
    CircularProgressIndicator(Modifier.padding(end = 16.dp).size(24.dp))
  } else {
    Button(onClick = onClick, shapes = ButtonDefaults.shapes(), modifier = Modifier.padding(end = 12.dp), enabled = enabled) { Text(label) }
  }
}

/**
 * A list's way into ordering it, 並び替え, a text button as the bar's other actions are, and out of
 * it again, 完了, which confirms the order as [ConfirmAction].
 */
@Composable
fun SortToggle(sorting: Boolean, onClick: () -> Unit) {
  if (sorting) ConfirmAction(stringResource(R.string.patterns_sort_done), onClick)
  else TextButton(onClick) { Text(stringResource(R.string.patterns_sort)) }
}
