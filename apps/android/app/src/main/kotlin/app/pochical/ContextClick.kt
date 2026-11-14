package app.pochical

import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.isSecondaryPressed
import androidx.compose.ui.input.pointer.pointerInput

/**
 * A right click (a mouse's secondary button, a trackpad's two-finger click) opens what a long press
 * on the element opens, at [onContextClick] with where it went down: as it goes down, as Android's
 * own context click is (View.performContextClick), with no haptic, as no finger feels it. Taken
 * before anything inside sees it, so the click is never a tap on what is under it as well.
 */
@Composable
fun Modifier.contextClick(onContextClick: (Offset) -> Unit): Modifier {
  val current by rememberUpdatedState(onContextClick)
  return pointerInput(Unit) {
    awaitEachGesture {
      val down = awaitFirstDown(requireUnconsumed = false, pass = PointerEventPass.Initial)
      if (!currentEvent.buttons.isSecondaryPressed) return@awaitEachGesture
      down.consume()
      current(down.position)
      // The rest of the click is its own.
      do {
        val event = awaitPointerEvent(PointerEventPass.Initial)
        event.changes.forEach { it.consume() }
      } while (event.changes.any { it.pressed })
    }
  }
}
