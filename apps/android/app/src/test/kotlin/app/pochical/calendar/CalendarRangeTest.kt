package app.pochical.calendar

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
}
