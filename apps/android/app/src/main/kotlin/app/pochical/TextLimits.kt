package app.pochical

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
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

/**
 * The field's text cut to `limit` characters once it is committed: while the
 * IME is still composing (kana before conversion), it is left whole, or the
 * composition would be cut off under the person's fingers.
 */
fun TextFieldValue.limited(limit: Int): TextFieldValue {
  if (composition != null) return this
  val text = limitText(text, limit)
  return if (text == this.text) this else TextFieldValue(text, TextRange(text.length))
}
