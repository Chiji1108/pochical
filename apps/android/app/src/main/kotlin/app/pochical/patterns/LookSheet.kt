package app.pochical.patterns

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.Footnote
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.Look
import app.pochical.MarkStyle
import app.pochical.R
import app.pochical.ShiftMark
import app.pochical.calendar.Pattern
import app.pochical.design.MarkIconNames
import app.pochical.design.Radius
import app.pochical.design.ReadyPatterns
import app.pochical.design.TextLimits
import app.pochical.kit.firstCharacter
import app.pochical.kit.isEmoji
import app.pochical.kit.markLetter
import app.pochical.kit.markIconSections

/** The pattern's mark on the frame a group's mark stands on, as its page heads with it. */
@Composable
fun MarkOnFrame(pattern: Pattern, modifier: Modifier = Modifier) {
  Box(
    modifier.size(88.dp).background(LocalThemeColors.current.fillQuaternary, CircleShape),
    contentAlignment = Alignment.Center,
  ) {
    ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 44.dp)
  }
}

/**
 * 印と色: the mark in each look, so what people on other styles see is never left out, and its
 * color (spec/shift-patterns.md, Picking a mark's icon). [onChange] gives the pattern as changed and
 * the part picked by hand, which is never guessed from the name again.
 */
@OptIn(ExperimentalMaterial3Api::class, ExperimentalLayoutApi::class)
@Composable
fun LookSheet(draft: Pattern, others: List<Pattern>, onChange: (Pattern, LookPart?) -> Unit, onDismiss: () -> Unit) {
  val colors = LocalThemeColors.current
  val look = LocalDeviceSettings.current.device.look
  var shown by rememberSaveable { mutableStateOf(look.style) }
  var choosingIcon by rememberSaveable { mutableStateOf(false) }
  var choosingEmoji by rememberSaveable { mutableStateOf(false) }
  ModalBottomSheet(onDismissRequest = onDismiss, sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)) {
    if (choosingIcon) {
      IconPicker(
        draft,
        onPick = {
          onChange(draft.copy(icon = it), LookPart.Icon)
          choosingIcon = false
        },
        onBack = { choosingIcon = false },
      )
      return@ModalBottomSheet
    }
    Column(
      Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp).padding(bottom = 24.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp),
      horizontalAlignment = Alignment.CenterHorizontally,
    ) {
      Text(stringResource(R.string.look_title), style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { heading() })
      ShiftMark(draft.icon, draft.emoji, draft.symbol, draft.color, size = 48.dp, look = sample(look, shown))
      SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
        val styles = listOf(MarkStyle.Icon to R.string.look_icon, MarkStyle.Emoji to R.string.look_emoji, MarkStyle.Badge to R.string.look_letter)
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
          FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (icon in withPicked(ReadyPatterns.markIcons, draft.icon)) {
              Choice(icon == draft.icon, MarkIconNames.names[icon] ?: icon, { onChange(draft.copy(icon = icon), LookPart.Icon) }) {
                ShiftMark(icon, draft.emoji, draft.symbol, draft.color, size = 28.dp, look = sample(look, MarkStyle.Icon))
              }
            }
          }
          TextButton(onClick = { choosingIcon = true }) {
            Icon(painterResource(R.drawable.ic_add), null, Modifier.size(18.dp))
            Text(stringResource(R.string.look_more_icons), Modifier.padding(start = 8.dp))
          }
        }
        MarkStyle.Emoji -> {
          FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            for (emoji in withPicked(ReadyPatterns.markEmojis, draft.emoji)) {
              Choice(emoji == draft.emoji, emoji, { onChange(draft.copy(emoji = emoji), LookPart.Emoji) }) {
                Text(emoji, fontSize = 26.sp)
              }
            }
          }
          TextButton(onClick = { choosingEmoji = true }) {
            Icon(painterResource(R.drawable.ic_add), null, Modifier.size(18.dp))
            Text(stringResource(R.string.look_more_emoji), Modifier.padding(start = 8.dp))
          }
        }
        MarkStyle.Badge -> {
          // As iOS's MarkLetterField: typing into a full letter replaces it, and a letter emptied
          // keeps the one before, shown under the field, as a mark always has one.
          var letter by remember { mutableStateOf(TextFieldValue(draft.symbol)) }
          // The letter as last committed, which an edit is measured against.
          var committed by remember { mutableStateOf(draft.symbol) }
          OutlinedTextField(
            letter,
            { typed ->
              if (typed.composition != null) {
                letter = typed
                return@OutlinedTextField
              }
              val text = markLetter(committed, typed.text, TextLimits.shiftMark)
              committed = text
              letter = TextFieldValue(text, TextRange(text.length))
              val symbol = text.trim()
              if (symbol.isNotEmpty()) onChange(draft.copy(symbol = symbol), LookPart.Symbol)
            },
            Modifier.fillMaxWidth(),
            label = { Text(stringResource(R.string.look_letter)) },
            placeholder = { Text(draft.symbol) },
            singleLine = true,
          )
        }
      }
      lookalike(draft, others, shown)?.let { Text(it, color = colors.dangerDefault, style = MaterialTheme.typography.bodySmall) }
      // Emoji bring colors of their own.
      if (shown != MarkStyle.Emoji) {
        Text(
          stringResource(R.string.look_color),
          style = MaterialTheme.typography.titleSmall,
          color = MaterialTheme.colorScheme.primary,
          modifier = Modifier.fillMaxWidth().semantics { heading() },
        )
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp, Alignment.CenterHorizontally), verticalArrangement = Arrangement.spacedBy(8.dp)) {
          colors.marks.forEachIndexed { slot, mark ->
            Choice(slot == draft.color, mark.name, { onChange(draft.copy(color = slot), null) }, shape = CircleShape) {
              Box(Modifier.size(32.dp).background(mark.color, CircleShape))
            }
          }
        }
        if (!look.colored) Footnote(stringResource(R.string.look_one_tone))
      }
    }
  }
  if (choosingEmoji) {
    EmojiDialog(onPick = { onChange(draft.copy(emoji = it), LookPart.Emoji) }, onDismiss = { choosingEmoji = false })
  }
}

/** The person's look drawn in [style], every mark in its own color. */
private fun sample(look: Look, style: MarkStyle) = look.copy(style = style, colored = true)

/** The marks offered first, with one picked from elsewhere leading them while it is the mark's. */
private fun withPicked(offered: List<String>, picked: String): List<String> = if (picked in offered) offered else listOf(picked) + offered

/** One of the choices, the picked one edged in the accent. */
@Composable
private fun Choice(
  picked: Boolean,
  description: String,
  onPick: () -> Unit,
  shape: androidx.compose.ui.graphics.Shape = RoundedCornerShape(Radius.md),
  size: Dp = 48.dp,
  content: @Composable () -> Unit,
) {
  val colors = LocalThemeColors.current
  Box(
    Modifier.size(size)
      .border(if (picked) 2.dp else 1.dp, if (picked) colors.accentDefault else colors.borderDefault, shape)
      .clickable(onClick = onPick)
      .clearAndSetSemantics {
        contentDescription = description
        selected = picked
        role = Role.RadioButton
      },
    contentAlignment = Alignment.Center,
  ) {
    content()
  }
}

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

/**
 * ほかのアイコンを選ぶ: every icon a mark can take, sorted into kinds, each drawn as the mark would be
 * with the one picked edged, and a search over their names and words.
 */
@Composable
private fun IconPicker(draft: Pattern, onPick: (String) -> Unit, onBack: () -> Unit) {
  val look = LocalDeviceSettings.current.device.look
  var query by rememberSaveable { mutableStateOf("") }
  val sections = remember(query) { markIconSections(query) }
  // A back goes to 印と色, as ← does, rather than closing the sheet.
  BackHandler(onBack = onBack)
  Column(Modifier.fillMaxHeight()) {
    Row(Modifier.fillMaxWidth().padding(horizontal = 4.dp), verticalAlignment = Alignment.CenterVertically) {
      IconButton(onClick = onBack) { Icon(painterResource(R.drawable.ic_back), stringResource(R.string.back)) }
      OutlinedTextField(
        query,
        { query = it },
        Modifier.weight(1f).padding(end = 12.dp),
        placeholder = { Text(stringResource(R.string.look_icon_search)) },
        singleLine = true,
      )
    }
    LazyVerticalGrid(GridCells.Adaptive(56.dp), Modifier.fillMaxWidth().padding(horizontal = 12.dp)) {
      for (section in sections) {
        item(span = { GridItemSpan(maxLineSpan) }) {
          Text(
            section.title,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.primary,
            modifier = Modifier.padding(top = 16.dp, bottom = 8.dp).semantics { heading() },
          )
        }
        items(section.icons, key = { "${section.title}/$it" }) { icon ->
          Box(Modifier.padding(4.dp), contentAlignment = Alignment.Center) {
            Choice(icon == draft.icon, MarkIconNames.names[icon] ?: icon, { onPick(icon) }) {
              ShiftMark(icon, draft.emoji, draft.symbol, draft.color, size = 26.dp, look = sample(look, MarkStyle.Icon))
            }
          }
        }
      }
    }
  }
}

/** ほかの絵文字を選ぶ: one emoji typed from the keyboard's own emoji, as iOS opens its emoji keyboard. */
@Composable
private fun EmojiDialog(onPick: (String) -> Unit, onDismiss: () -> Unit) {
  var typed by rememberSaveable { mutableStateOf("") }
  val emoji = firstCharacter(typed.trim()).takeIf(::isEmoji)
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.look_more_emoji)) },
    text = { OutlinedTextField(typed, { typed = it }, label = { Text(stringResource(R.string.look_emoji_field)) }, singleLine = true) },
    confirmButton = {
      TextButton(
        enabled = emoji != null,
        onClick = {
          emoji?.let(onPick)
          onDismiss()
        },
      ) {
        Text(stringResource(R.string.ok))
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
  )
}
