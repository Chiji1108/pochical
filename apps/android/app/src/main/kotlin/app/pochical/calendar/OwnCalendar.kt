package app.pochical.calendar

import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.PageSummary
import app.pochical.kit.PatternRefusal
import app.pochical.kit.Reminder
import app.pochical.kit.ReminderFiring
import app.pochical.kit.RepeatOrder
import app.pochical.kit.ShiftTime
import java.time.LocalDate
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.Serializable

/** A pattern as the calendar draws it and offers it for a day. */
@Serializable
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

  /** What 今月のお休み and 今月の内訳 count on the page from `first` through `last`. */
  fun summary(first: LocalDate, last: LocalDate): PageSummary

  /** The day's memo, or none. */
  fun note(day: LocalDate): String?

  /** The pattern entering `shift` puts on the following day too, as 明け after 夜勤; none when it names one that is gone. */
  fun nextDay(shift: String): String?

  /** The repeating orders, in their timeline's order: what refuses archiving or deleting a pattern. */
  val orders: List<RepeatOrder>

  /** Whether the person set the day's shift themselves, which stays over any order. */
  fun hasOwnShift(day: LocalDate): Boolean

  /** What `reminder` sends for the shifts from `from` through `through`, in order (spec/calendar.md, Reminders). */
  fun firings(reminder: Reminder, from: LocalDate, through: LocalDate): List<ReminderFiring>
}

/** Where the calendar comes from and where its edits go ([SyncedDays]). */
interface OwnDays {
  val calendar: StateFlow<OwnCalendar>

  /** Returns once [calendar] holds what the device keeps, not the nothing it starts from. */
  suspend fun awaitRead()

  /**
   * How many times the person put something on their days (a shift, its hours or people, a memo)
   * since the app started: the calendar asks for a review once they are done (spec/review.md).
   */
  val dayEdits: StateFlow<Int>

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

  /**
   * Keeps `pattern` as it is now, a new one at the end of the order (設定 › シフトパターン); a
   * refusal says why it was not kept (spec/shift-patterns.md, Patterns no longer used).
   */
  suspend fun savePattern(pattern: Pattern): PatternRefusal?

  /** Deletes a pattern, the days that show it keeping its id; a refusal says why it was not. */
  suspend fun deletePattern(id: String): PatternRefusal?

  /** Puts the patterns in this order, ポチポチ入力's keys with them. */
  fun orderPatterns(ids: List<String>)

  /** How many days show the pattern, of their own or from an order, once every edit before is written. */
  suspend fun daysShowing(id: String): Int

  /**
   * 繰り返し's periods: `order` put in on its start among the others, or set again; the days the
   * person entered stay over it.
   */
  suspend fun putOrder(order: RepeatOrder)

  /** Moves the period starting on `from` to start on `to`; false when that runs over a period around it. */
  suspend fun moveOrder(from: LocalDate, to: LocalDate): Boolean

  /** Takes out the period starting on `start`, the one before running on. */
  suspend fun removeOrder(start: LocalDate)

  /** Turns 祝日は休みにする on or off for the period starting on `start`, holidays taking `picked`. */
  suspend fun setHolidaysOff(on: Boolean, picked: String?, start: LocalDate)

  /**
   * 新しい仕事にする: the ready-made patterns `ids` take over from `start`, and `sequence` repeats
   * from there counted from `anchor`; an empty one ends repeating.
   */
  suspend fun changeJob(ids: List<String>, sequence: List<String>, start: LocalDate, anchor: LocalDate)

  /**
   * はじめの設定: the ready-made patterns `ids` become the person's, and `sequence`, when there is
   * one, repeats counted from `anchor`, the days just past showing it too.
   */
  suspend fun begin(ids: List<String>, sequence: List<String>, anchor: LocalDate)

  /** Keeps `note` as the day's memo; "" clears it, leaving the shift. */
  fun setNote(day: LocalDate, note: String)

  /** Adds `name` at the end of 一緒に働く人. */
  fun addCoworker(name: String): Coworker

  /** Gives someone of 一緒に働く人 a new name, on every day they are on too. */
  fun renameCoworker(id: String, name: String)

  /** Takes someone off 一緒に働く人, and so off the days that note them. */
  fun deleteCoworker(id: String)

  /** Puts 一緒に働く人 in this order, as a day's details list them. */
  fun orderCoworkers(ids: List<String>)
}

/** The person's days for the screens under the app's root. */
val LocalOwnDays = staticCompositionLocalOf<OwnDays> { error("No days above this screen") }
