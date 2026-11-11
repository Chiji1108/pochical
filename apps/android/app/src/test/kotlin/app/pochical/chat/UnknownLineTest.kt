package app.pochical.chat

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import app.pochical.kit.LineContent
import app.pochical.name
import app.pochical.string
import app.pochical.v1.ChatContent
import app.pochical.vectors
import java.util.HexFormat
import kotlinx.serialization.json.jsonObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A line of a kind the app does not know, from the wire's bytes to the screen: someone's message
 * saying in its place that the app must be updated to see it (spec/chat.md, What a line is;
 * spec/vectors/chat.json, content).
 */
@RunWith(RobolectricTestRunner::class)
class UnknownLineTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun itSaysToUpdateInItsPlace() {
    val cases = vectors("chat", "content").filter { it.getValue("expected").jsonObject.string("kind") == "unknown" }
    assertTrue(cases.isNotEmpty())
    for (case in cases) {
      val content = LineContent.of(ChatContent.parseFrom(HexFormat.of().parseHex(case.string("bytes")!!)))
      assertEquals(case.name(), LineContent.Unknown, content)
    }
    compose.setContent {
      Message(MessageLook("line-1", false, LineContent.Unknown, true, null, true, "9:41", null, 1, ReplySwipe.Rightward, "あや", emptyList()), testHandlers())
    }
    for (case in cases) {
      compose.onNodeWithText(case.getValue("expected").jsonObject.string("words")!!, useUnmergedTree = true).assertExists()
    }
  }
}
