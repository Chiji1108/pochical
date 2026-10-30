package app.pochical.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.gestures.awaitEachGesture
import androidx.compose.foundation.gestures.awaitFirstDown
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Stable
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.PointerInputChange
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.unit.dp
import app.pochical.design.Chat
import kotlin.math.abs
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull

// What a finger does on a chat's line (spec/chat.md, Opening a message's menu; Replies): a long press
// opens its reactions and menu, the finger then sliding onto an item and lifting there to pick it;
// a drag mostly across, toward the middle, answers it. A drag up or down is the list's scroll, and
// a tap is the line's own (its quote, later its links).

/** How a line answers a drag across: others' lines are dragged to the right, one's own to the left. */
enum class ReplySwipe(val sign: Float) {
  Rightward(1f),
  Leftward(-1f),
}

/**
 * How far a line is dragged to answer it, and its springing back, and whether a finger is down on
 * it before its long press, for the row to draw it by: the bubble gives a little under the finger.
 */
@Stable
class LineDrag {
  val offset = Animatable(0f)
  var pressed by mutableStateOf(false)
    internal set
}

/** How far a bubble gives under a finger down on it (spec/chat.md, Opening a message's menu). */
internal const val PRESSED_SCALE = 0.96f

/** What the line's gestures tell, by where the finger is in the window. */
class LineGestureHandler(
  /** The long press, where the finger went down in the window: the menu opens over the line, or a link's under it. */
  val onLongPress: (Offset) -> Unit,
  /** The finger that opened the menu moves, at this point in the window. */
  val onSlide: (Offset) -> Unit,
  /** It lifts, at this point; [slid] once it moved past the touch slop since the menu opened. */
  val onLift: (Offset, slid: Boolean) -> Unit,
  /** Dragged past `chatRules.replySwipe` and let go there. */
  val onReply: () -> Unit,
)

/**
 * The line's gestures on what it is drawn in, whose place in the window [coordinates] gives, and its
 * [drag] across when it answers one ([swipe], null when it is not dragged). Held `chatRules.longPressMs`
 * without moving past the touch slop, the menu opens with a haptic (spec/haptics.md); a drag across
 * reaching `chatRules.replySwipe` ticks once each time it gets there.
 */
@Composable
fun Modifier.lineGestures(
  handler: LineGestureHandler?,
  swipe: ReplySwipe?,
  drag: LineDrag,
  coordinates: () -> LayoutCoordinates?,
  reducedMotion: Boolean,
): Modifier {
  if (handler == null) return this
  val haptics = LocalHapticFeedback.current
  val scope = rememberCoroutineScope()
  val threshold = with(LocalDensity.current) { Chat.replySwipe.dp.toPx() }
  val current by rememberUpdatedState(handler)
  val currentSwipe by rememberUpdatedState(swipe)
  val currentReduced by rememberUpdatedState(reducedMotion)
  val window = remember { { local: Offset -> coordinates()?.localToWindow(local) ?: local } }
  return pointerInput(Unit) {
    val slop = viewConfiguration.touchSlop
    awaitEachGesture {
      val down = awaitFirstDown(requireUnconsumed = false)
      val start = window(down.position)
      // Until the long press: a tap, a scroll, or a drag across to answer.
      var across: PointerInputChange? = null
      // The bubble gives from the moment the finger goes down until the press is over, either way.
      drag.pressed = true
      val pressed =
        try {
          withTimeoutOrNull(Chat.longPressMs.toLong()) {
            while (true) {
              val event = awaitPointerEvent()
              val change = event.changes.firstOrNull { it.id == down.id } ?: return@withTimeoutOrNull false
              if (change.isConsumed) return@withTimeoutOrNull false
              if (change.changedToUpIgnoreConsumed()) {
                // A tap is the line's own: nothing under it (the list putting the keyboard away) takes it.
                change.consume()
                return@withTimeoutOrNull false
              }
              val moved = change.position - down.position
              if (moved.getDistance() > slop) {
                val sign = currentSwipe?.sign
                // Mostly across, toward the middle: the line answers it; else the list's scroll.
                if (sign != null && abs(moved.x) > 2 * abs(moved.y) && moved.x * sign > 0) across = change
                return@withTimeoutOrNull false
              }
            }
            @Suppress("UNREACHABLE_CODE") false
          } ?: true
        } finally {
          drag.pressed = false
        }
      val dragging = across
      when {
        pressed -> {
          haptics.performHapticFeedback(HapticFeedbackType.LongPress)
          current.onLongPress(start)
          // Taken from here on before anything under it (a quote) or the list sees it.
          var slid = false
          while (true) {
            val event = awaitPointerEvent(PointerEventPass.Initial)
            val change = event.changes.firstOrNull { it.id == down.id } ?: break
            change.consume()
            if ((change.position - down.position).getDistance() > slop) slid = true
            if (change.changedToUpIgnoreConsumed()) {
              current.onLift(window(change.position), slid)
              break
            }
            if (slid) current.onSlide(window(change.position))
          }
        }
        dragging != null -> {
          val sign = currentSwipe?.sign ?: return@awaitEachGesture
          var reached = false
          var change: PointerInputChange = dragging
          while (true) {
            change.consume()
            // In the window: the line moves under the finger as it follows it.
            val pulled = ((window(change.position).x - start.x) * sign).coerceAtLeast(0f)
            // Past the threshold the line follows the finger less, as a rubber band.
            val shown = if (pulled <= threshold) pulled else threshold + (pulled - threshold) * Chat.replySwipeRubber.toFloat()
            scope.launch { drag.offset.snapTo(shown * sign) }
            if (pulled >= threshold && !reached) haptics.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate)
            reached = pulled >= threshold
            val event = awaitPointerEvent()
            change = event.changes.firstOrNull { it.id == down.id } ?: break
            if (change.changedToUpIgnoreConsumed()) break
          }
          if (reached) current.onReply()
          scope.launch {
            if (currentReduced) drag.offset.snapTo(0f) else drag.offset.animateTo(0f, spring(dampingRatio = Spring.DampingRatioMediumBouncy))
          }
        }
      }
    }
  }
}
