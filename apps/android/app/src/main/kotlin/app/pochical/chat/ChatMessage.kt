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
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
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
import androidx.compose.ui.graphics.Shape
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
import androidx.compose.ui.semantics.semantics
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
import app.pochical.v1.LinkPreview
import java.time.LocalDate
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
  /** The line's seq, null for one on its way. */
  val seq: Long?,
  /** How a drag across answers it; null when it is not answered. */
  val swipe: ReplySwipe?,
  /** What a screen reader reads of it. */
  val said: String,
  /** What it shows besides its words, each drawn from here and offering its actions from here (`LinePart`). */
  val parts: List<LinePart> = emptyList(),
  /** Pinned for everyone: a small pin by its time. */
  val pinned: Boolean = false,
) {
  val quote: LineQuote?
    get() = parts.firstNotNullOfOrNull { (it as? QuotePart)?.quote }

  private val reacted: ReactionsPart?
    get() = parts.firstNotNullOfOrNull { it as? ReactionsPart }

  /** Its reactions; none for a line on its way, which takes none yet. */
  val reactions: List<LineReaction>
    get() = reacted?.reactions.orEmpty()

  /** A chat of two: who chose a reaction needs no face. */
  val counted: Boolean
    get() = reacted?.counted == true

  /** Its first link's page. */
  val page: LinkPreview?
    get() = parts.firstNotNullOfOrNull { (it as? PagePart)?.preview }

  /** The days it puts to the vote. */
  val poll: PollLook?
    get() = parts.firstNotNullOfOrNull { (it as? PollPart)?.look }
}

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
  /** A link opened in the system's browser sheet. */
  val openLink: (String) -> Unit,
  /** The days everyone in the group is off (みんな休み) from one day through another, by their shifts. */
  val together: @Composable (from: LocalDate, through: LocalDate) -> Set<LocalDate>,
  /** 行ける on a poll's day, or taken back. */
  val vote: (seq: Long, day: String, on: Boolean) -> Unit,
  /** 日にちを決める or 決め直す: the sheet a poll is settled with. */
  val decide: (seq: Long) -> Unit,
  /** Who can come on a poll's day, by name. */
  val voters: (day: LocalDate, people: List<String>) -> Unit,
  /** The chat's group, whose photos its lines show. */
  val groupId: String,
  /** 送信をやめる: the member's line of photos [opId] stops going up, not sent. */
  val stopSending: (opId: String) -> Unit,
  /** A line's photo, by its place in the line, opened large. */
  val openPhoto: (seq: Long, index: Int) -> Unit,
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
      menu.open(MenuLine(look.key, look.mine, look.waiting != null, items, bar) { LineBody(look, handlers, live = false, onQuote = {}) }, at.unclipped())
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
  // Its menu's items, 返信 first, then what each of its parts offers (spec/chat.md, Screen readers).
  val partLine = PartLine(look.seq, handlers, openMenu = { openMenu() })
  val actions =
    (items.map { item -> CustomAccessibilityAction(item.label) { item.run(); true } } + look.parts.flatMap { it.actions(partLine) })
      // Android holds at most this many on one element; past them, the latest parts' go.
      .take(MOST_ACTIONS)
  val menuLabel = stringResource(R.string.chat_menu)
  Box(
    modifier
      .zIndex(if (handlers.spray?.seq == look.seq && look.seq != null) 1f else 0f)
      .fillMaxWidth()
      .padding(top = (if (look.startsRun) Chat.runGap else Chat.lineGap).dp)
      .then(
        // A poll's days and 行ける are gone through one by one after its line (spec/chat.md, Screen
        // readers); any other line is one element.
        if (look.poll != null) Modifier.semantics { lineSemantics(look.said, actions, menuLabel) { openMenu() } }
        else Modifier.clearAndSetSemantics { lineSemantics(look.said, actions, menuLabel) { openMenu() } }
      )
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
        Box(Modifier.size(FACE).clearAndSetSemantics {}) {
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
            Modifier.padding(start = 4.dp, bottom = 2.dp).clearAndSetSemantics {},
            style = MaterialTheme.typography.labelMedium,
            color = colors.textSecondary,
          )
        }
        Row(verticalAlignment = Alignment.Bottom) {
          val edited = (look.content as? LineContent.Words)?.edited == true
          if (look.mine) TimeRoom(look.time, look.waiting, edited, look.pinned, items, Modifier.padding(end = 4.dp).clearAndSetSemantics {})
          Box(
            Modifier.weight(1f, fill = false)
              .onGloballyPositioned { at ->
                coordinates = at
                if (lifted) menu.bounds = at.unclipped()
              }
              .alpha(if (lifted) 0f else 1f)
              .lineGestures(gestures.takeIf { look.seq != null || look.waiting != null }, look.swipe, drag, { coordinates }, handlers.reducedMotion)
          ) {
            LineBody(look, handlers, onQuote = { look.quote?.let { handlers.jump(it.seq) } })
          }
          if (!look.mine) TimeRoom(look.time, null, edited, look.pinned, items, Modifier.padding(start = 4.dp).clearAndSetSemantics {})
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

/** What the line is drawn as: a poll's card, or a bubble; [live] false for the copy lifted over the menu, on which nothing acts. */
@Composable
private fun LineBody(look: MessageLook, handlers: MessageHandlers, live: Boolean = true, onQuote: () -> Unit) {
  val poll = look.poll
  val photos = look.content as? LineContent.Photos
  when {
    poll != null -> PollCard(poll, handlers, look.seq.takeIf { live }, live)
    photos != null -> PhotoBody(look, photos, handlers, live, onQuote)
    else -> Bubble(look, handlers, onQuote)
  }
}

/**
 * A line of photos, with no bubble (spec/chat.md, Photos): one answering a line sits in a bubble
 * under its quote, a little in from its edge, keeping its own corners and edge. [live] false for the
 * copy lifted over the menu, on which nothing acts.
 */
@Composable
private fun PhotoBody(look: MessageLook, photos: LineContent.Photos, handlers: MessageHandlers, live: Boolean, onQuote: () -> Unit) {
  val waiting = look.waiting
  val line = @Composable {
    PhotoLine(
      photos.photos,
      handlers.groupId,
      waiting,
      onStop = waiting?.takeIf { live }?.let { { handlers.stopSending(it.opId) } },
      onOpen = look.seq?.takeIf { live }?.let { seq -> { index -> handlers.openPhoto(seq, index) } },
    )
  }
  val quote = look.quote
  if (quote == null) {
    // Lit in its own rounded outline as it is gone to, as a bubble is.
    val shape = RoundedCornerShape(Radius.lg)
    return Box(Modifier.litWhenGoneTo(handlers.lit?.takeIf { it.seq == look.seq }, shape, handlers.reducedMotion)) { line() }
  }
  val colors = LocalThemeColors.current
  val shape = remember(look.mine, look.startsRun) { BubbleShape(look.mine, tail = look.startsRun) }
  val ink = if (look.mine) colors.accentOnFill else colors.textPrimary
  Column(
    Modifier.width(IntrinsicSize.Max)
      .background(if (look.mine) colors.accentFill else colors.fillTertiary, shape)
      .litWhenGoneTo(handlers.lit?.takeIf { it.seq == look.seq }, shape, handlers.reducedMotion)
      .padding(top = 8.dp, bottom = PHOTO_INSET, start = PHOTO_INSET, end = PHOTO_INSET)
  ) {
    BubbleQuote(quote, ink, inset = 12.dp - PHOTO_INSET, onOpen = onQuote)
    Spacer(Modifier.height(6.dp))
    line()
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
  val preview = look.page
  Column(
    Modifier.alpha(if (look.waiting != null && !look.waiting.failed) WAITING_ALPHA else 1f)
      .background(if (look.mine) colors.accentFill else colors.fillTertiary, shape)
      .litWhenGoneTo(handlers.lit?.takeIf { it.seq == look.seq }, shape, handlers.reducedMotion)
      // A page's picture is cut to the bubble's outline.
      .then(if (preview != null) Modifier.clip(shape) else Modifier)
      .padding(top = 8.dp, bottom = if (preview != null) 0.dp else 8.dp)
      // As wide as the widest of the quote and the words, the quote's rule across it; a line with a
      // link's page as wide as the page is drawn.
      .then(
        when {
          preview == null -> Modifier.width(IntrinsicSize.Max)
          LocalDensity.current.fontScale >= ACCESSIBILITY_SCALE -> Modifier.fillMaxWidth()
          else -> Modifier.width(PREVIEW_WIDTH)
        }
      )
  ) {
    look.quote?.let { BubbleQuote(it, ink, inset = 12.dp, onOpen = onQuote) }
    Text(
      messageText(look.content, look.mine, handlers.nameOf),
      Modifier.padding(horizontal = 12.dp),
      style = MaterialTheme.typography.bodyLarge,
      color = ink,
    )
    if (preview != null) {
      Spacer(Modifier.height(8.dp))
      PreviewCard(preview, ink) { handlers.openLink(preview.url) }
    }
  }
}

/**
 * Lit when its line is gone to (a quote, a pin): the accent over it inside its [shape]'s outline,
 * coming and going once over `chatRules.jumpFlashMs` with a band of shine sweeping across, still
 * with motion reduced (spec/chat.md, Pins). A bubble's and a card's alike.
 */
@Composable
fun Modifier.litWhenGoneTo(lit: Lit?, shape: Shape, reducedMotion: Boolean): Modifier {
  val light = remember { Animatable(0f) }
  val shine = remember { Animatable(0f) }
  LaunchedEffect(lit) {
    if (lit == null) return@LaunchedEffect
    if (reducedMotion) {
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
  val accent = LocalThemeColors.current.accentDefault
  return drawWithContent {
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
  /** The seqs of the chat's pinned lines. */
  pins: Set<Long>,
  quoteOf: @Composable (Long) -> LineQuote,
  nameOf: (String) -> String,
): MessageLook? {
  val mine = stringResource(R.string.chat_me)
  val edited = stringResource(R.string.chat_edited)
  val pinnedWords = stringResource(R.string.chat_pinned_line)
  val sending = stringResource(R.string.chat_sending)
  val notSent = stringResource(R.string.chat_not_sent)
  return when (item) {
    is ChatItem.Line -> {
      val line = item.line
      if (line.content is LineContent.Notice || line.content == LineContent.Unsent || line.content == LineContent.Hidden) return null
      val own = line.authorId == me
      val pinned = line.seq in pins
      val quote = line.replyTo?.let { quoteOf(it) }
      val replying = quote?.let { stringResource(R.string.chat_reply_to_said, it.writer.orEmpty(), it.words) }
      val words = saidWords(line.content, nameOf)
      val said =
        listOfNotNull(
            if (own) mine else nameOf(line.authorId),
            replying,
            words,
            (line.content as? LineContent.Words)?.preview?.title,
            clock(line.sentAtMs),
            pinnedWords.takeIf { pinned },
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
        seq = line.seq,
        swipe = if (own) ReplySwipe.Leftward else ReplySwipe.Rightward,
        said = said,
        parts = partsOf(line.content, quote, ReactionsPart(line.reactions, counted = direct), poll = pollLook(line.content, own || writers[line.authorId]?.left == true, waiting = false)),
        pinned = pinned,
      )
    }
    is ChatItem.Waiting -> {
      val line = item.line
      val quote = line.replyTo?.let { quoteOf(it) }
      val replying = quote?.let { stringResource(R.string.chat_reply_to_said, it.writer.orEmpty(), it.words) }
      val page = (line.content as? LineContent.Words)?.preview?.title
      val said = listOfNotNull(mine, replying, saidWords(line.content, nameOf), page, if (line.failed) notSent else sending).joinToString("、")
      MessageLook(item.key, true, line.content, item.startsRun, null, false, null, line, null, null, said, partsOf(line.content, quote, reactions = null, poll = pollLook(line.content, canDecide = true, waiting = !line.failed), waiting = line))
    }
    else -> null
  }
}

/** What a screen reader reads of a line's content: its words, or its photos as how many (3枚の写真, spec/chat.md, Albums). */
@Composable
private fun saidWords(content: LineContent, nameOf: (String) -> String): String =
  when {
    content !is LineContent.Photos -> lineWords(content, nameOf)
    content.photos.size > 1 -> stringResource(R.string.chat_photo_count, content.photos.size)
    else -> stringResource(R.string.chat_photo)
  }

/** A line as a screen reader has it: what it reads, its actions, and its menu opened by activating it, as the long press opens it. */
private fun androidx.compose.ui.semantics.SemanticsPropertyReceiver.lineSemantics(
  said: String,
  actions: List<CustomAccessibilityAction>,
  menuLabel: String,
  openMenu: () -> Unit,
) {
  contentDescription = said
  customActions = actions
  onClick(menuLabel) {
    openMenu()
    true
  }
}

/** The most custom actions Android takes on one element (its accessibility node's limit). */
private const val MOST_ACTIONS = 32

/** Where the bubble is in the window, whole: the list's clip would cut one scrolled partly out of sight. */
private fun LayoutCoordinates.unclipped(): Rect = Rect(positionInWindow(), size.toSize())

/**
 * What a line shows besides its words, in the order a screen reader offers their actions: its
 * reactions (none on a line on its way), the line it answers, the links of its words and its page.
 */
private fun partsOf(content: LineContent, quote: LineQuote?, reactions: ReactionsPart?, poll: PollPart?, waiting: WaitingLine? = null): List<LinePart> {
  val words = content as? LineContent.Words
  val links = words?.let { textParts(it.text).mapNotNull { part -> part.url } }.orEmpty()
  val photos = (content as? LineContent.Photos)?.let { PhotosPart(it.photos.size, waiting) }
  return listOfNotNull(
    photos,
    poll,
    reactions,
    quote?.let(::QuotePart),
    LinksPart(links).takeIf { links.isNotEmpty() },
    words?.preview?.let { PagePart(it, inWords = it.url in links) },
  )
}

/** A poll's part, for a line of days put to the vote; [canDecide] for its writer, or anyone once they left. */
private fun pollLook(content: LineContent, canDecide: Boolean, waiting: Boolean): PollPart? {
  val poll = content as? LineContent.Poll ?: return null
  return PollPart(PollLook(poll.poll, canDecide, waiting))
}

/** How far in from its bubble's edge a photo answering a line sits. */
private val PHOTO_INSET = 4.dp

/** How wide a line with a link's page is (spec/chat.md, Albums: as wide as an album). */
private val PREVIEW_WIDTH = 240.dp

/** The text size from which a line takes nearly the screen's width (spec/chat.md, Text size and contrast). */
private const val ACCESSIBILITY_SCALE = 1.3f

/** How dim a line on its way is, as it would be on the chat's ground. */
private const val WAITING_ALPHA = 0.6f

/** How strong the accent lights a line gone to. */
private const val LIGHT = 0.35f

/** Half the shine's band, in pixels across. */
private const val BAND = 80f
