package app.pochical.kit

import app.pochical.design.Holidays
import app.pochical.v1.repeatOrder
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

/**
 * The orders with a new job's [order] added: it takes over from its start, so an order starting on
 * or after that day gives way to it entirely (spec/vectors/repeat.json, added).
 */
fun ordersAdding(orders: List<RepeatOrder>, order: RepeatOrder): List<RepeatOrder> = orders.filter { it.start < order.start } + order

/**
 * 繰り返し's periods with [order] put in on its start among the others, in place of one that started
 * that day, and of the one starting on [replacing] when that period's start was moved; the rest stay
 * (spec/vectors/repeat.json, put).
 */
fun ordersPutting(orders: List<RepeatOrder>, order: RepeatOrder, replacing: LocalDate? = null): List<RepeatOrder> =
  (orders.filter { it.start != order.start && it.start != replacing } + order).sortedBy { it.start }

/** Whether the period at [index] of [orders] may start on [day]: after the one before starts, before the next one does. */
fun startFits(orders: List<RepeatOrder>, index: Int, day: LocalDate): Boolean =
  (index == 0 || day > orders[index - 1].start) && (index + 1 >= orders.size || day < orders[index + 1].start)

/** 繰り返し's periods without the one starting on [start], the one before running on (spec/vectors/repeat.json, removed). */
fun ordersRemoving(orders: List<RepeatOrder>, start: LocalDate): List<RepeatOrder> = orders.filter { it.start != start }

/**
 * Whether a new order starts with 祝日は休みにする on: a week of shifts with a pattern that counts as
 * off on a Saturday or Sunday reads as office hours (spec/vectors/repeat.json, holidaysOffByDefault).
 */
fun holidaysOffByDefault(sequence: List<String>, start: LocalDate, countsAsOff: (String) -> Boolean): Boolean =
  sequence.size == DAYS_A_WEEK &&
    sequence.withIndex().any { (index, shift) ->
      countsAsOff(shift) && start.plusDays(index.toLong()).weekday.let { it == 0 || it == 6 }
    }

private const val DAYS_A_WEEK = 7

/**
 * What holidays become for someone off on them: the pattern [picked], while it is one of [daysOff],
 * their patterns that count as off in their order, else the first of them (spec/vectors/repeat.json,
 * holidayShift).
 */
fun holidayShift(daysOff: List<String>, picked: String? = null): String? = picked?.takeIf { it in daysOff } ?: daysOff.firstOrNull()

/** 祝日は休みにする as a period has it: whether it is asked, whether it may be turned on, and what holidays take. */
data class HolidaySetting(val shown: Boolean, val canTurnOn: Boolean, val shift: String?)

/**
 * 祝日は休みにする on a period's page and as an order is saved (spec/shift-patterns.md, Holidays;
 * spec/vectors/repeat.json, holidayChoice), [on] as the period has it, with [kept] the pattern it
 * keeps for holidays and [picked] one picked among [daysOff], the person's patterns in use that count
 * as off, in their order. It is asked while on, so it can always be turned off, or while one counts
 * as off, which alone lets it be turned on. Holidays take the one picked, else, while on, the one
 * kept even if it no longer counts as off, else [holidayShift]'s.
 */
fun holidaySetting(daysOff: List<String>, on: Boolean, kept: String?, picked: String? = null): HolidaySetting =
  HolidaySetting(
    shown = on || daysOff.isNotEmpty(),
    canTurnOn = daysOff.isNotEmpty(),
    shift = picked?.takeIf { it in daysOff } ?: kept?.takeIf { on } ?: holidayShift(daysOff, kept),
  )

/** The order as the wire carries it. */
internal val RepeatOrder.wire: app.pochical.v1.RepeatOrder
  get() =
    repeatOrder {
      sequence += this@wire.sequence
      start = this@wire.start.toString()
      this@wire.anchor?.let { anchor = it.toString() }
      holidaysOff = this@wire.holidaysOff
      this@wire.holidayShift?.let { holidayShift = it }
      holidayCountry = this@wire.holidayCountry
    }
