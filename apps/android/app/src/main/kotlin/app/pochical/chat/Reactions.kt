package app.pochical.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ListItem
import androidx.compose.material3.ListItemDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
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
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.groups.MemberAvatar
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
 * Those there as the line is drawn are simply there; with animations off each just shows.
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
  // The emoji there as the line was drawn: only those coming after pop in.
  val there = remember { reactions.map { it.emoji }.toSet() }
  FlowRow(
    modifier.padding(top = 4.dp),
    horizontalArrangement = Arrangement.spacedBy(4.dp, if (mine) Alignment.End else Alignment.Start),
    verticalArrangement = Arrangement.spacedBy(4.dp),
  ) {
    for (reaction in reactions) {
      val own = me != null && me in reaction.userIds
      ReactionPill(
        reaction,
        own,
        writers,
        counted,
        pops = reaction.emoji !in there && !reducedMotion,
        spray = spray?.takeIf { it.emoji == reaction.emoji && !reducedMotion },
        onTap = { onToggle(reaction.emoji, !own) },
        onLongPress = { onChoosers(reaction) },
      )
    }
  }
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
  pops: Boolean,
  spray: Spray?,
  onTap: () -> Unit,
  onLongPress: () -> Unit,
) {
  val colors = LocalThemeColors.current
  val shape = RoundedCornerShape(50)
  val scale = remember { Animatable(if (pops) 0f else 1f) }
  LaunchedEffect(Unit) { if (pops) scale.animateTo(1f, spring(dampingRatio = Spring.DampingRatioMediumBouncy)) }
  Box(contentAlignment = Alignment.Center) {
    Row(
      Modifier.graphicsLayer {
        scaleX = scale.value
        scaleY = scale.value
      }
        .background(if (own) colors.accentContainer else MaterialTheme.colorScheme.surfaceContainerHigh, shape)
        .border(1.dp, if (own) colors.accentDefault else Color.Transparent, shape)
        .combinedClickable(onClick = onTap, onLongClick = onLongPress)
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
            MemberAvatar(writer?.shownName().orEmpty(), writer?.photoId.orEmpty(), writer?.let { PhotoShelf.Group(it.groupId) }, FACE_SIZE)
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
  LaunchedEffect(spray) { progress.animateTo(1f, tween(SPRAY_MS, easing = FastOutSlowInEasing)) }
  if (progress.value >= 1f) return
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

/** Everyone who chose a reaction, by name, in the order they did: a long press on its pill. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChoosersSheet(reaction: LineReaction, writers: Map<String, GroupMemberRow>, nameOf: (String) -> String, onDismiss: () -> Unit) {
  ModalBottomSheet(onDismissRequest = onDismiss) {
    Column(Modifier.navigationBarsPadding().padding(bottom = 16.dp)) {
      Text(
        reaction.emoji,
        Modifier.padding(horizontal = 24.dp, vertical = 8.dp).semantics { heading() },
        style = MaterialTheme.typography.headlineSmall,
      )
      for (id in reaction.userIds) {
        val writer = writers[id]
        ListItem(
          headlineContent = { Text(nameOf(id), maxLines = 1, overflow = TextOverflow.Ellipsis) },
          leadingContent = { MemberAvatar(nameOf(id), writer?.photoId.orEmpty(), writer?.let { PhotoShelf.Group(it.groupId) }, 40.dp) },
          colors = ListItemDefaults.colors(containerColor = Color.Transparent),
        )
      }
    }
  }
}

/** A line's reactions as a screen reader sums them up: each emoji and how many chose it, the reader's own said. */
@Composable
fun reactionWords(reactions: List<LineReaction>, me: String?): String? {
  if (reactions.isEmpty()) return null
  val withMe = stringResource(R.string.chat_reaction_with_me)
  return reactions.joinToString("、") { r -> "${r.emoji}${r.userIds.size}" + if (me in r.userIds) withMe else "" }
}

private val FACE_SIZE = 16.dp
private const val SPRAY_DROPS = 5
private const val SPRAY_MS = 900
