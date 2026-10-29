package app.pochical.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import app.pochical.design.Chat
import java.time.LocalDate
import kotlinx.coroutines.delay

// The floating day (spec/chat.md, Unread lines and typing): while the person scrolls, the day of the
// lines at the top floats over them, kept as a list pins its section's header, and fades
// chatRules.floatingDayMs after the scroll stops. Read from the list's layout alone, in the floating
// piece, never in the rows, so a row is not drawn again as the list scrolls (#797).

/** Where the day floats over the lines, below what floats over their top: where their first starts. */
private val GAP = 8.dp

/** The day floating over the lines: which, how far the next day's title pushes it up, and the title it takes over. */
@Stable
class FloatingDayState(private val list: LazyListState, items: () -> List<ChatItem>) {
  private val shown by derivedStateOf(items)

  /** The floating day's height, as it measures itself. */
  var height by mutableIntStateOf(0)

  /** The day at the top, how far it is pushed up, and the key of the title it takes over; null with no day. */
  val at by derivedStateOf { place() }

  /** The title taken over, told only as it changes, not each frame the day is pushed. */
  val taken by derivedStateOf { at?.taken }

  private fun place(): Place? {
    val items = shown
    val info = list.layoutInfo
    val visible = info.visibleItemsInfo
    if (visible.isEmpty()) return null
    // Reversed, an item's top stands its offset and size over the foot.
    val top = { item: androidx.compose.foundation.lazy.LazyListItemInfo -> info.viewportEndOffset - (item.offset + item.size) }
    // Where it floats: at the top of the lines, under what floats over them.
    val line = info.afterContentPadding
    // The item where the day floats, and its day: that of the title over it, the next older one.
    val under = visible.firstOrNull { top(it) <= line && line < top(it) + it.size } ?: visible.last()
    val day = (under.index until items.size).firstNotNullOfOrNull { (items[it] as? ChatItem.DayTitle)?.day } ?: return null
    // The next day's title coming up under it pushes it up and out.
    val next = visible.filter { items.getOrNull(it.index) is ChatItem.DayTitle && top(it) > line }.minOfOrNull(top)
    val push = next?.let { (line + height - it).coerceIn(0, height) } ?: 0
    // A title up to where the day floats is the floating day's: not drawn under it.
    val taken = visible.firstOrNull { items.getOrNull(it.index) is ChatItem.DayTitle && top(it) <= line }?.key as? String
    return Place(day, push, taken)
  }

  /** The day floating, pushed up by [push] pixels, and the title it takes over. */
  data class Place(val day: LocalDate, val push: Int, val taken: String?)
}

/** The floating day's state, read from [list] laid out as [items]. */
@Composable
fun rememberFloatingDay(list: LazyListState, items: List<ChatItem>): FloatingDayState {
  val current by rememberUpdatedState(items)
  return remember(list) { FloatingDayState(list) { current } }
}

/**
 * The day floating over the lines' top while the person scrolls, fading in as the scrolling starts
 * and out `chatRules.floatingDayMs` after it stops; never while the chat follows its latest line. A
 * screen reader does not read it: scrolling a page at a time says the day itself.
 */
@Composable
fun FloatingDay(state: FloatingDayState, list: LazyListState, topRoom: Dp, modifier: Modifier = Modifier) {
  // Scrolling by the person: from their drag through its fling, not as the chat follows its latest.
  var dragged by remember { mutableStateOf(false) }
  var shown by remember { mutableStateOf(false) }
  LaunchedEffect(list) { list.interactionSource.interactions.collect { if (it is DragInteraction.Start) dragged = true } }
  LaunchedEffect(list) {
    snapshotFlow { list.isScrollInProgress }.collect { scrolling ->
      if (scrolling && dragged) shown = true
      if (!scrolling) {
        dragged = false
        delay(Chat.floatingDayMs.toLong())
        shown = false
      }
    }
  }
  val at = state.at
  Box(modifier.fillMaxWidth().padding(top = topRoom).clipToBounds().clearAndSetSemantics {}, contentAlignment = Alignment.TopCenter) {
    AnimatedVisibility(shown && at != null, enter = fadeIn(), exit = fadeOut()) {
      val place = at ?: return@AnimatedVisibility
      DayWords(
        place.day,
        Modifier.padding(top = GAP).graphicsLayer { translationY = -place.push.toFloat() }.onSizeChanged { state.height = it.height },
        floating = true,
      )
    }
  }
}
