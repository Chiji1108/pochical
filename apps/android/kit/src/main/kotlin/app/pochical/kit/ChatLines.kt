package app.pochical.kit

import app.pochical.design.Chat
import app.pochical.v1.ChatContent
import app.pochical.v1.ChatNotice
import app.pochical.v1.ChatPhoto
import app.pochical.v1.ChatPoll
import app.pochical.v1.ChatVotes
import app.pochical.v1.chatVotes
import app.pochical.v1.ChatSendContent
import app.pochical.v1.LinkPreview
import app.pochical.v1.ChatLine as WireLine

// What a chat's lines are to the screens (spec/chat.md, What a line is), and the rules every
// platform writes again, pinned by spec/vectors/chat.json.

/** The group's own chat, 全体チャット. */
const val GROUP_THREAD = "group"

/**
 * Two members' one-to-one chat: "direct:" and their ids in order, so either of them names it
 * alike (spec/vectors/chat.json, directThread). Every id is ASCII, so Kotlin's order of strings,
 * by UTF-16 units, is the spec's.
 */
fun directThread(a: String, b: String): String = if (a < b) "direct:$a:$b" else "direct:$b:$a"

/** The other member of a one-to-one chat [me] is in; null for the group chat or a chat not theirs. */
fun otherIn(threadId: String, me: String): String? {
  val parts = threadId.split(":")
  if (parts.size != 3 || parts[0] != "direct" || me !in parts.drop(1)) return null
  return if (parts[1] == me) parts[2] else parts[1]
}

/** What a line is: one thing to its reader, so one kind of it. */
sealed interface LineContent {
  val kind: LineKind

  /** 1 to `textLimits.chatMessage` characters, 編集済み once changed, and its first link's page. */
  data class Words(val text: String, val edited: Boolean = false, val preview: LinkPreview? = null) : LineContent {
    override val kind
      get() = LineKind.Words
  }

  /** The photos sent at once, in the order sent (spec/chat.md, Albums). */
  data class Photos(val photos: List<ChatPhoto>) : LineContent {
    override val kind
      get() = LineKind.Photos
  }

  /** Days shared with everyone's shifts, "YYYY-MM-DD" in order. */
  data class Days(val days: List<String>) : LineContent {
    override val kind
      get() = LineKind.Days
  }

  /** Days put to the vote (spec/chat.md, Polls). */
  data class Poll(val poll: ChatPoll) : LineContent {
    override val kind
      get() = LineKind.Poll
  }

  /** A line from the app in 全体チャット (spec/chat.md, Notices). */
  data class Notice(val notice: ChatNotice) : LineContent {
    override val kind
      get() = LineKind.Notice
  }

  /** Taken back by its writer (送信取消): nothing of it is left. */
  data object Unsent : LineContent {
    override val kind
      get() = LineKind.Unsent
  }

  /**
   * Sent in a one-to-one chat by someone the reader had blocked, or of a kind this app does not
   * know (from an app newer than itself): shown as nothing.
   */
  data object Hidden : LineContent {
    override val kind
      get() = LineKind.Hidden
  }

  companion object {
    /** The content as the group sent it; none, or a kind or notice this app does not know, is hidden. */
    fun of(wire: ChatContent): LineContent =
      when (wire.kindCase) {
        ChatContent.KindCase.WORDS ->
          Words(wire.words.text, wire.words.edited, if (wire.words.hasPreview()) wire.words.preview else null)
        ChatContent.KindCase.PHOTOS -> Photos(wire.photos.photosList)
        ChatContent.KindCase.DAYS -> Days(wire.days.daysList)
        ChatContent.KindCase.POLL -> Poll(wire.poll)
        ChatContent.KindCase.NOTICE ->
          when (wire.notice.kind) {
            ChatNotice.Kind.KIND_UNSPECIFIED,
            ChatNotice.Kind.UNRECOGNIZED,
            null -> Hidden
            else -> Notice(wire.notice)
          }
        ChatContent.KindCase.UNSENT -> Unsent
        else -> Hidden
      }

    /** The line a send makes, as the group will hold it: its words not changed yet, its poll open. */
    fun of(send: ChatSendContent): LineContent =
      when (send.kindCase) {
        ChatSendContent.KindCase.WORDS ->
          Words(send.words.text, preview = if (send.words.hasPreview()) send.words.preview else null)
        ChatSendContent.KindCase.PHOTOS -> Photos(send.photos.photosList)
        ChatSendContent.KindCase.DAYS -> Days(send.days.daysList)
        ChatSendContent.KindCase.POLL -> Poll(ChatPoll.newBuilder().addAllDays(send.poll.daysList).build())
        else -> Hidden
      }
  }
}

/** A line's kind, as the device keeps it beside the line to count lines by. */
enum class LineKind(val key: String) {
  Words("words"),
  Photos("photos"),
  Days("days"),
  Poll("poll"),
  Notice("notice"),
  Unsent("unsent"),
  Hidden("hidden"),
}

/** Whose a line is, as every count of unread lines and ここから新着 go by (spec/vectors/chat.json, writer). */
enum class LineWriter {
  Others,
  Me,
  /** The app's notices, and a line never delivered to the reader: neither theirs nor others' to count. */
  App,
}

/** Whose a line of [kind] by [authorId] is to [me]. */
fun writerOf(kind: LineKind, authorId: String, me: String): LineWriter =
  when (kind) {
    LineKind.Notice,
    LineKind.Hidden -> LineWriter.App
    else -> if (authorId == me) LineWriter.Me else LineWriter.Others
  }

/** One emoji on a line and the members who chose it, in the order they did. */
data class LineReaction(val emoji: String, val userIds: List<String>)

/**
 * The reactions with [userId]'s [emoji] put on ([on]) or taken off, as the group takes it: a new
 * emoji goes last, a member choosing one goes last among its choosers, one they hold already
 * changes nothing, and one nobody holds any more goes (spec/vectors/chat.json, reactions).
 */
fun List<LineReaction>.toggling(emoji: String, userId: String, on: Boolean): List<LineReaction> {
  if (any { it.emoji == emoji && userId in it.userIds } == on) return this
  val reactions = map { if (it.emoji == emoji) it.copy(userIds = it.userIds - userId + listOfNotNull(userId.takeIf { on })) else it }
  val added = if (on && none { it.emoji == emoji }) listOf(LineReaction(emoji, listOf(userId))) else emptyList()
  return (reactions + added).filter { it.userIds.isNotEmpty() }
}

/** A line of a chat as the group holds it. */
data class ChatLine(
  val threadId: String,
  val seq: Long,
  val authorId: String,
  /** When the group took it, in ms since the epoch. */
  val sentAtMs: Long,
  /** The sending edit's op_id. */
  val opId: String,
  val content: LineContent,
  /** Each emoji on the line, in the order first chosen. */
  val reactions: List<LineReaction> = emptyList(),
  /** Pinned for everyone: the group's cursor when last pinned; 0 when not. */
  val pinnedOrder: Long = 0,
  /** The line it answers (返信), by its seq in the same chat. */
  val replyTo: Long? = null,
) {
  fun writer(me: String): LineWriter = writerOf(content.kind, authorId, me)

  companion object {
    fun of(wire: WireLine): ChatLine =
      ChatLine(
        threadId = wire.threadId,
        seq = wire.seq,
        authorId = wire.authorId,
        sentAtMs = wire.sentAtMs,
        opId = wire.opId,
        content = LineContent.of(wire.content),
        reactions = wire.reactionsList.map { LineReaction(it.emoji, it.userIdsList) },
        pinnedOrder = wire.pinnedOrder,
        replyTo = wire.replyTo.takeIf { it != 0L },
      )
  }
}

/** A line of the member's not yet taken by the group (spec/chat.md, Lines on their way). */
data class WaitingLine(
  val opId: String,
  /** When it was written, or sent again, by the server's time. */
  val madeAtMs: Long,
  /** The line it sends, as the group will hold it. */
  val content: LineContent,
  /** The line it answers (返信), by its seq. */
  val replyTo: Long? = null,
  /** Not sent (the group refused it, or it waited too long): to send again or delete. */
  val failed: Boolean = false,
  /** A line of photos all up, being sent: × (送信をやめる) no longer stops it. */
  val sending: Boolean = false,
)

/**
 * The first line a chat lays out as it opens, from its [latest] line and the reader's [read] mark
 * (null for no reader): its latest page, back to the first unread line when that is earlier, at
 * most `chatRules.openMax` lines (spec/vectors/chat.json, openingFrom).
 */
fun openingFrom(latest: Long, read: Long?): Long {
  val page = latest - Chat.pageSize + 1
  val unread = (read ?: latest) + 1
  return maxOf(latest - Chat.openMax + 1, minOf(page, unread), 1)
}

/**
 * The `before_seq` asking the page straight after a run of lines ending at [through]: as a chat's
 * seqs run without a gap on the server, the page before it holds the lines after [through], or
 * near the latest the latest page, which reaches them too (spec/vectors/chat.json, pageAfter).
 */
fun pageAfter(through: Long): Long = through + Chat.pageSize + 1

/**
 * The line a chat opens on under ここから新着, by its index in [writers]: the first of the last
 * [unread] lines others wrote, the app's own lines and the reader's not counted; null with nothing
 * unread (spec/vectors/chat.json, firstUnread).
 */
fun firstUnread(writers: List<LineWriter>, unread: Int): Int? {
  if (unread <= 0) return null
  var left = unread
  for (index in writers.indices.reversed()) {
    if (writers[index] != LineWriter.Others) continue
    left -= 1
    if (left == 0) return index
  }
  return writers.indexOf(LineWriter.Others).takeIf { it >= 0 }
}

/**
 * The first of the lines come in while the chat is open that it stops at under ここから新着 rather
 * than going past: after both the [latest] line it held and the reader's [read] mark, the first
 * others wrote; its seq, null for none (spec/vectors/chat.json, firstComing).
 */
fun firstComing(lines: List<Pair<Long, LineWriter>>, latest: Long, read: Long): Long? {
  val from = maxOf(latest, read)
  return lines.firstOrNull { (seq, writer) -> seq > from && writer == LineWriter.Others }?.first
}

/**
 * The reader's read mark as the chat's lines show: on to the latest of those whose foot is on the
 * screen ([shown]), never back, as a line once on screen stays read (spec/vectors/chat.json, readTo).
 */
fun readTo(shown: Collection<Long>, read: Long): Long = maxOf(read, shown.maxOrNull() ?: read)

/** How many of others' lines are unread past the [read] mark, what ↓ counts (spec/vectors/chat.json, readTo). */
fun unreadCount(lines: List<Pair<Long, LineWriter>>, read: Long): Int =
  lines.count { (seq, writer) -> seq > read && writer == LineWriter.Others }

/**
 * A poll's votes with [userId] coming on [day] ([on]) or taking it back: the member goes last among
 * who can come that day, a vote they have already changes nothing, and the days stay in the poll's [order], one nobody can come on left out
 * (spec/vectors/chat.json, votes).
 */
fun voting(votes: List<ChatVotes>, day: String, userId: String, on: Boolean, order: List<String>): List<ChatVotes> {
  // A vote the member has already, or one they do not have taken back, changes nothing.
  if (votes.any { it.day == day && userId in it.userIdsList } == on) return votes
  val byDay = votes.associate { it.day to it.userIdsList }.toMutableMap()
  byDay[day] = byDay[day].orEmpty() - userId + listOfNotNull(userId.takeIf { on })
  return order.mapNotNull { d -> byDay[d]?.takeIf { it.isNotEmpty() }?.let { users -> chatVotes { this.day = d; userIds += users } } }
}

/** Who can come on [day] of [poll], in the order they said so. */
fun voters(poll: ChatPoll, day: String): List<String> = poll.votesList.firstOrNull { it.day == day }?.userIdsList.orEmpty()

/** The pins of a chat after a step, the latest first, and the one that made room for a new one, if any (spec/vectors/chat.json, pins). */
data class PinStep(val pins: List<Long>, val dropped: Long? = null)

/** Pinning [seq], or settling the poll it is: a pinned line only moves up; one past `chatRules.maxPins` takes the place of the oldest. */
fun pinning(pins: List<Long>, seq: Long, most: Int = Chat.maxPins): PinStep {
  val next = listOf(seq) + pins.filter { it != seq }
  return PinStep(next.take(most), next.getOrNull(most))
}

/** Taking [seq]'s pin off, or taking the line back, its pin going with it. */
fun unpinning(pins: List<Long>, seq: Long): PinStep = PinStep(pins.filter { it != seq })

/**
 * How many of a line's [count] photos go in each of its album's rows, top first: two side by side,
 * three as one over two, and past that rows of two and three, as few as can be, the twos first
 * (spec/vectors/chat.json, albumRows). A line of one is a photo alone, a row of it.
 */
fun albumRows(count: Int): List<Int> {
  if (count <= 1) return listOfNotNull(count.takeIf { it == 1 })
  if (count == 3) return listOf(1, 2)
  val rows = (count + 2) / 3
  val twos = 3 * rows - count
  return List(twos) { 2 } + List(rows - twos) { 3 }
}

/** A line placed in a chat by its time: one the group holds, or one of the member's waiting. */
data class TimedLine<Id>(val id: Id, val at: Long, val failed: Boolean = false)

/**
 * The chat's lines in the order shown (spec/chat.md, Lines on their way): the group's in the order
 * it took them, each of the member's not sent where it was written, before the first of the
 * group's whose time is later, and theirs still being sent last, as the newest; each kind of theirs
 * in the order written (spec/vectors/chat.json, order). The chat list's latest line is the last.
 */
fun <Id> chatOrder(sent: List<TimedLine<Id>>, waiting: List<TimedLine<Id>>): List<Id> {
  val failed = ArrayDeque(waiting.filter { it.failed })
  val order = mutableListOf<Id>()
  for (line in sent) {
    while (failed.isNotEmpty() && failed.first().at < line.at) order += failed.removeFirst().id
    order += line.id
  }
  order += failed.map { it.id }
  order += waiting.filter { !it.failed }.map { it.id }
  return order
}

/**
 * What was being written in a chat: its words as they would be sent (its mentions as <@id>), and
 * the line it answers ([replyTo]) or changes ([editing]), by seq, never both.
 */
data class KeptDraft(val text: String, val replyTo: Long? = null, val editing: Long? = null)

/**
 * The draft to keep, or to open again, with the content of the chat's lines as the device holds
 * them ([lineOf], null for one it does not hold); null for none: words make a draft, an edit whose
 * words are still the line's own is none, an edit of a line taken back or not held goes with its
 * words, and a reply to a line taken back keeps its words without the quote
 * (spec/vectors/chat.json, draft).
 */
fun keptDraft(draft: KeptDraft, lineOf: (Long) -> LineContent?): KeptDraft? {
  if (draft.text.isBlank()) return null
  draft.editing?.let { seq ->
    val line = lineOf(seq) as? LineContent.Words ?: return null
    return draft.takeIf { line.text != draft.text }
  }
  val replyTo = draft.replyTo ?: return draft
  return if (lineOf(replyTo) == LineContent.Unsent) KeptDraft(draft.text) else draft
}

/** A chat as its screen shows it (spec/chat.md, Unread lines and typing). */
data class ChatState(
  /**
   * The lines laid out, oldest first: from the first laid out on to the end of the run without a
   * gap they are in, the rest coming as pages (spec/vectors/chat.json, window).
   */
  val lines: List<ChatLine>,
  /** The member's lines still on their way, in the order written: those still being sent, and those not sent among [lines]. */
  val waiting: List<WaitingLine>,
  /** When the next of [waiting] still being sent stops going by itself, by the device's clock; null with none. */
  val failsAt: Long? = null,
  /** The lines reach the chat's first. */
  val atStart: Boolean,
  /** How many lines the device holds before [lines], without a gap: laid out as the chat scrolls back, without asking. */
  val heldBefore: Int = 0,
  /** The first of the run without a gap the lines are in, before which the server is asked for a page. */
  val heldFrom: Long? = null,
  /** The lines reach the latest the device holds; else the page after them is asked as their foot nears (`pageAfter`). */
  val atEnd: Boolean = true,
  /** How many of others' lines after [lines] the reader has not read, each the device does not hold counted as unread. */
  val unreadAfter: Int = 0,
  /** Each member's read mark. */
  val marks: Map<String, Long> = emptyMap(),
  /** How far the member's own read waiting in the outbox goes, 0 with none. */
  val ownRead: Long = 0,
  /** The lines replies answer that are not among [lines], by seq, as the device holds them. */
  val quoted: Map<Long, ChatLine> = emptyMap(),
  /** The pinned lines, the latest first, however far back, the member's own pins on their way in place. */
  val pins: List<ChatLine> = emptyList(),
) {
  /** The line [seq] as the screen shows it, laid out or quoted; null while the device does not hold it. */
  fun line(seq: Long): ChatLine? = quoted[seq] ?: lines.firstOrNull { it.seq == seq } ?: pins.firstOrNull { it.seq == seq }

  /** How far [me] has read: their mark, or on to their read still waiting. */
  fun lastRead(me: String): Long = maxOf(marks[me] ?: 0, ownRead)

  /** How many of others' lines [me] has not read yet, those after the lines laid out too. */
  fun unread(me: String): Int = unreadCount(lines.map { it.seq to it.writer(me) }, lastRead(me)) + unreadAfter
}

/** A chat as a list shows it: its latest line, and how many of its lines are unread. */
data class ChatSummary(
  /** The latest line the group holds that the reader sees. */
  val last: ChatLine? = null,
  /** The member's line on its way that is the chat's latest, in the chat's order (`chatOrder`). */
  val waiting: WaitingLine? = null,
  /** When the next of the member's lines still being sent stops going by itself, by the device's clock. */
  val failsAt: Long? = null,
  /** Every unread line of the chat, as its own row shows them. */
  val unread: Int = 0,
  /** What is being written in it, kept as it was left. */
  val draft: KeptDraft? = null,
  /** One of its unread lines mentions the reader, marked @ in the list. */
  val mentioned: Boolean = false,
  /** Its notifications are turned off, marked by a crossed-out bell after its name. */
  val muted: Boolean = false,
)
