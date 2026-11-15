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

/** The days `month`'s page shows, a week to a row from `weekStart` (:kit's Period.weeks). */
fun monthWeeks(month: YearMonth, weekStart: Int): List<List<LocalDate>> = Period.of(month, 1).weeks(weekStart)

/** Between a month grid's weeks, and between a week's days. */
val DAY_GAP = Metrics.spacingStep

/** How tall a [MonthGrid] is with [cell]-tall days: room kept for six weeks. */
fun monthGridHeight(cell: Dp): Dp = cell * 6 + DAY_GAP * 5

/** From one week's top to the next's in a [MonthGrid] of [cell]-tall days. */
fun monthRowPitch(cell: Dp): Dp = cell + DAY_GAP

/** How tall a day is for six weeks to fit in [room]: up to [most], its full height unless said otherwise, else less, never under a touch's. */
fun monthCellHeight(room: Dp, most: Dp = DAY_FULL_HEIGHT): Dp = ((room - DAY_GAP * 5) / 6).coerceIn(Metrics.touch, most)

/**
 * How much larger than a phone's a day [cell] tall in a week [width] wide draws its mark: the smaller of how much
 * taller and how much wider it is than a phone's day (design/src/metrics.ts, DAY_PROPORTION), so the mark keeps to
 * the day either way; never smaller, as a short day fits its mark to its room instead.
 */
fun monthMarkScale(cell: Dp, width: Dp): Float = maxOf(1f, minOf(cell, (width - DAY_GAP * 6) / 7 * Metrics.DAY_PROPORTION) / DAY_FULL_HEIGHT)

/**
 * The tallest a day of a week [width] wide is drawn: a phone's day for its width (design/src/metrics.ts,
 * DAY_PROPORTION), never under its full height.
 */
fun tallestDay(width: Dp): Dp = maxOf(DAY_FULL_HEIGHT, (width - DAY_GAP * 6) / 7 * Metrics.DAY_PROPORTION)

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
  day: @Composable RowScope.(week: Int, date: LocalDate) -> Unit,
) {
  Column(modifier.height(monthGridHeight(cell)), verticalArrangement = Arrangement.spacedBy(DAY_GAP)) {
    weeks.forEachIndexed { index, dates -> WeekRow(dates, week(index)) { day(index, it) } }
  }
}

/** A week's days side by side, a [DAY_GAP] apart, as a [MonthGrid]'s rows and a week's page lay them. */
@Composable
fun WeekRow(dates: List<LocalDate>, modifier: Modifier = Modifier, day: @Composable RowScope.(LocalDate) -> Unit) {
  Row(modifier, horizontalArrangement = Arrangement.spacedBy(DAY_GAP)) { for (date in dates) day(date) }
}

/** The country whose holidays this device's days take: its region's when Pochical has them, else Japan's. */
fun holidayCountry(locale: Locale = Locale.getDefault()): String = Holidays.countryFor(locale.country.ifEmpty { null })

/** The national holiday on this day in `country`, or none. */
fun LocalDate.holidayName(country: String): String? = Holidays.nameOf(toString(), country)
