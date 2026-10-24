package app.pochical.kit

import app.pochical.v1.DayField
import app.pochical.v1.pattern
import java.time.LocalDate
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@Serializable
private data class EnteringVectors(val enter: List<Enter>, val gaps: List<Gaps>) {
  @Serializable data class VectorPattern(val id: String, val nextDay: String? = null)

  @Serializable
  data class Entry(val shift: String, val note: String? = null, val people: List<String>? = null) {
    val shown
      get() = ShownDay(shift, note = note, people = people)
  }

  @Serializable
  data class Enter(
    override val name: String,
    val patterns: List<VectorPattern>,
    val days: Map<String, Entry>,
    val date: String,
    val shift: String?,
    val page: List<String>? = null,
    val expected: Map<String, Entry>,
    val selects: String,
  ) : VectorCase

  @Serializable
  data class Gaps(override val name: String, val days: List<String>, val page: List<String>, val expected: List<String>) :
    VectorCase
}

private fun Map<String, EnteringVectors.Entry>.shown() = entries.associate { (day, entry) -> LocalDate.parse(day) to entry.shown }

@RunWith(RobolectricTestRunner::class)
class EnteringTest {
  private val vectors = vectors<EnteringVectors>("entering")
  private val database = testDatabase()
  private val edits = OwnEdits(database)
  private val night = LocalDate.parse("2026-10-01")
  private val after = night.plusDays(1)

  @After fun close() = database.close()

  @Test
  fun enter() =
    vectors.enter.checkEach({ it.expected.shown() to LocalDate.parse(it.selects) }) {
      val day = LocalDate.parse(it.date)
      val patterns = OwnCalendar(it.patterns.map { pattern -> patternRow(pattern.id).copy(nextDay = pattern.nextDay) }, emptyMap(), emptyList())
      val last = it.page?.let { page -> LocalDate.parse(page[1]) } ?: day.withDayOfMonth(day.lengthOfMonth())
      enteringShift(it.shift, day, it.days.shown(), patterns::nextDay) to selectedAfterEntering(it.shift, day, last, patterns::nextDay)
    }

  @Test
  fun gaps() =
    vectors.gaps.checkEach({ it.expected.map(LocalDate::parse) }) {
      val entered = it.days.mapTo(HashSet(), LocalDate::parse)
      gapDays(LocalDate.parse(it.page[0]), LocalDate.parse(it.page[1]), entered::contains)
    }

  private suspend fun nightAndAfter() {
    edits.savePattern("night", pattern {
      name = "夜勤"
      nextDay = "after"
    })
    edits.savePattern("after", pattern { name = "明け" })
  }

  private suspend fun calendar() = database.values().ownCalendar().first()

  @Test
  fun aKeyFillsTheNextDayAndKeepsBothMemos() = runTest {
    nightAndAfter()
    edits.setDay(night.toString(), DayField.DAY_FIELD_NOTE, "歯医者")
    edits.setDay(after.toString(), DayField.DAY_FIELD_NOTE, "美容院")
    edits.enter("night", night)
    assertEquals(
      mapOf(night to ShownDay("night", note = "歯医者"), after to ShownDay("after", note = "美容院")),
      calendar().shown(night, after),
    )
  }

  @Test
  fun clearingADayKeepsItsMemoAndLeavesTheNextDay() = runTest {
    nightAndAfter()
    edits.setDay(night.toString(), DayField.DAY_FIELD_NOTE, "棚卸し")
    edits.enter("night", night)
    edits.enter(null, night)
    val calendar = calendar()
    assertEquals(mapOf(after to ShownDay("after")), calendar.shown(night, after))
    assertEquals("棚卸し", calendar.note(night))
  }

  @Test
  fun fillingTheBlanksPutsTheDayOffOnEach() = runTest {
    edits.savePattern("off", pattern {
      name = "休み"
      countsAsOff = true
    })
    val days = listOf(LocalDate.parse("2026-10-03"), LocalDate.parse("2026-10-05"))
    edits.fill(days, "off")
    assertEquals(days.associateWith { ShownDay("off") }, calendar().shown(days[0], days[1]))
  }

  @Test
  fun enteringStartsOnTheFirstBlankDayElseTheFirst() {
    val last = LocalDate.parse("2026-10-31")
    assertEquals(LocalDate.parse("2026-10-03"), firstBlankDay(night, last) { it.dayOfMonth < 3 })
    assertEquals(night, firstBlankDay(night, last) { true })
  }
}
