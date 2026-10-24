package app.pochical.patterns

import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class EmojiTest {
  @Test
  fun keyboardEmojiAreTakenAndTextSymbolsAreNot() {
    val taken = listOf("🌙", "👨‍👩‍👧", "1️⃣", "☀️", "★", "©", "あ", "A").filter(::isEmoji)
    assertEquals(listOf("🌙", "👨‍👩‍👧", "1️⃣", "☀️"), taken)
  }
}
