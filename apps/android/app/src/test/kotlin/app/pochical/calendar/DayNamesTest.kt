package app.pochical.calendar

import app.pochical.kit.weekday
import app.pochical.name
import app.pochical.string
import app.pochical.vectors
import java.time.LocalDate
import java.time.YearMonth
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class DayNamesTest {
  @Test
  fun namesMonthsAndWeekdaysAsTheHeadingsDo() {
    val failed =
      vectors("day-names", "cases").mapNotNull { case ->
        val day = LocalDate.parse(case.string("day"))
        val english = case.getValue("english").jsonPrimitive.boolean
        val month = YearMonth.from(day)
        val expected = case.getValue("expected").jsonObject
        val got =
          mapOf(
            "weekdayLetter" to weekdayLetter(day.weekday, english),
            "weekdayName" to weekdayName(day.weekday, english),
            "weekdayHead" to weekdayHead(day.weekday, english),
            "monthTitle" to month.monthTitle(english),
            "monthWithYear" to month.monthWithYear(english),
            "shortMonth" to month.shortMonth(english),
            "headingMonth" to if (english) month.headingMonth else null,
          )
        val want = got.keys.associateWith { expected.string(it) }
        if (got == want) null else "${case.name()}: expected $want, got $got"
      }
    assertEquals("", failed.joinToString("\n"))
  }

  @Test
  fun aDayIsReadWithItsWeekdayTodayAndItsHoliday() {
    val day = LocalDate.of(LocalDate.now().year, 11, 3)
    assertEquals(day.fullText, day.spokenText(todayWord = null, holiday = null))
    assertEquals("今日、${day.fullText}、文化の日", day.spokenText(todayWord = "今日", holiday = "文化の日"))
  }
}
