package app.pochical

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.sizeIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.calendar.TimeChange
import app.pochical.design.MarkColor
import app.pochical.design.MarkIcons

/** The side of the grid Phosphor draws the marks' icons on. */
private const val ICON_GRID = 256f

/**
 * A pattern's mark, `size` across, in `look`: its icon, its emoji, or its
 * letter on a tile of its color's tint, as iOS's ShiftMark. An icon id with
 * no glyph, "letter" among them, is the letter in a thin ring. 早出 and
 * 残業 (`change`) are small triangles in its top corners, the day's start
 * at the left and its end at the right.
 */
@Composable
fun ShiftMark(
  icon: String,
  emoji: String,
  symbol: String,
  color: Int,
  size: Dp,
  modifier: Modifier = Modifier,
  change: TimeChange? = null,
  look: Look = LocalDeviceSettings.current.device.look,
) {
  val mark = LocalThemeColors.current.mark(if (look.colored) color else 0)
  // Emoji bring colors of their own, so their corners take secondary text's gray.
  val cornerColor = if (look.style == MarkStyle.Emoji) LocalThemeColors.current.textSecondary else mark.color
  val fontSize = with(LocalDensity.current) { size.toSp() }
  val drawn = if (change == null) modifier else modifier.drawWithContent {
    drawContent()
    val side = size.toPx() * 0.32f
    val reach = 2.dp.toPx()
    val right = this.size.width + reach
    if (change.early) {
      drawPath(triangle(Offset(-reach, -reach), Offset(side - reach, -reach), Offset(-reach, side - reach)), cornerColor)
    }
    if (change.late) {
      drawPath(triangle(Offset(right, -reach), Offset(right - side, -reach), Offset(right, side - reach)), cornerColor)
    }
  }
  when (look.style) {
    MarkStyle.Emoji -> Text(emoji, drawn, fontSize = fontSize)
    MarkStyle.Badge ->
      Box(
        drawn
          .sizeIn(minWidth = size, minHeight = size)
          .background(mark.tint, markShape(size)),
        contentAlignment = Alignment.Center,
      ) {
        Text(symbol, color = mark.color, fontSize = fontSize * 0.56f, fontWeight = FontWeight.Bold)
      }
    MarkStyle.Icon -> {
      val layers = markLayers(icon, filled = look.fill)
      if (layers == null) {
        LetterInRing(symbol, mark, size, drawn)
      } else {
        IconLayers(layers, mark, size, drawn)
      }
    }
  }
}

/** A mark's tile, a pattern's letters or a group's, as /design rounds it: 28% of its side. */
fun markShape(size: Dp) = RoundedCornerShape(size * 0.28f)

private fun triangle(a: Offset, b: Offset, c: Offset) =
  Path().apply {
    moveTo(a.x, a.y)
    lineTo(b.x, b.y)
    lineTo(c.x, c.y)
    close()
  }

/** The layers of the icon `id`, filled (duotone) or not (regular); none for an id with no glyph. */
fun markLayers(id: String, filled: Boolean): List<MarkIcons.Layer>? =
  MarkIcons.glyphs[id]?.let { MarkIcons.drawings[it]?.get(if (filled) "duotone" else "regular") }

/** A mark icon's [layers] in [mark]'s color, [size] across: a pattern's or a group's. */
@Composable
internal fun IconLayers(layers: List<MarkIcons.Layer>, mark: MarkColor, size: Dp, modifier: Modifier) {
  val paths = remember(layers) { layers.map { PathParser().parsePathString(it.pathData).toPath() } }
  Canvas(modifier.size(size)) {
    scale(this.size.width / ICON_GRID, pivot = Offset.Zero) {
      layers.forEachIndexed { index, layer -> drawPath(paths[index], mark.color, alpha = layer.opacity) }
    }
  }
}

@Composable
private fun LetterInRing(symbol: String, mark: MarkColor, size: Dp, modifier: Modifier) {
  val fontSize = with(LocalDensity.current) { (size * 0.5f).toSp() }
  Box(
    modifier.size(size).border(1.7.dp, mark.color, CircleShape),
    contentAlignment = Alignment.Center,
  ) {
    Text(symbol, color = mark.color, fontSize = fontSize, fontWeight = FontWeight.SemiBold)
  }
}
