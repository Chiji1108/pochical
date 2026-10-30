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
import android.text.Layout
import android.text.StaticLayout
import android.text.TextPaint
import android.util.LruCache
import android.util.TypedValue
import androidx.compose.runtime.Composable
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.core.graphics.PathParser
import androidx.core.graphics.createBitmap
import androidx.glance.ColorFilter
import androidx.glance.GlanceModifier
import androidx.glance.Image
import androidx.glance.ImageProvider
import androidx.glance.LocalContext
import androidx.glance.layout.Alignment
import androidx.glance.layout.Box
import androidx.glance.layout.ContentScale
import androidx.glance.layout.padding
import androidx.glance.unit.ColorProvider
import app.pochical.MARK_CORNER
import app.pochical.kit.GroupMarkValue
import app.pochical.kit.Look
import app.pochical.kit.MarkStyle
import app.pochical.kit.PatternRow
import app.pochical.kit.TimeChange
import app.pochical.kit.initialLetter
import app.pochical.markLayers
import kotlin.math.ceil

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

/** How many pixels a picture [size] across is on a side. */
private fun side(context: Context, size: Dp): Int = (size.value * context.resources.displayMetrics.density).toInt().coerceAtLeast(1)

/**
 * The picture [key] names, [width] by [height] pixels, white on clear for the launcher to tint:
 * drawn by [draw] the first time it is asked for. It is at the screen's density, so a view takes
 * its size from the picture without a size of its own, which costs Glance more views before
 * Android 12 (#1059).
 */
private fun picture(context: Context, key: String, width: Int, height: Int, draw: (Canvas) -> Unit): Bitmap {
  val sized = "$key|$width|$height"
  drawn.get(sized)?.let { return it }
  return createBitmap(width, height).also {
    it.density = context.resources.displayMetrics.densityDpi
    draw(Canvas(it))
    drawn.put(sized, it)
  }
}

/** The picture [key] names, [size] across, drawn by [draw] given its side in pixels. */
private fun picture(context: Context, size: Dp, key: String, draw: (Canvas, Float) -> Unit): Bitmap {
  val side = side(context, size)
  return picture(context, key, side, side) { draw(it, side.toFloat()) }
}

/** White paint, smoothed, for the pictures. */
private fun white() = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = android.graphics.Color.WHITE }

/** What is in the mark's own color, [size] across, for the launcher to tint. */
private fun markPicture(context: Context, icon: String, symbol: String, look: Look, size: Dp, change: TimeChange?): Bitmap =
  picture(context, size, listOf("mark", look.style, look.fill, icon, symbol, change?.early, change?.late).joinToString("|")) { canvas, px ->
    drawMark(canvas, px, icon, symbol, look, change)
  }

/** [markPicture]'s drawing on [canvas], [px] across. */
private fun drawMark(canvas: Canvas, px: Float, icon: String, symbol: String, look: Look, change: TimeChange?) {
  val paint = white()
  // A badge's corners go no further than its tile (tilePicture).
  if (look.style == MarkStyle.Badge) canvas.clipPath(Path().apply { addRoundRect(0f, 0f, px, px, px * MARK_CORNER, px * MARK_CORNER, Path.Direction.CW) })
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
fun ringPicture(context: Context, size: Dp, share: Float): Bitmap =
  picture(context, size, "ring|$share") { canvas, px ->
    val paint =
      white().apply {
        style = Paint.Style.STROKE
        strokeWidth = px * RING_WIDTH
        strokeCap = Paint.Cap.ROUND
      }
    val inset = paint.strokeWidth / 2
    canvas.drawArc(RectF(inset, inset, px - inset, px - inset), -90f, 360f * share, false, paint)
  }

/** A mark's tile, [size] across, rounded as the app's (markShape), for the launcher to tint (Fill). */
private fun tilePicture(context: Context, size: Dp): Bitmap =
  picture(context, size, "tile") { canvas, px -> canvas.drawRoundRect(0f, 0f, px, px, px * MARK_CORNER, px * MARK_CORNER, white()) }

/** An emoji mark's corners alone, which take secondary words' color, as the app's do. */
private fun cornersPicture(context: Context, size: Dp, change: TimeChange): Bitmap =
  picture(context, size, "corners|${change.early}|${change.late}") { canvas, px -> corners(canvas, px, change, white()) }

/**
 * [text] at [sp] on one line, in [color] (white for the launcher to tint), as a widget's line of
 * words lays it out: its fallback fonts' room and all.
 */
private fun line(context: Context, text: String, sp: Float, color: Int = android.graphics.Color.WHITE): StaticLayout {
  val paint =
    TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      this.color = color
      textSize = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, context.resources.displayMetrics)
    }
  val width = ceil(Layout.getDesiredWidth(text, paint)).toInt()
  return StaticLayout.Builder.obtain(text, 0, text.length, paint, width).setIncludePad(true).setUseLineSpacingFromFallbacks(true).setMaxLines(1).build()
}

/**
 * [text] at [sp] in a box [size] across, as a line of words in the middle of a Box that size draws
 * it: in the middle where it fits, else from the box's top and start, cut to the box. An emoji mark
 * in its own colors, a dash for the launcher to tint.
 */
private fun textPicture(context: Context, size: Dp, text: String, sp: Float, color: Int = android.graphics.Color.WHITE): Bitmap {
  val line = line(context, text, sp, color)
  val side = side(context, size)
  return picture(context, "text|$text|$color|${line.paint.textSize}", side, side) { canvas ->
    canvas.translate(maxOf(0, (side - line.width) / 2).toFloat(), maxOf(0, (side - line.height) / 2).toFloat())
    line.draw(canvas)
  }
}

/**
 * What a mark draws in secondary words' color: an emoji's corners over the mark's side, [size]
 * across, and [name] under it as a line of words at [sp] would stand under the mark, as wide as the
 * wider of the two.
 */
private fun underPicture(context: Context, size: Dp, change: TimeChange?, name: String, sp: Float): Bitmap {
  val side = side(context, size)
  val line = line(context, name, sp)
  val width = maxOf(side, line.width)
  return picture(context, "under|${change?.early}|${change?.late}|$name|${line.paint.textSize}|$side", width, side + line.height) { canvas ->
    if (change != null) {
      canvas.save()
      canvas.translate(((width - side) / 2).toFloat(), 0f)
      corners(canvas, side.toFloat(), change, white())
      canvas.restore()
    }
    canvas.translate(((width - line.width) / 2).toFloat(), side.toFloat())
    line.draw(canvas)
  }
}

/**
 * One picture of a mark: its pieces of one color, which the launcher tints [color], or its own
 * colors where none; [below] clear under it, where the name's line is.
 */
class MarkPart(val picture: Bitmap, val color: ColorProvider?, val alpha: Float = 1f, val below: Dp = 0.dp)

/**
 * A pattern's mark, [size] across, in [look] and the テーマ's colors, faint where a day off left
 * empty comes back in a week of days, with [name] under it at [nameSp]: its pictures, one for each
 * color, laid over each other. [onItsTile], a day off on its tile, which is a badge's own tile's
 * color, so the badge draws no tile of its own over it.
 */
@Composable
fun shiftParts(
  pattern: PatternRow,
  size: Dp,
  change: TimeChange?,
  look: Look,
  colors: WidgetColors,
  faint: Boolean = false,
  name: String? = null,
  nameSp: Float = 9f,
  onItsTile: Boolean = false,
): List<MarkPart> =
  partsOf(pattern.icon, pattern.emoji, pattern.symbol, if (look.colored) pattern.color else 0, size, change, look, colors, faint, name, nameSp, onItsTile)

/** A dash where nothing is entered, as quiet as the calendar's, [size] across, with [name]'s line under it at [nameSp]. */
@Composable
fun nothingParts(size: Dp, colors: WidgetColors, name: String? = null, nameSp: Float = 9f): List<MarkPart> {
  val context = LocalContext.current
  val under = name?.let { underPicture(context, size, null, it, nameSp) }
  return listOfNotNull(MarkPart(textPicture(context, size, "–", size.value * 0.5f), colors.quiet, below = below(context, size, under)), under?.let { MarkPart(it, colors.secondary) })
}

/**
 * The room under a mark [size] across that [under] takes, to the pixel: Glance cuts a padding's
 * pixels short, so half of one more keeps it the line's whole height.
 */
private fun below(context: Context, size: Dp, under: Bitmap?): Dp =
  under?.let { ((it.height - side(context, size) + 0.5f) / context.resources.displayMetrics.density).dp } ?: 0.dp

/** A mark of [icon], [emoji] or [symbol] as [look] draws it, in the テーマ's color [slot] (shiftParts). */
@Composable
private fun partsOf(
  icon: String,
  emoji: String,
  symbol: String,
  slot: Int,
  size: Dp,
  change: TimeChange?,
  look: Look,
  colors: WidgetColors,
  faint: Boolean = false,
  name: String? = null,
  nameSp: Float = 9f,
  onItsTile: Boolean = false,
): List<MarkPart> {
  val context = LocalContext.current
  val alpha = if (faint) 0.35f else 1f
  // An emoji's corners take secondary words' color, as its name does: one picture.
  val corners = change?.takeIf { look.style == MarkStyle.Emoji }
  val under = name?.let { underPicture(context, size, corners, it, nameSp) } ?: corners?.let { cornersPicture(context, size, it) }
  val below = below(context, size, under.takeIf { name != null })
  val mark =
    when (look.style) {
      // In a line of words' own black, which an emoji's colors leave alone.
      MarkStyle.Emoji -> listOf(MarkPart(textPicture(context, size, emoji, size.value * 0.8f, android.graphics.Color.BLACK), null, below = below))
      MarkStyle.Badge ->
        listOfNotNull(
          MarkPart(tilePicture(context, size), colors.markTint(slot), below = below).takeUnless { onItsTile },
          MarkPart(markPicture(context, icon, symbol, look, size, change), colors.mark(slot), alpha, below),
        )
      MarkStyle.Icon -> listOf(MarkPart(markPicture(context, icon, symbol, look, size, change), colors.mark(slot), alpha, below))
    }
  return mark + listOfNotNull(under?.let { MarkPart(it, colors.secondary) })
}

/**
 * [parts] over each other in the middle of the Box they are drawn in, a view a picture, with no Box
 * of their own: a month draws many (#1059).
 */
@Composable
fun MarkParts(parts: List<MarkPart>) {
  for (part in parts) {
    Image(
      ImageProvider(part.picture),
      contentDescription = null,
      modifier = if (part.below > 0.dp) GlanceModifier.padding(bottom = part.below) else GlanceModifier,
      // Its own size where the room is smaller, running over its edges as a view of a set size
      // would, rather than shrunk to fit.
      contentScale = ContentScale.Crop,
      alpha = part.alpha,
      colorFilter = part.color?.let { ColorFilter.tint(it) },
    )
  }
}

/** A mark of [parts] by itself, in a Box of its own where it has more than one. */
@Composable
private fun Mark(parts: List<MarkPart>) {
  if (parts.size == 1) MarkParts(parts) else Box(contentAlignment = Alignment.Center) { MarkParts(parts) }
}

/** A pattern's mark by itself (shiftParts). */
@Composable
fun WidgetShiftMark(pattern: PatternRow, size: Dp, change: TimeChange?, look: Look, colors: WidgetColors, faint: Boolean = false) {
  Mark(shiftParts(pattern, size, change, look, colors, faint))
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
  Mark(partsOf(mark.icon, mark.emoji, letter, mark.color, size, null, Look(style = style, fill = true), colors))
}

/** A dash by itself where nothing is entered (nothingParts). */
@Composable
fun NothingMark(size: Dp, colors: WidgetColors) {
  Mark(nothingParts(size, colors))
}

/** How much smaller a mark draws with its name under it. */
val NAME_ROOM = 6.dp
