package app.pochical.groups

import android.graphics.Bitmap
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.gestures.detectTransformGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.markShape
import java.io.ByteArrayOutputStream
import kotlin.math.min
import kotlin.math.roundToInt
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/** What a picked photo is cut to: a face's circle, or a group mark's rounded square. */
enum class PhotoCropShape {
  Round,
  Square;

  /** The frame's shape, [side] across: a group mark's as it is drawn. */
  fun shape(side: androidx.compose.ui.unit.Dp): Shape = if (this == Round) CircleShape else markShape(side)
}

/** Where a photo sits in its frame: moved by [offset] from the middle, in the frame's pixels, and zoomed by [zoom]. */
data class CropPlace(val offset: Offset = Offset.Zero, val zoom: Float = 1f) {
  /** The photo's pixels to the frame's, filling a frame [side] across at this zoom. */
  fun scale(photo: Size, side: Float): Float = side / min(photo.width, photo.height) * zoom

  /**
   * Moved by [pan] and zoomed by [zoomBy] about the frame's middle, so what is there stays there,
   * and kept from zooming out past filling the frame, in past [MAX_ZOOM], or moving so far that an
   * edge of the photo shows inside it.
   */
  fun moved(pan: Offset, zoomBy: Float, photo: Size, side: Float): CropPlace {
    val next = (zoom * zoomBy).coerceIn(1f, MAX_ZOOM)
    val grown = next / zoom
    val moved = offset * grown + pan
    val scale = side / min(photo.width, photo.height) * next
    // The photo's shorter side fills the frame exactly, but for float rounding either way.
    val spareX = ((photo.width * scale - side) / 2).coerceAtLeast(0f)
    val spareY = ((photo.height * scale - side) / 2).coerceAtLeast(0f)
    return CropPlace(Offset(moved.x.coerceIn(-spareX, spareX), moved.y.coerceIn(-spareY, spareY)), next)
  }

  /** The square of the photo inside a frame [side] across, as left, top and side in the photo's pixels. */
  fun cut(photo: Size, side: Float): Triple<Int, Int, Int> {
    val scale = scale(photo, side)
    val length = side / scale
    val left = photo.width / 2 - offset.x / scale - length / 2
    val top = photo.height / 2 - offset.y / scale - length / 2
    val whole = length.roundToInt().coerceAtMost(min(photo.width, photo.height).toInt())
    return Triple(
      left.roundToInt().coerceIn(0, photo.width.toInt() - whole),
      top.roundToInt().coerceIn(0, photo.height.toInt() - whole),
      whole,
    )
  }

  companion object {
    /** How far in a photo can be brought, past filling the frame. */
    const val MAX_ZOOM = 4f
  }
}

/**
 * A picked or taken photo to move and zoom inside its frame before it becomes a face or a group's
 * mark (/design's PhotoCrop; spec/sync-protocol.md, Profile), as Contacts and LINE ask: drag to
 * move, pinch to zoom, キャンセル or 選択 at the foot. The photo always covers the whole frame.
 * 選択 cuts the square inside, shrunk to at most chatRules.pictureMaxEdge, as a JPEG.
 */
@Composable
fun PhotoCrop(photo: Bitmap, shape: PhotoCropShape, onDone: (ByteArray?) -> Unit) {
  val colors = LocalThemeColors.current
  val picture = remember(photo) { photo.asImageBitmap() }
  val photoSize = Size(photo.width.toFloat(), photo.height.toFloat())
  val density = LocalDensity.current
  val scope = rememberCoroutineScope()
  // The room between the title and the buttons, as laid out: the frame is the square inside it.
  var room by remember { mutableStateOf(IntSize.Zero) }
  val side = with(density) { (min(room.width, room.height) - INSET.roundToPx() * 2).coerceAtLeast(1).toFloat() }
  val frame = with(density) { side.toDp() }
  // A new frame, as the phone turns, starts the photo again, its place being in the frame's pixels.
  var place by remember(photo, side) { mutableStateOf(CropPlace()) }
  var cutting by remember { mutableStateOf(false) }
  Dialog(
    onDismissRequest = { onDone(null) },
    properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false),
  ) {
    Box(Modifier.fillMaxSize().background(colors.mediaBackground)) {
      Box(
        Modifier.fillMaxSize().safeDrawingPadding().padding(vertical = BARS).onSizeChanged { room = it }.pointerInput(photo, side) {
          detectTransformGestures { _, pan, zoomBy, _ -> place = place.moved(pan, zoomBy, photoSize, side) }
        },
        contentAlignment = Alignment.Center,
      ) {
        val scale = place.scale(photoSize, side)
        Image(
          picture,
          contentDescription = null,
          Modifier.requiredSize(with(density) { (photoSize.width * scale).toDp() }, with(density) { (photoSize.height * scale).toDp() })
            .graphicsLayer {
              translationX = place.offset.x
              translationY = place.offset.y
            },
        )
        val outline = shape.shape(frame)
        Canvas(Modifier.fillMaxSize().graphicsLayer { compositingStrategy = CompositingStrategy.Offscreen }) {
          drawRect(colors.mediaShade)
          val hole = outline.createOutline(Size(side, side), layoutDirection, this)
          translate((size.width - side) / 2, (size.height - side) / 2) {
            drawOutline(hole, colors.mediaShade, blendMode = BlendMode.Clear)
            drawOutline(hole, colors.mediaTextSecondary, style = Stroke(1.dp.toPx()))
          }
        }
      }
      Text(
        stringResource(R.string.photo_crop_title),
        Modifier.align(Alignment.TopCenter).safeDrawingPadding().padding(top = 12.dp).semantics { heading() },
        color = colors.mediaText,
        style = MaterialTheme.typography.titleMedium,
      )
      Row(Modifier.align(Alignment.BottomCenter).fillMaxWidth().safeDrawingPadding().padding(horizontal = 8.dp, vertical = 4.dp)) {
        TextButton(onClick = { onDone(null) }) { Text(stringResource(R.string.cancel), color = colors.mediaText) }
        Spacer(Modifier.weight(1f))
        TextButton(
          onClick = {
            cutting = true
            val cut = place.cut(photoSize, side)
            scope.launch { onDone(withContext(Dispatchers.Default) { cutJpeg(photo, cut) }) }
          },
          enabled = !cutting,
        ) {
          Text(stringResource(R.string.photo_crop_choose), color = colors.mediaText, fontWeight = FontWeight.SemiBold)
        }
      }
    }
  }
}

/** The frame's room on either side. */
private val INSET = 16.dp

/** The room the title and the buttons take, above and below. */
private val BARS = 56.dp

/** The square [cut] of [photo], no larger than a face is kept, as a JPEG. */
private fun cutJpeg(photo: Bitmap, cut: Triple<Int, Int, Int>): ByteArray {
  val (left, top, length) = cut
  val edge = min(length, Chat.pictureMaxEdge)
  val square = Bitmap.createBitmap(photo, left, top, length, length)
  val shrunk = if (edge == length) square else Bitmap.createScaledBitmap(square, edge, edge, true)
  return ByteArrayOutputStream().use {
    shrunk.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, it)
    it.toByteArray()
  }
}

/** As iOS keeps a face, jpegData(compressionQuality: 0.9). */
private const val JPEG_QUALITY = 90
