package app.pochical.calendar

import app.pochical.kit.ShiftPeriod
import java.time.LocalDate
import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Test

class CalendarRangeTest {
  private val opened = YearMonth.parse("2026-10")
  private val range = CalendarRange(opened, around = 120)

  @Test
  fun reachesTheMonthsAroundTheOneItOpenedOn() {
    assertEquals(YearMonth.parse("2016-10")..YearMonth.parse("2036-10"), range.months)
    assertEquals(241, range.monthPages)
    assertEquals(opened, range.monthAt(range.pageOf(opened)))
    assertEquals(range.months.start, range.monthAt(0))
    assertEquals(range.months.endInclusive, range.monthAt(range.monthPages - 1))
  }

  @Test
  fun aMonthPastEitherEndTurnsToTheNearestReached() {
    assertEquals(0, range.pageOf(YearMonth.parse("2000-01")))
    assertEquals(range.monthPages - 1, range.pageOf(YearMonth.parse("2099-12")))
  }

  @Test
  fun theWeeksRunFromTheFirstMonthsFirstWeekToTheLastMonthsLast() {
    for (weekStart in 0..6) {
      val days = range.days(weekStart)
      assertEquals(0, range.weekPageOf(range.months.start.atDay(1), weekStart))
      assertEquals(range.weekPages(weekStart) - 1, range.weekPageOf(range.months.endInclusive.atEndOfMonth(), weekStart))
      assertEquals(days.start, range.weekAt(0, weekStart))
      assertEquals(days.endInclusive, range.weekAt(range.weekPages(weekStart) - 1, weekStart).plusDays(6))
      val today = LocalDate.parse("2026-10-23")
      assertEquals(today.weekStartingOn(weekStart), range.weekAt(range.weekPageOf(today, weekStart), weekStart))
    }
  }

  @Test
  fun aPeriodsPagesReachTheDaysOfTheLastPeriodPastItsMonth() {
    val periods = CalendarRange(opened, around = 120, ShiftPeriod(15))
    val days = periods.days(0)
    assertEquals(LocalDate.parse("2016-10-15").weekStartingOn(0), days.start)
    assertEquals(LocalDate.parse("2036-11-14").weekStartingOn(0).plusDays(6), days.endInclusive)
    assertEquals(periods.weekPages(0) - 1, periods.weekPageOf(LocalDate.parse("2036-11-14"), 0))
  }
}
