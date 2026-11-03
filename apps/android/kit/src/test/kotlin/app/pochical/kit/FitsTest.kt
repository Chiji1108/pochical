package app.pochical.kit

import app.pochical.design.SyncLimits
import app.pochical.v1.DayField
import java.time.LocalDate
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// spec/vectors/fits.json: what the server takes of each value the app edits, checked before the
// value is kept.
@Serializable
private data class FitsVectors(
  val dayField: List<DayFieldCase>,
  val coworkerName: List<Text>,
  val personName: List<Text>,
  val groupName: List<Text>,
  val groupMark: List<Mark>,
  val patternOrder: List<Ids>,
  val rotation: List<Rotation>,
  val repeatOrders: List<Orders>,
) {
  @Serializable
  data class DayFieldCase(override val name: String, val field: String, val value: String?, val expected: Boolean) : VectorCase {
    val wire: DayField
      get() = DayField.valueOf("DAY_FIELD_${this.field.uppercase()}")
  }

  @Serializable data class Text(override val name: String, val text: String, val expected: Boolean) : VectorCase

  @Serializable
  data class Parts(val emoji: String = "", val icon: String = "", val letter: String = "", val color: Int = 0, val photoId: String = "") {
    val mark: GroupMarkValue
      get() = GroupMarkValue(emoji, icon, letter, color, photoId)
  }

  @Serializable data class Mark(override val name: String, val mark: Parts, val expected: Boolean) : VectorCase

  /** Ids separated by single spaces, "" for none. */
  @Serializable data class Ids(override val name: String, val ids: String, val expected: Boolean) : VectorCase

  @Serializable data class Rotation(override val name: String, val sequence: String, val expected: Boolean) : VectorCase

  /** Each order by its rotation, as [Rotation] writes one. */
  @Serializable data class Orders(override val name: String, val orders: List<String>, val expected: Boolean) : VectorCase
}

/** Ids separated by single spaces, "" for none, as fits.json writes lists. */
private fun ids(text: String): List<String> = if (text.isEmpty()) emptyList() else text.split(" ")

// Robolectric, for the Unicode properties Android's ICU has and the database.
@RunWith(RobolectricTestRunner::class)
class FitsTest {
  private val vectors = vectors<FitsVectors>("fits")
  private val database = testDatabase()
  private val edits = OwnEdits(database)

  @After fun close() = database.close()

  @Test fun dayField() = vectors.dayField.checkEach({ it.expected }) { fitsDayField(it.wire, it.value) }

  @Test fun coworkerName() = vectors.coworkerName.checkEach({ it.expected }) { fitsCoworkerName(it.text) }

  @Test fun personName() = vectors.personName.checkEach({ it.expected }) { fitsPersonName(it.text) }

  @Test fun groupName() = vectors.groupName.checkEach({ it.expected }) { fitsGroupName(it.text) }

  @Test fun groupMark() = vectors.groupMark.checkEach({ it.expected }) { fitsGroupMark(it.mark.mark) }

  @Test fun patternOrder() = vectors.patternOrder.checkEach({ it.expected }) { fitsPatternOrder(ids(it.ids)) }

  @Test fun rotation() = vectors.rotation.checkEach({ it.expected }) { fitsRotation(ids(it.sequence)) }

  @Test
  fun repeatOrders() =
    vectors.repeatOrders.checkEach({ it.expected }) { case ->
      val start = LocalDate.of(2026, 1, 1)
      fitsRepeatOrders(case.orders.mapIndexed { index, sequence -> RepeatOrder(ids(sequence), start.plusDays(index.toLong()), holidayCountry = "JP") })
    }

  @Test
  fun aCountPastTheServersIsNotWritten() = runTest {
    val start = LocalDate.of(2026, 1, 1)
    fun order(index: Int) = RepeatOrder(listOf("p1"), start.plusDays(index.toLong()), holidayCountry = "JP")
    for (index in 1..SyncLimits.patterns) edits.savePattern("p$index", markedPattern("p$index"))
    for (index in 0 until SyncLimits.orders) edits.putOrder(order(index))
    val kept = database.write { outbox() }.size

    assertEquals(PatternRefusal.Unfit, edits.savePattern("one-more", markedPattern("one-more")))
    edits.putOrder(order(SyncLimits.orders))
    edits.putOrder(RepeatOrder(List(SyncLimits.sequence + 1) { "p1" }, start, holidayCountry = "JP"))
    edits.changeJob(listOf(), listOf("p1"), start.plusDays(SyncLimits.orders.toLong()), start, "JP")

    assertEquals(kept, database.write { outbox() }.size)
  }

  @Test
  fun aValueTheServerWouldRefuseIsNotWritten() = runTest {
    val day = LocalDate.of(2026, 11, 2)
    edits.setDay(day.toString(), DayField.DAY_FIELD_NOTE, "あ".repeat(101))
    assertNull(edits.addCoworker("  "))
    edits.setDays(mapOf(day to ShownDay("day", people = (1..51).map { "p$it" })))

    assertEquals(0, database.write { outbox() }.size)
  }
}
