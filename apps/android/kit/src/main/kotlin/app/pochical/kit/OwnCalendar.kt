package app.pochical.kit

import app.pochical.design.Days
import java.time.LocalDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

/**
 * The person's own calendar as the device holds it, as iOS's OwnCalendar: their patterns in their
 * order, their own days and their repeating orders, read from the tables that show them.
 */
class OwnCalendar(
  val patterns: List<PatternRow>,
  internal val own: Map<LocalDate, OwnDay>,
  val orders: List<RepeatOrder>,
) {
  private val known = patterns.mapTo(HashSet()) { it.id }

  private val byId = patterns.associateBy { it.id }

  /** The pattern [id], archived or not; none for one that is gone. */
  fun pattern(id: String): PatternRow? = byId[id]

  /** The pattern entering [shift] puts on the following day too, none when it names a pattern that is gone. */
  fun nextDay(shift: String): String? = byId[shift]?.nextDay?.takeIf { it in known }

  /** Every day from [from] through [through] that shows a shift: its own, else its order's. */
  fun shown(from: LocalDate, through: LocalDate): Map<LocalDate, ShownDay> =
    shownDays(own.filterKeys { it in from..through }, planned(from, through), known)

  /** Whether the person set the day's shift themselves, a cleared one too, which stays over any order. */
  fun hasOwnShift(day: LocalDate): Boolean = own[day]?.shift != null

  /**
   * Whether the person has entered any day yet, of their own or by a repeating order: the widgets
   * say where their days will come from until then (spec/widgets.md, Entry).
   */
  val hasEnteredDays: Boolean
    get() = own.values.any { it.shift != null && it.shift != Days.noShift } || orders.any { it.sequence.isNotEmpty() }

  /** The day's memo, its own whether it has a shift or not. */
  fun note(day: LocalDate): String? = own[day]?.note

  /** Each day's shift by the orders alone, from [from] through [through]. */
  internal fun planned(from: LocalDate, through: LocalDate) = plannedShifts(orders, known, from, through)

  companion object {
    val empty = OwnCalendar(emptyList(), emptyMap(), emptyList())

    internal fun of(days: List<DayRow>, patterns: List<PatternRow>, orders: List<RepeatOrderRow>) =
      OwnCalendar(patterns, days.associate { LocalDate.parse(it.date) to it.ownDay }, orders.map { it.order })
  }
}

/**
 * What 今月のお休み and 今月の内訳 count on a page (spec/calendar.md, The month;
 * spec/vectors/month.json, summary): its days off, each pattern's days in the patterns' order, and
 * the days that show no shift (未入力).
 */
data class PageSummary(val daysOff: Int, val counts: List<Pair<String, Int>>, val unfilled: Int) {
  companion object {
    /** The page from [first] through [last], with [shown] each day's shift by date and [patterns] the person's, archived too. */
    fun of(first: LocalDate, last: LocalDate, shown: Map<LocalDate, String>, patterns: List<PatternRow>): PageSummary {
      val onPage = shown.filterKeys { it in first..last }.values
      val off = patterns.filter { it.countsAsOff }.mapTo(HashSet()) { it.id }
      return PageSummary(
        daysOff = onPage.count { it in off },
        counts = patterns.map { pattern -> pattern.id to onPage.count { it == pattern.id } },
        unfilled = daysFrom(first, last).count() - onPage.size,
      )
    }
  }
}

/** What the page from [first] through [last] counts. */
fun OwnCalendar.summary(first: LocalDate, last: LocalDate): PageSummary =
  PageSummary.of(first, last, shown(first, last).mapValues { it.value.shift }, patterns)

/** The person's own calendar, again whenever sync or an edit changes it. */
fun Values.ownCalendar(): Flow<OwnCalendar> = combine(days(), patterns(), repeatOrders(), OwnCalendar::of)

/** The calendar with the own days from [from] through [through], read in the transaction it runs in. */
internal suspend fun SyncDao.ownCalendar(from: LocalDate, through: LocalDate): OwnCalendar =
  OwnCalendar.of(days(from.toString(), through.toString()), patterns(), repeatOrders())

/**
 * The shifts every day shows, from the first own day or order's start through [through], else
 * through the last own day or the latest order's start, past which only own days could show one the
 * order in use does not repeat. Read in the transaction it runs in.
 */
internal suspend fun SyncDao.shownSoFar(through: LocalDate? = null): Collection<ShownDay> {
  val days = days("0000-01-01", through?.toString() ?: "9999-12-31")
  val orders = repeatOrders()
  val edges = days.map { LocalDate.parse(it.date) } + orders.map { LocalDate.parse(it.start) }
  val first = edges.minOrNull() ?: return emptyList()
  val last = through ?: edges.max()
  if (first > last) return emptyList()
  return OwnCalendar.of(days, patterns(), orders).shown(first, last).values
}
