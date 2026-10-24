package app.pochical

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ListItem
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
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
import app.pochical.kit.Week
import app.pochical.patterns.SwitchRow
import java.time.YearMonth

/** 設定's カレンダー row: the day the week starts on, and the month as small text writes it, 10月 or Oct. */
@Composable
fun CalendarSettingsRow(open: (RootPage) -> Unit) {
  val device = LocalDeviceSettings.current.device
  val month = YearMonth.from(rememberToday()).shortMonth(device.heading.english)
  ListItem(
    headlineContent = { Text(stringResource(R.string.calendar_settings)) },
    supportingContent = { Text(stringResource(R.string.calendar_settings_summary, weekdayLetter(device.week.start), month)) },
    modifier = Modifier.clickable { open(RootPage.CalendarSettings) },
  )
}

/**
 * 設定 > カレンダー (/design's カレンダー page, iOS's CalendarSettings): this week under the month's
 * heading, as the settings below draw it; 月と曜日, what a tap on the month's name does, the day the
 * week starts on, and the days that take a color of their own. Only this person's screens change,
 * and each change is kept as it is picked. Material's segmented buttons pick among a few words.
 */
@Composable
fun CalendarSettingsPage(onBack: () -> Unit) {
  val settings = LocalDeviceSettings.current
  val device = settings.device
  val today = rememberToday()
  val scheme = rememberPreviewScheme()
  val colors = LocalThemeColors.current
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
        Segments(
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
        Segments(
          listOf(false, true),
          device.heading.surprise,
          { surprise -> stringResource(if (surprise) R.string.calendar_name_tap_surprise else R.string.calendar_pick_month) },
        ) { surprise -> settings.change { it.copy(heading = it.heading.copy(surprise = surprise)) } }
      }
      item {
        SectionHeader(stringResource(R.string.calendar_week_start))
        Segments(
          (0..6).toList(),
          device.week.start,
          { weekdayLetter(it) },
          { stringResource(R.string.calendar_weekday, weekdayLetter(it)) },
        ) { start -> changeWeek { it.copy(start = start) } }
      }
      item { SectionHeader(stringResource(R.string.calendar_colored_days)) }
      item {
        ColoredDay(R.string.calendar_saturday, colors.calendarSaturday, device.week.saturday) { on -> changeWeek { it.copy(saturday = on) } }
      }
      item { ColoredDay(R.string.calendar_sunday, colors.calendarHoliday, device.week.sunday) { on -> changeWeek { it.copy(sunday = on) } } }
      item { ColoredDay(R.string.calendar_holiday, colors.calendarHoliday, device.week.holiday) { on -> changeWeek { it.copy(holiday = on) } } }
      item { Footnote(stringResource(R.string.calendar_colored_days_note)) }
    }
  }
}

/** Material's segmented buttons, one for each of [options], each read as [spoken] says. */
@Composable
private fun <T> Segments(
  options: List<T>,
  picked: T,
  label: @Composable (T) -> String,
  spoken: @Composable (T) -> String = label,
  onPick: (T) -> Unit,
) {
  SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth().padding(horizontal = 16.dp)) {
    options.forEachIndexed { index, option ->
      val description = spoken(option)
      SegmentedButton(
        selected = option == picked,
        onClick = { onPick(option) },
        shape = SegmentedButtonDefaults.itemShape(index, options.size),
        icon = {},
        modifier = Modifier.semantics { contentDescription = description },
      ) {
        Text(label(option), maxLines = 1)
      }
    }
  }
}

/** A day that takes a color of its own: its name after a dot of that color, and a switch. */
@Composable
private fun ColoredDay(name: Int, color: Color, on: Boolean, onChange: (Boolean) -> Unit) {
  SwitchRow(
    title = stringResource(name),
    note = null,
    on = on,
    onChange = onChange,
    leading = { Box(Modifier.size(10.dp).background(color, CircleShape)) },
  )
}
