package app.pochical.patterns

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.RadioButton
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.saveable.rememberSerializable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.semantics.role
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import app.pochical.Footnote
import app.pochical.LimitedTextField
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.PageNavigation
import app.pochical.R
import app.pochical.RowEnd
import app.pochical.SectionRow
import app.pochical.SettingsPage
import app.pochical.SettingsRow
import app.pochical.SettingsSwitchRow
import app.pochical.ShiftMark
import app.pochical.calendar.LocalOwnDays
import app.pochical.calendar.Pattern
import app.pochical.calendar.TimeDialog
import app.pochical.calendar.row
import app.pochical.design.MarkIconNames
import app.pochical.design.TextLimits
import app.pochical.kit.MarkStyle
import app.pochical.kit.PatternRefusal
import app.pochical.kit.ShiftTime
import app.pochical.kit.fitsPattern
import app.pochical.kit.guessLook
import app.pochical.kit.nextColor
import app.pochical.kit.refusesArchiving
import app.pochical.kit.repeats
import app.pochical.limitText
import app.pochical.mark
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable

/** Which of a mark's parts the person picked by hand: never guessed from the name again. */
@Serializable
enum class LookPart {
  Emoji,
  Icon,
  Symbol,
}

/**
 * パターンを編集, or with [isNew] a pattern made from scratch under [id] (spec/shift-patterns.md, A
 * pattern's page): its mark at the top, which opens 印と色; the name and the time; whether it counts
 * as a day off and the next day's pattern; on a saved one, 入力に出す and このパターンを削除, each as the
 * repeating orders allow, read live as they change. 保存 (追加 for a new one) keeps it; a new one
 * goes back to the list past パターンを追加.
 */
@Composable
fun PatternEditor(id: String, isNew: Boolean, navigation: PageNavigation) {
  val days = LocalOwnDays.current
  val calendar by days.calendar.collectAsStateWithLifecycle()
  val colors = LocalThemeColors.current
  val saved = calendar.patterns.find { it.id == id }
  val initial =
    remember(saved == null) {
      saved
        ?: guessLook("").let { look ->
          Pattern(
            id = id,
            name = "",
            icon = look.icon,
            emoji = look.emoji,
            symbol = look.symbol,
            color = nextColor(calendar.patterns.map { it.color }, colors.marks.size),
            time = ShiftTime("09:00", "18:00"),
            countsAsOff = false,
          )
        }
    }
  // Kept or deleted here, the page goes back once, by the button that did it.
  var leaving by remember { mutableStateOf(false) }
  // A saved pattern deleted elsewhere while its page is open has nothing left to edit.
  LaunchedEffect(saved == null) { if (!isNew && saved == null && !leaving) navigation.back() }
  var draft by rememberSerializable { mutableStateOf(initial) }
  var name by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(initial.name)) }
  var allDay by rememberSaveable { mutableStateOf(initial.time == null) }
  var time by rememberSerializable { mutableStateOf(initial.time ?: ShiftTime("09:00", "18:00")) }
  // A saved pattern's mark stays as it is when it is renamed.
  var picked by rememberSerializable { mutableStateOf(if (isNew) emptySet() else LookPart.entries.toSet()) }
  var looking by rememberSaveable { mutableStateOf(false) }
  var choosingNextDay by rememberSaveable { mutableStateOf(false) }
  var pickingStart by rememberSaveable { mutableStateOf<Boolean?>(null) }
  var deletingDays by rememberSaveable { mutableStateOf<Int?>(null) }
  var refused by rememberSaveable { mutableStateOf(false) }
  val scope = rememberCoroutineScope()

  // The next day's choices: patterns in use, and the one it names.
  val others = calendar.patterns.filter { it.id != id && (!it.archived || it.id == draft.nextDay) }
  val repeating = repeats(id, calendar.orders)
  // Locked only where turning it off is refused: one turned off before an order took it on may be turned back on.
  val archivingRefused = refusesArchiving(id, saved?.archived ?: false, calendar.orders)
  val shapedName = limitText(name.text, TextLimits.shiftName).trim()
  val shaped = draft.copy(name = shapedName, time = if (allDay) null else time)

  fun rename(text: TextFieldValue) {
    name = text
    val look = guessLook(name.text)
    draft =
      draft.copy(
        emoji = if (LookPart.Emoji in picked) draft.emoji else look.emoji,
        icon = if (LookPart.Icon in picked) draft.icon else look.icon,
        symbol = if (LookPart.Symbol in picked) draft.symbol else look.symbol,
      )
  }

  /** Goes on as [done] once kept; a refusal of the repeating orders is said instead. */
  fun kept(refusal: PatternRefusal?, done: () -> Unit) {
    if (refusal == null) {
      leaving = true
      done()
    } else {
      refused = true
    }
  }

  SettingsPage(
    stringResource(if (isNew) R.string.patterns_add else R.string.pattern_edit),
    onBack = navigation::back,
    actions = {
      TextButton(
        // Only what the server takes, so a pattern saved stays once sent.
        enabled = fitsPattern(shaped.row),
        onClick = {
          scope.launch { kept(days.savePattern(shaped)) { if (isNew) navigation.back(2) else navigation.back() } }
        },
      ) {
        Text(stringResource(if (isNew) R.string.add else R.string.save))
      }
    },
  ) { padding ->
    LazyColumn(contentPadding = padding) {
      item {
        val label = stringResource(R.string.pattern_mark)
        val description = markDescription(draft)
        // The mark and its words, one button that names the mark, as a group's アイコン heads its page.
        Column(
          Modifier.fillMaxWidth().padding(vertical = 16.dp).clearAndSetSemantics {
            contentDescription = "$label、$description"
            role = Role.Button
            onClick { looking = true; true }
          },
          horizontalAlignment = Alignment.CenterHorizontally,
          verticalArrangement = Arrangement.spacedBy(8.dp),
        ) {
          MarkOnFrame(draft, Modifier.clickable { looking = true })
          TextButton(onClick = { looking = true }) { Text(label) }
        }
      }
      item {
        LimitedTextField(
          name,
          ::rename,
          TextLimits.shiftName,
          stringResource(R.string.name),
          Modifier.fillMaxWidth().padding(horizontal = 16.dp),
          placeholder = stringResource(R.string.pattern_name_example),
        )
      }
      item { SectionRow(0, 1) { SettingsSwitchRow(stringResource(R.string.pattern_no_time), R.drawable.ic_schedule, allDay, { allDay = it }) } }
      if (!allDay) {
        item {
          Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
            TextButton(onClick = { pickingStart = true }) { Text(time.start.removePrefix("0"), style = MaterialTheme.typography.titleMedium) }
            Text("–", color = colors.textTertiary)
            TextButton(onClick = { pickingStart = false }) { Text(time.end.removePrefix("0"), style = MaterialTheme.typography.titleMedium) }
          }
        }
      }
      item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
      item {
        SwitchRow(stringResource(R.string.pattern_counts_off), stringResource(R.string.pattern_counts_off_note), draft.countsAsOff) {
          draft = draft.copy(countsAsOff = it)
        }
      }
      item {
        val next = others.find { it.id == draft.nextDay }
        SectionRow(0, 1, Modifier.padding(top = 8.dp)) {
          SettingsRow(
            stringResource(R.string.pattern_next_day),
            R.drawable.ic_event,
            onClick = { choosingNextDay = true },
            end = RowEnd.None,
            value = if (next == null) stringResource(R.string.none) else null,
            valueContent =
              next?.let {
                {
                  Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
                    ShiftMark(it.icon, it.emoji, it.symbol, it.color, size = 18.dp)
                    Text(it.name, style = MaterialTheme.typography.bodyMedium)
                  }
                }
              },
          )
        }
      }
      // A state undone as easily, so a switch saved with the rest; a new pattern is in use.
      if (!isNew) {
        item { HorizontalDivider(Modifier.padding(vertical = 8.dp)) }
        item {
          SwitchRow(
            stringResource(R.string.pattern_in_use),
            null,
            !draft.archived,
            enabled = !(archivingRefused && !draft.archived),
          ) {
            draft = draft.copy(archived = !it)
          }
        }
        item {
          Footnote(stringResource(if (archivingRefused) R.string.pattern_in_use_refused else R.string.pattern_in_use_note))
        }
      }
      // Said once: under the switch, while that is refused too.
      if (!isNew && !archivingRefused) {
        item {
          if (repeating) {
            Footnote(stringResource(R.string.pattern_delete_refused))
          } else {
            TextButton(
              onClick = {
                scope.launch {
                  val shown = days.daysShowing(id)
                  if (shown == 0) kept(days.deletePattern(id), navigation::back) else deletingDays = shown
                }
              },
              modifier = Modifier.fillMaxWidth().padding(16.dp),
              colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
            ) {
              Text(stringResource(R.string.pattern_delete))
            }
          }
        }
      }
    }
  }

  if (looking) {
    LookSheet(draft, others, onChange = { changed, part ->
      draft = changed
      if (part != null) picked = picked + part
    }, onDismiss = { looking = false })
  }
  if (choosingNextDay) {
    NextDayDialog(name.text, others, draft.nextDay, onPick = { draft = draft.copy(nextDay = it) }, onDismiss = { choosingNextDay = false })
  }
  pickingStart?.let { start ->
    TimeDialog(
      time = if (start) time.start else time.end,
      onPick = { time = if (start) time.copy(start = it) else time.copy(end = it) },
      onDismiss = { pickingStart = null },
    )
  }
  deletingDays?.let { count ->
    AlertDialog(
      onDismissRequest = { deletingDays = null },
      title = { Text(stringResource(R.string.pattern_delete_title, initial.name)) },
      text = { Text(stringResource(R.string.pattern_delete_body, count, initial.name)) },
      confirmButton = {
        TextButton(
          onClick = {
            deletingDays = null
            scope.launch { kept(days.deletePattern(id), navigation::back) }
          },
          colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
          Text(stringResource(R.string.delete))
        }
      },
      dismissButton = { TextButton(onClick = { deletingDays = null }) { Text(stringResource(R.string.cancel)) } },
    )
  }
  if (refused) {
    AlertDialog(
      onDismissRequest = { refused = false },
      title = { Text(stringResource(R.string.pattern_refused_title)) },
      text = { Text(stringResource(R.string.pattern_refused_body)) },
      confirmButton = { TextButton(onClick = { refused = false }) { Text(stringResource(R.string.ok)) } },
    )
  }
}

/** A row with a switch, the whole row toggling it, and words under its name. */
@Composable
fun SwitchRow(
  title: String,
  note: String?,
  on: Boolean,
  enabled: Boolean = true,
  leading: (@Composable () -> Unit)? = null,
  onChange: (Boolean) -> Unit,
) {
  ListItem(
    headlineContent = { Text(title) },
    leadingContent = leading,
    supportingContent = note?.let { { Text(it) } },
    trailingContent = {
      // accentSwitch, the accent held under 墨's and 黒板's near-white, so the thumb stays clear of its track (#798).
      Switch(
        checked = on,
        onCheckedChange = null,
        enabled = enabled,
        colors = SwitchDefaults.colors(checkedTrackColor = LocalThemeColors.current.accentSwitch),
      )
    },
    modifier = Modifier.selectable(selected = on, enabled = enabled, role = Role.Switch) { onChange(!on) },
  )
}

/** The mark as the person's スタイル draws it, and its color, for a screen reader. */
@Composable
private fun markDescription(pattern: Pattern): String {
  val look = LocalDeviceSettings.current.device.look
  val mark =
    when (look.style) {
      MarkStyle.Icon -> MarkIconNames.names[pattern.icon] ?: pattern.icon
      MarkStyle.Emoji -> pattern.emoji
      MarkStyle.Badge -> pattern.symbol
    }
  return if (look.colored && look.style != MarkStyle.Emoji) "$mark、${LocalThemeColors.current.mark(pattern.color).name}" else mark
}

/** 翌日のパターン: none, or another of the person's patterns, picked as one of several. */
@Composable
private fun NextDayDialog(name: String, others: List<Pattern>, nextDay: String?, onPick: (String?) -> Unit, onDismiss: () -> Unit) {
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.pattern_next_day)) },
    text = {
      Column(Modifier.selectableGroup().verticalScroll(rememberScrollState())) {
        Text(
          stringResource(R.string.pattern_next_day_note, name.trim().ifEmpty { stringResource(R.string.pattern_this) }),
          style = MaterialTheme.typography.bodyMedium,
          modifier = Modifier.padding(bottom = 8.dp),
        )
        for (choice in listOf<Pattern?>(null) + others) {
          val picked = choice?.id == nextDay
          Row(
            Modifier.fillMaxWidth()
              .selectable(selected = picked, role = Role.RadioButton) {
                onPick(choice?.id)
                onDismiss()
              }
              .padding(vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
          ) {
            RadioButton(selected = picked, onClick = null)
            if (choice == null) {
              Text(stringResource(R.string.none))
            } else {
              ShiftMark(choice.icon, choice.emoji, choice.symbol, choice.color, size = 20.dp)
              Text(choice.name)
            }
          }
        }
      }
    },
    confirmButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
  )
}
