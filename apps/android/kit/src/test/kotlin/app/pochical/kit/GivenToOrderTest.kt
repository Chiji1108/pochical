package app.pochical.kit

import app.pochical.v1.DayField
import app.pochical.v1.repeatOrder
import java.time.LocalDate
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@Serializable
private data class GivenToOrderVectors(val givenToOrder: List<Case>) {
  @Serializable
  data class Day(
    val shift: String? = null,
    val start: String? = null,
    val end: String? = null,
    val note: String? = null,
    val people: List<String>? = null,
  ) {
    val own
      get() = OwnDay(shift, start, end, note, people)
  }

  @Serializable
  data class Case(override val name: String, val own: Map<String, Day>, val start: String, val expected: Map<String, Day>) : VectorCase
}

/** A new job's order, set while the person's own days wait to be sent, takes them back from its start. */
@RunWith(RobolectricTestRunner::class)
class GivenToOrderTest {
  @Test
  fun givenToOrder() = runTest {
    val cases = vectors<GivenToOrderVectors>("own-days").givenToOrder
    val given = cases.associate { case ->
      val database = testDatabase()
      val edits = OwnEdits(database)
      for ((date, day) in case.own) {
        val own = day.own
        edits.setDay(date, DayField.DAY_FIELD_PATTERN, own.shift)
        edits.setDay(date, DayField.DAY_FIELD_START, own.start)
        edits.setDay(date, DayField.DAY_FIELD_END, own.end)
        edits.setDay(date, DayField.DAY_FIELD_NOTE, own.note)
        edits.setDay(date, DayField.DAY_FIELD_PEOPLE, own.people?.joinToString(" "))
      }
      edits.setRepeatOrders(
        listOf(repeatOrder {
          start = case.start
          sequence += "day"
          holidayCountry = "JP"
        }),
        clearFrom = case.start,
      )
      val days = database.read { days() }.associate { LocalDate.parse(it.date) to it.ownDay }
      database.close()
      case.name to days
    }
    cases.checkEach({ it.expected.entries.associate { (day, own) -> LocalDate.parse(day) to own.own } }) { given.getValue(it.name) }
  }
}
