package app.pochical

import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Test

class TextLimitsTest {
  @Test
  fun countsCharactersAsAReaderSeesThem() {
    for (case in vectors("text", "characterCount")) {
      assertEquals(case.name(), case.getValue("expected").jsonPrimitive.int, characterCount(case.string("text")!!))
    }
  }

  @Test
  fun keepsTheFirstCharactersUpToTheLimit() {
    for (case in vectors("text", "limitText")) {
      val text = case.string("text")!!
      assertEquals(text, case.string("expected"), limitText(text, case.getValue("limit").jsonPrimitive.int))
    }
  }
}
