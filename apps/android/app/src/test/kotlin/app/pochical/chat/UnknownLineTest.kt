package app.pochical.chat

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import app.pochical.kit.LineContent
import app.pochical.name
import app.pochical.string
import app.pochical.v1.ChatContent
import app.pochical.vectors
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
  fun itSaysToUpdateInItsBubbleAndWhereverItIsNamed() {
    val cases = vectors("chat", "content").filter { it.getValue("expected").jsonObject.string("kind") == "unknown" }
    assertTrue(cases.isNotEmpty())
    val named = mutableListOf<String>()
    val contents =
      cases.map { case ->
        val bytes = case.string("bytes")!!.chunked(2).map { it.toInt(16).toByte() }.toByteArray()
        LineContent.of(ChatContent.parseFrom(bytes)).also { assertEquals(case.name(), LineContent.Unknown, it) }
      }
    compose.setContent {
      contents.forEach { named += lineWords(it) { id -> id } }
      Message(MessageLook("line-1", false, contents.first(), true, null, true, "9:41", null, 1, ReplySwipe.Rightward, "あや", emptyList()), testHandlers())
    }
    val words = cases.map { it.getValue("expected").jsonObject.string("words")!! }
    assertEquals(words, named.take(words.size))
    compose.onNodeWithText(words.first(), useUnmergedTree = true).assertExists()
  }
}
