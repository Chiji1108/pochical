package app.pochical.chat

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.positionInWindow
import androidx.compose.ui.unit.toSize
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.CustomAccessibilityAction
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.customActions
import androidx.compose.ui.semantics.onClick
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.zIndex
import app.pochical.LocalThemeColors
import app.pochical.R
import app.pochical.design.Chat
import app.pochical.design.Radius
import app.pochical.groups.MemberAvatar
import app.pochical.kit.GroupMemberRow
import app.pochical.kit.LineContent
import app.pochical.kit.LineReaction
import app.pochical.kit.PhotoShelf
import app.pochical.kit.WaitingLine
import app.pochical.kit.textParts
import kotlin.math.abs
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

// A message (spec/chat.md, In a message; Replies; Opening a message's menu): its bubble, the quote of
// the line it answers inside it, its writer's face and name over a run, its time, 編集済み, and what
// a finger and a screen reader do on it.

/** The face's size beside others' lines. */
internal val FACE = 32.dp

/** The room a bubble's tail reaches past its frame, kept beside every line of a run (`BubbleShape`). */
internal val TAIL = Radius.lg * BubbleShape.TAIL_REACH

/** The room kept on the side away from the writer, so a bubble never runs the screen's width. */
private val AWAY = 40.dp

/** A message as its row draws it. */
class MessageLook(
  /** Its key in the chat's list, the menu's line by it. */
  val key: String,
  val mine: Boolean,
  val content: LineContent,
  val startsRun: Boolean,
  /** Others' writer, by their face and name over a run. */
  val writer: GroupMemberRow?,
  val showsName: Boolean,
  /** Its time, null when left to the next line. */
  val time: String?,
  /** One of the member's lines on its way, its clock or ! by it. */
  val waiting: WaitingLine?,
  val quote: LineQuote?,
  /** The line's seq, null for one on its way. */
  val seq: Long?,
  /** How a drag across answers it; null when it is not answered. */
  val swipe: ReplySwipe?,
  /** What a screen reader reads of it. */
  val said: String,
  /** Its reactions, each emoji with who chose it; none for a line on its way, which takes none yet. */
  val reactions: List<LineReaction> = emptyList(),
  /** A chat of two: who chose a reaction needs no face. */
  val counted: Boolean = false,
)

/** A line gone to, lit once there: [time] tells one going to the same line again. */
data class Lit(val seq: Long, val time: Long)

/** What the chat's messages do, the same for each. */
class MessageHandlers(
  val menu: LineMenuState,
  /** Its menu's items, as its long press opens them. */
  val items: (MessageLook) -> List<LineMenuItem>,
  val reply: (Long) -> Unit,
  val jump: (Long) -> Unit,
  val nameOf: (String) -> String,
  val notKept: () -> Unit,
  val reducedMotion: Boolean,
  /** The line lit as it is gone to, each time it is. */
  val lit: Lit?,
  val me: String?,
  val writers: Map<String, GroupMemberRow>,
  /** The member's reaction on a line put on or taken back. */
  val react: (seq: Long, emoji: String, on: Boolean) -> Unit,
  /** + in the reactions' bar: any other emoji, from the system's picker. */
  val moreReactions: (seq: Long) -> Unit,
  /** A long press on a pill: everyone who chose it. */
  val choosers: (LineReaction) -> Unit,
  /** The member's own reaction just put on, spraying from its pill. */
  val spray: Spray?,
)

/**
 * A message: others' on the start with their face and name over a run, one's own on the end. Its
 * time sits beside it, keeping its room when left to the next line, 編集済み over it, and a line on
 * its way shows its clock there, or a red ! once not sent. While its menu is open the bubble is
 * lifted over the chat and its place here stands empty.
 */
@Composable
fun Message(look: MessageLook, handlers: MessageHandlers, modifier: Modifier = Modifier) {
  val colors = LocalThemeColors.current
  val drag = remember { LineDrag() }
  var coordinates by remember { mutableStateOf<LayoutCoordinates?>(null) }
  val menu = handlers.menu
  val haptics = LocalHapticFeedback.current
  val swipeWidth = with(LocalDensity.current) { Chat.replySwipe.dp.toPx() }
  val lifted = menu.open?.key == look.key
  val openMenu = {
    coordinates?.let { at ->
      val items = handlers.items(look)
      val seq = look.seq
      val bar =
        seq?.let {
          val chosen = look.reactions.filter { handlers.me in it.userIds }.map { it.emoji }.toSet()
          ReactionBar(chosen, onReact = { emoji -> handlers.react(seq, emoji, emoji !in chosen) }, onMore = { handlers.moreReactions(seq) })
        }
      menu.open(MenuLine(look.key, look.mine, look.waiting != null, items, bar) { Bubble(look, handlers, onQuote = {}) }, at.unclipped())
    }
  }
  val gestures =
    LineGestureHandler(
      onLongPress = { openMenu() },
      onSlide = { at -> menu.slide(at, haptics) },
      onLift = { at, slid -> menu.lift(at, slid) },
      onReply = { look.seq?.let(handlers.reply) },
    )
  val items = handlers.items(look)
  // Its menu's items, each reaction on it put on or taken off, and 返信元を表示, as its actions.
  val reactionLabel = stringResource(R.string.chat_reaction)
  val reactOn = stringResource(R.string.chat_reaction_on)
  val reactOff = stringResource(R.string.chat_reaction_off)
  val actions =
    items.map { item -> CustomAccessibilityAction(item.label) { item.run(); true } } +
      look.reactions.mapNotNull { reaction ->
        val seq = look.seq ?: return@mapNotNull null
        val own = handlers.me in reaction.userIds
        CustomAccessibilityAction((if (own) reactOff else reactOn).format(reaction.emoji)) { handlers.react(seq, reaction.emoji, !own); true }
      } +
      listOfNotNull(
        // リアクション: the reactions and menu over the chat, for the screen reader to go into.
        look.seq?.let { CustomAccessibilityAction(reactionLabel) { openMenu(); true } },
        look.quote?.let { quote -> CustomAccessibilityAction(stringResource(R.string.chat_show_quoted)) { handlers.jump(quote.seq); true } },
      )
  val menuLabel = stringResource(R.string.chat_menu)
  Box(
    modifier
      .zIndex(if (handlers.spray?.seq == look.seq && look.seq != null) 1f else 0f)
      .fillMaxWidth()
      .padding(top = (if (look.startsRun) Chat.runGap else Chat.lineGap).dp)
      .clearAndSetSemantics {
      contentDescription = look.said
      customActions = actions
      // Activating it opens its menu, as the long press does.
      onClick(menuLabel) {
        openMenu()
        true
      }
    }
  ) {
    // The reply arrow, in the room the line leaves as it is dragged.
    val pulled = (abs(drag.offset.value) / swipeWidth).coerceIn(0f, 1f)
    if (pulled > 0f) {
      Icon(
        painterResource(R.drawable.ic_reply),
        contentDescription = null,
        Modifier.align(if (look.mine) Alignment.CenterEnd else Alignment.CenterStart)
          .padding(horizontal = 12.dp)
          .size(24.dp)
          .graphicsLayer {
            alpha = pulled
            scaleX = pulled
            scaleY = pulled
          },
        tint = colors.textSecondary,
      )
    }
    Row(
      Modifier.fillMaxWidth().graphicsLayer { translationX = drag.offset.value },
      horizontalArrangement = if (look.mine) Arrangement.End else Arrangement.Start,
    ) {
      if (!look.mine) {
        Box(Modifier.size(FACE)) {
          val writer = look.writer
          if (look.startsRun && writer != null) MemberAvatar(writer.shownName(), writer.photoId, PhotoShelf.Group(writer.groupId), FACE)
        }
        Spacer(Modifier.width(TAIL))
      } else {
        Spacer(Modifier.width(AWAY))
      }
      Column(Modifier.weight(1f, fill = false), horizontalAlignment = if (look.mine) Alignment.End else Alignment.Start) {
        val writer = look.writer
        if (!look.mine && look.startsRun && look.showsName && writer != null) {
          Text(
            writer.shownName(),
            Modifier.padding(start = 4.dp, bottom = 2.dp),
            style = MaterialTheme.typography.labelMedium,
            color = colors.textSecondary,
          )
        }
        Row(verticalAlignment = Alignment.Bottom) {
          val edited = (look.content as? LineContent.Words)?.edited == true
          if (look.mine) TimeRoom(look.time, look.waiting, edited, items, Modifier.padding(end = 4.dp))
          Box(
            Modifier.weight(1f, fill = false)
              .onGloballyPositioned { at ->
                coordinates = at
                if (lifted) menu.bounds = at.unclipped()
              }
              .alpha(if (lifted) 0f else 1f)
              .lineGestures(gestures.takeIf { look.seq != null || look.waiting != null }, look.swipe, drag, { coordinates }, handlers.reducedMotion)
          ) {
            Bubble(look, handlers, onQuote = { look.quote?.let { handlers.jump(it.seq) } })
          }
          if (!look.mine) TimeRoom(look.time, null, edited, items, Modifier.padding(start = 4.dp))
        }
        if (look.waiting?.failed == true) {
          Text(stringResource(R.string.chat_not_sent), style = MaterialTheme.typography.labelSmall, color = colors.dangerDefault)
        }
        val seq = look.seq
        // There from the line's first drawing, so its first reaction coming pops in too.
        if (seq != null) {
          ReactionRow(
            look.reactions,
            handlers.me,
            handlers.writers,
            look.counted,
            spray = handlers.spray?.takeIf { it.seq == seq },
            reducedMotion = handlers.reducedMotion,
            mine = look.mine,
            onToggle = { emoji, on -> handlers.react(seq, emoji, on) },
            onChoosers = handlers.choosers,
          )
        }
      }
      if (look.mine) Spacer(Modifier.width(TAIL)) else Spacer(Modifier.width(AWAY))
    }
  }
}

/**
 * The bubble and what it holds: the quote of the line it answers over a thin rule, then its words,
 * mentions in the name's weight (in the accent in others'). Lit when the line is gone to: the accent
 * over it inside its outline, coming and going once over `chatRules.jumpFlashMs` with a band of
 * shine sweeping across, still with motion reduced.
 */
@Composable
fun Bubble(look: MessageLook, handlers: MessageHandlers, onQuote: () -> Unit) {
  val colors = LocalThemeColors.current
  val shape = remember(look.mine, look.startsRun) { BubbleShape(look.mine, tail = look.startsRun) }
  val ink = if (look.mine) colors.accentOnFill else colors.textPrimary
  val light = remember { Animatable(0f) }
  val shine = remember { Animatable(0f) }
  val lit = handlers.lit?.takeIf { it.seq == look.seq }
  LaunchedEffect(lit) {
    if (lit == null) return@LaunchedEffect
    if (handlers.reducedMotion) {
      light.snapTo(1f)
      delay(Chat.jumpFlashMs.toLong())
      light.snapTo(0f)
      return@LaunchedEffect
    }
    val half = Chat.jumpFlashMs / 2
    shine.snapTo(0f)
    coroutineScope {
      launch { shine.animateTo(1f, tween(Chat.jumpFlashMs, easing = LinearEasing)) }
      light.animateTo(1f, tween(half))
      light.animateTo(0f, tween(half))
    }
  }
  val accent = colors.accentDefault
  Column(
    Modifier.alpha(if (look.waiting != null && !look.waiting.failed) WAITING_ALPHA else 1f)
      .background(if (look.mine) colors.accentFill else colors.fillTertiary, shape)
      .drawWithContent {
        drawContent()
        if (light.value > 0f) {
          val outline = shape.createOutline(size, layoutDirection, this)
          drawOutline(outline, accent.copy(alpha = LIGHT * light.value))
          val x = size.width * (shine.value * 1.6f - 0.3f)
          drawOutline(
            outline,
            Brush.linearGradient(
              listOf(Color.Transparent, Color.White.copy(alpha = 0.25f * light.value), Color.Transparent),
              start = Offset(x - BAND, 0f),
              end = Offset(x + BAND, size.height),
            ),
          )
        }
      }
      .padding(vertical = 8.dp)
      // As wide as the widest of the quote and the words, the quote's rule across it.
      .width(IntrinsicSize.Max)
  ) {
    look.quote?.let { BubbleQuote(it, ink, inset = 12.dp, onOpen = onQuote) }
    Text(
      messageText(look.content, look.mine, handlers.nameOf),
      Modifier.padding(horizontal = 12.dp),
      style = MaterialTheme.typography.bodyLarge,
      color = ink,
    )
  }
}

/** A message's words: a mention as @ and the name, in its weight, in the accent in others' messages. */
@Composable
private fun messageText(content: LineContent, mine: Boolean, nameOf: (String) -> String): AnnotatedString {
  val accent = LocalThemeColors.current.accentDefault
  val words = content as? LineContent.Words ?: return AnnotatedString(lineWords(content, nameOf))
  return remember(words.text, mine, accent, nameOf) {
    buildAnnotatedString {
      for (part in textParts(words.text)) {
        val id = part.mention
        if (id == null) append(part.text)
        else withStyle(SpanStyle(fontWeight = FontWeight.SemiBold, color = if (mine) Color.Unspecified else accent)) { append("@${nameOf(id)}") }
      }
    }
  }
}

/**
 * The message [item] draws, null for what is not one (spec/chat.md, In a message; Screen readers):
 * read as who wrote it, the line it answers, its words, its time and how it stands. Answered by a
 * drag across when its menu has 返信: not one on its way.
 */
@Composable
fun messageLook(
  item: ChatItem,
  me: String?,
  writers: Map<String, GroupMemberRow>,
  direct: Boolean,
  quoteOf: @Composable (Long) -> LineQuote,
  nameOf: (String) -> String,
): MessageLook? {
  val mine = stringResource(R.string.chat_me)
  val edited = stringResource(R.string.chat_edited)
  val sending = stringResource(R.string.chat_sending)
  val notSent = stringResource(R.string.chat_not_sent)
  return when (item) {
    is ChatItem.Line -> {
      val line = item.line
      if (line.content is LineContent.Notice || line.content == LineContent.Unsent || line.content == LineContent.Hidden) return null
      val own = line.authorId == me
      val quote = line.replyTo?.let { quoteOf(it) }
      val replying = quote?.let { stringResource(R.string.chat_reply_to_said, it.writer.orEmpty(), it.words) }
      val words = lineWords(line.content, nameOf)
      val said =
        listOfNotNull(
            if (own) mine else nameOf(line.authorId),
            replying,
            words,
            clock(line.sentAtMs),
            edited.takeIf { (line.content as? LineContent.Words)?.edited == true },
            reactionWords(line.reactions, me),
          )
          .joinToString("、")
      MessageLook(
        key = item.key,
        mine = own,
        content = line.content,
        startsRun = item.startsRun,
        writer = writers[line.authorId].takeIf { !own },
        showsName = !direct,
        time = clock(line.sentAtMs).takeIf { item.showsTime },
        waiting = null,
        quote = quote,
        seq = line.seq,
        swipe = if (own) ReplySwipe.Leftward else ReplySwipe.Rightward,
        said = said,
        reactions = line.reactions,
        counted = direct,
      )
    }
    is ChatItem.Waiting -> {
      val line = item.line
      val quote = line.replyTo?.let { quoteOf(it) }
      val replying = quote?.let { stringResource(R.string.chat_reply_to_said, it.writer.orEmpty(), it.words) }
      val said = listOfNotNull(mine, replying, lineWords(line.content, nameOf), if (line.failed) notSent else sending).joinToString("、")
      MessageLook(item.key, true, line.content, item.startsRun, null, false, null, line, quote, null, null, said)
    }
    else -> null
  }
}

/** Where the bubble is in the window, whole: the list's clip would cut one scrolled partly out of sight. */
private fun LayoutCoordinates.unclipped(): Rect = Rect(positionInWindow(), size.toSize())

/** How dim a line on its way is, as it would be on the chat's ground. */
private const val WAITING_ALPHA = 0.6f

/** How strong the accent lights a line gone to. */
private const val LIGHT = 0.35f

/** Half the shine's band, in pixels across. */
private const val BAND = 80f
