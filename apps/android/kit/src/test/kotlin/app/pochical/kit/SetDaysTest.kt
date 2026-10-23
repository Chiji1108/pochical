package app.pochical.kit

import app.pochical.design.Days
import app.pochical.v1.Change
import app.pochical.v1.DayField
import java.time.LocalDate
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SetDaysTest {
  private val database = testDatabase()
  private val edits = OwnEdits(database)
  private val day = LocalDate.parse("2026-10-02")

  @After fun close() = database.close()

  /** The person's patterns and an order of 日勤 every day from October. */
  private suspend fun everyDayADayShift() {
    edits.savePattern("day", app.pochical.v1.pattern { name = "日勤" })
    edits.savePattern("night", app.pochical.v1.pattern { name = "夜勤" })
    edits.setRepeatOrders(
      listOf(
        app.pochical.v1.repeatOrder {
          start = "2026-10-01"
          sequence += "day"
          holidayCountry = "JP"
        }
      )
    )
  }

  /** The day edits waiting to be sent, each its field and value. */
  private suspend fun sentDays(): List<Pair<DayField, String?>> =
    database.write { outbox() }
      .map { Change.parseFrom(it.change) }
      .filter { it.kindCase == Change.KindCase.DAY }
      .map { it.day.field to it.day.value.takeIf { _ -> it.day.hasValue() } }

  private suspend fun calendar() = database.values().ownCalendar().first()

  @Test
  fun aDayGivenAnotherShiftShowsItAndSendsItsFields() = runTest {
    everyDayADayShift()
    edits.setDays(mapOf(day to ShownDay("night", end = "10:00", people = listOf("a", "b"))))
    assertEquals(ShownDay("night", end = "10:00", people = listOf("a", "b")), calendar().shown(day, day)[day])
    assertEquals(
      listOf(
        DayField.DAY_FIELD_PATTERN to "night",
        DayField.DAY_FIELD_END to "10:00",
        DayField.DAY_FIELD_PEOPLE to "a b",
      ),
      sentDays(),
    )
  }

  @Test
  fun aDayShowingItsOrdersShiftKeepsNoneOfItsOwn() = runTest {
    everyDayADayShift()
    edits.setDays(mapOf(day to ShownDay("night")))
    edits.setDays(mapOf(day to ShownDay("day")))
    assertEquals(ShownDay("day"), calendar().shown(day, day)[day])
    assertEquals(listOf(DayField.DAY_FIELD_PATTERN to "night", DayField.DAY_FIELD_PATTERN to null), sentDays())
  }

  @Test
  fun aClearedDayShowsNothingAndKeepsItsMemo() = runTest {
    everyDayADayShift()
    edits.setDay(day.toString(), DayField.DAY_FIELD_NOTE, "研修")
    edits.setDays(mapOf(day to null))
    val calendar = calendar()
    assertNull(calendar.shown(day, day)[day])
    assertEquals("研修", calendar.note(day))
    assertEquals(DayField.DAY_FIELD_PATTERN to Days.noShift, sentDays().last())
  }

  @Test
  fun whatADayAlreadyShowsSendsNothing() = runTest {
    everyDayADayShift()
    edits.setDays(mapOf(day to ShownDay("day")))
    assertEquals(emptyList<Pair<DayField, String?>>(), sentDays())
  }

  @Test
  fun someoneNamedBeforeTheyAreWrittenKeepsTheirId() = runTest {
    edits.addCoworker("佐藤", id = "satou")
    assertEquals(listOf(CoworkerRow("satou", "佐藤")), database.values().coworkers().first())
  }
}
