package app.pochical.kit

import kotlinx.serialization.Serializable
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The marks' rules of text.json; characterCount and limitText are the app's TextLimitsTest's.
@Serializable
private data class TextVectors(val isEmoji: List<IsEmoji>, val fitsText: List<FitsText>, val markLetter: List<MarkLetter>) {
  @Serializable data class IsEmoji(override val name: String, val text: String, val expected: Boolean) : VectorCase

  @Serializable data class FitsText(override val name: String, val text: String, val limit: Int, val expected: Boolean) : VectorCase

  @Serializable
  data class MarkLetter(override val name: String, val before: String, val after: String, val limit: Int, val expected: String) : VectorCase
}

// Robolectric, for the Unicode properties Android's ICU has.
@RunWith(RobolectricTestRunner::class)
class TextTest {
  private val vectors = vectors<TextVectors>("text")

  @Test fun isEmoji() = vectors.isEmoji.checkEach({ it.expected }) { isEmoji(it.text) }

  @Test fun fitsText() = vectors.fitsText.checkEach({ it.expected }) { fitsText(it.text, it.limit) }

  @Test fun markLetter() = vectors.markLetter.checkEach({ it.expected }) { markLetter(it.before, it.after, it.limit) }
}
