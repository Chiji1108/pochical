package app.pochical

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import app.pochical.design.TextFields
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

/**
 * A one-line field held to `limit` characters, with its count `{used}/{limit}` after it while it is
 * in use: all the while for a short limit, else once few are left; in the danger color only while a
 * composition runs past the limit (spec/text-limits.md).
 */
@Composable
fun LimitedTextField(
  value: TextFieldValue,
  onValueChange: (TextFieldValue) -> Unit,
  limit: Int,
  label: String,
  modifier: Modifier = Modifier,
  placeholder: String? = null,
) {
  var focused by remember { mutableStateOf(false) }
  val used = characterCount(value.text)
  val shown = focused && (limit <= TextFields.countAlwaysUpTo || limit - used <= TextFields.countWhenLeft)
  OutlinedTextField(
    value,
    { onValueChange(it.limited(limit)) },
    modifier.onFocusChanged { focused = it.isFocused },
    label = { Text(label) },
    placeholder = placeholder?.let { { Text(it) } },
    // A short limit keeps the count's line, so the field does not move as it is entered.
    supportingText =
      if (shown || limit <= TextFields.countAlwaysUpTo) {
        {
          Text(
            if (shown) "$used/$limit" else "",
            color = if (used > limit) MaterialTheme.colorScheme.error else MaterialTheme.colorScheme.onSurfaceVariant,
          )
        }
      } else {
        null
      },
    singleLine = true,
  )
}
