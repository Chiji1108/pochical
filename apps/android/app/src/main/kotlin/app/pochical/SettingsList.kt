package app.pochical

import androidx.annotation.DrawableRes
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.material3.ButtonGroupDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Icon
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.ListItemShapes
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.SegmentedListItem
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.ToggleButton
import androidx.compose.material3.ToggleButtonDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.toggleableState
import androidx.compose.ui.state.ToggleableState
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp

/*
 * The settings' lists, in Material 3 Expressive as Android 16's own Settings draws them: each
 * section a heading over its rows, the rows a rounded group of segments a small gap apart, the
 * first and last with the larger corners, every row led by its symbol (Material Symbols Rounded)
 * and ending in what it holds and where it goes. One piece for 設定 and every page under it, the
 * group's settings among them, so they read alike.
 */

/** Where a row sits in its section, which gives its segment's corners. */
private data class Segment(val index: Int, val count: Int)

private val LocalSegment = compositionLocalOf { Segment(0, 1) }

/** The rows of a [SettingsSection], each added with [row]. */
class SettingsSectionScope internal constructor() {
  internal val rows = mutableListOf<@Composable () -> Unit>()

  /** One row of the section, a [SettingsRow] or [SettingsSwitchRow], or none if it draws nothing. */
  fun row(content: @Composable () -> Unit) {
    rows += content
  }
}

/**
 * A section of a settings list: its [title] as a heading when it has one, its rows as one rounded
 * group of segments, and [footnote] under them.
 */
@Composable
fun SettingsSection(title: String? = null, modifier: Modifier = Modifier, footnote: String? = null, content: SettingsSectionScope.() -> Unit) {
  val rows = SettingsSectionScope().apply(content).rows
  Column(modifier.padding(horizontal = 16.dp)) {
    if (title != null) SectionHeader(title, Modifier) else Spacer(Modifier.height(8.dp))
    Column(verticalArrangement = Arrangement.spacedBy(ListItemDefaults.SegmentedGap)) {
      rows.forEachIndexed { index, row -> CompositionLocalProvider(LocalSegment provides Segment(index, rows.size)) { row() } }
    }
    if (footnote != null) Footnote(footnote, Modifier)
  }
}

/**
 * A row of a section laid out one item at a time, as a lazy list's (one that reorders, or grows
 * long): the [index]th of [count], off the screen's edges as a [SettingsSection]'s rows, the gap
 * between segments under all but the last.
 */
@Composable
fun SectionRow(index: Int, count: Int, modifier: Modifier = Modifier, content: @Composable () -> Unit) {
  Box(modifier.padding(start = 16.dp, end = 16.dp, bottom = if (index < count - 1) ListItemDefaults.SegmentedGap else 0.dp)) {
    CompositionLocalProvider(LocalSegment provides Segment(index, count), content = content)
  }
}

/**
 * A section's rows in a lazy list, each its own item, keyed by [key], so a long one (a full group's
 * members) is composed as it scrolls into sight: [extra] rows of the section follow them.
 */
fun <T> LazyListScope.sectionRows(rows: List<T>, key: (T) -> Any, extra: Int = 0, row: @Composable (T) -> Unit) {
  val count = rows.size + extra
  itemsIndexed(rows, key = { _, it -> key(it) }) { index, it -> SectionRow(index, count) { row(it) } }
}

/** The corners of the row being drawn, from where it sits in its section, for a row drawn as a [SegmentedListItem] of its own. */
@Composable
fun segmentShapes(): ListItemShapes {
  val segment = LocalSegment.current
  return ListItemDefaults.segmentedShapes(segment.index, segment.count)
}

/**
 * The rows' colors: on the fill the app's cards are on (the hub's), as Material's segmented rows
 * would be on the surface the page is.
 */
@Composable
fun rowColors() = ListItemDefaults.segmentedColors(containerColor = LocalThemeColors.current.fillQuaternary)

/** How a row ends after its value. */
enum class RowEnd {
  /** Goes on to a page of the app. */
  Chevron,

  /** Leaves the app, for the site in the browser's sheet or the system's settings. */
  Outside,

  /** Does something where it is. */
  None,
}

/**
 * A row of a settings list, in its section's segment: led by [icon] (or [leading], a face or a
 * mark), its [headline] over [supporting] when it has some (or [headlineContent] and
 * [supportingContent], drawn by the row), [overline] over both, then [value] (what it holds, in
 * the secondary color, or [valueContent]) and how it ends. [oneLine] cuts the words to a line each,
 * as a name's. [danger] draws it in the danger color, as a row that deletes. [onClickLabel] says
 * what pressing it does where that is not its headline's own, as one that opens the browser.
 */
@Composable
fun SettingsRow(
  headline: String,
  @DrawableRes icon: Int?,
  onClick: (() -> Unit)?,
  modifier: Modifier = Modifier,
  supporting: String? = null,
  value: String? = null,
  valueContent: (@Composable () -> Unit)? = null,
  end: RowEnd = if (onClick != null) RowEnd.Chevron else RowEnd.None,
  leading: (@Composable () -> Unit)? = null,
  overline: String? = null,
  headlineContent: (@Composable () -> Unit)? = null,
  supportingContent: (@Composable () -> Unit)? = null,
  oneLine: Boolean = false,
  enabled: Boolean = true,
  danger: Boolean = false,
  onClickLabel: String? = null,
) {
  val tint = if (danger) MaterialTheme.colorScheme.error else Color.Unspecified
  val lines = if (oneLine) 1 else Int.MAX_VALUE
  val lead = leading ?: icon?.let { { RowIcon(it, if (danger) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.primary) } }
  val trail: (@Composable () -> Unit)? =
    if (value == null && valueContent == null && end == RowEnd.None) null
    else {
      {
        Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          valueContent?.invoke()
          if (value != null) {
            Text(value, Modifier.widthIn(max = 168.dp), style = MaterialTheme.typography.bodyMedium, maxLines = 1, overflow = TextOverflow.Ellipsis)
          }
          when (end) {
            RowEnd.Chevron -> Icon(painterResource(R.drawable.ic_chevron_right), contentDescription = null)
            RowEnd.Outside -> Icon(painterResource(R.drawable.ic_arrow_outward), contentDescription = null, Modifier.size(20.dp))
            RowEnd.None -> Unit
          }
        }
      }
    }
  Segment(
    onClick = onClick,
    modifier = if (onClick != null && onClickLabel != null) modifier.semantics { onClick(onClickLabel) { onClick(); true } } else modifier,
    enabled = enabled,
    leading = lead,
    trailing = trail,
    overline = overline?.let { { Text(it) } },
    supporting = supportingContent ?: supporting?.let { { Text(it, maxLines = lines, overflow = TextOverflow.Ellipsis) } },
  ) {
    if (headlineContent != null) headlineContent() else Text(headline, color = tint, maxLines = lines, overflow = TextOverflow.Ellipsis)
  }
}

/** A segment of the section, pressed when [onClick] is given: the one place a row's segment is drawn. */
@Composable
private fun Segment(
  onClick: (() -> Unit)?,
  modifier: Modifier,
  enabled: Boolean,
  leading: (@Composable () -> Unit)?,
  trailing: (@Composable () -> Unit)?,
  overline: (@Composable () -> Unit)?,
  supporting: (@Composable () -> Unit)?,
  content: @Composable () -> Unit,
) {
  if (onClick != null) {
    SegmentedListItem(
      onClick = onClick,
      shapes = segmentShapes(),
      modifier = modifier,
      colors = rowColors(),
      enabled = enabled,
      leadingContent = leading,
      trailingContent = trailing,
      overlineContent = overline,
      supportingContent = supporting,
      content = content,
    )
  } else {
    SegmentedListItem(
      shapes = segmentShapes(),
      modifier = modifier,
      colors = rowColors(),
      enabled = enabled,
      leadingContent = leading,
      trailingContent = trailing,
      overlineContent = overline,
      supportingContent = supporting,
      content = content,
    )
  }
}

/**
 * A row of a settings list that is a switch: the whole row turns it, read as a switch, rather than
 * the small switch at its end alone.
 */
@Composable
fun SettingsSwitchRow(
  headline: String,
  @DrawableRes icon: Int?,
  checked: Boolean,
  onCheckedChange: (Boolean) -> Unit,
  modifier: Modifier = Modifier,
  supporting: String? = null,
  leading: (@Composable () -> Unit)? = null,
  oneLine: Boolean = false,
  enabled: Boolean = true,
) {
  val lines = if (oneLine) 1 else Int.MAX_VALUE
  SegmentedListItem(
    onClick = { onCheckedChange(!checked) },
    shapes = segmentShapes(),
    modifier =
      modifier.semantics(mergeDescendants = true) {
        role = Role.Switch
        toggleableState = ToggleableState(checked)
      },
    enabled = enabled,
    colors = rowColors(),
    leadingContent = leading ?: icon?.let { { RowIcon(it, MaterialTheme.colorScheme.primary) } },
    // accentSwitch, the accent held under 墨's and 黒板's near-white, so the thumb stays clear of its track (#798).
    trailingContent = {
      Switch(checked, onCheckedChange = null, enabled = enabled, colors = SwitchDefaults.colors(checkedTrackColor = LocalThemeColors.current.accentSwitch))
    },
    supportingContent = supporting?.let { { Text(it, maxLines = lines, overflow = TextOverflow.Ellipsis) } },
  ) {
    Text(headline, maxLines = lines, overflow = TextOverflow.Ellipsis)
  }
}

/**
 * A row of a settings list that is one choice of the section's, led by its radio button: picked, it
 * is drawn on the selected container, as Material 3 Expressive's lists mark the one chosen. Its
 * section is a selectable group.
 */
@Composable
fun SettingsRadioRow(headline: String, selected: Boolean, onClick: () -> Unit, modifier: Modifier = Modifier, supporting: String? = null, trailing: (@Composable () -> Unit)? = null) {
  SegmentedListItem(
    selected = selected,
    onClick = onClick,
    shapes = segmentShapes(),
    modifier = modifier,
    colors = rowColors(),
    leadingContent = { RadioButton(selected = selected, onClick = null) },
    trailingContent = trailing,
    supportingContent = supporting?.let { { Text(it) } },
  ) {
    Text(headline)
  }
}

/** A row of a settings list that is one of a section's checks, led by its checkbox. */
@Composable
fun SettingsCheckRow(
  headline: String,
  checked: Boolean,
  onCheckedChange: (Boolean) -> Unit,
  modifier: Modifier = Modifier,
  supporting: String? = null,
  leading: (@Composable () -> Unit)? = null,
  enabled: Boolean = true,
) {
  SegmentedListItem(
    checked = checked,
    onCheckedChange = onCheckedChange,
    shapes = segmentShapes(),
    modifier = modifier,
    enabled = enabled,
    colors = rowColors(),
    leadingContent = { Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) { Checkbox(checked = checked, onCheckedChange = null, enabled = enabled); leading?.invoke() } },
    supportingContent = supporting?.let { { Text(it) } },
  ) {
    Text(headline)
  }
}

/**
 * One of a few words picked with Material 3 Expressive's connected button group, as its toggle
 * buttons replace the segmented buttons: the picked one filled, its corners rounding out, each read
 * as a choice of the group as [spoken] says.
 */
@Composable
fun <T> ChoiceButtons(
  options: List<T>,
  picked: T,
  label: @Composable (T) -> String,
  spoken: @Composable (T) -> String = label,
  modifier: Modifier = Modifier.padding(horizontal = 16.dp),
  onPick: (T) -> Unit,
) {
  Row(modifier.fillMaxWidth().selectableGroup(), horizontalArrangement = Arrangement.spacedBy(ButtonGroupDefaults.ConnectedSpaceBetween)) {
    options.forEachIndexed { index, option ->
      val description = spoken(option)
      val selected = option == picked
      ToggleButton(
        checked = selected,
        onCheckedChange = { if (!selected) onPick(option) },
        modifier =
          Modifier.weight(1f).clearAndSetSemantics {
            contentDescription = description
            role = Role.RadioButton
            this.selected = selected
            onClick { if (!selected) onPick(option); true }
          },
        shapes =
          when (index) {
            0 -> ButtonGroupDefaults.connectedLeadingButtonShapes()
            options.lastIndex -> ButtonGroupDefaults.connectedTrailingButtonShapes()
            else -> ButtonGroupDefaults.connectedMiddleButtonShapes()
          },
        // Unpicked, on the rows' fill, so the group reads as one control on the page.
        colors = ToggleButtonDefaults.colors(containerColor = LocalThemeColors.current.fillQuaternary),
        contentPadding = PaddingValues(horizontal = 4.dp),
      ) {
        Text(label(option), maxLines = 1)
      }
    }
  }
}

@Composable
private fun RowIcon(@DrawableRes icon: Int, tint: Color) {
  Icon(painterResource(icon), contentDescription = null, tint = tint)
}

/**
 * A section's heading in a settings list, read as a heading, its words where its rows' start: a
 * [SettingsSection]'s own, or one over other content, kept off the screen's edge by [modifier].
 */
@Composable
fun SectionHeader(text: String, modifier: Modifier = Modifier.padding(horizontal = 16.dp)) {
  Text(
    text,
    style = MaterialTheme.typography.titleSmall,
    color = MaterialTheme.colorScheme.primary,
    modifier = modifier.padding(start = 16.dp, top = 20.dp, end = 16.dp, bottom = 8.dp).semantics { heading() },
  )
}

/** What a settings list says under its rows, its words where its rows' start, as [SectionHeader]'s. */
@Composable
fun Footnote(text: String, modifier: Modifier = Modifier.padding(horizontal = 16.dp)) {
  Text(
    text,
    style = MaterialTheme.typography.bodyMedium,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
    modifier = modifier.padding(horizontal = 16.dp, vertical = 8.dp),
  )
}
