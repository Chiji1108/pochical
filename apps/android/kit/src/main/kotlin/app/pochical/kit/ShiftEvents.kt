package app.pochical.kit

import java.time.LocalDate

// 端末カレンダーに追加 (spec/calendar.md, Adding a month to the device calendar), as iOS's
// ShiftEvents.swift: which days go in as events, and which patterns are picked to.
// spec/vectors/device-calendar.json pins both.

/**
 * A day's shift as an event in the device's calendar: its name, at its time on that day, or all day
 * when it has none, the day's memo and people in its notes when asked for.
 */
data class ShiftEvent(
  val day: LocalDate,
  val title: String,
  /** Minutes from the day's midnight; none is all day. */
  val start: Int?,
  /** Minutes from the day's midnight, past 24 hours for a shift that ends the next day. */
  val end: Int?,
  /** The day's memo and who works it, when asked for; none without either. */
  val notes: String? = null,
)

/**
 * The page's days with a shift of [shown] as events, each at the day's own time, else its
 * pattern's. [notes] and [people], given only when asked for, are each day's memo and the names of
 * those on it: they go in a shift's event's notes, and a day with a memo and no shift's event gets
 * one of its own, all day, named by the memo.
 */
fun shiftEvents(
  page: Period,
  days: Map<LocalDate, ShownDay>,
  patterns: Map<String, PatternRow>,
  shown: Set<String>,
  notes: Map<LocalDate, String> = emptyMap(),
  people: Map<LocalDate, List<String>> = emptyMap(),
): List<ShiftEvent> =
  page.days.mapNotNull { day ->
    shiftEvent(day, days[day], patterns, shown, notes[day], people[day].orEmpty()) ?: notes[day]?.let { memoEvent(it, day) }
  }

/**
 * The patterns put in until the person picks otherwise: those with a time, and of those without,
 * not the days off and not a pattern that follows another as its next day, like 明け after 夜勤,
 * whose night shows on that day already.
 */
fun shownAtFirst(patterns: List<PatternRow>): Set<String> {
  val following = patterns.mapNotNullTo(HashSet()) { it.nextDay }
  return patterns.filter { it.time != null || !(it.countsAsOff || it.id in following) }.mapTo(HashSet()) { it.id }
}

/** The patterns that go in: each as the person picked it, else as [shownAtFirst] has it. */
fun CalendarAdd.shown(patterns: List<PatternRow>): Set<String> {
  val atFirst = shownAtFirst(patterns)
  return patterns.filter { chosen[it.id] ?: (it.id in atFirst) }.mapTo(HashSet()) { it.id }
}

/**
 * [id] picked in or out, keeping only what differs from the first pick, and only for patterns still
 * there.
 */
fun CalendarAdd.picking(id: String, on: Boolean, patterns: List<PatternRow>): CalendarAdd {
  val ids = patterns.mapTo(HashSet()) { it.id }
  val kept = chosen.filterKeys { it in ids && it != id }
  return copy(chosen = if (on != (id in shownAtFirst(patterns))) kept + (id to on) else kept)
}

private fun shiftEvent(
  day: LocalDate,
  entry: ShownDay?,
  patterns: Map<String, PatternRow>,
  shown: Set<String>,
  memo: String?,
  people: List<String>,
): ShiftEvent? {
  val pattern = entry?.let { patterns[it.shift] }?.takeIf { it.id in shown } ?: return null
  val said = notesOf(memo, people)
  val start = (entry.start ?: pattern.start)?.let(::minutesOrNull)
  val end = (entry.end ?: pattern.end)?.let(::minutesOrNull)
  if (start == null || end == null) return ShiftEvent(day, pattern.name, null, null, said)
  // A shift ending at or before its start ends the next day.
  return ShiftEvent(day, pattern.name, start, if (end > start) end else end + MINUTES_A_DAY, said)
}

/** A memo on a day with no shift's event: all day, named by its first line, the whole memo in its notes when it runs longer. */
private fun memoEvent(memo: String, day: LocalDate): ShiftEvent? {
  val lines = memo.split("\n").filter { it.isNotEmpty() }
  val first = lines.firstOrNull() ?: return null
  return ShiftEvent(day, first, null, null, memo.takeIf { lines.size > 1 })
}

/** The memo, then 一緒に働く人：A、B on a line of its own. */
private fun notesOf(memo: String?, people: List<String>): String? =
  listOfNotNull(memo?.takeIf { it.isNotEmpty() }, people.takeIf { it.isNotEmpty() }?.let { "一緒に働く人：${it.joinToString("、")}" })
    .takeIf { it.isNotEmpty() }
    ?.joinToString("\n")

private const val MINUTES_A_DAY = 24 * 60
