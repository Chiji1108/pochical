package app.pochical.kit

import app.pochical.design.Holidays
import java.time.LocalDate
import java.time.temporal.ChronoUnit

/**
 * A repeating order of shifts (spec/shift-patterns.md, Repeating orders): its sequence laid over the
 * days from [start], without end, counted from [anchor], a day that falls on its first shift (the
 * start unless set). An empty sequence ends repeating: from its start, days are entered by hand.
 */
data class RepeatOrder(
  val sequence: List<String>,
  val start: LocalDate,
  val anchor: LocalDate? = null,
  /** 祝日は休みにする: the national holidays of [holidayCountry] take [holidayShift] in place of the sequence's shift. */
  val holidaysOff: Boolean = false,
  val holidayShift: String? = null,
  /** The device's region when the order was made, like "JP". */
  val holidayCountry: String,
)

internal val RepeatOrderRow.order: RepeatOrder
  get() =
    RepeatOrder(
      sequence = sequence.split(" ").filter { it.isNotEmpty() },
      start = LocalDate.parse(start),
      anchor = anchor?.let(LocalDate::parse),
      holidaysOff = holidaysOff,
      holidayShift = holidayShift,
      holidayCountry = holidayCountry,
    )

/**
 * A sequence laid over the days from [from] through [through], counted in whole days from [anchor],
 * so days before the anchor line up too. With a [holidayShift], the national holidays of
 * [holidayCountry] take it (spec/vectors/repeat.json, schedule).
 */
fun repeatSchedule(
  sequence: List<String>,
  anchor: LocalDate,
  from: LocalDate,
  through: LocalDate,
  holidayShift: String? = null,
  holidayCountry: String,
): Map<LocalDate, String> {
  if (sequence.isEmpty()) return emptyMap()
  return daysFrom(from, through)
    .associateWith { day ->
      if (holidayShift != null && Holidays.nameOf(day.toString(), holidayCountry) != null) {
        holidayShift
      } else {
        sequence[Math.floorMod(ChronoUnit.DAYS.between(anchor, day), sequence.size)]
      }
    }
}

/**
 * Each day's shift from [from] through [through] by the orders alone: a day follows the latest order
 * that starts on or before it. A pattern not in [known] leaves its days empty
 * (spec/vectors/repeat.json, shown).
 */
fun plannedShifts(orders: List<RepeatOrder>, known: Set<String>, from: LocalDate, through: LocalDate): Map<LocalDate, String> {
  val ordered = orders.sortedBy { it.start }
  val planned = mutableMapOf<LocalDate, String>()
  for ((index, order) in ordered.withIndex()) {
    val end = ordered.getOrNull(index + 1)?.start?.minusDays(1) ?: through
    val days =
      repeatSchedule(
        order.sequence,
        anchor = order.anchor ?: order.start,
        from = maxOf(order.start, from),
        through = minOf(end, through),
        holidayShift = order.holidayShift.takeIf { order.holidaysOff },
        holidayCountry = order.holidayCountry,
      )
    planned += days.filterValues { it in known }
  }
  return planned
}
