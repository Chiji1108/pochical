package app.pochical.kit

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
  private val orders: List<RepeatOrder>,
) {
  private val known = patterns.mapTo(HashSet()) { it.id }

  private val byId = patterns.associateBy { it.id }

  /** The pattern entering [shift] puts on the following day too, none when it names a pattern that is gone. */
  fun nextDay(shift: String): String? = byId[shift]?.nextDay?.takeIf { it in known }

  /** Every day from [from] through [through] that shows a shift: its own, else its order's. */
  fun shown(from: LocalDate, through: LocalDate): Map<LocalDate, ShownDay> =
    shownDays(own.filterKeys { it in from..through }, planned(from, through), known)

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

/** The person's own calendar, again whenever sync or an edit changes it. */
fun Values.ownCalendar(): Flow<OwnCalendar> = combine(days(), patterns(), repeatOrders(), OwnCalendar::of)

/** The calendar with the own days from [from] through [through], read in the transaction it runs in. */
internal suspend fun SyncDao.ownCalendar(from: LocalDate, through: LocalDate): OwnCalendar =
  OwnCalendar.of(days(from.toString(), through.toString()), patterns(), repeatOrders())
