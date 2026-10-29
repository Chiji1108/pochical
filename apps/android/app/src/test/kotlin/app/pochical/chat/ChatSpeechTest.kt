package app.pochical.chat

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.createComposeRule
import app.pochical.design.Chat
import app.pochical.kit.ChatLine
import app.pochical.kit.ChatState
import app.pochical.kit.LineContent
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** What a screen reader hears as others' lines come into an open chat. */
@RunWith(RobolectricTestRunner::class)
class ChatSpeechTest {
  @get:Rule val compose = createComposeRule()

  private fun line(seq: Long, author: String, words: String) = ChatLine("group", seq, author, seq, "op$seq", LineContent.Words(words))

  private fun said(): String =
    compose.onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion)).fetchSemanticsNode().config[SemanticsProperties.ContentDescription].joinToString()

  @Test
  fun othersLinesAreSaidOnceSettledNeverOnesOwnOrABlockedMembers() {
    var lines by mutableStateOf(listOf(line(1, "u2", "前から")))
    val names = mapOf("me" to "ゆうき", "u2" to "さくら", "u3" to "ブロック中")
    compose.mainClock.autoAdvance = false
    compose.setContent {
      val list = androidx.compose.runtime.remember { LazyListState() }
      ChatSpeech(
        ChatState(lines, emptyList(), atStart = true),
        me = "me",
        placed = true,
        blocked = { it.authorId == "u3" },
        nameOf = { names[it].orEmpty() },
        list = list,
        floatingDay = rememberFloatingDay(list, emptyList()),
      )
    }
    compose.mainClock.advanceTimeBy(100)
    // What the chat opened on is not said.
    assertEquals("", said())

    // One line: who and what, once it has settled.
    compose.runOnIdle { lines = lines + line(2, "u2", "今週どう？") + line(3, "me", "行ける") + line(4, "u3", "見えない") }
    compose.mainClock.advanceTimeByFrame()
    compose.waitForIdle()
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs / 2L)
    assertEquals("", said())
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals("さくら、今週どう？", said())

    // Several at once: how many and the latest.
    compose.runOnIdle { lines = lines + line(5, "u2", "土曜は？") + line(6, "u2", "日曜でも") }
    // The line coming is taken in a frame, and settles from then.
    compose.mainClock.advanceTimeByFrame()
    compose.waitForIdle()
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals("新しいメッセージ2件、さくら、日曜でも", said())
  }
}
