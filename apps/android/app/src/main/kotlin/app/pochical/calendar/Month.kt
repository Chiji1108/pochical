package app.pochical.calendar

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.height
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.Dp
import app.pochical.design.Holidays
import app.pochical.design.Metrics
import app.pochical.kit.Period
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale

/** 0 for Sunday through 6 for Saturday, as spec/ and the settings count weekdays. */
val LocalDate.weekday: Int
  get() = dayOfWeek.value % 7

/** The first day of the week `this` is in, the week starting on `weekStart`. */
fun LocalDate.weekStartingOn(weekStart: Int): LocalDate = minusDays(((weekday - weekStart + 7) % 7).toLong())

/** The days `month`'s page shows, a week to a row from `weekStart` (:kit's Period.weeks). */
fun monthWeeks(month: YearMonth, weekStart: Int): List<List<LocalDate>> = Period.of(month, 1).weeks(weekStart)

/** Between a month grid's weeks, and between a week's days. */
val DAY_GAP = Metrics.spacingStep

/** How tall a [MonthGrid] is with [cell]-tall days: room kept for six weeks. */
fun monthGridHeight(cell: Dp): Dp = cell * 6 + DAY_GAP * 5

/**
 * A month's weeks as every calendar of the app draws them, a row each, with room kept for six, so
 * what is under it stays put as the months turn: the calendar's pages, the order typed on 繰り返し's
 * calendar and one person's month in みんなのシフト. [week] gives each row its own modifier by its
 * index, and [day] draws each day in its share of the row.
 */
@Composable
fun MonthGrid(
  weeks: List<List<LocalDate>>,
  cell: Dp,
  modifier: Modifier = Modifier,
  week: (Int) -> Modifier = { Modifier },
  day: @Composable RowScope.(LocalDate) -> Unit,
) {
  Column(modifier.height(monthGridHeight(cell)), verticalArrangement = Arrangement.spacedBy(DAY_GAP)) {
    weeks.forEachIndexed { index, days ->
      Row(week(index), horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) { for (it in days) day(it) }
    }
  }
}

/** The country whose holidays this device's days take: its region's when Pochical has them, else Japan's. */
fun holidayCountry(locale: Locale = Locale.getDefault()): String = Holidays.countryFor(locale.country.ifEmpty { null })

/** The national holiday on this day in `country`, or none. */
fun LocalDate.holidayName(country: String): String? = Holidays.nameOf(toString(), country)
