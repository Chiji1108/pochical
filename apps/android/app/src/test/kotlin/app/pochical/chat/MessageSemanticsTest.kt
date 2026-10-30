package app.pochical.chat

import androidx.compose.ui.semantics.SemanticsActions
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.performClick
import androidx.compose.runtime.CompositionLocalProvider
import app.pochical.DeviceSettingsState
import app.pochical.LocalDeviceSettings
import app.pochical.kit.DeviceSettings
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.LineContent
import app.pochical.kit.LineReaction
import app.pochical.v1.chatPoll
import app.pochical.v1.chatVotes
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

  private fun handlers(
    choosers: (LineReaction) -> Unit = {},
    jump: (Long) -> Unit = {},
    openLink: (String) -> Unit = {},
    openProfile: ((GroupMemberRow) -> Unit)? = null,
  ) =
    MessageHandlers(
      menu = LineMenuState(),
      items = { emptyList() },
      reply = {},
      jump = jump,
      nameOf = { it },
      notKept = {},
      reducedMotion = true,
      lit = null,
      litShown = {},
      me = "me",
      writers = emptyMap(),
      react = { _, _, _ -> },
      moreReactions = {},
      choosers = choosers,
      spray = null,
      openLink = openLink,
      together = { _, _ -> emptySet() },
      vote = { _, _, _ -> },
      decide = {},
      voters = { _, _ -> },
      groupId = "g1",
      stopSending = {},
      openPhoto = { _, _ -> }, openOwnPhoto = { _, _ -> },
      openProfile = openProfile,
    )

  private fun look(content: LineContent, parts: List<LinePart>, said: String) =
    MessageLook("line-1", false, content, true, null, true, "9:41", null, 1, ReplySwipe.Rightward, said, parts)

  /** The line's actions, by their labels, as TalkBack offers them. */
  private fun actionsOf(said: String) =
    compose.onNode(SemanticsMatcher.expectValue(SemanticsProperties.ContentDescription, listOf(said))).fetchSemanticsNode().config[SemanticsActions.CustomActions]

  @Test
  fun theWritersProfileIsAnActionOfTheirLine() {
    var opened: GroupMemberRow? = null
    val aya = GroupMemberRow("g1", "u2", "あや", 0, left = false, deleted = false, ownName = false, photoId = "", ownPhoto = false, markStyle = "", markFill = true)
    val line = MessageLook("line-1", false, LineContent.Words("明日休み？"), false, aya, false, "9:41", null, 1, ReplySwipe.Rightward, "あや、明日休み？")
    compose.setContent { Message(line, handlers(openProfile = { opened = it })) }
    val profile = actionsOf(line.said).single { it.label == "あやのプロフィール" }
    profile.action()
    assertEquals(aya, opened)
  }

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

  @Test
  fun sharedDaysOfferTheShiftTableAfterTheWritersProfile() {
    var shown: java.time.LocalDate? = null
    val aya = GroupMemberRow("g1", "u2", "あや", 0, left = false, deleted = false, ownName = false, photoId = "", ownPhoto = false, markStyle = "", markFill = true)
    val day = java.time.LocalDate.parse("2026-11-03")
    val line =
      MessageLook("line-1", false, LineContent.Days(listOf("2026-11-03")), true, aya, true, "9:41", null, 1, ReplySwipe.Rightward, "あや、📅 11月3日(火)", listOf(DaysPart(day)))
    val handlers =
      MessageHandlers(
        menu = LineMenuState(), items = { emptyList() }, reply = {}, jump = {}, nameOf = { it }, notKept = {}, reducedMotion = true,
        lit = null, litShown = {}, me = "me", writers = emptyMap(), react = { _, _, _ -> }, moreReactions = {}, choosers = {}, spray = null,
        openLink = {}, together = { _, _ -> emptySet() }, vote = { _, _, _ -> }, decide = {}, voters = { _, _ -> }, groupId = "g1",
        openShifts = { shown = it }, stopSending = {}, openPhoto = { _, _ -> }, openOwnPhoto = { _, _ -> }, openProfile = {},
      )
    compose.setContent { CompositionLocalProvider(LocalDeviceSettings provides DeviceSettingsState(DeviceSettings()) {}) { Message(line, handlers) } }
    val actions = actionsOf(line.said)
    assertEquals(listOf("あやのプロフィール", "シフト表で見る"), actions.map { it.label })
    actions.last().action()
    assertEquals(day, shown)
  }

  @Test
  fun aPollsDaysAreGoneThroughOneByOneAndTheLineSettlesIt() {
    var voted: Triple<Long, String, Boolean>? = null
    var deciding: Long? = null
    // As many days as a month: more than one element holds actions (Android's 32).
    val days = (1..31).map { "2026-12-%02d".format(it) }
    val poll = chatPoll {
      this.days += days
      votes += chatVotes { day = "2026-12-03"; userIds += "me" }
    }
    val line = look(LineContent.Poll(poll), listOf(PollPart(PollLook(poll, canDecide = true, waiting = false))), "自分、日にちの投票")
    val handlers =
      MessageHandlers(
        menu = LineMenuState(), items = { emptyList() }, reply = {}, jump = {}, nameOf = { it }, notKept = {}, reducedMotion = true,
        lit = null, litShown = {}, me = "me", writers = emptyMap(), react = { _, _, _ -> }, moreReactions = {}, choosers = {}, spray = null,
        openLink = {}, together = { _, _ -> emptySet() }, vote = { seq, day, on -> voted = Triple(seq, day, on) }, decide = { deciding = it },
        voters = { _, _ -> }, groupId = "g1", stopSending = {}, openPhoto = { _, _ -> }, openOwnPhoto = { _, _ -> },
      )
    compose.setContent { CompositionLocalProvider(LocalDeviceSettings provides DeviceSettingsState(DeviceSettings()) {}) { Message(line, handlers) } }
    val actions = actionsOf(line.said)
    assertEquals(listOf("日にちを決める"), actions.map { it.label })
    actions.single().action()
    assertEquals(1L, deciding)
    // Each day its own element, its 行ける among them.
    compose.onAllNodes(hasText("行ける") and hasClickAction())[0].performClick()
    assertEquals(Triple(1L, "2026-12-01", true), voted)
  }
}
