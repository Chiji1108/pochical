package app.pochical.kit

import app.pochical.design.MarkIconNames
import java.text.Normalizer

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
