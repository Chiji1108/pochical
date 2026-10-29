package app.pochical.kit

import app.pochical.design.Widgets
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

// The day the launcher's 次の休み opens (spec/shortcuts.md), as 次の休み not set to anyone does.
class NextDayOffTest {
  private val today = LocalDate.of(2026, 10, 29)

  private fun pattern(id: String, off: Boolean) = PatternRow(id, id, "⭐️", id, "star", 0, null, null, off, null, false)

  private fun calendar(vararg days: Pair<Long, String>) =
    OwnCalendar(listOf(pattern("day", off = false), pattern("off", off = true)), days.associate { (inDays, shift) -> today.plusDays(inDays) to OwnDay(shift) }, emptyList())

  @Test
  fun opensTheFirstDayOffAhead() = assertEquals(today.plusDays(2), calendar(0L to "day", 1L to "day", 2L to "off", 3L to "off").nextDayOff(today))

  @Test
  fun opensTodayOnADayOff() = assertEquals(today, calendar(0L to "off", 1L to "off").nextDayOff(today))

  @Test
  fun opensTodayWithNoneAheadAsFarAsItLooks() {
    assertEquals(today, calendar().nextDayOff(today))
    assertEquals(today, calendar(0L to "day", Widgets.offLookaheadDays + 1L to "off").nextDayOff(today))
    assertEquals(today.plusDays(Widgets.offLookaheadDays.toLong()), calendar(Widgets.offLookaheadDays.toLong() to "off").nextDayOff(today))
  }
}
