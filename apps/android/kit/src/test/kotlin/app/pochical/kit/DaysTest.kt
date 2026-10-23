package app.pochical.kit

import java.time.LocalDate
import kotlinx.serialization.Serializable
import org.junit.Test

// Of repeat.json, schedule and shown are what the calendar reads; of own-days.json, edited is what a
// day's detail writes. The rest come with the screens that change orders.

/** A day's values as the vectors write them. */
@Serializable
private data class VectorDay(
  val shift: String? = null,
  val start: String? = null,
  val end: String? = null,
  val note: String? = null,
  val people: List<String>? = null,
) {
  val own
    get() = OwnDay(shift, start, end, note, people)

  val entry
    get() = ShownDay(shift ?: "", start, end, note, people)
}

@Serializable
private data class VectorOrder(
  val sequence: List<String>,
  val start: String,
  val anchor: String? = null,
  val holidaysOff: Boolean = false,
  val holidayShift: String? = null,
) {
  val order
    get() =
      RepeatOrder(
        sequence,
        LocalDate.parse(start),
        anchor?.let(LocalDate::parse),
        holidaysOff,
        holidayShift,
        holidayCountry = "JP",
      )
}

@Serializable
private data class RepeatVectors(val schedule: List<Schedule>, val shown: List<Shown>) {
  @Serializable
  data class Schedule(
    override val name: String,
    val sequence: List<String>,
    val anchor: String,
    val from: String,
    val to: String,
    val holidays: String? = null,
    val holidayShift: String? = null,
    val expected: Map<String, String>,
  ) : VectorCase

  @Serializable
  data class Shown(
    override val name: String,
    val orders: List<VectorOrder>,
    val patterns: List<String>,
    val own: Map<String, VectorDay>,
    val from: String,
    val to: String,
    val expected: Map<String, String>,
  ) : VectorCase
}

@Serializable
private data class OwnDaysVectors(val edited: List<Edited>) {
  @Serializable
  data class Edited(
    override val name: String,
    val own: Map<String, VectorDay>,
    val planned: Map<String, String>,
    val edits: Map<String, VectorDay?>,
    val expected: Map<String, VectorDay>,
  ) : VectorCase
}

private fun <V> Map<String, V>.byDay(): Map<LocalDate, V> = mapKeys { LocalDate.parse(it.key) }

class DaysTest {
  private val repeat = vectors<RepeatVectors>("repeat")

  @Test
  fun schedule() =
    repeat.schedule.checkEach({ it.expected.byDay() }) {
      repeatSchedule(
        it.sequence,
        LocalDate.parse(it.anchor),
        LocalDate.parse(it.from),
        LocalDate.parse(it.to),
        it.holidayShift,
        it.holidays ?: "JP",
      )
    }

  @Test
  fun shown() =
    repeat.shown.checkEach({ it.expected.byDay() }) {
      val from = LocalDate.parse(it.from)
      val through = LocalDate.parse(it.to)
      OwnCalendar(it.patterns.map(::patternRow), it.own.byDay().mapValues { (_, day) -> day.own }, it.orders.map { it.order })
        .shown(from, through)
        .mapValues { (_, day) -> day.shift }
    }

  @Test
  fun edited() =
    vectors<OwnDaysVectors>("own-days").edited.checkEach({ it.expected.byDay().mapValues { (_, day) -> day.own } }) {
      editedOwnDays(
        it.own.byDay().mapValues { (_, day) -> day.own },
        it.planned.byDay(),
        it.edits.byDay().mapValues { (_, day) -> day?.entry },
      )
    }
}

/** A pattern with no more than its id. */
internal fun patternRow(id: String) =
  PatternRow(id, name = id, emoji = "", symbol = "", icon = "", color = 0, start = null, end = null, countsAsOff = false, nextDay = null, archived = false)
