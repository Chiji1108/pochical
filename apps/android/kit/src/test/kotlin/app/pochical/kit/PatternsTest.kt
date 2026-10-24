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

@Serializable
private data class PatternsVectors(
  val saved: List<Saved>,
  val deleted: List<Deleted>,
  val guessLook: List<GuessLook>,
  val nextColor: List<NextColor>,
  val readyCopies: List<ReadyCopies>,
  val refused: List<Refused>,
  val fits: List<Fits>,
  val newJob: List<NewJobCase>,
) {
  @Serializable
  data class Wire(
    val id: String,
    val name: String,
    val emoji: String,
    val symbol: String,
    val icon: String,
    val color: Int,
    val start: String? = null,
    val end: String? = null,
    val nextDay: String? = null,
  ) {
    val row
      get() = PatternRow(id, name, emoji, symbol, icon, color, start, end, countsAsOff = false, nextDay = nextDay, archived = false)
  }

  @Serializable data class Fits(override val name: String, val pattern: Wire, val expected: Boolean) : VectorCase

  @Serializable
  data class Full(
    val id: String,
    val name: String,
    val countsAsOff: Boolean,
    val emoji: String,
    val icon: String,
    val color: Int,
    val time: List<String>? = null,
    val nextDay: String? = null,
    val archived: Boolean = false,
  ) {
    val row
      get() = PatternRow(id, name, emoji, "", icon, color, time?.get(0), time?.get(1), countsAsOff, nextDay, archived)
  }

  @Serializable data class Listed3(val id: String, val nextDay: String? = null, val archived: Boolean = false)

  @Serializable data class Job(val patterns: List<Listed3>, val sequence: List<String>)

  @Serializable
  data class NewJobCase(
    override val name: String,
    val own: List<Full>,
    val incoming: List<Full>,
    val sequence: List<String>,
    val usedBefore: List<String>,
    val expected: Job,
  ) : VectorCase

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
      OwnEdits(database).savePattern(case.id, markedPattern("${case.id}!"))
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
      for (linked in case.patterns) {
        edits.savePattern(linked.id, markedPattern(linked.id) { linked.nextDay?.let { nextDay = it } })
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

  @Test fun fits() = vectors.fits.checkEach({ it.expected }) { fitsPattern(it.pattern.row) }

  @Test
  fun aPatternTheServerWouldRefuseIsNotWritten() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    assertEquals(PatternRefusal.Unfit, edits.savePattern("day", pattern { name = "日勤" }))
    assertEquals(emptyList<OutboxEdit>(), database.write { outbox() })
    database.close()
  }

  @Test
  fun newJob() =
    vectors.newJob.checkEach({ it.expected }) { case ->
      var fresh = 0
      val job = patternsForJob(case.own.map { it.row }, case.incoming.map { it.row }, case.sequence, case.usedBefore::contains) { "new-${++fresh}" }
      PatternsVectors.Job(job.patterns.map { PatternsVectors.Listed3(it.id, it.nextDay, it.archived) }, job.sequence)
    }

  @Test
  fun anOrderInUseRefusesArchivingAndDeletingItsPatternAndWritesNothing() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("day", markedPattern("日勤"))
    edits.setRepeatOrders(listOf(repeatOrder {
      start = "2026-01-01"
      sequence += "day"
      holidayCountry = "JP"
    }))
    val sent = database.write { outbox() }.size
    assertEquals(PatternRefusal.Repeating, edits.savePattern("day", markedPattern("日勤") {
      archived = true
    }))
    assertEquals(PatternRefusal.Repeating, edits.deletePattern("day"))
    assertEquals(sent, database.write { outbox() }.size)
    assertEquals(listOf(false), database.values().patterns().first().map { it.archived })
    // Renamed, in use as it was, it is kept.
    assertNull(edits.savePattern("day", markedPattern("日中")))
    assertEquals(listOf("日中"), database.values().patterns().first().map { it.name })
    database.close()
  }

  @Test
  fun deletingAsksAboutTheDaysThatShowIt() = runTest {
    val database = testDatabase()
    val edits = OwnEdits(database)
    edits.savePattern("day", markedPattern("日勤"))
    edits.savePattern("off", markedPattern("休み"))
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
    edits.savePattern("zz-first", markedPattern("日勤"))
    edits.savePattern("aa-second", markedPattern("夜勤"))
    assertEquals(listOf("zz-first", "aa-second"), database.values().patterns().first().map { it.id })
    database.close()
  }
}
