package app.pochical.kit

import app.pochical.design.MarkIconNames
import app.pochical.design.ReadyPattern
import app.pochical.design.ReadyPatterns
import java.text.Normalizer
import java.time.LocalDate
import kotlinx.coroutines.flow.first

// The person's patterns as 設定 › シフトパターン makes and changes them (spec/shift-patterns.md),
// as iOS's Pattern.swift and PatternEdits.swift: a new pattern's mark and color, ready-made copies,
// and what the repeating orders refuse.

/** An edit of a pattern the rules refuse, for the page to say why. */
enum class PatternRefusal {
  /** A repeating order in use or to come puts it on days: neither archived nor deleted until it changes. */
  Repeating,
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

/** The first character as a reader sees it, an emoji with its joiners whole. */
fun firstCharacter(text: String): String {
  val breaks = java.text.BreakIterator.getCharacterInstance()
  breaks.setText(text)
  val end = breaks.next()
  return if (end == java.text.BreakIterator.DONE) "" else text.substring(0, end)
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
suspend fun Values.daysShowing(id: String): Int {
  val days = days().first()
  val orders = repeatOrders().first()
  val edges = days.map { LocalDate.parse(it.date) } + orders.map { LocalDate.parse(it.start) }
  val first = edges.minOrNull() ?: return 0
  return OwnCalendar.of(days, patterns().first(), orders).shown(first, edges.max()).values.count { it.shift == id }
}

private const val KATAKANA_TO_HIRAGANA = 0x60

private fun folded(text: String): String =
  Normalizer.normalize(text, Normalizer.Form.NFKC).lowercase().map { char ->
    if (char in 'ァ'..'ヶ') char - KATAKANA_TO_HIRAGANA else char
  }.joinToString("")
