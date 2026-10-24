package app.pochical.chat

import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.RoundRect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Matrix
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.LayoutDirection
import app.pochical.design.Radius
import kotlin.math.asin
import kotlin.math.sqrt

/**
 * A message's bubble (spec/chat.md, In a message): round all over at [radius], but for the first
 * line of a run ([tail]), whose outline grows a tail at its top corner by the writer's side, one's
 * own on the end, others' on the start. It is one outline, reaching past the bubble's frame by
 * 0.6r, which the line keeps room for.
 */
class BubbleShape(private val mine: Boolean, private val tail: Boolean, private val radius: Dp = Radius.lg) : Shape {
  override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
    val r = minOf(with(density) { radius.toPx() }, size.minDimension / 2)
    if (!tail) {
      return Outline.Generic(Path().apply { addRoundRect(RoundRect(Rect(Offset.Zero, size), r, r)) })
    }
    val w = size.width
    val h = size.height
    // Drawn for one's own, the tail at the top right; others' is its mirror.
    val path =
      Path().apply {
        moveTo(r, 0f)
        lineTo(w - r, 0f)
        // The top right corner's arc, down to the notch at x = W − 0.25r.
        val notchY = r - sqrt(r * r - (0.75f * r) * (0.75f * r))
        arcTo(Rect(w - 2 * r, 0f, w, 2 * r), -90f, ARC_TO_NOTCH, forceMoveTo = false)
        // The horn rises to its tip, level with the top edge, and curves back in, concave, to the side.
        cubicTo(w - 0.25f * r + 0.2f * r, notchY - 0.25f * r, w + 0.25f * r, 0.04f * r, w + 0.6f * r, 0f)
        cubicTo(w + 0.3f * r, 0.12f * r, w, 0.55f * r, w, minOf(1.5f * r, h - r))
        lineTo(w, h - r)
        arcTo(Rect(w - 2 * r, h - 2 * r, w, h), 0f, 90f, forceMoveTo = false)
        lineTo(r, h)
        arcTo(Rect(0f, h - 2 * r, 2 * r, h), 90f, 90f, forceMoveTo = false)
        lineTo(0f, r)
        arcTo(Rect(0f, 0f, 2 * r, 2 * r), 180f, 90f, forceMoveTo = false)
        close()
      }
    val start = mine == (layoutDirection == LayoutDirection.Rtl)
    if (start) path.transform(Matrix().apply { scale(-1f, 1f); translate(-w, 0f) })
    return Outline.Generic(path)
  }

  private companion object {
    /** The arc from the top of the corner to x = W − 0.25r, in degrees: asin(0.75). */
    val ARC_TO_NOTCH = Math.toDegrees(asin(0.75)).toFloat()
  }
}
