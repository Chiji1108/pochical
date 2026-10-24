package app.pochical.repeat

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.LocalDeviceSettings
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.ShiftMark
import app.pochical.calendar.Pattern
import app.pochical.calendar.slashText
import app.pochical.calendar.weekdayColor
import app.pochical.calendar.weekdayLetter
import app.pochical.design.Radius
import app.pochical.kit.HolidaySetting
import app.pochical.kit.RepeatOrder
import app.pochical.patterns.SwitchRow
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import kotlinx.serialization.Serializable

/** How a sequence is being set: the first, a new period from a day, or the period starting on a day set again. */
@Serializable
sealed interface RepeatMode {
  @Serializable data object First : RepeatMode

  @Serializable data object Switch : RepeatMode

  /** The period starting on [start], "YYYY-MM-DD". */
  @Serializable data class Fix(val start: String) : RepeatMode
}

/** The 1st of next month: where a new order, or stopping one, starts unless picked. */
fun nextMonthStart(today: LocalDate = LocalDate.now()): LocalDate = today.withDayOfMonth(1).plusMonths(1)

/** The period in use [today], while it repeats. */
fun List<RepeatOrder>.current(today: LocalDate = LocalDate.now()): RepeatOrder? = lastOrNull { it.start <= today }?.takeIf { it.sequence.isNotEmpty() }

/** When the period at [index] runs: from its start to the day before the next one's. */
@Composable
fun periodText(orders: List<RepeatOrder>, index: Int): String {
  val start = orders[index].start.slashText
  val next = orders.getOrNull(index + 1) ?: return stringResource(R.string.repeat_period_from, start)
  return stringResource(R.string.repeat_period_range, start, next.start.minusDays(1).slashText)
}

/**
 * An order's days as its editor draws them, smaller and not to press: seven a row, so a week reads
 * as one; each says its place, or, for an order that starts on a Sunday, its weekday.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun SequenceTiles(sequence: List<String>, patterns: Map<String, Pattern>, weekly: Boolean = false) {
  val colors = LocalThemeColors.current
  val week = LocalDeviceSettings.current.device.week
  val deleted = stringResource(R.string.deleted_pattern)
  val label = sequence.joinToString("、") { patterns[it]?.name ?: deleted }
  Tiles(sequence.size, Modifier.clearAndSetSemantics { contentDescription = label }) { index ->
    val pattern = patterns[sequence[index]]
    Text(
      if (weekly) weekdayLetter(index % 7) else "${index + 1}",
      fontSize = 9.sp,
      color = if (weekly) weekdayColor(index % 7, holiday = false, week, plain = colors.textTertiary) else colors.textTertiary,
    )
    if (pattern != null) ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 16.dp)
    Text(pattern?.name ?: deleted, fontSize = 10.sp, color = colors.textSecondary, maxLines = 1)
  }
}

/** A kind of work's patterns as ポチポチ入力's keys will show them, smaller and not to press. */
@Composable
fun KeysPreview(ids: List<String>, patterns: Map<String, Pattern>) {
  val colors = LocalThemeColors.current
  val label = ids.mapNotNull { patterns[it]?.name }.joinToString("、")
  Tiles(ids.size, Modifier.clearAndSetSemantics { contentDescription = label }) { index ->
    val pattern = patterns[ids[index]] ?: return@Tiles
    ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 16.dp)
    Text(pattern.name, fontSize = 10.sp, color = colors.textPrimary, maxLines = 1)
  }
}

/** Small tiles seven a row, as wide as a week's days. */
@Composable
private fun Tiles(count: Int, modifier: Modifier, tile: @Composable (Int) -> Unit) {
  val colors = LocalThemeColors.current
  Column(modifier, verticalArrangement = Arrangement.spacedBy(4.dp)) {
    for (row in 0 until (count + 6) / 7) {
      Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
        for (column in 0 until 7) {
          val index = row * 7 + column
          if (index < count) {
            Surface(
              shape = RoundedCornerShape(Radius.sm),
              color = colors.backgroundCard,
              border = BorderStroke(1.dp, colors.borderDefault),
              modifier = Modifier.weight(1f).heightIn(min = 48.dp),
            ) {
              Column(horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) { tile(index) }
            }
          } else {
            Spacer(Modifier.weight(1f))
          }
        }
      }
    }
  }
}

/**
 * 祝日は休みにする (/design's HolidayChoice) as [setting] has it (spec/shift-patterns.md, Holidays):
 * asked while on, so it can always be turned off, or while a pattern counts as off, which alone lets
 * it be turned on; on, holidays take one picked among those as chips when there are more than one.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun HolidayChoice(patterns: List<Pattern>, on: Boolean, setting: HolidaySetting, onChange: (Boolean) -> Unit, onPick: (String) -> Unit) {
  if (!setting.shown) return
  val offs = patterns.filter { it.countsAsOff }
  SwitchRow(
    stringResource(R.string.repeat_holidays_off),
    stringResource(R.string.repeat_holidays_off_note),
    on,
    enabled = on || setting.canTurnOn,
    onChange = onChange,
  )
  if (on && offs.size > 1) {
    val label = stringResource(R.string.repeat_holiday_patterns)
    FlowRow(
      Modifier.fillMaxWidth().padding(horizontal = 16.dp).semantics { contentDescription = label },
      horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
      for (pattern in offs) {
        FilterChip(
          selected = pattern.id == setting.shift,
          onClick = { onPick(pattern.id) },
          label = { Text(pattern.name) },
          leadingIcon = { ShiftMark(pattern.icon, pattern.emoji, pattern.symbol, pattern.color, size = 16.dp) },
        )
      }
    }
  }
}

/** A day picked on Material's date picker in a dialog, opened on [day]. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun DayPickerDialog(day: LocalDate, onPick: (LocalDate) -> Unit, onDismiss: () -> Unit) {
  val state = rememberDatePickerState(initialSelectedDateMillis = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli())
  DatePickerDialog(
    onDismissRequest = onDismiss,
    confirmButton = {
      TextButton(
        onClick = {
          state.selectedDateMillis?.let { onPick(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate()) }
          onDismiss()
        }
      ) {
        Text(stringResource(R.string.ok))
      }
    },
    dismissButton = { TextButton(onClick = onDismiss) { Text(stringResource(R.string.cancel)) } },
  ) {
    DatePicker(state, showModeToggle = false)
  }
}
