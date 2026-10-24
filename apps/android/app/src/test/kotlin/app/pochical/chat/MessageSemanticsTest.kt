package app.pochical.chat

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import app.pochical.kit.LineContent
import app.pochical.kit.LineReaction
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A line is one element to a screen reader, whatever it does by a gesture being among its actions (spec/chat.md, Screen readers). */
@RunWith(RobolectricTestRunner::class)
class MessageSemanticsTest {
  @get:Rule val compose = createComposeRule()

  @Test
  fun whoChoseAReactionIsAnActionOfItsLine() {
    var listed: LineReaction? = null
    val thumbs = LineReaction("👍", listOf("u2", "u3"))
    val look =
      MessageLook(
        key = "line-1",
        mine = false,
        content = LineContent.Words("明日休み？"),
        startsRun = true,
        writer = null,
        showsName = true,
        time = "9:41",
        waiting = null,
        quote = null,
        seq = 1,
        swipe = ReplySwipe.Rightward,
        said = "あや、明日休み？、9:41、👍2",
        reactions = listOf(thumbs),
      )
    val handlers =
      MessageHandlers(
        menu = LineMenuState(),
        items = { emptyList() },
        reply = {},
        jump = {},
        nameOf = { it },
        notKept = {},
        reducedMotion = true,
        lit = null,
        me = "me",
        writers = emptyMap(),
        react = { _, _, _ -> },
        moreReactions = {},
        choosers = { listed = it },
        spray = null,
        openLink = {},
      )
    compose.setContent { Message(look, handlers) }
    val line = compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf(look.said)))
    val actions = line.fetchSemanticsNode().config[SemanticsActions.CustomActions]
    actions.first { it.label == "👍をリアクションした人" }.action()
    assertEquals(thumbs, listed)
  }
}
