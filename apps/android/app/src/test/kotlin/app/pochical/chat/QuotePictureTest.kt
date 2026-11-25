package app.pochical.chat

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.test.click
import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onRoot
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.unit.dp
import app.pochical.kit.ChatLine
import app.pochical.kit.GROUP_THREAD
import app.pochical.kit.LineContent
import app.pochical.v1.chatPhoto
import app.pochical.v1.chatSticker
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** A quote of a photo or a sticker shows it small beside its words, as the reply bar does (spec/chat.md, Replies). */
@RunWith(RobolectricTestRunner::class)
class QuotePictureTest {
  @get:Rule val compose = createComposeRule()

  private val first = chatPhoto { id = "p1"; width = 400; height = 300 }
  private val sticker = chatSticker { id = "s1"; width = 320; height = 320 }

  private fun line(content: LineContent) = ChatLine(GROUP_THREAD, 7, "aya", 0, "op-7", content)

  @Test
  fun aPhotoOrAStickerIsQuotedBesideItsWords() {
    val quotes = mutableMapOf<String, LineQuote>()
    compose.setContent {
      quotes["photos"] = lineQuote(7, line(LineContent.Photos(listOf(first, chatPhoto { id = "p2" }))), { it }, emptySet())
      quotes["sticker"] = lineQuote(7, line(LineContent.Sticker(sticker)), { it }, emptySet())
      quotes["words"] = lineQuote(7, line(LineContent.Words("明日休み？")), { it }, emptySet())
      quotes["blocked"] = lineQuote(7, line(LineContent.Photos(listOf(first))), { it }, setOf("aya"))
    }
    compose.waitForIdle()
    // The line's first photo; its sticker; nothing for words, nor for a blocked member's line, whose photo is not shown.
    assertEquals(LineQuote(7, "aya", "📷 写真2枚", photo = first), quotes["photos"])
    assertEquals(sticker, quotes.getValue("sticker").sticker)
    assertEquals(null, quotes.getValue("sticker").photo)
    assertEquals(null to null, quotes.getValue("words").let { it.photo to it.sticker })
    assertEquals(null to null, quotes.getValue("blocked").let { it.photo to it.sticker })
  }

  /** The picture is drawn in the bubble's quote, and a tap on it goes to the line as a tap on the words does. */
  @Test
  fun theBubbleDrawsItAndItsTapGoesToTheLine() {
    var opened = 0
    compose.setContent {
      Box(Modifier.width(IntrinsicSize.Max)) {
        BubbleQuote(LineQuote(7, "aya", "📷 写真", photo = first), "g1", Color.Black, inset = 0.dp) { opened++ }
      }
    }
    compose.onNodeWithTag(QUOTE_PICTURE_TAG, useUnmergedTree = true).assertExists()
    // On the picture, at the quote's end.
    compose.onRoot().performTouchInput { click(Offset(width - 16.dp.toPx(), 24.dp.toPx())) }
    assertEquals(1, opened)
  }
}
