package app.pochical

import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import sh.calvin.reorderable.ReorderableCollectionItemScope
import sh.calvin.reorderable.ReorderableLazyListState
import sh.calvin.reorderable.rememberReorderableLazyListState

/**
 * Rows a finger drags into another order by their handles, ticking as a row is picked up, passes
 * another and is let go (spec/haptics.md): the patterns', 一緒に働く人's. [rows] are in the order as a
 * finger drags it, then as dropped until the source shows it; rows the source brings meanwhile take
 * their places from it, one new after the rest.
 */
@Stable
class DragOrder<T>(
  val rows: List<T>,
  val state: ReorderableLazyListState,
  private val haptics: HapticFeedback,
  private val onDragging: (Boolean) -> Unit,
  private val onDropped: () -> Unit,
) {
  /** The handle a row is dragged by, named [label] for a screen reader. */
  @Composable
  fun Handle(scope: ReorderableCollectionItemScope, label: String) {
    with(scope) {
      IconButton(
        onClick = {},
        modifier =
          Modifier.draggableHandle(
            onDragStarted = {
              onDragging(true)
              haptics.performHapticFeedback(HapticFeedbackType.GestureThresholdActivate)
            },
            onDragStopped = {
              onDragging(false)
              haptics.performHapticFeedback(HapticFeedbackType.GestureEnd)
              onDropped()
            },
          ),
      ) {
        Icon(painterResource(R.drawable.ic_drag_handle), label)
      }
    }
  }
}

/** [rows] in a [DragOrder] over [list], each known by [key]; the ids in their new order go to [onDrop] once let go. */
@Composable
fun <T> rememberDragOrder(rows: List<T>, key: (T) -> String, list: LazyListState, onDrop: (List<String>) -> Unit): DragOrder<T> {
  var order by remember { mutableStateOf<List<String>?>(null) }
  var dragging by remember { mutableStateOf(false) }
  val shown = order?.let { ids -> rows.sortedBy { row -> ids.indexOf(key(row)).takeIf { it >= 0 } ?: Int.MAX_VALUE } } ?: rows
  LaunchedEffect(rows) { if (!dragging && order == rows.map(key)) order = null }
  val haptics = LocalHapticFeedback.current
  val drop by rememberUpdatedState(onDrop)
  val state =
    rememberReorderableLazyListState(list) { from, to ->
      val ids = shown.map(key).toMutableList()
      val moving = ids.indexOf(from.key)
      val target = ids.indexOf(to.key)
      if (moving < 0 || target < 0) return@rememberReorderableLazyListState
      ids.add(target, ids.removeAt(moving))
      order = ids
      haptics.performHapticFeedback(HapticFeedbackType.SegmentFrequentTick)
    }
  return DragOrder(shown, state, haptics, onDragging = { dragging = it }, onDropped = { order?.let(drop) })
}
