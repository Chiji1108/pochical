package app.pochical.calendar

import app.pochical.name
import app.pochical.string
import app.pochical.strings
import app.pochical.vectors
import java.time.LocalDate
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class SampleDaysTest {
  @Test
  fun repeatsTheOrderAsTheVectorsDo() {
    for (case in vectors("repeat", "schedule")) {
      val order =
        SampleOrder(
          sequence = case.strings("sequence")!!,
          anchor = LocalDate.parse(case.string("anchor")),
          holidayShift = case.string("holidayShift"),
          holidays = case.string("holidays"),
        )
      val days =
        generateSequence(LocalDate.parse(case.string("from"))) { it.plusDays(1) }
          .takeWhile { it <= LocalDate.parse(case.string("to")) }
      assertEquals(
        case.name(),
        case.getValue("expected").jsonObject.mapValues { it.value.jsonPrimitive.content },
        days.associate { it.toString() to order.shiftOn(it) },
      )
    }
  }

  private val today = LocalDate.parse("2026-10-23")
  private val day = LocalDate.parse("2026-10-20")

  @Test
  fun showsTheMonthWithItsMemosAndChangedHours() {
    val calendar = SampleDays(today).calendar.value
    val month = calendar.shown(LocalDate.parse("2026-10-01"), LocalDate.parse("2026-10-31"))
    assertEquals(31, month.size)
    assertEquals("棚卸し", calendar.note(LocalDate.parse("2026-10-08")))
    assertEquals("20:00", month.getValue(LocalDate.parse("2026-10-08")).end)
    assertEquals("08:00", month.getValue(LocalDate.parse("2026-10-13")).start)
    // スポーツの日 takes the day off whatever the order says.
    assertEquals("off", month.getValue(LocalDate.parse("2026-10-12")).shift)
  }

  @Test
  fun aClearedDayShowsNothingAndKeepsItsMemo() {
    val days = SampleDays(today)
    days.setNote(day, "研修")
    days.set(day, null)
    val calendar = days.calendar.value
    assertNull(calendar.shown(day, day)[day])
    assertEquals("研修", calendar.note(day))
  }

  @Test
  fun anEntryAndAMemoShowOnTheirDayAlone() {
    val days = SampleDays(today)
    val before = days.calendar.value.shown(day.minusDays(1), day.plusDays(1))
    days.set(day, DayEntry("night", end = "10:00"))
    days.setNote(day, "早めに出る")
    val after = days.calendar.value
    assertEquals(DayEntry("night", end = "10:00"), after.shown(day, day)[day])
    assertEquals(before - day, after.shown(day.minusDays(1), day.plusDays(1)) - day)
    days.setNote(day, "")
    assertNull(days.calendar.value.note(day))
  }

  @Test
  fun someoneAddedGoesToTheEndOfTheList() {
    val days = SampleDays(today)
    val first = days.addCoworker("佐藤")
    val second = days.addCoworker("鈴木")
    assertEquals(listOf(first, second), days.calendar.value.coworkers)
  }
}
