package app.pochical.calendar

import androidx.compose.runtime.staticCompositionLocalOf
import java.time.LocalDate
import kotlinx.coroutines.flow.StateFlow

/** A pattern as the calendar draws it and offers it for a day. */
data class Pattern(
  val id: String,
  val name: String,
  val icon: String,
  val emoji: String,
  val symbol: String,
  /** Its slot in the テーマ's shift colors. */
  val color: Int,
  /** Its standard hours; none for a pattern without a time. */
  val time: ShiftTime?,
  val countsAsOff: Boolean,
  /** Another pattern's id, entered on the following day too, as 明け after 夜勤 (spec/shift-patterns.md, The next day). */
  val nextDay: String? = null,
  /** Kept for the days that show it, offered nowhere a pattern is picked (spec/vectors/patterns.json, newJob). */
  val archived: Boolean = false,
)

/** Start and end, "HH:MM"; an end at or before the start is the next day's. */
data class ShiftTime(val start: String, val end: String)

/**
 * A day's shift as it shows: its pattern, the day's own hours where they
 * differ from the pattern's, and the coworkers on it by id.
 */
data class DayEntry(
  val shift: String,
  val start: String? = null,
  val end: String? = null,
  val people: List<String> = emptyList(),
)

/** Someone the person works with (一緒に働く人). */
data class Coworker(val id: String, val name: String)

/**
 * The person's own calendar at one moment, as iOS's OwnCalendar: what the
 * calendar screen reads. A day shows its own shift, else its repeating
 * order's (spec/shift-patterns.md); the memo is the day's whether it has a
 * shift or not.
 */
interface OwnCalendar {
  /** The patterns in the person's order. */
  val patterns: List<Pattern>

  /** 一緒に働く人, in the person's order. */
  val coworkers: List<Coworker>

  /** Every day from `from` through `through` that shows a shift. */
  fun shown(from: LocalDate, through: LocalDate): Map<LocalDate, DayEntry>

  /** The day's memo, or none. */
  fun note(day: LocalDate): String?

  /** The pattern entering `shift` puts on the following day too, as 明け after 夜勤; none when it names one that is gone. */
  fun nextDay(shift: String): String?
}

/** Where the calendar comes from and where its edits go ([SyncedDays]). */
interface OwnDays {
  val calendar: StateFlow<OwnCalendar>

  /** Returns once [calendar] holds what the device keeps, not the nothing it starts from. */
  suspend fun awaitRead()

  /** Puts `entry` on `day`; none clears its shift with its hours and people, keeping the memo. */
  fun set(day: LocalDate, entry: DayEntry?)

  /**
   * Enters `shift` on `day` as ポチポチ入力's keys do, a pattern's next day on the day after too;
   * none clears the day's shift, keeping its memo.
   */
  fun enter(day: LocalDate, shift: String?)

  /** Puts `shift` on each of `days`, the blank days 完了 asks about. */
  fun fill(days: List<LocalDate>, shift: String)

  /**
   * The days from `from` through `through` that show a shift once every edit made before this is
   * written, which [calendar] may not show yet: what 完了 asks about must count the last key.
   */
  suspend fun shownOnceWritten(from: LocalDate, through: LocalDate): Set<LocalDate>

  /** Keeps `note` as the day's memo; "" clears it, leaving the shift. */
  fun setNote(day: LocalDate, note: String)

  /** Adds `name` at the end of 一緒に働く人. */
  fun addCoworker(name: String): Coworker
}

/** The person's days for the screens under the app's root. */
val LocalOwnDays = staticCompositionLocalOf<OwnDays> { error("No days above this screen") }
