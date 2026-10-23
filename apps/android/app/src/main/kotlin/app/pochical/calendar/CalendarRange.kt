package app.pochical.calendar

import java.time.YearMonth
import java.time.temporal.ChronoUnit

/**
 * The months the calendar reaches: `around` either side of the month it
 * opened on, as iOS's monthsAround. The pages and 月を選ぶ all take their
 * bounds and page numbers from here, so none is asked for a month outside.
 */
class CalendarRange(opened: YearMonth, around: Int) {
  val months: ClosedRange<YearMonth> = opened.minusMonths(around.toLong())..opened.plusMonths(around.toLong())

  /** How many month pages there are. */
  val monthPages: Int = pageOf(months.endInclusive) + 1

  fun monthAt(page: Int): YearMonth = months.start.plusMonths(page.toLong())

  /** The page of `month`, or of the nearest month the calendar reaches. */
  fun pageOf(month: YearMonth): Int = ChronoUnit.MONTHS.between(months.start, month.coerceIn(months)).toInt()
}
