package app.pochical.chat

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.add
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.groups.MemberAvatar
import app.pochical.kit.PhotoShelf

/** Someone a sheet lists: their id, their name and face as the group shows them. */
data class SheetMember(val id: String, val name: String, val photoId: String, val shelf: PhotoShelf?)

/**
 * A list of people in a Material bottom sheet, the one piece every such sheet of the chats is drawn
 * with (個人チャットを始める, who chose a reaction, who can come on a poll's day): its [title], a row a
 * person with their face, picked with [onPick] when given, and a [note] under them. The rows scroll
 * within the sheet, as a group holds up to GROUP_MAX_MEMBERS people, more than a sheet shows.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MemberSheet(title: String, members: List<SheetMember>, onDismiss: () -> Unit, note: String? = null, onPick: ((SheetMember) -> Unit)? = null) {
  val colors = LocalThemeColors.current
  ModalBottomSheet(onDismissRequest = onDismiss) {
    LazyColumn(contentPadding = WindowInsets.navigationBars.add(WindowInsets(bottom = 16.dp)).asPaddingValues()) {
      item {
        Text(
          title,
          Modifier.padding(horizontal = 24.dp, vertical = 8.dp).semantics { heading() },
          style = MaterialTheme.typography.titleLarge,
        )
      }
      items(members, key = { it.id }) { member ->
        ListItem(
          headlineContent = { Text(member.name, maxLines = 1, overflow = TextOverflow.Ellipsis) },
          leadingContent = { MemberAvatar(member.name, member.photoId, member.shelf, 40.dp) },
          colors = ListItemDefaults.colors(containerColor = Color.Transparent),
          modifier = Modifier.fillMaxWidth().then(if (onPick != null) Modifier.clickable { onPick(member) } else Modifier),
        )
      }
      if (note != null) {
        item {
          Text(
            note,
            Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
            style = MaterialTheme.typography.bodySmall,
            color = colors.textSecondary,
          )
        }
      }
    }
  }
}
