package app.pochical.kit

import app.pochical.design.Widgets
import java.time.LocalDate
import kotlinx.serialization.Serializable
import org.junit.Test

@Serializable
private data class WidgetVectors(val day: List<Day>, val offs: List<Offs>) {
  @Serializable data class DayWords(val time: String?, val change: String?, val column: String?, val columnShort: String?)

  @Serializable
  data class Day(
    override val name: String,
    val time: List<String>? = null,
    val start: String? = null,
    val end: String? = null,
    val expected: DayWords,
  ) : VectorCase

  /** Someone's days by how many days from today: work, off, or null where not entered; the others `rest`. */
  @Serializable
  data class Days(val name: String = "", val days: Map<Int, String?>, val rest: String? = null) {
    fun on(inDays: Int): String? = if (inDays in days) days[inDays] else rest
  }

  @Serializable data class NoneWhy(val kind: String, val names: List<String> = emptyList())

  @Serializable data class Counted(val today: Boolean, val next: Int? = null, val none: NoneWhy? = null)

  @Serializable
  data class Offs(override val name: String, val me: Days, val with: List<Days>, val group: Boolean = false, val expected: Counted) :
    VectorCase
}

/** What a widget's entry says of a day and of days off, as spec/vectors/widgets.json pins it for every platform. */
class WidgetDaysTest {
  private val today = LocalDate.of(2026, 9, 21)
  private val widgets = vectors<WidgetVectors>("widgets")

  @Test
  fun saysWhatChangedOfADay() =
    widgets.day.checkEach({ it.expected }) { case ->
      val time = case.time?.let { (start, end) -> ShiftTime(start, end) }
      val day = WidgetDay.of(today, ShownDay("day", case.start, case.end), pattern("day", time), noted = false, week = Week(), holiday = false)
      val column = day.columnHours()
      WidgetVectors.DayWords(day.time, day.change, column, column?.let(::withoutWholeHours))
    }

  @Test
  fun countsTheNextDayOff() =
    widgets.offs.checkEach({ it.expected }) { case ->
      val people = case.with.map { them -> WidgetPerson(them.name) { date -> them.on(inDays(date))?.let { it == "off" } } }
      fun dayAt(inDays: Int): WidgetDay {
        val kind = case.me.on(inDays)
        return WidgetDay.of(today.plusDays(inDays.toLong()), kind?.let(::ShownDay), kind?.let(::pattern), false, Week(), false)
      }
      val offs = widgetOffs(dayAt(0), people, case.group, ::dayAt)
      WidgetVectors.Counted(offs.today, offs.next?.inDays, offs.none?.let(::why))
    }

  @Test
  fun theLaunchersNextOffOpensTheDayTheWidgetCounts() =
    // spec/shortcuts.md: the day 次の休み not set to anyone counts, today on a day off, else today.
    widgets.offs.filter { it.with.isEmpty() }.checkEach({ case -> today.plusDays(if (case.expected.today) 0 else case.expected.next?.toLong() ?: 0) }) { case ->
      val own = (0..Widgets.offLookaheadDays + 1).mapNotNull { inDays -> case.me.on(inDays)?.let { today.plusDays(inDays.toLong()) to OwnDay(it) } }
      OwnCalendar(listOf(pattern("work"), pattern("off")), own.toMap(), emptyList()).nextDayOff(today)
    }

  private fun inDays(date: LocalDate) = (date.toEpochDay() - today.toEpochDay()).toInt()

  private fun why(none: NoOff) =
    when (none) {
      is NoOff.Waiting -> WidgetVectors.NoneWhy("waiting", none.names)
      NoOff.Apart -> WidgetVectors.NoneWhy("apart")
      NoOff.Alone -> WidgetVectors.NoneWhy("alone")
      NoOff.NotEntered -> WidgetVectors.NoneWhy("notEntered")
    }

  private fun pattern(id: String, time: ShiftTime? = null) =
    PatternRow(id, id, "", "", "", 0, time?.start, time?.end, countsAsOff = id == "off", nextDay = null, archived = false)
}
