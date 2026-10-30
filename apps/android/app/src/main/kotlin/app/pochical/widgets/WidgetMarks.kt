package app.pochical.widgets

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.Path
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.RectF
import android.graphics.Typeface
import android.util.LruCache
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.core.graphics.PathParser
import androidx.core.graphics.createBitmap
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.background
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.size
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import androidx.glance.unit.ColorProvider
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.Look
import app.pochical.kit.MarkStyle
import app.pochical.kit.PatternRow
import app.pochical.kit.TimeChange
import app.pochical.kit.initialLetter
import app.pochical.MARK_CORNER
import app.pochical.markLayers

// A pattern's mark as a widget draws it, as the app's ShiftMark draws it: its icon, its emoji, or
// its letter on a tile of its color's tint, 早出 and 残業 as small triangles in its top corners.
// A widget is drawn by the launcher from RemoteViews, which take no Canvas, so what is in the mark's
// own color is drawn once into a white picture the launcher tints, light or dark as it draws.

/** The side of the grid Phosphor draws the marks' icons on. */
private const val ICON_GRID = 256f

/** 早出's and 残業's triangles, a share of the mark's side, as ShiftMark draws them. */
private const val CORNER_SHARE = 0.32f

/** The icons' paths read so far, by their path data: the same few icons are drawn at each size. */
private val paths = HashMap<String, Path>()

/** The pictures drawn so far, by what is in them, for the widgets drawn again and again: 4 MB of them. */
private val drawn =
  object : LruCache<String, Bitmap>(4 * 1024 * 1024) {
    override fun sizeOf(key: String, value: Bitmap) = value.byteCount
  }

/** What is in the mark's own color, white on clear, [size] across, for the launcher to tint. */
private fun markPicture(context: Context, icon: String, symbol: String, look: Look, size: Dp, change: TimeChange?): Bitmap {
  val side = (size.value * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)
  val key = listOf(look.style, look.fill, icon, symbol, side, change?.early, change?.late).joinToString("|")
  drawn.get(key)?.let { return it }
  val picture = createBitmap(side, side)
  val canvas = Canvas(picture)
  val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE }
  val px = side.toFloat()
  fun letter(symbol: String, share: Float, bold: Boolean) {
    paint.style = Paint.Style.FILL
    paint.textSize = px * share
    paint.typeface = Typeface.create(Typeface.DEFAULT, if (bold) Typeface.BOLD else Typeface.NORMAL)
    paint.textAlign = Paint.Align.CENTER
    val metrics = paint.fontMetrics
    canvas.drawText(symbol, px / 2, px / 2 - (metrics.ascent + metrics.descent) / 2, paint)
  }
  when (look.style) {
    MarkStyle.Badge -> letter(symbol, 0.56f, bold = true)
    MarkStyle.Emoji -> {}
    MarkStyle.Icon -> {
      val layers = markLayers(icon, filled = look.fill)
      if (layers == null) {
        // The letter in a thin ring, for an icon with no glyph.
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = px * 0.07f
        canvas.drawCircle(px / 2, px / 2, px / 2 - paint.strokeWidth / 2, paint)
        letter(symbol, 0.5f, bold = true)
      } else {
        val scale = Matrix().apply { setScale(px / ICON_GRID, px / ICON_GRID) }
        paint.style = Paint.Style.FILL
        for (layer in layers) {
          val path = Path(synchronized(paths) { paths.getOrPut(layer.pathData) { PathParser.createPathFromPathData(layer.pathData) } }).apply { transform(scale) }
          paint.alpha = (layer.opacity * 255).toInt()
          canvas.drawPath(path, paint)
        }
        paint.alpha = 255
      }
    }
  }
  if (look.style != MarkStyle.Emoji) corners(canvas, px, change, paint)
  drawn.put(key, picture)
  return picture
}

/**
 * A group's mark in its own colors, as a picture filling [side] pixels, for the system to cut as it
 * cuts a conversation's icon (an adaptive bitmap, whose middle two thirds always show): the mark's
 * tint all over, its icon or letters in its color in the middle, else its emoji. A photo mark is
 * drawn from the photo itself, by whoever has it; until then, as the group's initial.
 */
fun groupMarkPicture(context: Context, mark: GroupMarkValue, name: String, side: Int, color: Int, tint: Int): Bitmap {
  val style =
    when {
      mark.photoId.isEmpty() && markLayers(mark.icon, filled = true) != null -> MarkStyle.Icon
      mark.photoId.isEmpty() && mark.letter.isEmpty() && mark.emoji.isNotEmpty() -> MarkStyle.Emoji
      else -> MarkStyle.Badge
    }
  val picture = createBitmap(side, side)
  val canvas = Canvas(picture)
  canvas.drawColor(tint)
  // What shows of an adaptive icon is its middle two thirds; the mark takes half of the side.
  val inner = side / 2
  val at = (side - inner) / 2f
  if (style == MarkStyle.Emoji) {
    val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = inner * 0.85f; textAlign = Paint.Align.CENTER }
    canvas.drawText(mark.emoji, side / 2f, side / 2f - (paint.fontMetrics.ascent + paint.fontMetrics.descent) / 2, paint)
  } else {
    val letter = mark.letter.takeIf { mark.photoId.isEmpty() }?.ifEmpty { null } ?: initialLetter(name)
    val glyph = markPicture(context, mark.icon, letter, Look(style = style, fill = true), (inner / context.resources.displayMetrics.density).dp, null)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG).apply { colorFilter = PorterDuffColorFilter(color, PorterDuff.Mode.SRC_IN) }
    canvas.drawBitmap(glyph, null, RectF(at, at, at + inner, at + inner), paint)
  }
  return picture
}

/** 早出 at the left and 残業 at the right of the mark's top. */
private fun corners(canvas: Canvas, px: Float, change: TimeChange?, paint: Paint) {
  change ?: return
  val side = px * CORNER_SHARE
  paint.style = Paint.Style.FILL
  paint.alpha = 255
  if (change.early) canvas.drawPath(Path().apply { moveTo(0f, 0f); lineTo(side, 0f); lineTo(0f, side); close() }, paint)
  if (change.late) canvas.drawPath(Path().apply { moveTo(px, 0f); lineTo(px - side, 0f); lineTo(px, side); close() }, paint)
}

/** The width of いまのシフト's ring, a share of its side. */
private const val RING_WIDTH = 0.08f

/**
 * いまのシフト's ring, [size] across, white on clear for the launcher to tint: [share] of it from the
 * top round clockwise, what is left of the shift, the whole of it for its track.
 */
fun ringPicture(context: Context, size: Dp, share: Float): Bitmap {
  val side = (size.value * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)
  val key = "ring|$side|$share"
  drawn.get(key)?.let { return it }
  val picture = createBitmap(side, side)
  val paint =
    Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = android.graphics.Color.WHITE
      style = Paint.Style.STROKE
      strokeWidth = side * RING_WIDTH
      strokeCap = Paint.Cap.ROUND
    }
  val inset = paint.strokeWidth / 2
  Canvas(picture).drawArc(RectF(inset, inset, side - inset, side - inset), -90f, 360f * share, false, paint)
  drawn.put(key, picture)
  return picture
}

/** A mark's tile, [size] across, rounded as the app's (markShape), white on clear for the launcher to tint (WidgetShape). */
private fun tilePicture(context: Context, size: Dp): Bitmap {
  val side = (size.value * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)
  val key = "tile|$side"
  drawn.get(key)?.let { return it }
  val picture = createBitmap(side, side)
  val px = side.toFloat()
  Canvas(picture).drawRoundRect(0f, 0f, px, px, px * MARK_CORNER, px * MARK_CORNER, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE })
  drawn.put(key, picture)
  return picture
}

/** An emoji mark's corners alone, which take secondary words' color, as the app's do. */
private fun cornersPicture(context: Context, size: Dp, change: TimeChange): Bitmap {
  val side = (size.value * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)
  val key = "corners|$side|${change.early}|${change.late}"
  drawn.get(key)?.let { return it }
  val picture = createBitmap(side, side)
  corners(Canvas(picture), side.toFloat(), change, Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE })
  drawn.put(key, picture)
  return picture
}

/**
 * A pattern's mark, [size] across, in [look] and the テーマ's colors, faint where a day off left
 * empty comes back in a week of days.
 */
@Composable
fun WidgetShiftMark(pattern: PatternRow, size: Dp, change: TimeChange?, look: Look, colors: WidgetColors, faint: Boolean = false) {
  WidgetMarkOf(pattern.icon, pattern.emoji, pattern.symbol, if (look.colored) pattern.color else 0, size, change, look, colors, faint)
}

/**
 * A group's mark, [size] across, as the group's screens draw it (GroupMarkView): its icon, else its
 * letters on a tile of its color's tint, else its emoji. A photo stands as the group's initial
 * until widgets show photos.
 */
@Composable
fun WidgetGroupMark(mark: GroupMarkValue, name: String, size: Dp, colors: WidgetColors) {
  val style =
    when {
      mark.photoId.isEmpty() && markLayers(mark.icon, filled = true) != null -> MarkStyle.Icon
      mark.photoId.isEmpty() && mark.letter.isEmpty() && mark.emoji.isNotEmpty() -> MarkStyle.Emoji
      else -> MarkStyle.Badge
    }
  val letter = mark.letter.takeIf { mark.photoId.isEmpty() }?.ifEmpty { null } ?: initialLetter(name)
  WidgetMarkOf(mark.icon, mark.emoji, letter, mark.color, size, null, Look(style = style, fill = true), colors)
}

/** A mark of [icon], [emoji] or [symbol] as [look] draws it, in the テーマ's color [slot]. */
@Composable
private fun WidgetMarkOf(
  icon: String,
  emoji: String,
  symbol: String,
  slot: Int,
  size: Dp,
  change: TimeChange?,
  look: Look,
  colors: WidgetColors,
  faint: Boolean = false,
) {
  val context = LocalContext.current
  val alpha = if (faint) 0.35f else 1f
  when (look.style) {
    MarkStyle.Emoji ->
      Box(GlanceModifier.size(size), contentAlignment = Alignment.Center) {
        Text(emoji, style = TextStyle(fontSize = (size.value * 0.8f).sp))
        if (change != null) {
          Image(provider = ImageProvider(cornersPicture(context, size, change)), contentDescription = null, modifier = GlanceModifier.size(size), colorFilter = ColorFilter.tint(colors.secondary))
        }
      }
    MarkStyle.Badge ->
      Box(GlanceModifier.size(size).background(colors.markTint(slot), ImageProvider(tilePicture(context, size))), contentAlignment = Alignment.Center) {
        MarkImage(markPicture(context, icon, symbol, look, size, change), size, colors.mark(slot), alpha)
      }
    MarkStyle.Icon -> MarkImage(markPicture(context, icon, symbol, look, size, change), size, colors.mark(slot), alpha)
  }
}

@Composable
private fun MarkImage(picture: Bitmap, size: Dp, color: ColorProvider, alpha: Float) {
  Image(provider = ImageProvider(picture), contentDescription = null, modifier = GlanceModifier.size(size), alpha = alpha, colorFilter = ColorFilter.tint(color))
}

/** A dash where nothing is entered, as quiet as the calendar's. */
@Composable
fun NothingMark(size: Dp, colors: WidgetColors) {
  Box(GlanceModifier.size(size), contentAlignment = Alignment.Center) {
    Text("–", style = TextStyle(color = colors.quiet, fontSize = (size.value * 0.5f).sp))
  }
}

/** How much smaller a mark draws with its name under it. */
val NAME_ROOM = 6.dp
