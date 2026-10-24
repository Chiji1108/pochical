package app.pochical.kit

import app.pochical.design.MarkIconNames
import java.text.Normalizer

// What a pattern's mark and a group's share (spec/shift-patterns.md, spec/vectors/patterns.json and
// groups.json): the next color, the hint a name suggests, and the icon picker's search.

/**
 * A new mark's color slot, a pattern's or a group's (spec/vectors/patterns.json, nextColor): the
 * first of the palette's [slots] that [used] does not hold, else how many are used, modulo the slots.
 */
fun nextColor(used: List<Int>, slots: Int): Int = (0 until slots).firstOrNull { it !in used } ?: (used.size % slots)

/**
 * The first hint with one of its [words] anywhere in [name], as a new pattern's look
 * (patterns.json, guessLook) and a new group's mark (groups.json, guessMark) are guessed.
 */
fun <H> List<H>.hintedBy(name: String, words: (H) -> List<String>): H? = firstOrNull { hint -> words(hint).any { it in name } }

/**
 * The icon picker's search (/design's IconPickerSheet): the kinds with only the icons whose name or
 * words hold every word typed, width, case and katakana folded, so ケア, けあ and ｹｱ find the same;
 * every kind whole for nothing typed.
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

private fun folded(text: String): String =
  Normalizer.normalize(text, Normalizer.Form.NFKC).lowercase().map { if (it in 'ァ'..'ヶ') it - KANA_GAP else it }.joinToString("")

/** How far each katakana is from its hiragana. */
private const val KANA_GAP = 'ァ' - 'ぁ'
