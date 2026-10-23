package app.pochical.kit

import app.pochical.design.Days
import app.pochical.v1.DayField
import java.time.LocalDate

// The person's days over their repeating orders, as iOS's DayEntry.swift: only what differs from
// the orders is kept as their own (spec/shift-patterns.md, Repeating orders).

/** A day as it shows: its shift, and what else it has. */
data class ShownDay(
  val shift: String,
  /** Set only when the time differs from the pattern's standard time. */
  val start: String? = null,
  val end: String? = null,
  val note: String? = null,
  /** The coworkers noted on the day, by id, in the order they were added. */
  val people: List<String>? = null,
)

/**
 * What the person set on a day themselves, the only days kept: a shift of their own, or
 * [Days.noShift] for a day cleared on purpose. A day without one follows its repeating order.
 */
data class OwnDay(
  val shift: String? = null,
  val start: String? = null,
  val end: String? = null,
  val note: String? = null,
  val people: List<String>? = null,
) {
  val isEmpty: Boolean
    get() = this == OwnDay()
}

internal val DayRow.ownDay: OwnDay
  get() = OwnDay(pattern, start, end, note, people?.split(" "))

/**
 * Every day that shows a shift, from the person's own days and their orders' ([plannedShifts]): its
 * own shift, else its order's, with [known] the person's patterns. A day whose shift is
 * [Days.noShift], or names a pattern that is gone, shows nothing (spec/sync-protocol.md, Deleted
 * values).
 */
fun shownDays(own: Map<LocalDate, OwnDay>, planned: Map<LocalDate, String>, known: Set<String>): Map<LocalDate, ShownDay> =
  (own.keys + planned.keys)
    .mapNotNull { day ->
      val kept = own[day]
      val shift = (kept?.shift ?: planned[day])?.takeIf { it in known } ?: return@mapNotNull null
      day to ShownDay(shift, kept?.start, kept?.end, kept?.note, kept?.people)
    }
    .toMap()

/**
 * The person's own days once [edits] set the days they name to show an entry, or nothing (null).
 * Only what differs from the order is kept: a day showing its planned shift keeps no shift of its
 * own, and clearing a day the order fills keeps [Days.noShift] there (spec/vectors/own-days.json).
 */
fun editedOwnDays(
  own: Map<LocalDate, OwnDay>,
  planned: Map<LocalDate, String>,
  edits: Map<LocalDate, ShownDay?>,
): Map<LocalDate, OwnDay> {
  val edited = own.toMutableMap()
  for ((day, entry) in edits) {
    val kept = ownDay(entry, planned[day], own[day])
    if (kept == null) edited -= day else edited[day] = kept
  }
  return edited
}

/**
 * The memo is the day's, not the shift's (spec/shift-patterns.md, A day's memo): an entry without
 * one keeps [previous]'s, and "" clears it.
 */
private fun ownDay(entry: ShownDay?, planned: String?, previous: OwnDay?): OwnDay? {
  val note = (entry?.note ?: previous?.note)?.ifEmpty { null }
  val kept =
    if (entry == null) {
      OwnDay(shift = if (planned == null) null else Days.noShift, note = note)
    } else {
      OwnDay(
        shift = entry.shift.takeUnless { it == planned },
        start = entry.start,
        end = entry.end,
        note = note,
        // A day with nobody on it keeps no people, not an empty list.
        people = entry.people?.ifEmpty { null },
      )
    }
  return kept.takeUnless { it.isEmpty }
}

private val dayFields: List<Pair<DayField, (OwnDay?) -> String?>> =
  listOf(
    DayField.DAY_FIELD_PATTERN to { it?.shift },
    DayField.DAY_FIELD_START to { it?.start },
    DayField.DAY_FIELD_END to { it?.end },
    DayField.DAY_FIELD_NOTE to { it?.note },
    DayField.DAY_FIELD_PEOPLE to { it?.people?.joinToString(" ") },
  )

/** The day fields whose own values differ between two own days, each with its new value as the wire carries it (null clears it). */
internal fun changedFields(old: OwnDay?, new: OwnDay?): List<Pair<DayField, String?>> =
  dayFields.mapNotNull { (field, value) -> if (value(old) == value(new)) null else field to value(new) }
