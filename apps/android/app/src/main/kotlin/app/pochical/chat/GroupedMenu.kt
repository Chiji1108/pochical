package app.pochical.chat

import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
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
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R

// The app's menus in Material 3 Expressive's grouped menus: the chat's small ones from where they
// were opened (⋯ beside the title, the composer's ＋, a pin's long press, a line not sent's !, a
// profile's ⋯) and a line's own over the dimmed chat (LineMenu), and the others the app opens from a
// button (the calendar's save corner, a group's table, a photo's 写真を編集, the QR code's long press,
// a reminder's minutes), one piece, so they read alike.

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
 * symbol before its words, a destructive one in the danger color, and of a choice the one in use
 * checked. [item] adds to each item's
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
        val shapes = MenuDefaults.itemShape(place, group.size)
        // Of a choice, the one in use checked where an item's symbol goes, the others' words in line with it.
        val choice = entry.selected
        val icon = if (choice == true) R.drawable.ic_check else entry.icon
        DropdownMenuItem(
          onClick = { onPick(entry) },
          text = { Text(entry.label, color = tint) },
          shape = shapes.shape,
          leadingIcon =
            when {
              icon != null -> ({ Icon(painterResource(icon), contentDescription = null, tint = tint) })
              choice != null -> ({ Spacer(Modifier.size(24.dp)) })
              else -> null
            },
          modifier = item(index, shapes.shape).then(if (choice != null) Modifier.semantics { selected = choice } else Modifier),
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
