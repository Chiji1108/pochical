package app.pochical

import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import app.pochical.kit.characterEnds

/** How many characters `text` holds as a reader sees them, grapheme clusters (spec/text-limits.md). */
fun characterCount(text: String): Int = characterEnds(text).count()

/** The first `limit` characters of `text`, as a reader counts them (spec/vectors/text.json). */
fun limitText(text: String, limit: Int): String =
  characterEnds(text).elementAtOrNull(limit - 1)?.let { text.substring(0, it) } ?: text

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
