package app.pochical.chat

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.material3.DropdownMenuGroup
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.DropdownMenuPopup
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.res.painterResource
import app.pochical.LocalThemeColors

// The chat's menus in Material 3 Expressive's grouped menus: the small ones from where they were
// opened (⋯ beside the title, the composer's ＋, a pin's long press, a line not sent's !, a profile's
// ⋯) and a line's own over the dimmed chat (LineMenu), one piece, so they read alike.

/**
 * A menu from where it was opened: [items] in their groups (MenuGroups), [title] heading the first.
 * A pick closes it as it acts, as the system's menus do.
 */
@Composable
fun GroupedMenu(expanded: Boolean, onDismiss: () -> Unit, items: List<LineMenuItem>, title: String? = null) {
  DropdownMenuPopup(expanded, onDismissRequest = onDismiss) {
    MenuGroups(items, title, onPick = { item ->
      onDismiss()
      item.run()
    })
  }
}

/**
 * [items] as Material 3 Expressive groups them, a group starting at each item that [LineMenuItem.startsGroup]:
 * each group a rounded card a small gap from the next, its first and last item rounder, each item's
 * symbol before its words, a destructive one in the danger color. [item] adds to each item's
 * modifier, by its place in [items] and its shape.
 */
@Composable
fun ColumnScope.MenuGroups(
  items: List<LineMenuItem>,
  title: String? = null,
  onPick: (LineMenuItem) -> Unit,
  item: @Composable (index: Int, shape: Shape) -> Modifier = { _, _ -> Modifier },
) {
  val colors = LocalThemeColors.current
  val groups = remember(items) { groupsOf(items) }
  groups.forEachIndexed { at, group ->
    if (at > 0) Spacer(Modifier.height(MenuDefaults.GroupSpacing))
    DropdownMenuGroup(shapes = MenuDefaults.groupShape(at, groups.size)) {
      if (at == 0 && title != null) MenuDefaults.DropdownMenuGroupLabel { Text(title) }
      group.forEachIndexed { place, (index, entry) ->
        val tint = if (entry.destructive) colors.dangerDefault else MaterialTheme.colorScheme.onSurface
        val shape = MenuDefaults.itemShape(place, group.size).shape
        DropdownMenuItem(
          onClick = { onPick(entry) },
          text = { Text(entry.label, color = tint) },
          shape = shape,
          leadingIcon = { Icon(painterResource(entry.icon), contentDescription = null, tint = tint) },
          modifier = item(index, shape),
        )
      }
    }
  }
}

/** The items in their groups, each with its place among them all. */
private fun groupsOf(items: List<LineMenuItem>): List<List<IndexedValue<LineMenuItem>>> {
  val groups = mutableListOf<MutableList<IndexedValue<LineMenuItem>>>()
  for (item in items.withIndex()) {
    if (groups.isEmpty() || item.value.startsGroup) groups += mutableListOf<IndexedValue<LineMenuItem>>()
    groups.last() += item
  }
  return groups
}
