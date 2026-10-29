package app.pochical

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ListItem
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import app.pochical.calendar.StylePreview
import app.pochical.calendar.rememberPreviewScheme
import app.pochical.calendar.rememberToday
import app.pochical.calendar.shortMonth
import app.pochical.calendar.weekdayLetter
import app.pochical.calendar.weekdayName
import app.pochical.kit.ShiftPeriod
import app.pochical.kit.Week
import app.pochical.kit.byPeriod
import app.pochical.patterns.SwitchRow
import java.time.YearMonth

/**
 * 設定's カレンダー row: the day the week starts on, the month as small text writes it, 10月 or Oct,
 * and a シフトの期間's first day, 15日〜.
 */
@Composable
fun CalendarSettingsRow(open: (RootPage) -> Unit) {
  val device = LocalDeviceSettings.current.device
  val month = YearMonth.from(rememberToday()).shortMonth(device.heading.english)
  val summary =
    listOfNotNull(
      stringResource(R.string.calendar_settings_summary, weekdayLetter(device.week.start), month),
      device.period.takeIf { it.byPeriod }?.let { stringResource(R.string.period_short, it.start) },
    )
  SettingsRow(
    stringResource(R.string.calendar_settings),
    R.drawable.ic_calendar,
    onClick = { open(RootPage.CalendarSettings) },
    value = summary.joinToString("・"),
  )
}

/**
 * 設定 > カレンダー (/design's カレンダー page, iOS's CalendarSettings): this week under the month's
 * heading, as the settings below draw it; 月と曜日, what a tap on the month's name does, the day the
 * week starts on, the days that take a color of their own, and シフトの期間, what each page holds.
 * Only this person's screens change, and each change is kept as it is picked. Material 3 Expressive's connected
 * buttons pick among a few words; the period, one of many, is picked in a dialog's list.
 */
@Composable
fun CalendarSettingsPage(onBack: () -> Unit) {
  val settings = LocalDeviceSettings.current
  val device = settings.device
  val today = rememberToday()
  val scheme = rememberPreviewScheme()
  val colors = LocalThemeColors.current
  var pickingPeriod by rememberSaveable { mutableStateOf(false) }
  fun changeWeek(change: (Week) -> Week) = settings.change { it.copy(week = change(it.week)) }
  SettingsPage(stringResource(R.string.calendar_settings), onBack) { padding ->
    LazyColumn(contentPadding = padding) {
      item {
        StylePreview(scheme, today, Modifier.padding(horizontal = 16.dp), withHeading = true)
      }
      // The month's name and the weekdays' together: a heading reads in one language, so English names both.
      item {
        SectionHeader(stringResource(R.string.calendar_names))
        val month = YearMonth.from(today)
        val weekday = today.dayOfWeek.value % 7
        ChoiceButtons(
          listOf(false, true),
          device.heading.english,
          { english -> "${month.shortMonth(english)}・${weekdayName(weekday, english)}" },
          { english -> stringResource(if (english) R.string.calendar_names_english else R.string.calendar_names_japanese) },
        ) { english -> settings.change { it.copy(heading = it.heading.copy(english = english)) } }
      }
      // おたのしみ lights a sky over the calendar's month, a tap on its name drifting it to another;
      // never before the first tap, not even in the preview above.
      item {
        SectionHeader(stringResource(R.string.calendar_name_tap))
        ChoiceButtons(
          listOf(false, true),
          device.heading.surprise,
          { surprise -> stringResource(if (surprise) R.string.calendar_name_tap_surprise else R.string.calendar_pick_month) },
        ) { surprise -> settings.change { it.copy(heading = it.heading.copy(surprise = surprise)) } }
      }
      item {
        SectionHeader(stringResource(R.string.calendar_week_start))
        ChoiceButtons(
          (0..6).toList(),
          device.week.start,
          { weekdayLetter(it) },
          { stringResource(R.string.calendar_weekday, weekdayLetter(it)) },
        ) { start -> changeWeek { it.copy(start = start) } }
      }
      item {
        SettingsSection(stringResource(R.string.calendar_colored_days), footnote = stringResource(R.string.calendar_colored_days_note)) {
          row { ColoredDay(R.string.calendar_saturday, colors.calendarSaturday, device.week.saturday) { on -> changeWeek { it.copy(saturday = on) } } }
          row { ColoredDay(R.string.calendar_sunday, colors.calendarHoliday, device.week.sunday) { on -> changeWeek { it.copy(sunday = on) } } }
          row { ColoredDay(R.string.calendar_holiday, colors.calendarHoliday, device.week.holiday) { on -> changeWeek { it.copy(holiday = on) } } }
        }
      }
      // Most people's shifts come by the month, so it starts as the month; a workplace closing on its
      // own day picks the day its shifts start (spec/calendar.md, The shift period).
      item {
        SettingsSection(stringResource(R.string.period), footnote = stringResource(R.string.period_note)) {
          row {
            SettingsRow(stringResource(R.string.period_page), R.drawable.ic_event, onClick = { pickingPeriod = true }, value = periodName(device.period.start), end = RowEnd.None)
          }
        }
      }
    }
  }
  if (pickingPeriod) {
    AlertDialog(
      onDismissRequest = { pickingPeriod = false },
      title = { Text(stringResource(R.string.period_page)) },
      text = {
        PeriodChoices(
          device.period.start,
          onPick = { start ->
            settings.change { it.copy(period = ShiftPeriod(start)) }
            pickingPeriod = false
          },
          modifier = Modifier.verticalScroll(rememberScrollState()),
        )
      },
      confirmButton = {},
      dismissButton = { TextButton(onClick = { pickingPeriod = false }) { Text(stringResource(R.string.cancel)) } },
    )
  }
}

/** A day that takes a color of its own: its name after a dot of that color, and a switch. */
@Composable
private fun ColoredDay(name: Int, color: Color, on: Boolean, onChange: (Boolean) -> Unit) {
  SettingsSwitchRow(
    stringResource(name),
    icon = null,
    checked = on,
    onCheckedChange = onChange,
    leading = { Box(Modifier.size(24.dp), contentAlignment = Alignment.Center) { Box(Modifier.size(12.dp).background(color, CircleShape)) } },
  )
}
