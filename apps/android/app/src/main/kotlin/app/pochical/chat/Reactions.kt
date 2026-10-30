package app.pochical.chat

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.EnterTransition
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.MutableTransitionState
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.LineReaction
import app.pochical.kit.PhotoShelf
import kotlin.random.Random
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

// Reactions (spec/chat.md, Reactions; /design's ReactionPill): the emoji on a line under its bubble,
// each with the faces of who chose it; the bar over a line's menu offers the first ones and the
// system's emoji picker for any other.

/** The emoji a line's menu offers first (/design's reactionChoices). */
val reactionChoices = listOf("👍", "❤️", "😂", "👀", "🙏", "🎉")

/** The member's own reaction just put on, which sprays its emoji up from its pill once. */
data class Spray(val seq: Long, val emoji: String, val time: Long)

/**
 * A line's reactions under its bubble, wrapping to more rows. One coming while the line is drawn
 * pops in; the reader's own choice ([spray]) sprays its emoji up from its pill, over the lines above.
 * One going shrinks and fades where it was. Those there as the line is drawn are simply there; with
 * motion reduced each fades in and out where it is (spec/chat.md, Reactions; Reduced motion).
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ReactionRow(
  reactions: List<LineReaction>,
  me: String?,
  writers: Map<String, GroupMemberRow>,
  counted: Boolean,
  spray: Spray?,
  reducedMotion: Boolean,
  mine: Boolean,
  onToggle: (emoji: String, on: Boolean) -> Unit,
  onChoosers: (LineReaction) -> Unit,
  modifier: Modifier = Modifier,
) {
  // The emoji there as the line was drawn: only those coming after pop in, one that left and comes again too.
  val there = remember { reactions.mapTo(HashSet()) { it.emoji } }
  // Those drawn as of the last composition, those gone from the line kept where they were until they have left.
  var drawn by remember { mutableStateOf(reactions) }
  val shown = remember(drawn, reactions) { withLeaving(drawn, reactions) }
  SideEffect { drawn = shown }
  if (shown.isEmpty()) return
  val present = reactions.mapTo(HashSet()) { it.emoji }
  val motion = MaterialTheme.motionScheme
  FlowRow(
    modifier.padding(top = 4.dp),
    horizontalArrangement = Arrangement.spacedBy(4.dp, if (mine) Alignment.End else Alignment.Start),
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    for (reaction in shown) {
      val own = me != null && me in reaction.userIds
      val here = reaction.emoji in present
      key(reaction.emoji) {
        val visible = remember { MutableTransitionState(true) }
        visible.targetState = here
        // Gone once it has shrunk away, so the row closes up after it.
        if (visible.isIdle && !visible.currentState) {
          LaunchedEffect(Unit) {
            there -= reaction.emoji
            drawn = drawn.filterNot { it.emoji == reaction.emoji }
          }
        }
        AnimatedVisibility(
          visible,
          enter = EnterTransition.None,
          exit =
            if (reducedMotion) fadeOut(motion.fastEffectsSpec())
            else scaleOut(motion.fastSpatialSpec(), targetScale = LEAVING_SCALE) + fadeOut(motion.fastEffectsSpec()),
        ) {
          ReactionPill(
            reaction,
            own,
            writers,
            counted,
            comes = reaction.emoji !in there,
            reducedMotion = reducedMotion,
            spray = spray?.takeIf { it.emoji == reaction.emoji && !reducedMotion },
            // One leaving takes no taps: what it held is gone.
            onTap = { onToggle(reaction.emoji, !own) }.takeIf { here },
            onLongPress = { onChoosers(reaction) },
          )
        }
      }
    }
  }
}

/** The line's reactions [now] in its order, with those [drawn] before and gone from it, each kept where it was. */
private fun withLeaving(drawn: List<LineReaction>, now: List<LineReaction>): List<LineReaction> {
  val present = now.mapTo(HashSet()) { it.emoji }
  val merged = now.toMutableList()
  drawn.forEachIndexed { index, reaction -> if (reaction.emoji !in present) merged.add(minOf(index, merged.size), reaction) }
  return merged
}

/**
 * A reaction: the emoji and the faces of who chose it, in the order they did, past three two faces
 * and +N; in a chat of two ([counted]) the emoji alone and 2 once both did. The reader's own on the
 * accent's container, edged in the accent.
 */
@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun ReactionPill(
  reaction: LineReaction,
  own: Boolean,
  writers: Map<String, GroupMemberRow>,
  counted: Boolean,
  /** It came while the line was drawn: it pops in, or with motion reduced fades in. */
  comes: Boolean,
  reducedMotion: Boolean,
  spray: Spray?,
  /** A tap puts the reader's on or takes it back; null on one leaving. */
  onTap: (() -> Unit)?,
  onLongPress: () -> Unit,
) {
  val colors = LocalThemeColors.current
  val shape = RoundedCornerShape(50)
  val coming = remember { Animatable(if (comes) 0f else 1f) }
  val fade = MaterialTheme.motionScheme.fastEffectsSpec<Float>()
  LaunchedEffect(Unit) {
    if (comes) coming.animateTo(1f, if (reducedMotion) fade else spring(dampingRatio = Spring.DampingRatioMediumBouncy))
  }
  Box(contentAlignment = Alignment.Center) {
    Row(
      Modifier.graphicsLayer {
        if (reducedMotion) {
          alpha = coming.value
        } else {
          scaleX = coming.value
          scaleY = coming.value
        }
      }
        .background(if (own) colors.accentContainer else MaterialTheme.colorScheme.surfaceContainerHigh, shape)
        .border(1.dp, if (own) colors.accentDefault else Color.Transparent, shape)
        .combinedClickable(enabled = onTap != null, onClick = { onTap?.invoke() }, onLongClick = onLongPress)
        .padding(horizontal = 8.dp, vertical = 3.dp)
        .clearAndSetSemantics {},
      verticalAlignment = Alignment.CenterVertically,
      horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
      Text(reaction.emoji, fontSize = 15.sp)
      val count = reaction.userIds.size
      if (counted) {
        if (count > 1) Text("$count", style = MaterialTheme.typography.labelMedium, color = colors.textSecondary)
      } else {
        val faces = if (count > 3) reaction.userIds.take(2) else reaction.userIds
        Row(horizontalArrangement = Arrangement.spacedBy((-4).dp)) {
          for (id in faces) {
            val writer = writers[id]
            Face(id, writer?.shownName().orEmpty(), writer?.photoId.orEmpty(), writer?.let { PhotoShelf.place(it.groupId) }, FACE_SIZE)
          }
        }
        if (count > 3) Text("+${count - 2}", style = MaterialTheme.typography.labelMedium, color = colors.textSecondary)
      }
    }
    if (spray != null) SprayBurst(spray)
  }
}

/** The emoji sprayed up from its pill, over the lines above, fading as they go. */
@Composable
private fun SprayBurst(spray: Spray) {
  val density = LocalDensity.current
  val drops = remember(spray) { List(SPRAY_DROPS) { Random.nextFloat() } }
  val progress = remember(spray) { Animatable(0f) }
  var played by remember(spray) { mutableStateOf(false) }
  LaunchedEffect(spray) {
    progress.animateTo(1f, tween(SPRAY_MS, easing = FastOutSlowInEasing))
    played = true
  }
  if (played) return
  for ((index, drift) in drops.withIndex()) {
    val rise = with(density) { (60 + 90 * drift).dp.toPx() }
    val across = with(density) { ((index - SPRAY_DROPS / 2) * 14 + drift * 10).dp.toPx() }
    Text(
      spray.emoji,
      Modifier.graphicsLayer {
        translationY = -rise * progress.value
        translationX = across * progress.value
        alpha = 1f - progress.value
        val grow = 0.8f + 0.6f * progress.value
        scaleX = grow
        scaleY = grow
      },
      fontSize = 18.sp,
    )
  }
}

/** Everyone who chose a reaction, by name, in the order they did: a long press on its pill, or its screen reader's action. */
@Composable
fun ChoosersSheet(reaction: LineReaction, writers: Map<String, GroupMemberRow>, nameOf: (String) -> String, onDismiss: () -> Unit) {
  MemberSheet(
    reaction.emoji,
    reaction.userIds.map { id ->
      val writer = writers[id]
      SheetMember(id, nameOf(id), writer?.photoId.orEmpty(), writer?.let { PhotoShelf.place(it.groupId) })
    },
    onDismiss,
  )
}

/** A line's reactions as a screen reader sums them up: each emoji and how many chose it, the reader's own said. */
@Composable
fun reactionWords(reactions: List<LineReaction>, me: String?): String? {
  if (reactions.isEmpty()) return null
  val withMe = stringResource(R.string.chat_reaction_with_me)
  return reactions.joinToString("、") { r -> "${r.emoji}${r.userIds.size}" + if (me in r.userIds) withMe else "" }
}

private val FACE_SIZE = 16.dp

/** How small a pill going shrinks as it fades, as iOS's does. */
private const val LEAVING_SCALE = 0.5f
private const val SPRAY_DROPS = 5
internal const val SPRAY_MS = 900
