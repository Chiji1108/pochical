package app.pochical.kit

import android.icu.lang.UCharacter
import android.icu.lang.UProperty
import java.text.BreakIterator

// Text counted as spec/text-limits.md has it, in characters as a reader sees them, and the limits
// the server holds it to (spec/vectors/text.json), as iOS's ChatText.swift and design/src/text.ts.

/** Where each character of [text] ends, as a reader counts them: grapheme clusters. */
fun characterEnds(text: String): Sequence<Int> {
  val characters = BreakIterator.getCharacterInstance().apply { setText(text) }
  return generateSequence { characters.next().takeIf { it != BreakIterator.DONE } }
}

/** The first character as a reader sees it, an emoji with its joiners whole. */
fun firstCharacter(text: String): String = characterEnds(text).firstOrNull()?.let { text.substring(0, it) }.orEmpty()

/**
 * The most UTF-16 code units one character may take on average (design/src/text.ts), so text
 * counted within its limit is bounded in size too.
 */
private const val UNITS_PER_CHARACTER_MOST = 32

/** Whether [text] has at most [limit] characters and is no larger than that many can be. */
fun withinLimit(text: String, limit: Int): Boolean = text.length <= limit * UNITS_PER_CHARACTER_MOST && characterEnds(text).count() <= limit

/** What the server takes for a field limited to [limit] characters: 1 to [limit], not only spaces (spec/vectors/text.json, fitsText). */
fun fitsText(text: String, limit: Int): Boolean = text.isNotBlank() && withinLimit(text, limit)

private const val KEYCAP = '⃣'
private val REGIONAL_INDICATORS = 0x1F1E6..0x1F1FF

/**
 * Whether [text] is exactly one emoji, as the pickers and the system keyboards give one: one
 * character that starts as a pictograph or a flag, or a keycap (1️⃣, #️⃣), which starts with its
 * plain digit or sign (spec/vectors/text.json, isEmoji).
 */
fun isEmoji(text: String): Boolean {
  if (text.isEmpty() || !withinLimit(text, 1) || characterEnds(text).count() != 1) return false
  val first = text.codePointAt(0)
  // A keycap starts with its plain digit or sign, which alone is no emoji.
  if (first.toChar() in "#*0123456789") return KEYCAP in text
  return UCharacter.hasBinaryProperty(first, UProperty.EXTENDED_PICTOGRAPHIC) || first in REGIONAL_INDICATORS
}

/**
 * A mark's letter after an edit from [before] to [after]: within [limit], the text as it is; past
 * it, what the edit put in, cut to [limit], so typing into a full letter replaces it. What was put in
 * is the text less what it shares with the letter before at its start and its end
 * (spec/vectors/text.json, markLetter).
 */
fun markLetter(before: String, after: String, limit: Int): String {
  val was = characters(before)
  val now = characters(after)
  if (now.size <= limit) return after
  val shared = minOf(was.size, now.size)
  var start = 0
  while (start < shared && was[start] == now[start]) start++
  var end = 0
  while (end < shared - start && was[was.size - 1 - end] == now[now.size - 1 - end]) end++
  val typed = now.subList(start, now.size - end)
  return (typed.ifEmpty { now }).take(limit).joinToString("")
}

private fun characters(text: String): List<String> {
  var start = 0
  return characterEnds(text).map { end -> text.substring(start, end).also { start = end } }.toList()
}
