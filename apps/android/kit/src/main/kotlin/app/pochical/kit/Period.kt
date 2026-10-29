package app.pochical.kit

import app.pochical.design.Days
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit

/**
 * A page of the calendar's days (spec/calendar.md, The shift period; spec/vectors/periods.json), as
 * iOS's Period: a month, or with a シフトの期間 the period starting on its day in a month and running
 * to the day before it a month on. A page is named by the month it starts in, so turning pages is
 * turning months whatever the period.
 */
data class Period(val first: LocalDate, val last: LocalDate) {
  /** The month naming this page. */
  val month: YearMonth
    get() = YearMonth.from(first)

  /** Every day of it, its first to its last. */
  val days: List<LocalDate>
    get() = daysFrom(first, last).toList()

  /** How many days it holds. */
  val length: Int
    get() = ChronoUnit.DAYS.between(first, last).toInt() + 1

  operator fun contains(day: LocalDate): Boolean = day in first..last

  /** The page [by] pages on, or back for a negative count. */
  fun stepped(by: Int, start: Int): Period = of(month.plusMonths(by.toLong()), start)

  /**
   * The days its page draws, a week to a row from [weekStart] (0 for Sunday through 6 for
   * Saturday): whole weeks holding it, the days before and after filling the first and last.
   */
  fun weeks(weekStart: Int): List<List<LocalDate>> {
    val lead = (first.dayOfWeek.value % 7 - weekStart + 7) % 7
    val from = first.minusDays(lead.toLong())
    val count = (lead + length + 6) / 7
    return List(count) { week -> List(7) { from.plusDays((week * 7 + it).toLong()) } }
  }

  companion object {
    /** The period starting on [start] in [month]; 1 is the month itself. */
    fun of(month: YearMonth, start: Int): Period {
      val first = month.atDay(start)
      return Period(first, first.plusMonths(1).minusDays(1))
    }

    /** The period [day] is in: the calendar opens on today's. */
    fun holding(day: LocalDate, start: Int): Period =
      of(YearMonth.from(day).minusMonths(if (day.dayOfMonth < start) 1 else 0), start)
  }
}

/** The day a period starting mid-month is picked from: its own, else 15日 (`Days.periodFirstPick`). */
val ShiftPeriod.firstPick: Int
  get() = if (byPeriod) start else Days.periodFirstPick

/** Whether the pages are periods rather than months. */
val ShiftPeriod.byPeriod: Boolean
  get() = start != 1

/** The page [month] names. */
fun ShiftPeriod.page(month: YearMonth): Period = Period.of(month, start)

/** The page holding [day]. */
fun ShiftPeriod.pageHolding(day: LocalDate): Period = Period.holding(day, start)

/** The month naming the page that holds [day]. */
fun ShiftPeriod.monthHolding(day: LocalDate): YearMonth = pageHolding(day).month
