package app.pochical.chat

import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.DpSize
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.calendar.rememberReducedMotion
import app.pochical.design.Chat
import app.pochical.design.Radius
import android.content.Context
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.material3.SnackbarHostState
import app.pochical.kit.ChatPhotoFiles
import app.pochical.kit.GroupCalls
import app.pochical.kit.PhotoUploads
import app.pochical.savePhoto
import kotlin.coroutines.cancellation.CancellationException
import app.pochical.kit.WaitingLine
import app.pochical.kit.albumRows
import app.pochical.v1.ChatPhoto
import coil3.compose.AsyncImage
import coil3.compose.AsyncImagePainter
import coil3.request.ImageRequest
import coil3.request.crossfade

// Photos in a chat (spec/chat.md, Photos; Albums): a line's photo or album, each photo over the
// blur its ThumbHash draws while it comes, and its ring while it goes up, as iOS's
// ChatPhotoViews.swift and ChatAlbums.swift draw them.

/** How far the member's photos have gone up, and × to stop a line. */
val LocalPhotoUploads = staticCompositionLocalOf<PhotoUploads> { error("No photo uploads provided") }

/** The member's own photos on the device, as sent. */
val LocalPhotoFiles = staticCompositionLocalOf<ChatPhotoFiles> { error("No photo files provided") }

/**
 * Saves [photos] of [groupId] to the phone's pictures, each tried, one that fails not stopping the
 * rest; what to say of it (spec/chat.md, Photos): 写真を保存しました, 一部の写真を保存できませんでした
 * or 保存できませんでした.
 */
suspend fun savePhotos(context: Context, calls: GroupCalls, files: ChatPhotoFiles, groupId: String, photos: List<ChatPhoto>): Saved {
  val saved =
    photos.count { photo ->
      try {
        savePhoto(context, wholePhoto(context, calls, files, groupId, photo.id), "pochical-${photo.id}.jpg")
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        false
      }
    }
  return Saved(
    context.getString(
      when (saved) {
        photos.size -> R.string.chat_photo_saved
        0 -> R.string.chat_photo_not_saved
        else -> R.string.chat_photo_some_not_saved
      }
    ),
    all = saved == photos.size,
  )
}

/** What saving photos came to: [words] to say, and whether [all] were saved, which is felt as well (spec/haptics.md). */
class Saved(val words: String, val all: Boolean)

/** Says what saving came to, felt as well once every photo was saved, as it is out of sight in Photos; a failure plays nothing. */
suspend fun SnackbarHostState.saying(saved: Saved, haptics: HapticFeedback) {
  if (saved.all) haptics.performHapticFeedback(HapticFeedbackType.Confirm)
  showSnackbar(saved.words)
}

/** The box a photo fits in, and how far from square it may be before its ends are cut, as LINE crops a panorama (/design's photoSize). */
object PhotoBox {
  val WIDTH = 220.dp
  val HEIGHT = 260.dp
  private const val WIDEST = 2f
  private const val TALLEST = 0.5f

  /** The size a photo takes in the chat, as it was sent. */
  fun size(photo: ChatPhoto): DpSize {
    val aspect = (photo.width.toFloat() / maxOf(photo.height, 1)).coerceIn(TALLEST, WIDEST).takeIf { photo.width > 0 } ?: 1f
    val width = minOf(WIDTH, HEIGHT * aspect)
    return DpSize(width, width / aspect)
  }
}

/** An album's width, as wide as a line with a link's page, and the gap between its photos. */
private val ALBUM_WIDTH = 240.dp
private val ALBUM_GAP = 2.dp

/**
 * A line's photos with no bubble (spec/chat.md, Photos; Albums): one alone the size it was sent at
 * within [PhotoBox], two or more as an album in rows (`albumRows`), rounded at `lg` with a hairline
 * edge. While the line goes up ([waiting] still being sent) each is dimmed with its ring, × in it
 * stopping the line ([onStop]); a tap opens one ([onOpen], by its place), one that could not be
 * fetched is fetched again instead.
 */
@Composable
fun PhotoLine(photos: List<ChatPhoto>, groupId: String, waiting: WaitingLine?, onStop: (() -> Unit)?, onOpen: ((Int) -> Unit)?, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val shape = RoundedCornerShape(Radius.lg)
  @Composable
  fun Cell(index: Int, modifier: Modifier) {
    Box(modifier) {
      // Not while it goes up; one of the member's own once up, or not sent, opens alone.
      val opens = waiting == null || waiting.failed || waiting.sending
      // The place it opens large out of; not the copy lifted over the line's menu, which opens nothing.
      ChatPhotoImage(
        photos[index],
        groupId,
        retries = waiting == null,
        onOpen = onOpen?.takeIf { opens }?.let { open -> { open(index) } },
        Modifier.matchParentSize().then(if (onOpen != null) Modifier.photoPlace(photos[index].id) else Modifier),
      )
      if (waiting != null && !waiting.failed) PhotoGoingUp(photos[index].id, waiting.sending, onStop.takeIf { !waiting.sending }, Modifier.matchParentSize())
    }
  }
  if (photos.size == 1) {
    val size = PhotoBox.size(photos.single())
    Cell(0, modifier.size(size).clip(shape).border(1.dp, colors.borderDefault, shape))
    return
  }
  Column(modifier.width(ALBUM_WIDTH).clip(shape).border(1.dp, colors.borderDefault, shape), verticalArrangement = Arrangement.spacedBy(ALBUM_GAP)) {
    var index = 0
    for (across in albumRows(photos.size)) {
      Row(horizontalArrangement = Arrangement.spacedBy(ALBUM_GAP)) {
        for (cell in index until index + across) {
          // A row of several as tall as a cell is wide; the row of one half the album's width tall.
          Cell(cell, Modifier.weight(1f).then(if (across == 1) Modifier.height(ALBUM_WIDTH / 2) else Modifier.aspectRatio(1f)))
        }
      }
      index += across
    }
  }
}

/**
 * One of the group's photos as it loads, read at the size it shows, its small version: over the
 * blur its ThumbHash draws, fading in over it in `chatRules.photoFadeMs`, or over its grey breathing
 * at once; drawn at once when memory holds it. One that could not be fetched keeps its blur, or its
 * grey still, with ↻ over it, and with [retries] a tap anywhere on it fetches it again.
 */
@Composable
fun ChatPhotoImage(photo: ChatPhoto, groupId: String, retries: Boolean, onOpen: (() -> Unit)?, modifier: Modifier = Modifier) {
  val context = LocalContext.current
  val blur = remember(photo.id) { blurOf(photo)?.asImageBitmap() }
  var attempt by remember(photo.id) { mutableIntStateOf(0) }
  var failed by remember(photo.id) { mutableStateOf(false) }
  var shown by remember(photo.id) { mutableStateOf(false) }
  val request =
    remember(photo.id, groupId, attempt) {
      ImageRequest.Builder(context).data(ChatPhotoData(photo.id, groupId, small = true, attempt = attempt)).crossfade(if (blur != null) Chat.photoFadeMs else 0).build()
    }
  val open by rememberUpdatedState(onOpen)
  // A tap, not a press held: one held `chatRules.longPressMs` opens the line's menu, and its lift is no tap.
  val tap = Modifier.pointerInput(failed, retries) {
    var pressedAt = 0L
    detectTapGestures(
      onPress = { pressedAt = System.currentTimeMillis() },
      onTap = {
        if (System.currentTimeMillis() - pressedAt >= Chat.longPressMs) return@detectTapGestures
        if (failed && retries) attempt++ else open?.invoke()
      },
    )
  }
  Box(modifier.then(tap)) {
    when {
      blur != null -> Image(blur, contentDescription = null, Modifier.matchParentSize(), contentScale = ContentScale.Crop)
      !shown -> PhotoComing(breathing = !failed, Modifier.matchParentSize())
    }
    AsyncImage(
      request,
      contentDescription = null,
      Modifier.matchParentSize(),
      contentScale = ContentScale.Crop,
      onState = { state ->
        failed = state is AsyncImagePainter.State.Error
        shown = state is AsyncImagePainter.State.Success
      },
    )
    if (failed && retries) PhotoRetry(Modifier.align(Alignment.Center))
  }
}

/** ↻ in a dark circle over a photo that could not be fetched, as Signal and Telegram mark one; the photo's tap fetches it again. */
@Composable
private fun PhotoRetry(modifier: Modifier) {
  val colors = LocalThemeColors.current
  Box(modifier.size(48.dp).background(colors.mediaShade, CircleShape), contentAlignment = Alignment.Center) {
    Icon(painterResource(R.drawable.ic_refresh), stringResource(R.string.chat_photo_retry), Modifier.size(24.dp), tint = colors.mediaText)
  }
}

/**
 * Where a photo without a ThumbHash will be while it comes: its grey breathing, fading to 40% and
 * back every 1.6 seconds, so it reads as on its way; still when motion is reduced or it cannot come.
 */
@Composable
fun PhotoComing(breathing: Boolean, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val still = !breathing || rememberReducedMotion()
  val faded =
    if (still) 1f
    else rememberInfiniteTransition(label = "breathing").animateFloat(1f, 0.4f, infiniteRepeatable(tween(BREATH_MS), RepeatMode.Reverse), label = "breath").value
  Box(modifier.alpha(faded).background(colors.fillTertiary))
}

/**
 * A photo going up, dimmed: how far it has gone as a ring filling, turning a quarter while it waits
 * its turn or for the network, full once up, × in it stopping its whole line ([onStop]), as Signal
 * and Telegram ring one. Once the line is being sent ([sending]) the ring stays full without ×.
 */
@Composable
private fun PhotoGoingUp(photoId: String, sending: Boolean, onStop: (() -> Unit)?, modifier: Modifier) {
  val colors = LocalThemeColors.current
  val uploads = LocalPhotoUploads.current
  val sent by uploads.sent.collectAsStateWithLifecycle()
  val gone = sent[photoId] ?: if (sending) 1f else null
  Box(modifier.background(colors.mediaDim), contentAlignment = Alignment.Center) {
    Box(Modifier.size(48.dp).background(colors.mediaShade, CircleShape), contentAlignment = Alignment.Center) {
      Ring(gone, Modifier.fillMaxSize().padding(4.dp))
      if (onStop != null) {
        IconButton(onClick = onStop, Modifier.size(48.dp)) {
          Icon(painterResource(R.drawable.ic_close), stringResource(R.string.chat_photo_stop), Modifier.size(18.dp), tint = colors.mediaText)
        }
      }
    }
  }
}

/** How far a photo has gone up, as a ring filling from the top; a quarter of it turning while it has not begun, still with motion reduced. */
@Composable
private fun Ring(gone: Float?, modifier: Modifier) {
  val colors = LocalThemeColors.current
  val track = colors.mediaText.copy(alpha = 0.3f)
  when {
    gone != null -> {
      val shown by animateFloatAsState(maxOf(gone, 0.02f), tween(RING_MS), label = "ring")
      CircularProgressIndicator(progress = { shown }, modifier, color = colors.mediaText, strokeWidth = RING_WIDTH, trackColor = track, gapSize = 0.dp)
    }
    rememberReducedMotion() -> CircularProgressIndicator(progress = { 0.25f }, modifier, color = colors.mediaText, strokeWidth = RING_WIDTH, trackColor = track, gapSize = 0.dp)
    else -> CircularProgressIndicator(modifier, color = colors.mediaText, strokeWidth = RING_WIDTH, trackColor = track, gapSize = 0.dp)
  }
}

private val RING_WIDTH: Dp = 3.dp
private const val RING_MS = 200
private const val BREATH_MS = 800
