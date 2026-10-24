package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.change
import app.pochical.v1.pattern
import app.pochical.v1.patternOrder
import app.pochical.v1.patternValue
import app.pochical.v1.repeatOrder
import java.time.LocalDate
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// newJob comes with 新しい仕事にする.
@Serializable
private data class PatternsVectors(
  val saved: List<Saved>,
  val deleted: List<Deleted>,
  val guessLook: List<GuessLook>,
  val nextColor: List<NextColor>,
  val readyCopies: List<ReadyCopies>,
  val refused: List<Refused>,
) {
  @Serializable
  data class Saved(override val name: String, val patterns: List<String>, val id: String, val expected: List<String>) : VectorCase

  @Serializable data class Linked(val id: String, val nextDay: String? = null)

  @Serializable data class Listed(val patterns: List<Linked>)

  @Serializable
  data class Deleted(override val name: String, val patterns: List<Linked>, val id: String, val expected: Listed) : VectorCase

  @Serializable data class Look(val emoji: String, val icon: String, val symbol: String)

  @Serializable data class GuessLook(override val name: String, val text: String, val expected: Look) : VectorCase

  @Serializable data class NextColor(override val name: String, val used: List<Int>, val expected: Int) : VectorCase

  @Serializable
  data class ReadyCopies(override val name: String, val ids: List<String>, val keeping: List<String>? = null, val expected: List<Linked>) :
    VectorCase

  @Serializable
  data class Order(
    val sequence: List<String>,
    val start: String,
    val holidaysOff: Boolean = false,
    val holidayShift: String? = null,
  ) {
    val order
      get() = RepeatOrder(sequence, LocalDate.parse(start), holidaysOff = holidaysOff, holidayShift = holidayShift, holidayCountry = "JP")
  }

  @Serializable data class Refusals(val archiving: Boolean, val deleting: Boolean)

  @Serializable
  data class Refused(
    override val name: String,
    val orders: List<Order>,
    val today: String,
    val id: String,
    val archived: Boolean,
    val expected: Refusals,
  ) : VectorCase
}

/** The mark palette's slots, design/src/tokens' marks. */
private const val SLOTS = 12

@RunWith(RobolectricTestRunner::class)
class PatternsTest {
  private val vectors = vectors<PatternsVectors>("patterns")

  @Test
  fun saved() = runTest {
    val failed = mutableListOf<String>()
    for (case in vectors.saved) {
      val database = testDatabase()
      database.write {
        for (id in case.patterns) {
          takeOwn(change { pattern = patternValue { this.id = id; pattern = pattern { name = id } } })
        }
        takeOwn(change { patternOrder = patternOrder { ids += case.patterns } })
      }
      OwnEdits(database).savePattern(case.id, pattern { name = "${case.id}!" })
      val shown = database.values().patterns().first().map { it.id }
      // A new one's order goes to the server as an edit of its own, so every device lists them alike.
      val sent =
        database.write { outbox() }
          .map { Change.parseFrom(it.change) }
          .lastOrNull { it.kindCase == Change.KindCase.PATTERN_ORDER }
          ?.patternOrder
          ?.idsList
      val expectedSent = if (case.id in case.patterns) null else case.expected
      if (shown != case.expected || sent != expectedSent) {
        failed += "${case.name}: expected ${case.expected} sent as $expectedSent, got $shown sent as $sent"
      }
      database.close()
    }
    assertEquals("", failed.joinToString("\n"))
  }

  @Test
  fun deleted() = runTest {
    val listed = vectors.deleted.associate { case ->
      val database = testDatabase()
      val edits = OwnEdits(database)
      for (pattern in case.patterns) {
        edits.savePattern(pattern.id, pattern {
          name = pattern.id
          pattern.nextDay?.let { nextDay = it }
        })
      }
      edits.deletePattern(case.id)
      val patterns = database.values().patterns().first().map { PatternsVectors.Linked(it.id, it.nextDay) }
      database.close()
      case.name to patterns
    }
    vectors.deleted.checkEach({ it.expected.patterns }) { listed.getValue(it.name) }
  }

  @Test
  fun guessLook() =
    vectors.guessLook.checkEach({ MarkLook(it.expected.emoji, it.expected.icon, it.expected.symbol) }) { guessLook(it.text) }

  @Test fun nextColor() = vectors.nextColor.checkEach({ it.expected }) { nextColor(it.used, SLOTS) }

  @Test
  fun readyCopies() =
    vectors.readyCopies.checkEach({ it.expected }) { case ->
      readyCopies(case.ids, case.keeping?.toSet() ?: case.ids.toSet()).map { PatternsVectors.Linked(it.id, it.nextDay) }
    }

  @Test
  fun refused() =
    vectors.refused.checkEach({ it.expected }) {
      val orders = it.orders.map { order -> order.order }
      val today = LocalDate.parse(it.today)
      PatternsVectors.Refusals(refusesArchiving(it.id, it.archived, orders, today), repeats(it.id, orders, today))
    }

  @Test
  fun anOrderInUseRefusesArchivingAndDeletingItsPatternAndWritesNothing() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("day", pattern { name = "日勤" })
    edits.setRepeatOrders(listOf(repeatOrder {
      start = "2026-01-01"
      sequence += "day"
      holidayCountry = "JP"
    }))
    val sent = database.write { outbox() }.size
    assertEquals(PatternRefusal.Repeating, edits.savePattern("day", pattern {
      name = "日勤"
      archived = true
    }))
    assertEquals(PatternRefusal.Repeating, edits.deletePattern("day"))
    assertEquals(sent, database.write { outbox() }.size)
    assertEquals(listOf(false), database.values().patterns().first().map { it.archived })
    // Renamed, in use as it was, it is kept.
    assertNull(edits.savePattern("day", pattern { name = "日中" }))
    assertEquals(listOf("日中"), database.values().patterns().first().map { it.name })
    database.close()
  }

  @Test
  fun deletingAsksAboutTheDaysThatShowIt() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("day", pattern { name = "日勤" })
    edits.savePattern("off", pattern { name = "休み" })
    edits.setRepeatOrders(listOf(repeatOrder {
      start = "2026-10-01"
      sequence += listOf("day", "off")
      holidayCountry = "JP"
    }))
    edits.setDays(mapOf(LocalDate.parse("2026-10-02") to ShownDay("day"), LocalDate.parse("2026-10-04") to ShownDay("day")))
    // From the order's start through the last own day: the 1st and 3rd from the order, the 2nd and 4th their own.
    assertEquals(4, database.daysShowing("day"))
    database.close()
  }

  @Test
  fun twoNewPatternsListInTheOrderTheyWereMade() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("zz-first", pattern { name = "日勤" })
    edits.savePattern("aa-second", pattern { name = "夜勤" })
    assertEquals(listOf("zz-first", "aa-second"), database.values().patterns().first().map { it.id })
    database.close()
  }
}
