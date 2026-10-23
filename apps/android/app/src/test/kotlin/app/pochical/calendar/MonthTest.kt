package app.pochical.calendar

import app.pochical.name
import app.pochical.string
import app.pochical.strings
import app.pochical.vectors
import java.time.YearMonth
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
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

  @Test
  fun saysHowADaysHoursMoved() {
    for (case in vectors("time-change", "cases")) {
      val time = case.strings("time")?.let { (start, end) -> ShiftTime(start, end) }
      val expected =
        (case["expected"] as? JsonObject)?.let {
          TimeChange(it.getValue("early").jsonPrimitive.boolean, it.getValue("late").jsonPrimitive.boolean)
        }
      assertEquals(case.name(), expected, timeChange(case.string("start"), case.string("end"), time))
    }
  }

  @Test
  fun writesHoursAsTheScreensDo() {
    for (case in vectors("widgets", "day")) {
      val (start, end) = case.strings("time") ?: continue
      val expected = case.getValue("expected").jsonObject.string("time")
      assertEquals(case.name(), expected, hoursText(case.string("start") ?: start, case.string("end") ?: end))
    }
  }
}
