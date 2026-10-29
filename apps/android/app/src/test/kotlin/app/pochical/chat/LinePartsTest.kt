package app.pochical.chat

import org.junit.Assert.assertEquals
import org.junit.Test

/** What a line's parts offer a screen reader. */
class LinePartsTest {
  @Test
  fun eachLinkToOneSiteIsToldApart() {
    assertEquals(
      listOf("example.com/a", "example.com/b", "apple.com", "example.com/a", "example.com?q=2"),
      linkNames(listOf("https://example.com/a", "https://example.com/b", "https://www.apple.com/", "https://example.com/a", "https://www.example.com?q=2")),
    )
  }
}
