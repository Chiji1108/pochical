package app.pochical.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.drawscope.ContentDrawScope
import androidx.compose.ui.graphics.drawscope.clipRect
import androidx.compose.ui.layout.Measurable
import androidx.compose.ui.layout.MeasureResult
import androidx.compose.ui.layout.MeasureScope
import androidx.compose.ui.node.DrawModifierNode
import androidx.compose.ui.node.LayoutModifierNode
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.platform.InspectorInfo
import androidx.compose.ui.unit.Constraints
import app.pochical.design.Chat
import kotlinx.coroutines.CoroutineStart
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

private class NewHeightNode(var atOnce: Boolean) : Modifier.Node(), LayoutModifierNode, DrawModifierNode {
  /** How far under its place the line's top is drawn, over it while the line shrinks. */
  private val drawnUnder = Animatable(0f)
  private var height = UNMEASURED

  // A list's item taken up by another line starts anew.
  override fun onReset() {
    height = UNMEASURED
  }

  override fun MeasureScope.measure(measurable: Measurable, constraints: Constraints): MeasureResult {
    val placeable = measurable.measure(constraints)
    val grown = placeable.height - height
    if (height != UNMEASURED && grown != 0 && !atOnce) {
      // Undispatched, so this very frame already draws it where it stood.
      coroutineScope.launch(start = CoroutineStart.UNDISPATCHED) {
        drawnUnder.snapTo(drawnUnder.value + grown)
        drawnUnder.animateTo(0f, tween(Chat.lineMoveMs))
      }
    }
    height = placeable.height
    return layout(placeable.width, placeable.height) { placeable.placeWithLayer(0, 0) { translationY = drawnUnder.value } }
  }

  override fun ContentDrawScope.draw() {
    if (drawnUnder.value == 0f) {
      drawContent()
    } else {
      // Drawn inside its own layer, so its foot, which stays, is measured from where the line is drawn.
      // Past its sides and top what plays on it still shows.
      clipRect(-OPEN, -OPEN, size.width + OPEN, size.height - drawnUnder.value) { this@draw.drawContent() }
    }
  }
}

private const val UNMEASURED = -1

/** Far enough over a line for anything drawn from it. */
private const val OPEN = 100_000f
