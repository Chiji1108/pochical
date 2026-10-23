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
import androidx.compose.ui.graphics.drawscope.scale
import androidx.compose.ui.graphics.vector.PathParser
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.design.MarkColor
import app.pochical.design.MarkIcons

/** The side of the grid Phosphor draws the marks' icons on. */
private const val ICON_GRID = 256f

/**
 * A pattern's mark, `size` across, in `look`: its icon, its emoji, or its
 * letter on a tile of its color's tint, as iOS's ShiftMark. An icon id with
 * no glyph, "letter" among them, is the letter in a thin ring.
 */
@Composable
fun ShiftMark(
  icon: String,
  emoji: String,
  symbol: String,
  color: Int,
  size: Dp,
  modifier: Modifier = Modifier,
  look: Look = LocalDeviceSettings.current.device.look,
) {
  val mark = LocalThemeColors.current.mark(if (look.colored) color else 0)
  val fontSize = with(LocalDensity.current) { size.toSp() }
  when (look.style) {
    MarkStyle.Emoji -> Text(emoji, modifier, fontSize = fontSize)
    MarkStyle.Badge ->
      Box(
        modifier
          .sizeIn(minWidth = size, minHeight = size)
          .background(mark.tint, RoundedCornerShape(size * 0.28f)),
        contentAlignment = Alignment.Center,
      ) {
        Text(symbol, color = mark.color, fontSize = fontSize * 0.56f, fontWeight = FontWeight.Bold)
      }
    MarkStyle.Icon -> {
      val layers = markLayers(icon, filled = look.fill)
      if (layers == null) {
        LetterInRing(symbol, mark, size, modifier)
      } else {
        IconLayers(layers, mark, size, modifier)
      }
    }
  }
}

/** The layers of the icon `id`, filled (duotone) or not (regular); none for an id with no glyph. */
fun markLayers(id: String, filled: Boolean): List<MarkIcons.Layer>? =
  MarkIcons.glyphs[id]?.let { MarkIcons.drawings[it]?.get(if (filled) "duotone" else "regular") }

@Composable
private fun IconLayers(layers: List<MarkIcons.Layer>, mark: MarkColor, size: Dp, modifier: Modifier) {
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
