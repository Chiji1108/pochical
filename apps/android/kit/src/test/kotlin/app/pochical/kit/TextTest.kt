package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// How text is counted and cut (spec/text-limits.md), the marks' rules of text.json and a day's shift name.
@Serializable
private data class TextVectors(
  val characterCount: List<CharacterCount>,
  val limitText: List<LimitText>,
  val isEmoji: List<IsEmoji>,
  val fitsText: List<FitsText>,
  val markLetter: List<MarkLetter>,
  val dayName: List<DayName>,
) {
  @Serializable data class CharacterCount(override val name: String, val text: String, val expected: Int) : VectorCase

  /** Named by its [text]. */
  @Serializable
  data class LimitText(val text: String, val limit: Int, val expected: String) : VectorCase {
    override val name
      get() = text
  }

  @Serializable data class IsEmoji(override val name: String, val text: String, val expected: Boolean) : VectorCase

  @Serializable data class FitsText(override val name: String, val text: String, val limit: Int, val expected: Boolean) : VectorCase

  @Serializable
  data class MarkLetter(override val name: String, val before: String, val after: String, val limit: Int, val expected: String) : VectorCase

  /** [name] is the shift's name, and names the case too. */
  @Serializable data class DayName(override val name: String, val length: Int, val expected: String) : VectorCase
}

// Robolectric, for the Unicode properties Android's ICU has.
@RunWith(RobolectricTestRunner::class)
class TextTest {
  private val vectors = vectors<TextVectors>("text")

  @Test fun characterCount() = vectors.characterCount.checkEach({ it.expected }) { characterCount(it.text) }

  @Test fun limitText() = vectors.limitText.checkEach({ it.expected }) { limitText(it.text, it.limit) }

  @Test fun isEmoji() = vectors.isEmoji.checkEach({ it.expected }) { isEmoji(it.text) }

  @Test fun fitsText() = vectors.fitsText.checkEach({ it.expected }) { fitsText(it.text, it.limit) }

  @Test fun markLetter() = vectors.markLetter.checkEach({ it.expected }) { markLetter(it.before, it.after, it.limit) }

  @Test fun dayName() = vectors.dayName.checkEach({ it.expected }) { dayName(it.name, it.length) }
}
