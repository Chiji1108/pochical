package app.pochical.calendar

import app.pochical.name
import app.pochical.string
import app.pochical.vectors
import java.time.YearMonth
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class MonthTest {
  @Test
  fun laysAMonthOutInWholeWeeks() {
    for (case in vectors("month", "weeks")) {
      val expected = case.getValue("expected").jsonObject
      val weeks = monthWeeks(YearMonth.parse(case.string("month")), case.getValue("weekStart").jsonPrimitive.int)
      assertTrue(case.name(), weeks.all { it.size == 7 })
      assertEquals(
        case.name(),
        listOf(expected.string("first"), expected.string("last"), expected.getValue("weeks").jsonPrimitive.int),
        listOf(weeks.first().first().toString(), weeks.last().last().toString(), weeks.size),
      )
    }
  }
}
