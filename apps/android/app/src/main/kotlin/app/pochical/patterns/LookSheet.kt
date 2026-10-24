package app.pochical.patterns

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.EmojiPickerSheet
import app.pochical.Footnote
import app.pochical.IconPickerSheet
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.Look
import app.pochical.MarkChoiceGrid
import app.pochical.MarkColorGrid
import app.pochical.MarkFrame
import app.pochical.MarkLetterField
import app.pochical.MarkStyle
import app.pochical.R
import app.pochical.ShiftMark
import app.pochical.calendar.Pattern
import app.pochical.design.MarkIconNames
import app.pochical.design.ReadyPatterns
import app.pochical.design.TextLimits
import app.pochical.withPicked

/** The pattern's mark on the frame a group's mark stands on, as its page heads with it. */
@Composable
fun MarkOnFrame(pattern: Pattern, modifier: Modifier = Modifier) {
  MarkFrame(modifier) { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 44.dp) }
}

/**
 * 印と色: the mark in each look, so what people on other styles see is never left out, and its
 * color (spec/shift-patterns.md, Picking a mark's icon), from the pickers a group's mark takes too.
 * [onChange] gives the pattern as changed and the part picked by hand, which is never guessed from
 * the name again.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LookSheet(draft: Pattern, others: List<Pattern>, onChange: (Pattern, LookPart?) -> Unit, onDismiss: () -> Unit) {
  val colors = LocalThemeColors.current
  val look = LocalDeviceSettings.current.device.look
  var shown by rememberSaveable { mutableStateOf(look.style) }
  var choosingIcon by rememberSaveable { mutableStateOf(false) }
  var choosingEmoji by rememberSaveable { mutableStateOf(false) }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    Column(
      Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text(stringResource(R.string.look_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
      ShiftMark(draft.icon, draft.emoji, draft.symbol, draft.color, size = 48.dp, look = sample(look, shown))
      SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        val styles = listOf(MarkStyle.Icon to R.string.mark_kind_icon, MarkStyle.Emoji to R.string.mark_kind_emoji, MarkStyle.Badge to R.string.mark_kind_letter)
        styles.forEachIndexed { index, (style, title) ->
          SegmentedButton(
            selected = shown == style,
            onClick = { shown = style },
            shape = SegmentedButtonDefaults.itemShape(index, styles.size),
          ) {
            Text(stringResource(title))
          }
        }
      }
      when (shown) {
        MarkStyle.Icon -> {
          MarkChoiceGrid(
            withPicked(ReadyPatterns.markIcons, draft.icon),
            draft.icon,
            { MarkIconNames.names[it] ?: it },
            { onChange(draft.copy(icon = it), LookPart.Icon) },
          ) {
            ShiftMark(it, draft.emoji, draft.symbol, draft.color, size = 28.dp, look = sample(look, MarkStyle.Icon))
          }
          TextButton(onClick = { choosingIcon = true }) { Text(stringResource(R.string.mark_more_icons)) }
        }
        MarkStyle.Emoji -> {
          MarkChoiceGrid(withPicked(ReadyPatterns.markEmojis, draft.emoji), draft.emoji, { it }, { onChange(draft.copy(emoji = it), LookPart.Emoji) }) {
            Text(it, fontSize = 26.sp)
          }
          TextButton(onClick = { choosingEmoji = true }) { Text(stringResource(R.string.mark_more_emoji)) }
        }
        MarkStyle.Badge -> MarkLetterField(draft.symbol, TextLimits.shiftMark) { onChange(draft.copy(symbol = it), LookPart.Symbol) }
      }
      lookalike(draft, others, shown)?.let { Text(it, color = colors.dangerDefault, style = MaterialTheme.typography.bodySmall) }
      // Emoji bring colors of their own.
      if (shown != MarkStyle.Emoji) {
        Text(
          stringResource(R.string.mark_color),
          style = MaterialTheme.typography.titleSmall,
          color = MaterialTheme.colorScheme.primary,
          modifier = Modifier.fillMaxWidth().semantics { heading() },
        )
        MarkColorGrid(draft.color, { onChange(draft.copy(color = it), null) })
        if (!look.colored) Footnote(stringResource(R.string.look_one_tone))
      }
    }
  }
  if (choosingIcon) {
    IconPickerSheet(
      draft.icon,
      onPick = {
        onChange(draft.copy(icon = it), LookPart.Icon)
        choosingIcon = false
      },
      onDismiss = { choosingIcon = false },
    ) {
      ShiftMark(it, draft.emoji, draft.symbol, draft.color, size = 26.dp, look = sample(look, MarkStyle.Icon))
    }
  }
  if (choosingEmoji) {
    EmojiPickerSheet(
      onPick = {
        onChange(draft.copy(emoji = it), LookPart.Emoji)
        choosingEmoji = false
      },
      onDismiss = { choosingEmoji = false },
    )
  }
}

/** The person's look drawn in [style], every mark in its own color. */
private fun sample(look: Look, style: MarkStyle) = look.copy(style = style, colored = true)

/** Another pattern drawn the same in this look, said under the choices. */
@Composable
private fun lookalike(draft: Pattern, others: List<Pattern>, style: MarkStyle): String? {
  val (what, same) =
    when (style) {
      MarkStyle.Icon ->
        R.string.look_alike_icon to { other: Pattern ->
          other.color == draft.color &&
            if (draft.icon == ReadyPatterns.FALLBACK_ICON) other.icon == draft.icon && other.symbol == draft.symbol else other.icon == draft.icon
        }
      MarkStyle.Emoji -> R.string.look_alike_emoji to { other: Pattern -> other.emoji == draft.emoji }
      MarkStyle.Badge -> R.string.look_alike_letter to { other: Pattern -> other.symbol == draft.symbol && other.color == draft.color }
    }
  val alike = others.firstOrNull(same) ?: return null
  return stringResource(R.string.look_alike, stringResource(what), alike.name)
}
