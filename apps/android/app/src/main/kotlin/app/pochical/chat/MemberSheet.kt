package app.pochical.chat

import app.pochical.sectionRows
import app.pochical.SettingsRow
import app.pochical.RowEnd
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import app.pochical.ListSheet
import app.pochical.LocalThemeColors
import app.pochical.kit.PhotoShelf

/** Someone a sheet lists: their id, their name and face as the group shows them. */
data class SheetMember(val id: String, val name: String, val photoId: String, val shelf: PhotoShelf?)

/**
 * A list of people in a Material bottom sheet, the one piece every such sheet of the chats is drawn
 * with (個人チャットを始める, who chose a reaction, who can come on a poll's day): its [title], a row a
 * person with their face, picked with [onPick] when given, and a [note] under them, through
 * [ListSheet], so the rows scroll within the sheet.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberSheet(title: String, members: List<SheetMember>, onDismiss: () -> Unit, note: String? = null, onPick: ((SheetMember) -> Unit)? = null) {
  val colors = LocalThemeColors.current
  ListSheet(onDismiss, title) {
    // Material 3 Expressive's segments, as the settings' lists draw their rows.
    sectionRows(members, key = { it.id }) { member ->
      SettingsRow(
        member.name,
        icon = null,
        onClick = onPick?.let { pick -> { pick(member) } },
        end = RowEnd.None,
        leading = { Face(member.id, member.name, member.photoId, member.shelf, 40.dp) },
        oneLine = true,
      )
    }
    if (note != null) {
      item {
        Text(note, Modifier.padding(horizontal = 24.dp, vertical = 8.dp), style = MaterialTheme.typography.bodySmall, color = colors.textSecondary)
      }
    }
  }
}
