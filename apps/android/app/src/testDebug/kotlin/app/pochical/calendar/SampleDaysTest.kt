package app.pochical.calendar

import app.pochical.v1.DayField
import app.pochical.v1.pattern
import java.time.LocalDate
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The days of a debug build launched with `sample` on [today], once all of the sample shows. */
fun sampleDays(today: LocalDate): TestDays {
  val test = TestDays()
  runBlocking { putSampleDays(test.database, test.edits, today) }
  // The sample's last edit: the calendar showing it shows the rest.
  test.awaitCalendar { it.note(today.withDayOfMonth(16)) != null }
  return test
}

@RunWith(RobolectricTestRunner::class)
class SampleDaysTest {
  @Test
  fun showsTheMonthWithItsMemosAndChangedHours() {
    val calendar = sampleDays(LocalDate.parse("2026-10-23")).use { it.days.calendar.value }
    val month = calendar.shown(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-31"))
    assertEquals(listOf("day", "night", "after", "off"), calendar.patterns.map { it.id })
    assertEquals(31, month.size)
    assertEquals("棚卸し", calendar.note(LocalDate.parse("2026-10-08")))
    assertEquals("歯医者", calendar.note(LocalDate.parse("2026-10-16")))
    assertEquals("20:00", month.getValue(LocalDate.parse("2026-10-08")).end)
    assertEquals("08:00", month.getValue(LocalDate.parse("2026-10-13")).start)
    // スポーツの日 takes the day off whatever the order says.
    assertEquals("off", month.getValue(LocalDate.parse("2026-10-12")).shift)
    assertEquals("after", calendar.patterns.first { it.id == "night" }.nextDay)
  }

  @Test
  fun changedHoursFallOnADayShiftEveryMonth() {
    for (month in 1..12) {
      val first = LocalDate.of(2027, month, 1)
      val days = sampleDays(first).use { it.days.calendar.value }
      assertEquals(DayEntry("day", end = "20:00"), days.shown(first.plusDays(7), first.plusDays(7)).values.single())
      assertEquals(DayEntry("day", start = "08:00"), days.shown(first.plusDays(12), first.plusDays(12)).values.single())
    }
  }

  @Test
  fun aPersonWithPatternsGetsNoSample() {
    val today = LocalDate.parse("2026-10-23")
    val marker = LocalDate.parse("2000-01-01")
    val calendar =
      TestDays().use { test ->
        runBlocking {
          test.edits.savePattern("mine", pattern { name = "出勤" })
          putSampleDays(test.database, test.edits, today)
          // Written last, so the calendar showing it shows whatever the sample put in.
          test.edits.setDay(marker.toString(), DayField.DAY_FIELD_NOTE, "end")
        }
        test.awaitCalendar { it.note(marker) != null }
      }
    assertEquals(listOf("mine"), calendar.patterns.map { it.id })
    assertNull(calendar.note(today.withDayOfMonth(16)))
  }
}
