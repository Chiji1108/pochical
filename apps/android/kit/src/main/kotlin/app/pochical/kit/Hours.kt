package app.pochical.kit

import kotlinx.serialization.Serializable

// A shift's hours and how a day's own move from its pattern's, as iOS's Pattern.swift and
// TimeChange in PochicalKit: what the calendar, the groups and the reminders say of them.

/** Start and end, "HH:MM"; an end at or before the start is the next day's. */
@Serializable
data class ShiftTime(val start: String, val end: String)

/** How a day's own hours moved from its pattern's: starting earlier is 早出, ending later is 残業. */
data class TimeChange(val early: Boolean, val late: Boolean)

/**
 * The change of a day with its own `start` or `end` against `standard`,
 * none when it has neither or the pattern has no time. Times count from
 * the standard start around the clock, so a night shift's end the next
 * morning compares the right way (spec/vectors/time-change.json).
 */
fun timeChange(start: String?, end: String?, standard: ShiftTime?): TimeChange? {
  if (standard == null || (start == null && end == null)) return null
  val day = 24 * 60
  val standardStart = minutes(standard.start)
  fun fromStart(time: String): Int {
    val offset = minutes(time) - standardStart
    return when {
      offset > day / 2 -> offset - day
      offset < -day / 2 -> offset + day
      else -> offset
    }
  }
  fun endOf(time: String): Int {
    val offset = minutes(time) - standardStart
    return if (offset <= 0) offset + day else offset
  }
  return TimeChange(
    early = start?.let { fromStart(it) < 0 } ?: false,
    late = end?.let { endOf(it) > endOf(standard.end) } ?: false,
  )
}

/** Hours as the screens write them: 9:00 – 18:00, an end at or before the start as 翌9:30 (spec/vectors/widgets.json). */
fun hoursText(start: String, end: String): String {
  fun trim(time: String) = time.removePrefix("0")
  return "${trim(start)} – ${if (end <= start) "翌" else ""}${trim(end)}"
}

/** "HH:MM" as minutes since midnight. */
internal fun minutes(time: String): Int = checkNotNull(minutesOrNull(time)) { "Not a time: $time" }

/** "HH:MM" as minutes since midnight; none for what is not a time, as iOS's minutes. */
internal fun minutesOrNull(time: String): Int? {
  val parts = time.split(":").map { it.toIntOrNull() ?: return null }
  if (parts.size != 2) return null
  return parts[0] * 60 + parts[1]
}

/** The pattern's standard hours; none for a pattern without a time. */
val PatternRow.time: ShiftTime?
  get() = start?.let { start -> end?.let { ShiftTime(start, it) } }
