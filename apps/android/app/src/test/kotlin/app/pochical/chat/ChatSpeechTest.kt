package app.pochical.chat

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.remember
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.junit4.v2.createComposeRule
import app.pochical.design.Chat
import app.pochical.kit.ChatLine
import app.pochical.kit.LineContent
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.map
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** What a screen reader hears as others' lines come into an open chat. */
@RunWith(RobolectricTestRunner::class)
class ChatSpeechTest {
  @get:Rule val compose = createComposeRule()

  private val names = mapOf("me" to "ゆうき", "u2" to "さくら", "u3" to "ブロック中")

  /** The chat's lines the device holds, as the database has them. */
  private val held = MutableStateFlow<List<ChatLine>>(emptyList())

  private fun line(seq: Long, author: String, words: String) = ChatLine("group", seq, author, seq, "op$seq", LineContent.Words(words))

  private fun come(vararg lines: ChatLine) {
    compose.runOnIdle { held.value = held.value + lines }
    // Taken in a frame, and settling from then.
    compose.mainClock.advanceTimeByFrame()
    compose.waitForIdle()
  }

  /** Everything said, in order. */
  private val heard = mutableListOf<String>()

  /** What was said since the last asked, each by a live region whose words changed for it. */
  private fun said(): List<String> {
    val live = compose.onAllNodes(SemanticsMatcher.keyIsDefined(SemanticsProperties.LiveRegion)).fetchSemanticsNodes()
    heard.lastOrNull()?.let { last -> assertEquals(listOf(last), live.map { it.config[SemanticsProperties.ContentDescription].joinToString() }.filter { it.isNotEmpty() }) }
    return heard.toList().also { heard.clear() }
  }

  private fun open() {
    compose.mainClock.autoAdvance = false
    compose.setContent {
      val list = remember { LazyListState() }
      ChatSpeech(
        me = "me",
        placed = true,
        newest = { held.value.maxOfOrNull { it.seq } ?: 0 },
        arrived = { after -> held.map { lines -> lines.filter { it.seq > after }.sortedBy { it.seq } } },
        blocked = { it.authorId == "u3" },
        nameOf = { names[it].orEmpty() },
        list = list,
        floatingDay = rememberFloatingDay(list, emptyList()),
        moves = remember { ListMoves() },
        reading = true,
        onSaid = { heard += it },
      )
    }
    compose.mainClock.advanceTimeByFrame()
    compose.waitForIdle()
  }

  @Test
  fun othersLinesAreSaidOnceSettledNeverOnesOwnOrABlockedMembers() {
    held.value = listOf(line(1, "u2", "前から"))
    open()
    // What the chat opened on is not said.
    assertEquals(emptyList<String>(), said())

    come(line(2, "u2", "今週どう？"), line(3, "me", "行ける"), line(4, "u3", "見えない"))
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs / 2L)
    assertEquals(emptyList<String>(), said())
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals(listOf("さくら、今週どう？"), said())

    // Several at once: how many and the latest, as iOS says them.
    come(line(5, "u2", "土曜は？"), line(6, "u2", "日曜でも"))
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals(listOf("新しいメッセージ2件。最新は、さくら、日曜でも"), said())
  }

  @Test
  fun aLineChangedOrTakenBackWhileItSettlesIsSaidAsItIsThen() {
    open()
    come(line(1, "u2", "あした？"))
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs / 2L)
    // Edited meanwhile: said as it is now.
    compose.runOnIdle { held.value = listOf(line(1, "u2", "あさって？")) }
    compose.mainClock.advanceTimeByFrame()
    compose.waitForIdle()
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals(listOf("さくら、あさって？"), said())
    // Taken back while it settles: nothing is said.
    come(line(2, "u2", "まちがい"))
    compose.runOnIdle { held.value = held.value.map { if (it.seq == 2L) it.copy(content = LineContent.Unsent) else it } }
    compose.mainClock.advanceTimeByFrame()
    compose.waitForIdle()
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals(emptyList<String>(), said())
  }

  @Test
  fun anEmptyChatsFirstLineIsSaid() {
    open()
    come(line(1, "u2", "はじめまして"))
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals(listOf("さくら、はじめまして"), said())
  }

  @Test
  fun theSameWordsAgainAreSaidAgain() {
    open()
    come(line(1, "u2", "了解"))
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    come(line(2, "u2", "了解"))
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals(listOf("さくら、了解", "さくら、了解"), said())
  }


  @Test
  fun linesArrivingBeyondAGapAreSaidAndEarlierPagesAreNot() {
    // What arrives is told by what the device holds, not by the lines laid out: a page of earlier
    // lines comes in under the newest held as the chat was placed and is not said; one past it is.
    held.value = listOf(line(50, "u2", "最新"))
    open()
    come(line(10, "u2", "前のページ"), line(11, "u2", "前のページ"))
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals(emptyList<String>(), said())
    come(line(51, "u2", "いま来た"))
    compose.mainClock.advanceTimeBy(Chat.announceSettleMs * 2L)
    assertEquals(listOf("さくら、いま来た"), said())
  }
}
