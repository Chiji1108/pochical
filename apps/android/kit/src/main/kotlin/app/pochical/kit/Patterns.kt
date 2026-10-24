package app.pochical.kit

import app.pochical.design.MarkIconNames
import app.pochical.design.ReadyPattern
import app.pochical.design.ReadyPatterns
import app.pochical.design.SyncLimits
import app.pochical.design.TextLimits
import app.pochical.design.Theme
import java.text.Normalizer
import java.time.LocalDate


// The person's patterns as 設定 › シフトパターン makes and changes them (spec/shift-patterns.md),
// as iOS's Pattern.swift and PatternEdits.swift: a new pattern's mark and color, ready-made copies,
// and what the repeating orders refuse.

/** An edit of a pattern the rules refuse, for the page to say why. */
enum class PatternRefusal {
  /** A repeating order in use or to come puts it on days: neither archived nor deleted until it changes. */
  Repeating,

  /** It holds what the server would refuse (`fitsPattern`), so it would not stay. */
  Unfit,
}

/** A mark in each look: the emoji, the icon's name, and the letter on a tile. */
data class MarkLook(val emoji: String, val icon: String, val symbol: String)

/**
 * A new pattern's mark from its name (spec/vectors/patterns.json, guessLook): the first hint with a
 * word anywhere in the name gives its emoji and icon, else a star and the letter icon; the letter is
 * the name's first character as a reader sees it, trimmed.
 */
fun guessLook(name: String): MarkLook {
  val hint = ReadyPatterns.lookHints.firstOrNull { hint -> hint.words.any { it in name } }
  return MarkLook(
    hint?.emoji ?: ReadyPatterns.FALLBACK_EMOJI,
    hint?.icon ?: ReadyPatterns.FALLBACK_ICON,
    firstCharacter(name.trim()),
  )
}

/** The mark palette's slots, the same in every テーマ. */
val MARK_SLOTS: Int = Theme.Pochical.colors(dark = false).marks.size

private val TIME = Regex("^(?:[01]\\d|2[0-3]):[0-5]\\d$")

/** Whether the text can be an id or an icon's name: 1 to `SyncLimits.idLength`, no spaces. */
fun isId(text: String): Boolean = text.isNotEmpty() && text.length <= SyncLimits.idLength && text.none(Char::isWhitespace)

/**
 * Whether [pattern] holds only what the server takes for one under its id, so it stays once sent
 * (spec/vectors/patterns.json, fits): a name, an emoji, a letter and an icon in each look, a color of
 * the palette, both times or neither as HH:MM, and a next day that is another pattern.
 */
fun fitsPattern(pattern: PatternRow): Boolean {
  val timed = pattern.start != null || pattern.end != null
  return fitsText(pattern.name, TextLimits.shiftName) &&
    isEmoji(pattern.emoji) &&
    fitsText(pattern.symbol, TextLimits.shiftMark) &&
    isId(pattern.icon) &&
    pattern.color in 0 until MARK_SLOTS &&
    (!timed || (pattern.start != null && pattern.end != null)) &&
    (pattern.start == null || TIME.matches(pattern.start)) &&
    (pattern.end == null || TIME.matches(pattern.end)) &&
    (pattern.nextDay == null || (isId(pattern.nextDay) && pattern.nextDay != pattern.id))
}

/**
 * A new pattern's color slot (spec/vectors/patterns.json, nextColor): the first of the palette's
 * [slots] no pattern uses, else the count of patterns modulo the slots.
 */
fun nextColor(used: List<Int>, slots: Int): Int = (0 until slots).firstOrNull { it !in used } ?: (used.size % slots)

/** A ready-made pattern as the person's copy: its next day kept only when that pattern is among [keeping]. */
fun ReadyPattern.personsCopy(keeping: Set<String>): PatternRow =
  PatternRow(
    id = id,
    name = name,
    emoji = emoji,
    symbol = symbol,
    icon = icon,
    color = color,
    start = time?.first,
    end = time?.second,
    countsAsOff = countsAsOff,
    nextDay = nextDay?.takeIf { it in keeping },
    archived = false,
  )

/**
 * The ready-made patterns [ids] as the person's copies, in that order, each keeping its next day
 * only when that pattern is among [keeping] (spec/vectors/patterns.json, readyCopies).
 */
fun readyCopies(ids: List<String>, keeping: Set<String> = ids.toSet()): List<PatternRow> =
  ids.mapNotNull { id -> ReadyPatterns.all.find { it.id == id }?.personsCopy(keeping) }

/** The patterns and order a new job brings, once its patterns take over the person's. */
data class NewJob(val patterns: List<PatternRow>, val sequence: List<String>)

/**
 * The patterns after changing jobs (spec/shift-patterns.md, Changing jobs; spec/vectors/patterns.json,
 * newJob): [incoming] take over [own], and an old one still on a day before the switch ([usedBefore])
 * stays after them, archived. A ready-made one the person changed, still on those days, keeps its
 * id; the new job's then comes in under a fresh one ([newId]), which [sequence] and next days use.
 */
fun patternsForJob(
  own: List<PatternRow>,
  incoming: List<PatternRow>,
  sequence: List<String>,
  usedBefore: (String) -> Boolean,
  newId: () -> String,
): NewJob {
  val renamed =
    incoming
      .filter { pattern -> own.find { it.id == pattern.id }?.let { theirs -> usedBefore(theirs.id) && !theirs.isSame(pattern) } == true }
      .associate { it.id to newId() }
  val renameOf = { id: String -> renamed[id] ?: id }
  val coming = incoming.map { it.copy(id = renameOf(it.id), nextDay = it.nextDay?.let(renameOf)) }
  // Kept for its days, but archived: the old job's keys go.
  val kept = own.filter { pattern -> coming.none { it.id == pattern.id } && usedBefore(pattern.id) }.map { it.copy(archived = true) }
  return NewJob(coming + kept, sequence.map(renameOf))
}

/** Whether two patterns would show and count a day the same way, in use or not. */
private fun PatternRow.isSame(other: PatternRow): Boolean = this == other.copy(id = id, archived = archived)

/**
 * Whether one of [orders], in their timeline's order, in use or to come on [today] puts the pattern
 * on days, in its sequence or on holidays: it cannot be deleted until that order changes. One only
 * in periods over can (spec/vectors/patterns.json, refused).
 */
fun repeats(id: String, orders: List<RepeatOrder>, today: LocalDate = LocalDate.now()): Boolean =
  orders.indices.any { index ->
    val order = orders[index]
    val over = index + 1 < orders.size && orders[index + 1].start <= today
    !over && (id in order.sequence || (order.holidaysOff && order.holidayShift == id))
  }

/**
 * Whether archiving the pattern, saved as [archived], is refused: one in use stays so while one of
 * [orders] repeats it. Bringing one back into use never is.
 */
fun refusesArchiving(id: String, archived: Boolean, orders: List<RepeatOrder>, today: LocalDate = LocalDate.now()): Boolean =
  !archived && repeats(id, orders, today)

/**
 * The icon picker's search: the kinds with only the icons whose name or words hold every word
 * typed, width, case and katakana folded, so ケア, けあ and ｹｱ find the same.
 */
fun markIconSections(query: String): List<MarkIconNames.Section> {
  val words = folded(query).split(Regex("\\s+")).filter { it.isNotEmpty() }
  if (words.isEmpty()) return MarkIconNames.sections
  return MarkIconNames.sections.mapNotNull { section ->
    val icons =
      section.icons.filter { icon ->
        val text = folded("${MarkIconNames.names[icon].orEmpty()} ${MarkIconNames.words[icon].orEmpty()}")
        words.all { it in text }
      }
    if (icons.isEmpty()) null else MarkIconNames.Section(section.title, icons)
  }
}

/**
 * How many days show the pattern, of their own or from an order, as deleting it asks: from the
 * first day either reaches through the last own day or the latest order's start, past which only
 * own days could show one the order in use does not repeat.
 */
suspend fun AppDatabase.daysShowing(id: String): Int = write {
  // In one transaction, so a change sync takes meanwhile counts whole or not at all.
  val days = days("0000-01-01", "9999-12-31")
  val orders = repeatOrders()
  val edges = days.map { LocalDate.parse(it.date) } + orders.map { LocalDate.parse(it.start) }
  val first = edges.minOrNull() ?: return@write 0
  OwnCalendar.of(days, patterns(), orders).shown(first, edges.max()).values.count { it.shift == id }
}

private const val KATAKANA_TO_HIRAGANA = 0x60

private fun folded(text: String): String =
  Normalizer.normalize(text, Normalizer.Form.NFKC).lowercase().map { char ->
    if (char in 'ァ'..'ヶ') char - KATAKANA_TO_HIRAGANA else char
  }.joinToString("")
