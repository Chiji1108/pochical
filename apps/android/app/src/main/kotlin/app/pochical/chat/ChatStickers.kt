package app.pochical.chat

import android.content.Context
import android.net.Uri
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import app.pochical.R
import app.pochical.calendar.rememberReducedMotion
import app.pochical.design.Chat
import app.pochical.design.Radius
import app.pochical.kit.StickerEncoding
import app.pochical.kit.StickerFile
import app.pochical.kit.WaitingLine
import app.pochical.v1.ChatSticker
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import coil3.gif.AnimatedImageDecoder
import coil3.gif.MovieDrawable
import coil3.gif.repeatCount
import coil3.request.ImageRequest
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

// Stickers in a chat (spec/chat.md, Stickers): drawn on the chat's ground with no bubble, edge or
// ground, see-through where they are, moving where they move, fetched and kept as the chat's
// photos are (`ChatPhotoData`).

/** The sticker the keyboard gave at [uri], written to send (`StickerEncoding`); null for one the phone cannot read. */
suspend fun keyboardSticker(context: Context, uri: Uri): StickerFile? =
  withContext(Dispatchers.Default) {
    val bytes =
      try {
        context.contentResolver.openInputStream(uri)?.use { it.readBytes() }
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        null
      }
    bytes?.let(StickerEncoding::encode)
  }

/** The size a sticker takes in the chat: within `chatRules.stickerSize` square, its shape kept. */
fun stickerSize(sticker: ChatSticker): DpSize {
  val box = Chat.stickerSize.dp
  if (sticker.width <= 0 || sticker.height <= 0) return DpSize(box, box)
  val longer = maxOf(sticker.width, sticker.height).toFloat()
  return DpSize(box * (sticker.width / longer), box * (sticker.height / longer))
}

/**
 * A sticker's request, the file itself (it has no small version), as its line draws it and the
 * chat fetches it ahead: read by Android's ImageDecoder to move, looping for ever whatever the file
 * says, or [still], as the loader reads any image, at its first frame.
 */
fun stickerRequest(context: Context, stickerId: String, groupId: String, still: Boolean, attempt: Int = 0): ImageRequest =
  ImageRequest.Builder(context)
    .data(ChatPhotoData(stickerId, groupId, small = false, attempt = attempt))
    .apply { if (!still) decoderFactory(AnimatedImageDecoder.Factory()).repeatCount(MovieDrawable.REPEAT_INFINITE).memoryCacheKeyExtra(MOVING, "") }
    .build()

/**
 * A sticker as it loads, the file itself (it has no small version): a photo's grey in its place
 * while it comes, ↻ in it should it not come, a tap fetching it again. A moving one plays as its file says,
 * looping for ever, and stands still at its first frame while motion is reduced. While its line
 * goes up ([waiting] still being sent) it is dimmed under the photos' ring, × in it stopping the
 * line ([onStop]).
 */
@Composable
fun StickerImage(sticker: ChatSticker, groupId: String, waiting: WaitingLine?, onStop: (() -> Unit)?, modifier: Modifier = Modifier) {
  val context = LocalContext.current
  val still = rememberReducedMotion()
  var attempt by remember(sticker.id) { mutableIntStateOf(0) }
  var failed by remember(sticker.id) { mutableStateOf(false) }
  var shown by remember(sticker.id) { mutableStateOf(false) }
  val request = remember(sticker.id, groupId, attempt, still) { stickerRequest(context, sticker.id, groupId, still, attempt) }
  val going = waiting != null && !waiting.failed
  Box(modifier.size(stickerSize(sticker))) {
    // A photo's grey while it comes, rounded as a photo's line is.
    if (!shown) PhotoComing(breathing = !failed, Modifier.matchParentSize().clip(RoundedCornerShape(Radius.lg)))
    AsyncImage(
      request,
      contentDescription = null,
      Modifier.matchParentSize().alpha(if (going) WAITING_ALPHA else 1f),
      contentScale = ContentScale.Fit,
      onState = {
        failed = it is AsyncImagePainter.State.Error
        shown = it is AsyncImagePainter.State.Success
      },
    )
    // The member's own is on the device.
    if (failed && waiting == null) PhotoRetry(Modifier.align(Alignment.Center), onClick = { attempt++ }, label = stringResource(R.string.chat_sticker_retry))
    if (waiting != null && going) PhotoGoingUp(sticker.id, waiting.sending, onStop.takeIf { !waiting.sending }, Modifier.matchParentSize(), ground = Color.Transparent)
  }
}

/** What a moving sticker is kept under in memory beside its key, apart from the still frame drawn while motion is reduced. */
private const val MOVING = "moving"
