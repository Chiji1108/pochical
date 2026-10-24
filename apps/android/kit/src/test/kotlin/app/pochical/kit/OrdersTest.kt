package app.pochical.kit

import app.pochical.v1.DayField
import app.pochical.v1.pattern
import java.time.LocalDate
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// repeat.json's timeline of periods and what a new order starts with; schedule and shown are DaysTest's.
@Serializable
private data class OrdersVectors(
  val added: List<Added>,
  val put: List<Put>,
  val removed: List<Removed>,
  val holidaysOffByDefault: List<OffByDefault>,
  val holidayShift: List<HolidayShift>,
  val holidayChoice: List<HolidayChoice>,
) {
  @Serializable data class Choice(val shown: Boolean, val canTurnOn: Boolean, val shift: String? = null)

  @Serializable
  data class HolidayChoice(
    override val name: String,
    val patterns: List<Off>,
    val on: Boolean,
    val kept: String? = null,
    val picked: String? = null,
    val expected: Choice,
  ) : VectorCase

  @Serializable
  data class Order(val sequence: List<String>, val start: String) {
    val order
      get() = RepeatOrder(sequence, LocalDate.parse(start), holidayCountry = "JP")
  }

  @Serializable
  data class Added(override val name: String, val orders: List<Order>, val order: Order, val expected: List<Order>) : VectorCase

  @Serializable
  data class Put(
    override val name: String,
    val orders: List<Order>,
    val order: Order,
    val replacing: String? = null,
    val expected: List<Order>,
  ) : VectorCase

  @Serializable
  data class Removed(override val name: String, val orders: List<Order>, val start: String, val expected: List<Order>) : VectorCase

  @Serializable
  data class OffByDefault(
    override val name: String,
    val sequence: List<String>,
    val start: String,
    val daysOff: List<String>,
    val expected: Boolean,
  ) : VectorCase

  @Serializable data class Off(val id: String, val countsAsOff: Boolean)

  @Serializable
  data class HolidayShift(override val name: String, val patterns: List<Off>, val picked: String? = null, val expected: String? = null) :
    VectorCase
}

@RunWith(RobolectricTestRunner::class)
class OrdersTest {
  private val vectors = vectors<OrdersVectors>("repeat")

  private fun List<OrdersVectors.Order>.orders() = map { it.order }

  @Test fun added() = vectors.added.checkEach({ it.expected.orders() }) { ordersAdding(it.orders.orders(), it.order.order) }

  @Test
  fun put() =
    vectors.put.checkEach({ it.expected.orders() }) {
      ordersPutting(it.orders.orders(), it.order.order, it.replacing?.let(LocalDate::parse))
    }

  @Test
  fun removed() = vectors.removed.checkEach({ it.expected.orders() }) { ordersRemoving(it.orders.orders(), LocalDate.parse(it.start)) }

  @Test
  fun holidaysOffByDefault() =
    vectors.holidaysOffByDefault.checkEach({ it.expected }) { holidaysOffByDefault(it.sequence, LocalDate.parse(it.start), it.daysOff::contains) }

  @Test
  fun holidayShift() =
    vectors.holidayShift.checkEach({ it.expected }) { case ->
      holidayShift(case.patterns.filter { it.countsAsOff }.map { it.id }, case.picked)
    }

  @Test
  fun holidayChoice() =
    vectors.holidayChoice.checkEach({ HolidaySetting(it.expected.shown, it.expected.canTurnOn, it.expected.shift) }) { case ->
      holidaySetting(case.patterns.filter { it.countsAsOff }.map { it.id }, case.on, case.kept, case.picked)
    }

  @Test
  fun holidaysKeepTheirPatternAfterItStopsCountingAsOffAndCanStillBeTurnedOff() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("day", markedPattern("日勤"))
    edits.savePattern("off", markedPattern("休み") { countsAsOff = true })
    val start = LocalDate.parse("2026-01-01")
    edits.putOrder(RepeatOrder(listOf("day"), start, holidayCountry = "JP"))
    edits.setHolidaysOff(true, start = start)
    edits.savePattern("off", markedPattern("休み"))
    edits.setHolidaysOff(true, start = start)
    assertEquals(listOf(true to "off"), database.values().ownCalendar().first().orders.map { it.holidaysOff to it.holidayShift })
    edits.setHolidaysOff(false, start = start)
    edits.setHolidaysOff(true, start = start)
    // With none that counts as off it is not turned on again.
    assertEquals(listOf(false to "off"), database.values().ownCalendar().first().orders.map { it.holidaysOff to it.holidayShift })
    database.close()
  }

  @Test
  fun aPeriodPutOnTheDaysKeepsWhatThePersonEntered() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("day", markedPattern("日勤"))
    edits.savePattern("night", markedPattern("夜勤"))
    val entered = LocalDate.parse("2026-10-05")
    edits.setDays(mapOf(entered to ShownDay("night")))
    edits.putOrder(RepeatOrder(listOf("day"), LocalDate.parse("2026-10-01"), holidayCountry = "JP"))
    val calendar = database.values().ownCalendar().first()
    assertEquals("night", calendar.shown(entered, entered)[entered]?.shift)
    assertEquals("day", calendar.shown(entered.plusDays(1), entered.plusDays(1)).values.single().shift)
    database.close()
  }

  @Test
  fun aPeriodMovesOnlyBetweenTheStartsAroundIt() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("day", markedPattern("日勤"))
    val starts = listOf("2026-01-01", "2026-06-01", "2026-10-01").map(LocalDate::parse)
    for (start in starts) edits.putOrder(RepeatOrder(listOf("day"), start, holidayCountry = "JP"))
    assertEquals(false, edits.moveOrder(starts[1], starts[2]))
    assertEquals(false, edits.moveOrder(starts[1], LocalDate.parse("2025-12-31")))
    assertEquals(true, edits.moveOrder(starts[1], LocalDate.parse("2026-07-01")))
    val orders = database.values().ownCalendar().first().orders
    assertEquals(listOf("2026-01-01", "2026-07-01", "2026-10-01"), orders.map { it.start.toString() })
    assertEquals(starts[1], orders[1].anchor)
    database.close()
  }

  @Test
  fun holidaysOffTakesThePersonsFirstDayOffInUse() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("day", markedPattern("日勤"))
    edits.savePattern("paid", markedPattern("有休") {
      countsAsOff = true
      archived = true
    })
    edits.savePattern("off", markedPattern("休み") {
      countsAsOff = true
    })
    val start = LocalDate.parse("2026-01-01")
    edits.putOrder(RepeatOrder(listOf("day"), start, holidayCountry = "JP"))
    edits.setHolidaysOff(true, start = start)
    assertEquals("off", database.values().ownCalendar().first().orders.single().holidayShift)
    edits.setHolidaysOff(false, start = start)
    // Off, it keeps the pattern holidays took, for when it is turned on again.
    assertEquals(listOf(false to "off"), database.values().ownCalendar().first().orders.map { it.holidaysOff to it.holidayShift })
    database.close()
  }

  @Test
  fun aNewJobArchivesWhatPastDaysShowAndTakesTheDaysFromItsStart() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("office", markedPattern("出勤") {
      emoji = "💼"
      symbol = "出"
      icon = "briefcase"
    })
    edits.setDays(mapOf(LocalDate.parse("2026-10-30") to ShownDay("office"), LocalDate.parse("2026-11-03") to ShownDay("office")))
    edits.setDay("2026-11-03", DayField.DAY_FIELD_NOTE, "健診")
    val start = LocalDate.parse("2026-11-01")
    edits.changeJob(readyCopies(listOf("duty", "offDuty", "off")), listOf("duty", "offDuty", "off"), start, start, "JP")
    val calendar = database.values().ownCalendar().first()
    assertEquals(
      listOf("duty" to false, "offDuty" to false, "off" to false, "office" to true),
      calendar.patterns.map { it.id to it.archived },
    )
    val after = LocalDate.parse("2026-11-03")
    assertEquals(ShownDay("off", note = "健診"), calendar.shown(after, after)[after])
    assertEquals("office", calendar.shown(LocalDate.parse("2026-10-30"), LocalDate.parse("2026-10-30")).values.single().shift)
    database.close()
  }
}
