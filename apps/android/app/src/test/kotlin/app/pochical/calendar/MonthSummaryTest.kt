package app.pochical.calendar

import app.pochical.kit.RepeatOrder
import java.time.LocalDate
import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Test

class MonthSummaryTest {
  private fun pattern(id: String, off: Boolean) = Pattern(id, id, "star", "⭐️", id, 0, null, off)

  private val day = pattern("day", off = false)
  private val off = pattern("off", off = true)
  private val paid = pattern("paid", off = true)

  /** A calendar showing [days] by date, September's last days and November's first among them. */
  private fun calendar(days: Map<String, String>) =
    object : OwnCalendar {
      override val patterns = listOf(day, off, paid)
      override val coworkers = emptyList<Coworker>()
      override val orders = emptyList<RepeatOrder>()

      override fun shown(from: LocalDate, through: LocalDate) =
        days.mapKeys { LocalDate.parse(it.key) }.filterKeys { it in from..through }.mapValues { DayEntry(it.value) }

      override fun note(day: LocalDate): String? = null

      override fun nextDay(shift: String): String? = null

      override fun hasOwnShift(day: LocalDate) = false
    }

  private val october = YearMonth.of(2026, 10)
  private val days =
    mapOf(
      "2026-09-30" to "off",
      "2026-10-01" to "day",
      "2026-10-02" to "off",
      "2026-10-03" to "paid",
      "2026-10-04" to "off",
      "2026-10-31" to "day",
      "2026-11-01" to "off",
    )

  @Test
  fun theMonthsDaysOffCountEveryPatternThatCountsAsOffAndNoDayAround() {
    assertEquals(3, calendar(days).daysOffCount(october))
  }

  @Test
  fun theBreakdownGivesEachPatternInOrderThenTheBlankDays() {
    val breakdown = calendar(days).breakdown(october)
    assertEquals(listOf(day to 2, off to 2, paid to 1), breakdown.counts)
    assertEquals(31 - 5, breakdown.unfilled)
  }
}
