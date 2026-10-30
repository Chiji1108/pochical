package app.pochical.kit

import org.junit.Assert.assertEquals
import org.junit.Test

/** The week's columns and how its days are colored, as the calendar, the groups and the widgets read them. */
class WeekTest {
  @Test
  fun columnsRunFromTheWeekStartAroundToIt() {
    assertEquals(listOf(0, 1, 2, 3, 4, 5, 6), (0 until 7).map { Week(start = 0).weekdayAt(it) })
    assertEquals(listOf(1, 2, 3, 4, 5, 6, 0), (0 until 7).map { Week(start = 1).weekdayAt(it) })
    assertEquals(listOf(6, 0, 1, 2, 3, 4, 5), (0 until 7).map { Week(start = 6).weekdayAt(it) })
  }

  @Test
  fun sundaysAndHolidaysInSundaysColorSaturdaysInTheirs() {
    val week = Week()
    assertEquals(DayTone.Holiday, week.tone(0))
    assertEquals(DayTone.Saturday, week.tone(6))
    assertEquals(DayTone.Plain, week.tone(3))
    assertEquals(DayTone.Holiday, week.tone(3, holiday = true))
    assertEquals(DayTone.Holiday, week.tone(6, holiday = true))
  }

  @Test
  fun eachColorTurnedOffIsPlain() {
    assertEquals(DayTone.Plain, Week(sunday = false).tone(0))
    assertEquals(DayTone.Plain, Week(saturday = false).tone(6))
    assertEquals(DayTone.Plain, Week(holiday = false).tone(3, holiday = true))
    assertEquals(DayTone.Saturday, Week(holiday = false).tone(6, holiday = true))
    assertEquals(DayTone.Holiday, Week(holiday = false).tone(0, holiday = true))
  }
}
