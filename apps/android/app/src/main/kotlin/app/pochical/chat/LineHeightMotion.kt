package app.pochical.chat

import androidx.compose.animation.core.animate
import androidx.compose.animation.core.tween
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.node.LayoutModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import app.pochical.design.Chat
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * A line moves to a new height with the lines around it (spec/chat.md, Unread lines and typing): the
 * list takes its new height at once and `animateItem` slides the lines over it there, so the line is
 * drawn from where its top stood down to its place in the same motion, cut at its foot, never over
 * the line under it. Only the drawing moves: a frame of it lays nothing out.
 */
internal fun Modifier.movesToNewHeight(atOnce: Boolean): Modifier = this then NewHeightElement(atOnce)

private data class NewHeightElement(val atOnce: Boolean) : ModifierNodeElement<NewHeightNode>() {
  override fun create() = NewHeightNode(atOnce)

  override fun update(node: NewHeightNode) {
    node.atOnce = atOnce
  }

  override fun InspectorInfo.inspectableProperties() {
    name = "movesToNewHeight"
  }
}

private class NewHeightNode(var atOnce: Boolean) : Modifier.Node(), LayoutModifierNode {
  /** How far under its place the line's top is drawn, over it while the line shrinks. */
  private var drawnUnder by mutableFloatStateOf(0f)
  private var height = UNMEASURED
  private var moving: Job? = null

  // A list's item taken up by another line starts anew.
  override fun onReset() {
    moving?.cancel()
    drawnUnder = 0f
    height = UNMEASURED
  }

  override fun MeasureScope.measure(measurable: Measurable, constraints: Constraints): MeasureResult {
    val placeable = measurable.measure(constraints)
    val grown = placeable.height - height
    if (height != UNMEASURED && grown != 0 && !atOnce) {
      // Set here, so this very frame already draws it where it stood; only its layer reads it.
      val from = Snapshot.withoutReadObservation { drawnUnder + grown }
      drawnUnder = from
      moving?.cancel()
      moving = coroutineScope.launch { animate(from, 0f, animationSpec = tween(Chat.lineMoveMs)) { value, _ -> drawnUnder = value } }
    }
    height = placeable.height
    return layout(placeable.width, placeable.height) {
      placeable.placeWithLayer(0, 0) {
        translationY = drawnUnder
        clip = drawnUnder != 0f
        shape = FootClip(drawnUnder)
      }
    }
  }
}

/** Cuts a line drawn [under] its place at its foot, which stays; past its sides and top what plays on it still shows. */
private data class FootClip(val under: Float) : Shape {
  override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density) = Outline.Rectangle(Rect(-OPEN, -OPEN, size.width + OPEN, size.height - under))
}

private const val UNMEASURED = -1

/** Far enough over a line for anything drawn from it. */
private const val OPEN = 100_000f
