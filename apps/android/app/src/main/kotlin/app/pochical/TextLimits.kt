package app.pochical

import java.text.BreakIterator

/** How many characters `text` holds as a reader sees them, grapheme clusters (spec/text-limits.md). */
fun characterCount(text: String): Int = graphemeEnds(text).count()

/** The first `limit` characters of `text`, as a reader counts them (spec/vectors/text.json). */
fun limitText(text: String, limit: Int): String =
  graphemeEnds(text).elementAtOrNull(limit - 1)?.let { text.substring(0, it) } ?: text

private fun graphemeEnds(text: String): Sequence<Int> {
  val characters = BreakIterator.getCharacterInstance().apply { setText(text) }
  return generateSequence { characters.next().takeIf { it != BreakIterator.DONE } }
}
