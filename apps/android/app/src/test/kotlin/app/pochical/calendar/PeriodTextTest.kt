package app.pochical.calendar

import app.pochical.kit.Period
import app.pochical.name
import app.pochical.string
import app.pochical.strings
import app.pochical.vectors
import java.time.LocalDate
import org.junit.Assert.assertEquals
import org.junit.Test

class PeriodTextTest {
  @Test
  fun writesAPeriodByItsDays() {
    val failed =
      vectors("periods", "written").mapNotNull { case ->
        val (first, last) = case.strings("period")!!.map(LocalDate::parse)
        val period = Period(first, last)
        val want = listOf("short", "year", "full", "english").map { case.string(it) }
        val got = listOf(period.text, period.yearText, period.title(english = false), period.title(english = true))
        if (got == want) null else "${case.name()}: expected $want, got $got"
      }
    assertEquals("", failed.joinToString("\n"))
  }
}
