package app.pochical.kit

import java.time.LocalDate
import java.time.YearMonth
import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class DeviceCalendarVectors(
  val events: List<Events>,
  val shownAtFirst: List<AtFirst>,
  val picks: List<Picks>,
  val marks: List<Marking>,
  val marksRead: List<Reading>,
) {
  @Serializable
  data class Pattern(
    val name: String = "",
    val time: List<String>? = null,
    val off: Boolean = false,
    val nextDay: String? = null,
  )

  @Serializable data class Day(val shift: String, val start: String? = null, val end: String? = null)

  @Serializable
  data class Event(val day: String, val title: String, val start: Int?, val end: Int?, val notes: String? = null)

  @Serializable
  data class Events(
    override val name: String,
    val month: String,
    /** A シフトの期間's first day; the month without it. */
    val start: Int = 1,
    val patterns: Map<String, Pattern>,
    val days: Map<String, Day>,
    val notes: Map<String, String> = emptyMap(),
    val people: Map<String, List<String>> = emptyMap(),
    val shown: List<String>,
    val expected: List<Event>,
  ) : VectorCase

  @Serializable
  data class AtFirst(override val name: String, val patterns: Map<String, Pattern>, val expected: List<String>) : VectorCase

  @Serializable data class Pick(val id: String, val on: Boolean)

  @Serializable data class Kept(val chosen: Map<String, Boolean>, val shown: List<String>)

  @Serializable
  data class Picks(
    override val name: String,
    val patterns: Map<String, Pattern>,
    val chosen: Map<String, Boolean>,
    val pick: Pick? = null,
    val expectedChosen: Map<String, Boolean>,
    val expectedShown: List<String>,
  ) : VectorCase

  @Serializable
  data class Marking(override val name: String, val day: String, val user: String, val notes: String? = null, val expected: String) :
    VectorCase

  @Serializable data class Mark(val day: String, val user: String)

  @Serializable data class Reading(override val name: String, val notes: String, val expected: Mark?) : VectorCase
}

private fun rows(patterns: Map<String, DeviceCalendarVectors.Pattern>): List<PatternRow> =
  patterns.map { (id, it) ->
    PatternRow(id, it.name, "⭐️", id, "star", 0, it.time?.get(0), it.time?.get(1), it.off, it.nextDay, false)
  }

class ShiftEventsTest {
  private val cases = vectors<DeviceCalendarVectors>("device-calendar")

  @Test
  fun events() =
    cases.events.checkEach({ it.expected }) { case ->
      val days = case.days.entries.associate { (day, it) -> LocalDate.parse(day) to ShownDay(it.shift, it.start, it.end) }
      shiftEvents(
          ShiftPeriod(case.start).page(YearMonth.from(LocalDate.parse(case.month))),
          days,
          rows(case.patterns).associateBy { it.id },
          case.shown.toSet(),
          case.notes.mapKeys { LocalDate.parse(it.key) },
          case.people.mapKeys { LocalDate.parse(it.key) },
        )
        .map { DeviceCalendarVectors.Event(it.day.toString(), it.title, it.start, it.end, it.notes) }
    }

  @Test
  fun shownAtFirst() = cases.shownAtFirst.checkEach({ it.expected.sorted() }) { shownAtFirst(rows(it.patterns)).sorted() }

  @Test
  fun picks() =
    cases.picks.checkEach({ DeviceCalendarVectors.Kept(it.expectedChosen, it.expectedShown.sorted()) }) { case ->
      val patterns = rows(case.patterns)
      val start = CalendarAdd(chosen = case.chosen)
      val picked = case.pick?.let { start.picking(it.id, it.on, patterns) } ?: start
      DeviceCalendarVectors.Kept(picked.chosen, picked.shown(patterns).sorted())
    }

  @Test
  fun marks() =
    cases.marks.checkEach({ it.expected }) { EventMark(LocalDate.parse(it.day), it.user).appendedTo(it.notes) }

  @Test
  fun marksRead() =
    cases.marksRead.checkEach({ it.expected }) { case ->
      EventMark.inNotes(case.notes)?.let { DeviceCalendarVectors.Mark(it.day.toString(), it.user) }
    }
}
