package app.pochical.chat

import androidx.annotation.DrawableRes
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.safeDrawing
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.MenuDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.hapticfeedback.HapticFeedback
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.boundsInWindow
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.dp
import app.pochical.LocalThemeColors
import kotlin.math.roundToInt

// A line's reactions and menu (spec/chat.md, Opening a message's menu): drawn by the app over the
// dimmed chat, as LINE, WhatsApp and Messages draw theirs, the line lifted where it was with the
// menu under it, or over it when there is no room under it, and only when neither fits all moved
// together to stay on the screen. Material's menu surface and items draw the menu.

/** One of a line's menu items: [destructive] in the danger color, [startsGroup] apart from those before it. */
class LineMenuItem(
  val label: String,
  @param:DrawableRes val icon: Int,
  val destructive: Boolean = false,
  val startsGroup: Boolean = false,
  val run: () -> Unit,
)

/** The line a menu is open on: its key in the list, its items, whose it is, and its bubble drawn again lifted. */
class MenuLine(
  val key: String,
  val mine: Boolean,
  val items: List<LineMenuItem>,
  val bubble: @Composable () -> Unit,
)

/**
 * The menu open over the chat, if any, and the bubble's place in the window, which follows the line
 * as the chat moves under it; and the item under the finger that opened it, lit as it slides there.
 */
@Stable
class LineMenuState {
  var open by mutableStateOf<MenuLine?>(null)
    private set

  /** The lifted line's bubble in the window, where its place in the chat is. */
  var bounds by mutableStateOf(Rect.Zero)

  /** The item lit under the finger, by index. */
  var lit by mutableStateOf<Int?>(null)
    private set

  internal val items = mutableStateMapOf<Int, Rect>()
  private val shown = MutableTransitionState(false)

  internal val visible
    get() = shown

  fun open(line: MenuLine, at: Rect) {
    items.clear()
    lit = null
    bounds = at
    open = line
    shown.targetState = true
  }

  fun close() {
    shown.targetState = false
    lit = null
  }

  /** The menu has gone: the line draws its bubble again. */
  internal fun gone() {
    open = null
  }

  /** The finger that opened the menu is at [at]: the item under it lights, with a tick each time one does. */
  fun slide(at: Offset, haptics: HapticFeedback) {
    val under = items.entries.firstOrNull { it.value.contains(at) }?.key
    if (under != lit && under != null) haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
    lit = under
  }

  /** It lifts at [at]: having slid onto an item, that item is picked as the menu closes; else it stays open for a tap. */
  fun lift(at: Offset, slid: Boolean) {
    val line = open ?: return
    if (!slid) return
    val under = items.entries.firstOrNull { it.value.contains(at) }?.key
    lit = null
    if (under != null) pick(line.items[under])
  }

  /** A pick acts as the menu closes, as the system's context menu does. */
  fun pick(item: LineMenuItem) {
    close()
    item.run()
  }
}

@Composable fun rememberLineMenuState(): LineMenuState = remember { LineMenuState() }

/**
 * The open menu over everything the chat page draws: a scrim to close it at a tap, the line's
 * bubble lifted where it is, and its menu by it. With the keyboard up it stays up when they fit over
 * it with the line where it is; else the keyboard goes down for the room.
 */
@Composable
fun LineMenu(state: LineMenuState) {
  val line = state.open ?: return
  val keyboard = LocalSoftwareKeyboardController.current
  val density = LocalDensity.current
  val imeBottom = WindowInsets.ime.getBottom(density)
  val safe = WindowInsets.safeDrawing
  val top = safe.getTop(density)
  val bottom = maxOf(safe.getBottom(density), imeBottom)
  val margin = with(density) { 8.dp.roundToPx() }
  var origin by remember { mutableStateOf(Offset.Zero) }
  // Told by the layout: the menu fits neither under nor over the line with the keyboard up.
  var crowded by remember { mutableStateOf(false) }
  LaunchedEffect(crowded) { if (crowded) keyboard?.hide() }
  val gone = state.visible.isIdle && !state.visible.targetState
  LaunchedEffect(gone) { if (gone) state.gone() }
  Box(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInWindow() }) {
    AnimatedVisibility(state.visible, enter = fadeIn(), exit = fadeOut()) {
      Box(
        Modifier.fillMaxSize()
          .background(MaterialTheme.colorScheme.scrim.copy(alpha = SCRIM))
          .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { state.close() }
      )
    }
    val bubble = state.bounds.translate(-origin)
    Layout(
      content = {
        Box { line.bubble() }
        AnimatedVisibility(
          state.visible,
          enter = fadeIn() + scaleIn(initialScale = 0.8f, transformOrigin = TransformOrigin(if (line.mine) 1f else 0f, 0f)),
          exit = fadeOut() + scaleOut(targetScale = 0.8f, transformOrigin = TransformOrigin(if (line.mine) 1f else 0f, 0f)),
        ) {
          MenuSurface(line, state)
        }
      },
      modifier = Modifier.fillMaxSize(),
    ) { measurables, constraints ->
      val lifted = measurables[0].measure(Constraints.fixed(bubble.width.roundToInt().coerceAtLeast(0), bubble.height.roundToInt().coerceAtLeast(0)))
      // Gone once it has faded out, while the lifted line goes back.
      val menu = measurables.getOrNull(1)?.measure(constraints.copy(minWidth = 0, minHeight = 0))
      val menuHeight = menu?.height ?: 0
      val height = constraints.maxHeight
      val floor = height - bottom - margin
      val ceiling = top + margin
      var bubbleY = bubble.top.roundToInt()
      val below = bubbleY + lifted.height + margin
      val menuY =
        when {
          // Under it, where the line is.
          below + menuHeight <= floor -> below
          // Over it.
          bubbleY - margin - menuHeight >= ceiling -> bubbleY - margin - menuHeight
          else -> {
            // Neither fits: the keyboard goes down for the room, or all move together to stay on the screen.
            if (imeBottom > 0) crowded = true
            bubbleY = (floor - menuHeight - margin - lifted.height).coerceAtLeast(ceiling)
            bubbleY + lifted.height + margin
          }
        }
      layout(constraints.maxWidth, height) {
        lifted.place(bubble.left.roundToInt(), bubbleY)
        if (menu != null) {
          val menuX = if (line.mine) (bubble.right.roundToInt() - menu.width) else bubble.left.roundToInt()
          menu.place(menuX.coerceIn(margin, (constraints.maxWidth - menu.width - margin).coerceAtLeast(margin)), menuY)
        }
      }
    }
  }
}

/** The menu's items on Material's menu surface, each lit while the finger that opened it is over it. */
@Composable
private fun MenuSurface(line: MenuLine, state: LineMenuState) {
  val colors = LocalThemeColors.current
  Surface(
    shape = MenuDefaults.shape,
    color = MenuDefaults.containerColor,
    tonalElevation = MenuDefaults.TonalElevation,
    shadowElevation = MenuDefaults.ShadowElevation,
    modifier = Modifier.widthIn(min = MENU_WIDTH),
  ) {
    Column(Modifier.width(MENU_WIDTH)) {
      line.items.forEachIndexed { index, item ->
        if (item.startsGroup && index > 0) HorizontalDivider()
        val tint = if (item.destructive) colors.dangerDefault else MaterialTheme.colorScheme.onSurface
        DropdownMenuItem(
          text = { Text(item.label, color = tint) },
          leadingIcon = { Icon(painterResource(item.icon), contentDescription = null, tint = tint) },
          onClick = { state.pick(item) },
          modifier =
            Modifier.onGloballyPositioned { state.items[index] = it.boundsInWindow() }
              .background(if (state.lit == index) MaterialTheme.colorScheme.onSurface.copy(alpha = LIT) else Color.Transparent),
        )
      }
    }
  }
}

private const val SCRIM = 0.32f
private const val LIT = 0.1f
private val MENU_WIDTH = 200.dp
