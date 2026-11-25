package app.pochical.chat

import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.R
import app.pochical.design.Radius
import app.pochical.kit.ChatLine
import app.pochical.kit.LineContent
import app.pochical.kit.folds
import app.pochical.v1.ChatPhoto
import app.pochical.v1.ChatSticker

// Replies (返信; spec/chat.md, Replies; /design's BubbleQuote and the composer's reply bar): a line
// answering another shows that line inside its bubble, and a tap there goes to it.

/**
 * The line a reply answers, as its quote shows it: who wrote it (none while not held), it in one line
 * of words, and its first [photo] or its [sticker] small beside them (at most one of the two).
 */
data class LineQuote(val seq: Long, val writer: String?, val words: String, val photo: ChatPhoto? = null, val sticker: ChatSticker? = null)

/**
 * The line [seq] ([line], null while not held) as a quote of it reads: as the device holds it, however far back, else 以前のメッセージ
 * until it comes; 取り消されたメッセージ once taken back, ブロック中のメンバーのメッセージ for a blocked
 * member's.
 */
@Composable
fun lineQuote(seq: Long, line: ChatLine?, nameOf: (String) -> String, blocked: Set<String>): LineQuote {
  line ?: return LineQuote(seq, null, stringResource(R.string.chat_quote_earlier))
  return when (val content = line.content) {
    LineContent.Unsent -> LineQuote(seq, nameOf(line.authorId), stringResource(R.string.chat_quote_unsent))
    // A notice takes no reply, nor a line never delivered: quoted as one not held.
    is LineContent.Notice,
    LineContent.Hidden -> LineQuote(seq, null, stringResource(R.string.chat_quote_earlier))
    else ->
      if (line.folds(blocked)) LineQuote(seq, null, stringResource(R.string.chat_blocked_line))
      else
        LineQuote(
          seq,
          nameOf(line.authorId),
          lineWords(content, nameOf),
          photo = (content as? LineContent.Photos)?.photos?.firstOrNull(),
          sticker = (content as? LineContent.Sticker)?.sticker,
        )
  }
}

/**
 * The quote over a reply's words, in the bubble's own [color], over a thin rule across the bubble
 * (the words [inset] from its sides). A tap goes to the line; a long press is the bubble's, as on its words.
 */
@Composable
fun BubbleQuote(quote: LineQuote, groupId: String, color: Color, inset: Dp, onOpen: () -> Unit) {
  val open by rememberUpdatedState(onOpen)
  // Read with its line, whose actions go to it (返信元を表示).
  Column(Modifier.fillMaxWidth().pointerInput(Unit) { detectTapGestures(onTap = { open() }) }.clearAndSetSemantics {}) {
    Row(Modifier.padding(horizontal = inset), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
      Column(Modifier.weight(1f, fill = false)) {
        if (quote.writer != null) {
          Text(quote.writer, style = MaterialTheme.typography.labelMedium, fontWeight = FontWeight.SemiBold, color = color.copy(alpha = 0.85f), maxLines = 1)
        }
        Text(quote.words, style = MaterialTheme.typography.bodySmall, color = color.copy(alpha = 0.8f), maxLines = 1, overflow = TextOverflow.Ellipsis)
      }
      QuotePicture(quote, groupId)
    }
    // Across the bubble, its padding [inset] either side of the words.
    HorizontalDivider(Modifier.fillMaxWidth().padding(top = 8.dp, bottom = 6.dp), color = color.copy(alpha = 0.25f))
  }
}

/**
 * A quote's photo small and square, or its sticker whole and still within the square; nothing for a
 * line with neither. It takes no tap, which goes to the quote's.
 */
@Composable
fun QuotePicture(quote: LineQuote, groupId: String) {
  val square = Modifier.size(QUOTE_PICTURE).testTag(QUOTE_PICTURE_TAG)
  when {
    quote.sticker != null -> StickerImage(quote.sticker, groupId, waiting = null, onStop = null, square, still = true, retries = false, corner = Radius.xs)
    quote.photo != null -> ChatPhotoImage(quote.photo, groupId, retries = false, onOpen = null, square.clip(RoundedCornerShape(Radius.xs)))
  }
}

/** The side of a quote's picture. */
private val QUOTE_PICTURE = 32.dp

/** What a quote's picture is found by in tests. */
internal const val QUOTE_PICTURE_TAG = "quote-picture"
