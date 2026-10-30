package app.pochical.chat

import androidx.annotation.DrawableRes
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
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import app.pochical.LocalThemeColors

// The chat's small menus from where they were opened (⋯ beside the title, the composer's ＋, a pin's
// long press, a line not sent's !, a profile's ⋯), in Material 3 Expressive's grouped menus: one
// piece, so they read alike.

/** One item of a [GroupedMenu]: [icon] before its words, [danger] in the danger color. */
class MenuEntry(val label: String, @param:DrawableRes val icon: Int? = null, val danger: Boolean = false, val run: () -> Unit)

/**
 * A menu from where it was opened, as Material 3 Expressive groups one: each of [groups] a rounded
 * card of its items, the cards a small gap apart, the first and last item of each rounder, [title]
 * heading the first. A pick closes it as it acts, as the system's menus do.
 */
@Composable
fun GroupedMenu(expanded: Boolean, onDismiss: () -> Unit, groups: List<List<MenuEntry>>, title: String? = null) {
  val colors = LocalThemeColors.current
  val shown = groups.filter { it.isNotEmpty() }
  DropdownMenuPopup(expanded, onDismissRequest = onDismiss) {
    shown.forEachIndexed { at, group ->
      if (at > 0) Spacer(Modifier.height(MenuDefaults.GroupSpacing))
      DropdownMenuGroup(shapes = MenuDefaults.groupShape(at, shown.size)) {
        if (at == 0 && title != null) MenuDefaults.DropdownMenuGroupLabel { Text(title) }
        group.forEachIndexed { index, entry ->
          val tint = if (entry.danger) colors.dangerDefault else MaterialTheme.colorScheme.onSurface
          DropdownMenuItem(
            onClick = {
              onDismiss()
              entry.run()
            },
            text = { Text(entry.label, color = tint) },
            shape = MenuDefaults.itemShape(index, group.size).shape,
            leadingIcon = entry.icon?.let { { Icon(painterResource(it), contentDescription = null, tint = tint) } },
          )
        }
      }
    }
  }
}
