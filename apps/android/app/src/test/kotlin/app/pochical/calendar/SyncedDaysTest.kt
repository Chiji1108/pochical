package app.pochical.calendar

import app.pochical.v1.pattern
import app.pochical.v1.repeatOrder
import java.time.LocalDate
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SyncedDaysTest {
  private val test = TestDays()
  private val days = test.days
  private val day = LocalDate.parse("2026-10-20")

  /** 日勤 and 夜勤, and 日勤 every day from October. */
  @Before
  fun putPatterns() = runBlocking {
    test.edits.savePattern("day", markedPattern("日勤") { start = "09:00"; end = "18:00" })
    test.edits.savePattern("night", markedPattern("夜勤") { nextDay = "after" })
    test.edits.setRepeatOrders(
      listOf(
        repeatOrder {
          start = "2026-10-01"
          sequence += "day"
          holidayCountry = "JP"
        }
      )
    )
    test.awaitCalendar { it.patterns.size == 2 && it.shown(day, day).isNotEmpty() }
    Unit
  }

  @After fun close() = test.close()

  @Test
  fun showsThePatternsInTheirOrderAndTheDaysTheOrderFills() {
    val calendar = days.calendar.value
    assertEquals(
      listOf(
        Pattern("day", "日勤", "star", "⭐️", "日", 0, ShiftTime("09:00", "18:00"), countsAsOff = false),
        Pattern("night", "夜勤", "star", "⭐️", "夜", 0, null, countsAsOff = false, nextDay = "after"),
      ),
      calendar.patterns,
    )
    assertEquals(DayEntry("day"), calendar.shown(day, day)[day])
  }

  @Test
  fun onceReadTheCalendarHoldsWhatTheDeviceKeeps() = runBlocking {
    val scope = CoroutineScope(SupervisorJob() + Dispatchers.Default)
    val opened = SyncedDays(test.database, test.edits, scope)
    opened.awaitRead()
    assertEquals(listOf("day", "night"), opened.calendar.value.patterns.map { it.id })
    scope.cancel()
  }

  @Test
  fun anEntryAndAMemoShowOnTheirDayAlone() {
    days.set(day, DayEntry("night", end = "10:00"))
    days.setNote(day, "早めに出る")
    val calendar = test.awaitCalendar { it.note(day) != null }
    assertEquals(DayEntry("night", end = "10:00"), calendar.shown(day, day)[day])
    assertEquals("早めに出る", calendar.note(day))
    assertEquals(mapOf(day.minusDays(1) to DayEntry("day"), day.plusDays(1) to DayEntry("day")), calendar.shown(day.minusDays(1), day.plusDays(1)) - day)
    days.setNote(day, "")
    assertNull(test.awaitCalendar { it.note(day) == null }.note(day))
  }

  @Test
  fun aClearedDayShowsNothingAndKeepsItsMemo() {
    days.setNote(day, "研修")
    days.set(day, null)
    val calendar = test.awaitCalendar { it.shown(day, day).isEmpty() }
    assertEquals("研修", calendar.note(day))
  }

  @Test
  fun aDayOfAPatternNotAmongThePatternsShowsNothing() {
    days.set(day, DayEntry("duty"))
    days.setNote(day, "研修")
    assertNull(test.awaitCalendar { it.note(day) != null }.shown(day, day)[day])
  }

  @Test
  fun someoneAddedFromADayIsOnItAndAtTheEndOfTheList() {
    val first = days.addCoworker("佐藤")
    val second = days.addCoworker("鈴木")
    days.set(day, DayEntry("day", people = listOf(second.id)))
    val calendar = test.awaitCalendar { it.coworkers.size == 2 && it.shown(day, day)[day]?.people?.isNotEmpty() == true }
    assertEquals(listOf(first, second), calendar.coworkers)
    assertEquals(DayEntry("day", people = listOf(second.id)), calendar.shown(day, day)[day])
  }

  @Test
  fun editsLandInTheOrderTheyWereMade() {
    val a = days.addCoworker("佐藤")
    val b = days.addCoworker("鈴木")
    days.set(day, DayEntry("night", people = listOf(a.id)))
    days.set(day, DayEntry("night", people = listOf(a.id, b.id)))
    days.setNote(day, "done")
    val calendar = test.awaitCalendar { it.note(day) == "done" }
    assertEquals(DayEntry("night", people = listOf(a.id, b.id)), calendar.shown(day, day)[day])
  }
}
