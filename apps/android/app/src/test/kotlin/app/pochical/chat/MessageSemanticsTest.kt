package app.pochical.chat

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import app.pochical.kit.LineContent
import app.pochical.kit.LineReaction
import app.pochical.v1.linkPreview
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A line is one element to a screen reader, whatever it does by a gesture being among its actions (spec/chat.md, Screen readers). */
@RunWith(RobolectricTestRunner::class)
class MessageSemanticsTest {
  @get:Rule val compose = createComposeRule()

  private fun handlers(choosers: (LineReaction) -> Unit = {}, jump: (Long) -> Unit = {}, openLink: (String) -> Unit = {}) =
    MessageHandlers(
      menu = LineMenuState(),
      items = { emptyList() },
      reply = {},
      jump = jump,
      nameOf = { it },
      notKept = {},
      reducedMotion = true,
      lit = null,
      me = "me",
      writers = emptyMap(),
      react = { _, _, _ -> },
      moreReactions = {},
      choosers = choosers,
      spray = null,
      openLink = openLink,
    )

  private fun look(content: LineContent, parts: List<LinePart>, said: String) =
    MessageLook("line-1", false, content, true, null, true, "9:41", null, 1, ReplySwipe.Rightward, said, parts)

  /** The line's actions, by their labels, as TalkBack offers them. */
  private fun actionsOf(said: String) =
    compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf(said))).fetchSemanticsNode().config[SemanticsActions.CustomActions]

  @Test
  fun whoChoseAReactionIsAnActionOfItsLine() {
    var listed: LineReaction? = null
    val thumbs = LineReaction("👍", listOf("u2", "u3"))
    val line = look(LineContent.Words("明日休み？"), listOf(ReactionsPart(listOf(thumbs), counted = false)), "あや、明日休み？")
    compose.setContent { Message(line, handlers(choosers = { listed = it })) }
    val actions = actionsOf(line.said)
    assertEquals(listOf("リアクション", "👍を付ける", "👍をリアクションした人"), actions.map { it.label })
    actions.first { it.label == "👍をリアクションした人" }.action()
    assertEquals(thumbs, listed)
  }

  @Test
  fun eachPartOffersItsActionsInTheSpecsOrder() {
    var opened: String? = null
    var went: Long? = null
    val page = linkPreview { url = "https://cafe.example/menu"; title = "カフェ"; site = "Cafe" }
    val text = "ここ https://cafe.example/menu と https://b.example"
    val line =
      look(
        LineContent.Words(text, preview = page),
        listOf(
          ReactionsPart(emptyList(), counted = false),
          QuotePart(LineQuote(7, "あや", "明日休み？")),
          LinksPart(listOf("https://cafe.example/menu", "https://b.example")),
          PagePart(page, inWords = true),
        ),
        "自分、ここ",
      )
    compose.setContent { Message(line, handlers(jump = { went = it }, openLink = { opened = it })) }
    val actions = actionsOf(line.said)
    assertEquals(listOf("リアクション", "返信元を表示", "リンクを開く（cafe.example）", "リンクを開く（b.example）"), actions.map { it.label })
    actions.first { it.label == "返信元を表示" }.action()
    actions.first { it.label == "リンクを開く（b.example）" }.action()
    assertEquals(7L, went)
    assertEquals("https://b.example", opened)
  }

  @Test
  fun aPageWhoseLinkIsNotInTheWordsOpensItself() {
    var opened: String? = null
    val page = linkPreview { url = "https://cafe.example/menu"; title = "カフェ" }
    val line = look(LineContent.Words("ここ", preview = page), listOf(PagePart(page, inWords = false)), "自分、ここ")
    compose.setContent { Message(line, handlers(openLink = { opened = it })) }
    actionsOf(line.said).single().action()
    assertEquals("https://cafe.example/menu", opened)
  }
}
