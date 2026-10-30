package app.pochical.chat

import androidx.annotation.DrawableRes
import androidx.activity.compose.BackHandler
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.background
import androidx.compose.foundation.focusable
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.layoutId
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.sp
import app.pochical.R
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
import androidx.compose.foundation.layout.wrapContentHeight
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
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clipToBounds
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
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
  /** One of the member's lines on its way: its menu is not that of the group's line it becomes. */
  val waiting: Boolean,
  val items: List<LineMenuItem>,
  /** The reactions' bar over the line; none for a line that takes no reactions (one on its way). */
  val bar: ReactionBar?,
  val bubble: @Composable () -> Unit,
)

/** The reactions' bar: the first emoji offered, the reader's own [chosen] among them lit, and + for any other. */
class ReactionBar(val chosen: Set<String>, val onReact: (String) -> Unit, val onMore: () -> Unit)

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

  /** What is lit under the finger: an item (`item0`…), a reaction (`react👍`) or + (`more`). */
  var lit by mutableStateOf<String?>(null)
    private set

  /** Where each of the menu's items and the bar's reactions is in the window, by the key [lit] names them by. */
  internal val targets = mutableStateMapOf<String, Rect>()
  private val shown = MutableTransitionState(false)

  internal val visible
    get() = shown

  fun open(line: MenuLine, at: Rect) {
    targets.clear()
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
    val under = targets.entries.firstOrNull { it.value.contains(at) }?.key
    if (under != lit && under != null) haptics.performHapticFeedback(HapticFeedbackType.SegmentTick)
    lit = under
  }

  /** It lifts at [at]: having slid onto an item, that item is picked as the menu closes; else it stays open for a tap. */
  fun lift(at: Offset, slid: Boolean) {
    val line = open ?: return
    if (!slid) return
    lit = null
    val under = targets.entries.firstOrNull { it.value.contains(at) }?.key ?: return
    val bar = line.bar
    when {
      under.startsWith(ITEM) -> pick(line.items[under.removePrefix(ITEM).toInt()])
      under == MORE -> bar?.let(::more)
      under.startsWith(REACT) -> bar?.let { react(it, under.removePrefix(REACT)) }
    }
  }

  /** + in the bar: the system's emoji picker, as the menu closes. */
  fun more(bar: ReactionBar) {
    close()
    bar.onMore()
  }

  /** A reaction picked from the bar, as the menu closes: the reader's own taken back, else put on. */
  fun react(bar: ReactionBar, emoji: String) {
    close()
    bar.onReact(emoji)
  }

  /** A pick acts as the menu closes, as the system's context menu does. */
  fun pick(item: LineMenuItem) {
    close()
    item.run()
  }
}

@Composable fun rememberLineMenuState(): LineMenuState = remember { LineMenuState() }

/**
 * The open menu over everything the chat page draws: a scrim to close it at a tap or a back, the
 * line's bubble lifted where it is, a little larger while it is open, and its menu by it, scrolled
 * through when taller than the room. With the keyboard up it stays up when they fit over it with the
 * line where it is; else the keyboard goes down for the room. With motion reduced the bubble is not
 * lifted and the item under the finger is lit rather than grown (spec/chat.md, Reduced motion).
 */
@Composable
fun LineMenu(state: LineMenuState, reducedMotion: Boolean) {
  val line = state.open ?: return
  val keyboard = LocalSoftwareKeyboardController.current
  val density = LocalDensity.current
  val imeBottom = WindowInsets.ime.getBottom(density)
  val safe = WindowInsets.safeDrawing
  val top = safe.getTop(density)
  val bottom = maxOf(safe.getBottom(density), imeBottom)
  val margin = with(density) { 8.dp.roundToPx() }
  val leastMenu = with(density) { LEAST_MENU.roundToPx() }
  val leastBubble = with(density) { LEAST_BUBBLE.roundToPx() }
  var origin by remember { mutableStateOf(Offset.Zero) }
  // Told by the layout: the menu fits neither under nor over the line with the keyboard up.
  var crowded by remember { mutableStateOf(false) }
  LaunchedEffect(crowded) { if (crowded) keyboard?.hide() }
  val gone = state.visible.isIdle && !state.visible.targetState
  LaunchedEffect(gone) { if (gone) state.gone() }
  BackHandler(state.visible.targetState) { state.close() }
  // A screen reader goes into it as it opens, on its first reaction or item, as iOS moves VoiceOver there.
  val first = remember(line) { FocusRequester() }
  val reading = rememberScreenReaderOn()
  LaunchedEffect(line, reading) { if (reading) first.requestFocus() }
  // Lifted about its middle from the press's give as the menu opens, and back to its size as it goes.
  val lift = remember(line) { Animatable(if (reducedMotion) 1f else PRESSED_SCALE) }
  val spatial = MaterialTheme.motionScheme.defaultSpatialSpec<Float>()
  LaunchedEffect(line, state.visible.targetState, reducedMotion) {
    if (reducedMotion) lift.snapTo(1f) else lift.animateTo(if (state.visible.targetState) LIFTED_SCALE else 1f, spatial)
  }
  Box(Modifier.fillMaxSize().onGloballyPositioned { origin = it.positionInWindow() }) {
    AnimatedVisibility(state.visible, enter = fadeIn(), exit = fadeOut()) {
      Box(
        Modifier.fillMaxSize()
          .background(MaterialTheme.colorScheme.scrim.copy(alpha = SCRIM))
          // Not a screen reader's: it closes the menu by a back, as the chat under it is out of its reach.
          .clearAndSetSemantics {}
          .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { state.close() }
      )
    }
    val bubble = state.bounds.translate(-origin)
    // The menu's and the bar's heights kept as they fade out, so the line does not move as they go.
    val shownHeights = remember { intArrayOf(0, 0) }
    val corner = TransformOrigin(if (line.mine) 1f else 0f, 0f)
    Layout(
      content = {
        // Drawn whole at its size; a line too tall for the room is cut short at its end.
        Box(
          Modifier.layoutId(BUBBLE)
            // The line is read in the chat; over it a screen reader goes through its reactions and menu.
            .clearAndSetSemantics {}
            .graphicsLayer {
              scaleX = lift.value
              scaleY = lift.value
            }
            .clipToBounds()
            .wrapContentHeight(Alignment.Top, unbounded = true)
        ) {
          line.bubble()
        }
        AnimatedVisibility(
          state.visible,
          Modifier.layoutId(MENU),
          enter = fadeIn() + scaleIn(initialScale = 0.8f, transformOrigin = corner),
          exit = fadeOut() + scaleOut(targetScale = 0.8f, transformOrigin = corner),
        ) {
          MenuSurface(line, state, first.takeIf { line.bar == null })
        }
        line.bar?.let { bar ->
          AnimatedVisibility(
            state.visible,
            Modifier.layoutId(BAR),
            enter = fadeIn() + scaleIn(initialScale = 0.8f, transformOrigin = TransformOrigin(if (line.mine) 1f else 0f, 1f)),
            exit = fadeOut() + scaleOut(targetScale = 0.8f, transformOrigin = TransformOrigin(if (line.mine) 1f else 0f, 1f)),
          ) {
            BarSurface(bar, state, reducedMotion, first)
          }
        }
      },
      modifier = Modifier.fillMaxSize(),
    ) { measurables, constraints ->
      val loose = constraints.copy(minWidth = 0, minHeight = 0)
      val height = constraints.maxHeight
      val floor = height - bottom - margin
      val ceiling = top + margin
      // Each gone once it has faded out, while the lifted line goes back.
      val bar = measurables.firstOrNull { it.layoutId == BAR }?.measure(loose)
      if (bar != null) shownHeights[1] = bar.height
      val barHeight = if (line.bar != null) shownHeights[1] else 0
      val barRoom = if (barHeight > 0) barHeight + margin else 0
      // As tall as the room leaves it beside the bar and the least of the line, its items scrolled
      // past that, as iOS's MenuPlacement gives it; never less than an item.
      val menuRoom = maxOf(leastMenu, floor - ceiling - barRoom - leastBubble - 2 * margin)
      val menu = measurables.firstOrNull { it.layoutId == MENU }?.measure(loose.copy(maxHeight = menuRoom))
      if (menu != null) shownHeights[0] = menu.height
      val menuHeight = shownHeights[0]
      val width = bubble.width.roundToInt().coerceAtLeast(0)
      val tall = bubble.height.roundToInt().coerceAtLeast(0)
      // The room the line has beside its bar and menu: a line taller than it is drawn smaller about
      // its top corner by the writer, as the system's context menu draws a tall preview, down to half
      // its size, and past that cut short at its end, so the bar and menu are always whole on the screen.
      val room = (floor - ceiling - menuHeight - margin - barRoom).coerceAtLeast(0)
      val scale = if (tall <= room || tall == 0) 1f else maxOf(room.toFloat() / tall, MOST_SHRUNK)
      val kept = minOf(tall, (room / scale).roundToInt())
      val lifted = measurables.first { it.layoutId == BUBBLE }.measure(Constraints.fixed(width, kept))
      val shown = (kept * scale).roundToInt()
      var bubbleY = bubble.top.roundToInt()
      val below = bubbleY + shown + margin
      val menuY =
        when {
          // Under it, where the line is, the bar over it.
          bubbleY - barRoom >= ceiling && below + menuHeight <= floor -> below
          // Over the bar.
          bubbleY + shown <= floor && bubbleY - barRoom - margin - menuHeight >= ceiling -> bubbleY - barRoom - margin - menuHeight
          else -> {
            // Neither fits: the keyboard goes down for the room, and all move together to stay on the screen.
            if (imeBottom > 0) crowded = true
            bubbleY = bubbleY.coerceIn(ceiling + barRoom, (floor - menuHeight - margin - shown).coerceAtLeast(ceiling + barRoom))
            bubbleY + shown + margin
          }
        }
      layout(constraints.maxWidth, height) {
        // Scaled about its top corner by the writer, which stays where it is.
        val left = bubble.left.roundToInt()
        lifted.placeWithLayer(left, bubbleY) {
          scaleX = scale
          scaleY = scale
          transformOrigin = corner
        }
        // By the writer's side, within the screen.
        fun x(of: Int) = (if (line.mine) bubble.right.roundToInt() - of else left).coerceIn(margin, (constraints.maxWidth - of - margin).coerceAtLeast(margin))
        menu?.place(x(menu.width), menuY)
        bar?.place(x(bar.width), bubbleY - barRoom)
      }
    }
  }
}

/**
 * The reactions' bar on Material's menu surface: the first emoji offered, the reader's own on the
 * accent's container, and + for the system's emoji picker; each lit while the finger is over it.
 */
@Composable
private fun BarSurface(bar: ReactionBar, state: LineMenuState, reducedMotion: Boolean, first: FocusRequester) {
  val colors = LocalThemeColors.current
  val lit = MaterialTheme.colorScheme.onSurface.copy(alpha = LIT)
  // Under the finger a reaction grows, as iOS's does; with motion reduced it is lit instead.
  @Composable
  fun Modifier.held(key: String, ground: Color): Modifier {
    val held = state.lit == key
    val grown by animateFloatAsState(if (held && !reducedMotion) HELD_SCALE else 1f, MaterialTheme.motionScheme.fastSpatialSpec(), label = "held")
    return graphicsLayer {
      scaleX = grown
      scaleY = grown
    }
      .clip(CircleShape)
      .background(if (held && reducedMotion) lit else ground)
  }
  Surface(
    shape = RoundedCornerShape(50),
    color = MenuDefaults.containerColor,
    tonalElevation = MenuDefaults.TonalElevation,
    shadowElevation = MenuDefaults.ShadowElevation,
  ) {
    Row(Modifier.padding(4.dp), horizontalArrangement = Arrangement.spacedBy(2.dp)) {
      for (emoji in reactionChoices) {
        val key = REACT + emoji
        val chosen = emoji in bar.chosen
        val label = stringResource(if (chosen) R.string.chat_reaction_off else R.string.chat_reaction_on, emoji)
        Box(
          Modifier.size(REACTION)
            .focusedFirst(first.takeIf { emoji == reactionChoices.first() })
            .onGloballyPositioned { state.targets[key] = it.boundsInWindow() }
            .held(key, if (chosen) colors.accentContainer else Color.Transparent)
            .clickable(onClickLabel = label) { state.react(bar, emoji) }
            .semantics { contentDescription = label },
          contentAlignment = Alignment.Center,
        ) {
          Text(emoji, fontSize = 22.sp)
        }
      }
      val more = stringResource(R.string.chat_reaction_more)
      Box(
        Modifier.size(REACTION)
          .onGloballyPositioned { state.targets[MORE] = it.boundsInWindow() }
          .held(MORE, Color.Transparent)
          .clickable { state.more(bar) }
          .semantics { contentDescription = more },
        contentAlignment = Alignment.Center,
      ) {
        Icon(painterResource(R.drawable.ic_add_reaction), contentDescription = null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    }
  }
}

/** The menu's items on Material's menu surface, each lit while the finger that opened it is over it. */
@Composable
private fun MenuSurface(line: MenuLine, state: LineMenuState, first: FocusRequester?) {
  val colors = LocalThemeColors.current
  Surface(
    shape = MenuDefaults.shape,
    color = MenuDefaults.containerColor,
    tonalElevation = MenuDefaults.TonalElevation,
    shadowElevation = MenuDefaults.ShadowElevation,
    modifier = Modifier.widthIn(min = MENU_WIDTH),
  ) {
    Column(Modifier.width(MENU_WIDTH).verticalScroll(rememberScrollState())) {
      line.items.forEachIndexed { index, item ->
        if (item.startsGroup && index > 0) HorizontalDivider()
        val tint = if (item.destructive) colors.dangerDefault else MaterialTheme.colorScheme.onSurface
        DropdownMenuItem(
          text = { Text(item.label, color = tint) },
          leadingIcon = { Icon(painterResource(item.icon), contentDescription = null, tint = tint) },
          onClick = { state.pick(item) },
          modifier =
            Modifier.focusedFirst(first.takeIf { index == 0 })
              .onGloballyPositioned { state.targets[ITEM + index] = it.boundsInWindow() }
              .background(if (state.lit == ITEM + index) MaterialTheme.colorScheme.onSurface.copy(alpha = LIT) else Color.Transparent),
        )
      }
    }
  }
}

/** What a screen reader is put on as the menu opens: focusable in touch mode, as a screen reader's focus follows it there. */
private fun Modifier.focusedFirst(requester: FocusRequester?): Modifier = if (requester == null) this else focusRequester(requester).focusable()

private const val SCRIM = 0.32f

/** The keys the menu's items and the bar's reactions are lit and picked by. */
private const val ITEM = "item"
private const val REACT = "react"
private const val MORE = "more"

/** What the overlay lays out, by its id. */
private const val BUBBLE = "bubble"
private const val MENU = "menu"
private const val BAR = "bar"

/** A reaction's round in the bar. */
private val REACTION = 40.dp

/** How much larger the lifted line is drawn while its menu is open, as iOS lifts it. */
private const val LIFTED_SCALE = 1.02f

/** How much a reaction under the finger grows. */
private const val HELD_SCALE = 1.3f

/** The least the menu is drawn at, one item, and the least of the line beside it. */
private val LEAST_MENU = 48.dp
private val LEAST_BUBBLE = 60.dp

/** The least a line too tall for the room is drawn, before it is cut short instead. */
private const val MOST_SHRUNK = 0.5f
private const val LIT = 0.1f
private val MENU_WIDTH = 200.dp
