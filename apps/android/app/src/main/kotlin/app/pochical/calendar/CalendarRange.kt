package app.pochical.calendar

import app.pochical.kit.ShiftPeriod
import app.pochical.kit.page
import app.pochical.kit.weekStartingOn
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

/**
 * The months the calendar reaches: `around` either side of the month it
 * opened on, as iOS's monthsAround, and the weeks and days their pages show,
 * each page the month or the シフトの期間 [period] starting in it. The pages,
 * 月を選ぶ and an opened day's weeks all take their bounds and page numbers
 * from here, so none is asked for a page outside.
 */
class CalendarRange(opened: YearMonth, around: Int, private val period: ShiftPeriod = ShiftPeriod()) {
  val months: ClosedRange<YearMonth> = opened.minusMonths(around.toLong())..opened.plusMonths(around.toLong())

  /** How many month pages there are. */
  val monthPages: Int = pageOf(months.endInclusive) + 1

  fun monthAt(page: Int): YearMonth = months.start.plusMonths(page.toLong())

  /** The page of `month`, or of the nearest month the calendar reaches. */
  fun pageOf(month: YearMonth): Int = ChronoUnit.MONTHS.between(months.start, month.coerceIn(months)).toInt()

  /** Every day the pages show, the first page's lead days and the last's trailing ones among them. */
  fun days(weekStart: Int): ClosedRange<LocalDate> =
    firstWeek(weekStart)..period.page(months.endInclusive).last.weekStartingOn(weekStart).plusDays(6)

  /** How many week pages there are, a week starting on `weekStart`. */
  fun weekPages(weekStart: Int): Int = weekPageOf(days(weekStart).endInclusive, weekStart) + 1

  /** The first day of the week on page `page`. */
  fun weekAt(page: Int, weekStart: Int): LocalDate = firstWeek(weekStart).plusWeeks(page.toLong())

  /** The page of the week `day` is in, or of the nearest week the calendar reaches. */
  fun weekPageOf(day: LocalDate, weekStart: Int): Int =
    ChronoUnit.WEEKS.between(firstWeek(weekStart), day.coerceIn(days(weekStart)).weekStartingOn(weekStart)).toInt()

  private fun firstWeek(weekStart: Int) = period.page(months.start).first.weekStartingOn(weekStart)
}
