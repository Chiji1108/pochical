package app.pochical.calendar

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.unit.dp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ShiftMark
import app.pochical.design.COWORKERS_MAX
import app.pochical.design.TextLimits
import app.pochical.kit.ShiftTime
import app.pochical.kit.hoursText
import app.pochical.kit.minutes
import app.pochical.kit.timeChange
import app.pochical.kit.limitText
import app.pochical.limited
import java.time.LocalDate

/**
 * A day opened from the month, under its week: its shift, its own hours,
 * the people on it and a memo (spec/calendar.md, A day's detail). Its bar
 * holds the date, ‹ › to the day before and after, and × to close.
 */
@Composable
fun DayDetail(
  day: LocalDate,
  calendar: OwnCalendar,
  days: OwnDays,
  peopleOpen: Boolean,
  onPeopleOpenChange: (Boolean) -> Unit,
  onStep: (Int) -> Unit,
  /** Whether the day before (-1) or after (1) is one the calendar reaches. */
  canStep: (Int) -> Boolean,
  onClose: () -> Unit,
  onPickShift: () -> Unit,
  modifier: Modifier = Modifier,
) {
  val entry = calendar.shown(day, day)[day]
  val pattern = entry?.let { shown -> calendar.patterns.find { it.id == shown.shift } }
  // Above the keyboard, so the memo being written scrolls into sight.
  Column(modifier.imePadding().verticalScroll(rememberScrollState()).navigationBarsPadding()) {
    Row(Modifier.fillMaxWidth().padding(start = 16.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
      Text(
        day.fullText,
        Modifier.weight(1f).semantics { heading() },
        style = MaterialTheme.typography.titleMedium,
      )
      IconButton(onClick = { onStep(-1) }, enabled = canStep(-1)) {
        Icon(painterResource(R.drawable.ic_chevron_left), stringResource(R.string.day_before))
      }
      IconButton(onClick = { onStep(1) }, enabled = canStep(1)) {
        Icon(painterResource(R.drawable.ic_chevron_right), stringResource(R.string.day_after))
      }
      IconButton(onClick = onClose) { Icon(painterResource(R.drawable.ic_close), stringResource(R.string.close)) }
    }
    ListItem(
      headlineContent = { Text(stringResource(R.string.day_shift)) },
      trailingContent = {
        if (pattern == null) {
          Text(stringResource(R.string.none))
        } else {
          Row(horizontalArrangement = Arrangement.spacedBy(6.dp), verticalAlignment = Alignment.CenterVertically) {
            ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 18.dp)
            Text(pattern.name, maxLines = 1)
          }
        }
      },
      modifier = Modifier.clickable(onClick = onPickShift),
    )
    val time = pattern?.time
    if (entry != null && time != null) {
      HoursRow(entry, time) { days.set(day, it) }
    }
    // Someone works alongside on any shift but a day off.
    if (entry != null && pattern != null && !pattern.countsAsOff) {
      PeopleRows(entry, calendar.coworkers, peopleOpen, onPeopleOpenChange, days) { days.set(day, it) }
    }
    HorizontalDivider(Modifier.padding(vertical = 8.dp))
    // A field of its own for each day, so the one left keeps its own memo as it goes.
    key(day) { MemoField(day, calendar.note(day), days, Modifier.padding(horizontal = 16.dp)) }
    if (entry != null) {
      ClearButton(entry, calendar.coworkers) { days.set(day, null) }
    }
  }
}

/**
 * The day's own hours, each picked on Material's clock, a change from the
 * pattern's said in words (早出, 残業, else 変更済み), and 標準に戻す while
 * they differ. An hour is kept only where it differs from the pattern's.
 */
@Composable
private fun HoursRow(entry: DayEntry, time: ShiftTime, onChange: (DayEntry) -> Unit) {
  val change = timeChange(entry.start, entry.end, time)
  var picking by remember { mutableStateOf<Boolean?>(null) }
  ListItem(
    headlineContent = { Text(stringResource(R.string.day_hours)) },
    supportingContent =
      change?.let {
        {
          val moves =
            listOfNotNull(
              stringResource(R.string.day_early).takeIf { change.early },
              stringResource(R.string.day_late).takeIf { change.late },
            )
          Text(if (moves.isEmpty()) stringResource(R.string.day_hours_changed) else moves.joinToString("・"))
        }
      },
    trailingContent = {
      Row(verticalAlignment = Alignment.CenterVertically) {
        TextButton(onClick = { picking = true }) { Text((entry.start ?: time.start).removePrefix("0")) }
        Text("–", color = LocalThemeColors.current.textTertiary)
        TextButton(onClick = { picking = false }) { Text((entry.end ?: time.end).removePrefix("0")) }
      }
    },
  )
  if (entry.start != null || entry.end != null) {
    TextButton(onClick = { onChange(entry.copy(start = null, end = null)) }, Modifier.padding(horizontal = 8.dp)) {
      Text(stringResource(R.string.day_hours_reset, hoursText(time.start, time.end)))
    }
  }
  picking?.let { start ->
    TimeDialog(
      time = if (start) entry.start ?: time.start else entry.end ?: time.end,
      onPick = { picked ->
        onChange(
          if (start) entry.copy(start = picked.takeIf { it != time.start })
          else entry.copy(end = picked.takeIf { it != time.end })
        )
      },
      onDismiss = { picking = null },
    )
  }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
internal fun TimeDialog(time: String, onPick: (String) -> Unit, onDismiss: () -> Unit) {
  val minutes = minutes(time)
  val state = rememberTimePickerState(initialHour = minutes / 60, initialMinute = minutes % 60, is24Hour = true)
  AlertDialog(
    onDismissRequest = onDismiss,
    confirmButton = {
      TextButton(
        onClick = {
          onPick("%02d:%02d".format(state.hour, state.minute))
          onDismiss()
        }
      ) {
        Text(stringResource(R.string.ok))
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
    text = { TimePicker(state) },
  )
}

/**
 * 一緒に働く人, those on the day by name, unfolding into the person's
 * coworkers as filter chips and 追加, as /design's; kept unfolded as
 * another day opens, for noting people day after day.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun PeopleRows(
  entry: DayEntry,
  coworkers: List<Coworker>,
  open: Boolean,
  onOpenChange: (Boolean) -> Unit,
  days: OwnDays,
  onChange: (DayEntry) -> Unit,
) {
  // Someone deleted from 一緒に働く人 goes as the day's people are written.
  val people = entry.people.filter { id -> coworkers.any { it.id == id } }
  var adding by remember { mutableStateOf(false) }
  var full by remember { mutableStateOf(false) }
  ListItem(
    headlineContent = { Text(stringResource(R.string.day_people)) },
    supportingContent = {
      Text(
        coworkers.filter { it.id in people }.joinToString("、") { it.name }.ifEmpty { stringResource(R.string.none) },
        maxLines = 1,
      )
    },
    trailingContent = {
      Icon(painterResource(R.drawable.ic_expand_more), null, Modifier.rotate(if (open) 180f else 0f))
    },
    modifier = Modifier.clickable(onClickLabel = stringResource(R.string.day_people)) { onOpenChange(!open) },
  )
  AnimatedVisibility(open) {
    FlowRow(
      Modifier.fillMaxWidth().padding(horizontal = 16.dp),
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      for (coworker in coworkers) {
        val picked = coworker.id in people
        FilterChip(
          selected = picked,
          onClick = { onChange(entry.copy(people = if (picked) people - coworker.id else people + coworker.id)) },
          label = { Text(coworker.name) },
          leadingIcon =
            if (picked) {
              { Icon(painterResource(R.drawable.ic_check), null, Modifier.size(18.dp)) }
            } else {
              null
            },
        )
      }
      AssistChip(
        onClick = { if (coworkers.size >= COWORKERS_MAX) full = true else adding = true },
        label = { Text(stringResource(if (coworkers.isEmpty()) R.string.day_people_add_first else R.string.day_people_add)) },
        leadingIcon = { Icon(painterResource(R.drawable.ic_add), null, Modifier.size(18.dp)) },
      )
    }
  }
  if (adding) {
    NameDialog(
      onAdd = { name ->
        // Someone added from a day is on that day too.
        val added = days.addCoworker(name)
        onChange(entry.copy(people = people + added.id))
      },
      onDismiss = { adding = false },
    )
  }
  if (full) {
    AlertDialog(
      onDismissRequest = { full = false },
      confirmButton = { TextButton(onClick = { full = false }) { Text(stringResource(R.string.ok)) } },
      text = { Text(stringResource(R.string.day_people_full, COWORKERS_MAX)) },
    )
  }
}

@Composable
private fun NameDialog(onAdd: (String) -> Unit, onDismiss: () -> Unit) {
  var name by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue()) }
  AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(stringResource(R.string.day_people_add_title)) },
    text = {
      OutlinedTextField(
        name,
        { name = it.limited(TextLimits.personName) },
        label = { Text(stringResource(R.string.name)) },
        singleLine = true,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Words),
      )
    },
    confirmButton = {
      TextButton(
        onClick = {
          limitText(name.text, TextLimits.personName).trim().takeIf { it.isNotEmpty() }?.let(onAdd)
          onDismiss()
        }
      ) {
        Text(stringResource(R.string.add))
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
  )
}

/**
 * The memo, on any day, up to `TextLimits.dayNote` characters, with a
 * button that clears it at once while it holds words. It is kept when the
 * field is left, the day closes or the app goes to the background, not on
 * each letter (spec/calendar.md, Text fields).
 */
@Composable
private fun MemoField(day: LocalDate, note: String?, days: OwnDays, modifier: Modifier = Modifier) {
  var draft by rememberSaveable(stateSaver = TextFieldValue.Saver) { mutableStateOf(TextFieldValue(note.orEmpty())) }
  val keep by rememberUpdatedState {
    val memo = limitText(draft.text, TextLimits.dayNote)
    if (memo != note.orEmpty()) days.setNote(day, memo)
  }
  DisposableEffect(Unit) { onDispose { keep() } }
  LifecycleEventEffect(Lifecycle.Event.ON_STOP) { keep() }
  OutlinedTextField(
    draft,
    { draft = it.limited(TextLimits.dayNote) },
    modifier.fillMaxWidth().onFocusChanged { if (!it.isFocused) keep() },
    label = { Text(stringResource(R.string.day_memo)) },
    trailingIcon =
      if (draft.text.isNotEmpty()) {
        {
          IconButton(
            onClick = {
              draft = TextFieldValue()
              days.setNote(day, "")
            }
          ) {
            Icon(painterResource(R.drawable.ic_close), stringResource(R.string.day_memo_clear))
          }
        }
      } else {
        null
      },
    maxLines = 5,
  )
}

/**
 * この日のシフトを消す: clears the shift with its own hours and people, the
 * memo staying. With nothing more it clears at once, as one tap brings it
 * back; with hours or people that would go too, it asks first and names them.
 */
@Composable
private fun ClearButton(entry: DayEntry, coworkers: List<Coworker>, onClear: () -> Unit) {
  val lost =
    listOfNotNull(
      stringResource(R.string.day_clear_hours).takeIf { entry.start != null || entry.end != null },
      stringResource(R.string.day_people).takeIf { entry.people.any { id -> coworkers.any { it.id == id } } },
    )
  var asking by remember { mutableStateOf(false) }
  TextButton(
    onClick = { if (lost.isEmpty()) onClear() else asking = true },
    Modifier.fillMaxWidth().padding(16.dp),
    colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
  ) {
    Text(stringResource(R.string.day_clear))
  }
  if (asking) {
    AlertDialog(
      onDismissRequest = { asking = false },
      title = { Text(stringResource(R.string.day_clear_title)) },
      text = { Text(stringResource(R.string.day_clear_lost, lost.joinToString("、"))) },
      confirmButton = {
        TextButton(
          onClick = {
            asking = false
            onClear()
          },
          colors = ButtonDefaults.textButtonColors(contentColor = MaterialTheme.colorScheme.error),
        ) {
          Text(stringResource(R.string.clear))
        }
      },
      dismissButton = { TextButton(onClick = { asking = false }) { Text(stringResource(R.string.cancel)) } },
    )
  }
}
