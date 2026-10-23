package app.pochical.calendar

import app.pochical.design.ReadyPatterns
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.UUID
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update

/**
 * A month to look at before the app keeps days, as iOS's SampleDays puts
 * in: Pochical's 二交代制 patterns, repeated from last month with holidays
 * off, a memo and changed hours on a few days. Kept in memory: what is
 * changed lasts while the app runs.
 */
class SampleDays(today: LocalDate) : OwnDays {
  private val first = today.withDayOfMonth(1)
  private val order =
    SampleOrder(
      sequence = listOf("day", "day", "night", "after", "off", "off"),
      anchor = first.minusMonths(1),
      holidayShift = "off",
      holidays = "JP",
    )
  private val state =
    MutableStateFlow(
      Sample(
        patterns =
          listOf("day", "night", "after", "off").map { id ->
            val ready = ReadyPatterns.all.first { it.id == id }
            Pattern(
              id = ready.id,
              name = ready.name,
              icon = ready.icon,
              emoji = ready.emoji,
              symbol = ready.symbol,
              color = ready.color,
              time = ready.time?.let { (start, end) -> ShiftTime(start, end) },
              countsAsOff = ready.countsAsOff,
            )
          },
        coworkers = emptyList(),
        order = order,
        own =
          mapOf(
            first.plusDays(7) to order.entryOn(first.plusDays(7)).copy(end = "20:00"),
            first.plusDays(12) to order.entryOn(first.plusDays(12)).copy(start = "08:00"),
          ),
        notes = mapOf(first.plusDays(7) to "棚卸し", first.plusDays(15) to "歯医者"),
      )
    )

  override val calendar: StateFlow<OwnCalendar> = state

  override fun set(day: LocalDate, entry: DayEntry?) = state.update { it.copy(own = it.own + (day to entry)) }

  override fun setNote(day: LocalDate, note: String) =
    state.update { it.copy(notes = if (note.isEmpty()) it.notes - day else it.notes + (day to note)) }

  override fun addCoworker(name: String): Coworker {
    val coworker = Coworker(UUID.randomUUID().toString(), name)
    state.update { it.copy(coworkers = it.coworkers + coworker) }
    return coworker
  }

  /** A day's own entry wins over the order's; one cleared (null) shows nothing. */
  private data class Sample(
    override val patterns: List<Pattern>,
    override val coworkers: List<Coworker>,
    val order: SampleOrder,
    val own: Map<LocalDate, DayEntry?>,
    val notes: Map<LocalDate, String>,
  ) : OwnCalendar {
    override fun shown(from: LocalDate, through: LocalDate): Map<LocalDate, DayEntry> =
      generateSequence(from) { it.plusDays(1) }
        .takeWhile { it <= through }
        .mapNotNull { day -> (if (day in own) own[day] else order.entryOn(day))?.let { day to it } }
        .toMap()

    override fun note(day: LocalDate): String? = notes[day]
  }
}

/** The sample's one repeating order (spec/vectors/repeat.json, schedule). */
internal data class SampleOrder(
  val sequence: List<String>,
  /** The day its first shift falls on; days before it count backwards. */
  val anchor: LocalDate,
  /** What a national holiday of `holidays` takes instead, if anything. */
  val holidayShift: String? = null,
  val holidays: String? = null,
) {
  fun shiftOn(day: LocalDate): String {
    if (holidayShift != null && holidays != null && day.holidayName(holidays) != null) return holidayShift
    return sequence[Math.floorMod(ChronoUnit.DAYS.between(anchor, day), sequence.size)]
  }

  fun entryOn(day: LocalDate) = DayEntry(shiftOn(day))
}
