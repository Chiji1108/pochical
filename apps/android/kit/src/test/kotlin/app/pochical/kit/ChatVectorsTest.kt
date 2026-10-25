package app.pochical.kit

import app.pochical.v1.ChatLine as WireLine
import app.pochical.v1.ChatNotice
import app.pochical.v1.change
import app.pochical.v1.chatContent
import app.pochical.v1.chatHidden
import app.pochical.v1.chatLine
import app.pochical.v1.chatNotice
import app.pochical.v1.chatTakenBack
import app.pochical.v1.chatWords
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.Serializable
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

// The chat's cases every platform checks (spec/vectors/chat.json) that the chat's lines, its
// scrolling, its composer, its reactions and its pins use; albumRows comes with photos (#827),
// withdrawn with notifications (#884).

@Serializable
private data class ChatVectors(
  val writer: List<Writer>,
  val firstUnread: List<FirstUnread>,
  val directThread: List<DirectThread>,
  val openingFrom: List<OpeningFrom>,
  val firstComing: List<FirstComing>,
  val readTo: List<ReadToCase>,
  val window: List<Window>,
  val pageAfter: List<PageAfter>,
  val order: List<Order>,
  val draft: List<Draft>,
  val edited: List<Edited>,
  val composer: List<Composer>,
  val reactions: List<Reactions>,
  val pins: List<Pins>,
) {
  @Serializable
  data class Writer(override val name: String, val author: String, val me: String, val kind: String, val expected: String) : VectorCase

  @Serializable
  data class FirstUnread(override val name: String, val lines: List<String>, val unread: Int, val expected: Int?) : VectorCase

  @Serializable data class DirectThread(override val name: String, val a: String, val b: String, val expected: String) : VectorCase

  @Serializable data class OpeningFrom(override val name: String, val latest: Long, val read: Long?, val expected: Long) : VectorCase

  @Serializable data class Line(val seq: Long, val writer: String)

  @Serializable
  data class FirstComing(override val name: String, val lines: List<Line>, val latest: Long, val read: Long, val expected: Long?) :
    VectorCase

  @Serializable data class Read(val read: Long, val unread: Int)

  @Serializable
  data class ReadToCase(override val name: String, val lines: List<Line>, val read: Long, val shown: List<Long>, val expected: Read) :
    VectorCase

  @Serializable
  data class Laid(val lines: List<Long>, val heldFrom: Long, val heldBefore: Int, val atEnd: Boolean, val unread: Int)

  @Serializable
  data class Window(
    override val name: String,
    val held: List<List<Long>>,
    val mine: List<Long>,
    val read: Long,
    val from: Long?,
    val expected: Laid,
  ) : VectorCase

  @Serializable data class PageAfter(override val name: String, val through: Long, val expected: Long) : VectorCase

  @Serializable data class Timed(val id: String, val at: Long, val failed: Boolean = false)

  @Serializable
  data class Order(override val name: String, val sent: List<Timed>, val waiting: List<Timed>, val expected: List<String>) : VectorCase

  @Serializable data class Kept(val text: String, val replyTo: Long? = null, val editing: Long? = null)

  @Serializable data class HeldLine(val seq: Long, val kind: String, val text: String = "")

  @Serializable
  data class Draft(override val name: String, val draft: Kept, val lines: List<HeldLine>, val expected: Kept?) : VectorCase

  @Serializable data class Edited(override val name: String, val text: String, val edit: String, val expected: String) : VectorCase

  /** The composer as the vectors keep it: its words as sent, the line it answers or changes, its days, photos and ×. */
  @Serializable
  data class Held(
    val text: String,
    val replyTo: Long? = null,
    val editing: Long? = null,
    val days: List<String>? = null,
    val photos: Int? = null,
    val withoutPreview: Boolean? = null,
  )

  @Serializable
  data class Step(val reply: Long? = null, val edit: Long? = null, val share: List<String>? = null, val stop: Boolean? = null)

  @Serializable data class PinsStep(val pin: String? = null, val unpin: String? = null, val unsend: String? = null, val settle: String? = null)

  @Serializable data class PinsAfter(val pins: List<String>, val dropped: String?)

  @Serializable
  data class Pins(override val name: String, val lines: List<String>, val pins: List<String>, val step: PinsStep, val expected: PinsAfter) : VectorCase {
    /** The named line's seq, the first at 1. */
    fun seq(line: String): Long = lines.indexOf(line).toLong() + 1
  }

  @Serializable data class Reaction(val emoji: String, val userIds: List<String>)

  @Serializable data class React(val user: String, val emoji: String, val on: Boolean)

  @Serializable
  data class Reactions(override val name: String, val reactions: List<Reaction>, val step: React, val expected: List<Reaction>) : VectorCase

  @Serializable
  data class Composer(override val name: String, val composer: Held, val step: Step, val lines: List<HeldLine>, val expected: Held) :
    VectorCase
}

private val chat = vectors<ChatVectors>("chat")

private fun writer(name: String) =
  when (name) {
    "others" -> LineWriter.Others
    "me" -> LineWriter.Me
    else -> LineWriter.App
  }

class ChatVectorsTest {
  @Test
  fun writer() =
    chat.writer.checkEach({ writer(it.expected) }) { case ->
      writerOf(LineKind.entries.first { it.key == case.kind }, case.author, case.me)
    }

  @Test
  fun firstUnread() = chat.firstUnread.checkEach({ it.expected }) { firstUnread(it.lines.map(::writer), it.unread) }

  @Test fun directThread() = chat.directThread.checkEach({ it.expected }) { directThread(it.a, it.b) }

  @Test fun openingFrom() = chat.openingFrom.checkEach({ it.expected }) { openingFrom(it.latest, it.read) }

  @Test
  fun firstComing() =
    chat.firstComing.checkEach({ it.expected }) { case ->
      firstComing(case.lines.map { it.seq to writer(it.writer) }, case.latest, case.read)
    }

  @Test
  fun readTo() =
    chat.readTo.checkEach({ it.expected }) { case ->
      val read = readTo(case.shown, case.read)
      ChatVectors.Read(read, unreadCount(case.lines.map { it.seq to writer(it.writer) }, read))
    }

  @Test fun pageAfter() = chat.pageAfter.checkEach({ it.expected }) { pageAfter(it.through) }

  @Test
  fun order() =
    chat.order.checkEach({ it.expected }) { case ->
      chatOrder(case.sent.map { TimedLine(it.id, it.at) }, case.waiting.map { TimedLine(it.id, it.at, it.failed) })
    }

  @Test
  fun draft() =
    chat.draft.checkEach({ it.expected }) { case ->
      val lines =
        case.lines.associate {
          it.seq to if (it.kind == "unsent") LineContent.Unsent else LineContent.Words(it.text)
        }
      keptDraft(KeptDraft(case.draft.text, case.draft.replyTo, case.draft.editing), lines::get)?.let {
        ChatVectors.Kept(it.text, it.replyTo, it.editing)
      }
    }

  @Test
  fun pins() =
    chat.pins.checkEach({ case -> PinStep(case.expected.pins.map(case::seq), case.expected.dropped?.let(case::seq)) }) { case ->
      val pins = case.pins.map(case::seq)
      val step = case.step
      when {
        step.pin != null -> pinning(pins, case.seq(step.pin))
        // Settling a poll pins it.
        step.settle != null -> pinning(pins, case.seq(step.settle))
        step.unpin != null -> unpinning(pins, case.seq(step.unpin))
        else -> unpinning(pins, case.seq(step.unsend!!))
      }
    }

  @Test
  fun reactions() =
    chat.reactions.checkEach({ case -> case.expected.map { LineReaction(it.emoji, it.userIds) } }) { case ->
      case.reactions.map { LineReaction(it.emoji, it.userIds) }.toggling(case.step.emoji, case.step.user, case.step.on)
    }

  @Test
  fun edited() = chat.edited.checkEach({ it.expected }) { if (keepsPreview(it.text, it.edit)) "kept" else "new" }

  @Test
  fun composer() =
    chat.composer.checkEach({ it.expected }) { case ->
      val nameOf = { id: String -> if (id == "u2") "ゆき" else id }
      val held = case.composer
      val before =
        Writing.of<Int>(held.text, nameOf, held.replyTo, held.editing)
          .copy(days = held.days, photos = List(held.photos ?: 0) { it }, previewRemoved = if (held.withoutPreview == true) previewLink(held.text) else null)
      val step = case.step
      val after =
        when {
          step.reply != null -> before.answer(step.reply)
          step.edit != null -> before.change(step.edit, case.lines.first { it.seq == step.edit }.text, nameOf)
          step.share != null -> before.share(step.share)
          else -> before.stop()
        }
      val text = after.sent
      ChatVectors.Held(
        text = text,
        replyTo = after.replyTo,
        editing = after.editing,
        days = after.days,
        photos = after.photos.size.takeIf { it > 0 },
        withoutPreview = after.previewRemoved?.takeIf { it == previewLink(text) }?.let { true },
      )
    }
}

/** A line of words [seq] by [author], as the group sends it. */
internal fun wordsLine(seq: Long, author: String, text: String = "$seq", thread: String = GROUP_THREAD, opId: String = "op-$seq"): WireLine =
  chatLine {
    threadId = thread
    this.seq = seq
    authorId = author
    sentAtMs = seq * 1000
    this.opId = opId
    content = chatContent { words = chatWords { this.text = text } }
  }

@RunWith(RobolectricTestRunner::class)
class ChatWindowTest {
  private val database = testDatabase()

  @After fun close() = database.close()

  @Test
  fun window() = runTest {
    val laid =
      chat.window.associate { case ->
        case.name to
          database.write {
            eraseChats()
            val lines = case.held.flatMap { (first, last) -> (first..last).map { wordsLine(it, if (it in case.mine) "me" else "u2") } }
            takeChanges(lines, "g1")
            upsert(ReadMarkRow("g1", GROUP_THREAD, "me", case.read))
            val state = chatState("g1", GROUP_THREAD, "me", case.from, now = 0)
            ChatVectors.Laid(
              lines = listOfNotNull(state.lines.firstOrNull()?.seq, state.lines.lastOrNull()?.seq),
              heldFrom = state.heldFrom ?: 0,
              heldBefore = state.heldBefore,
              atEnd = state.atEnd,
              unread = state.unread("me"),
            )
          }
      }
    chat.window.checkEach({ it.expected }) { laid.getValue(it.name) }
  }
}

/** The group's lines taken as its socket brings them. */
internal suspend fun SyncDao.takeChanges(lines: List<WireLine>, groupId: String) {
  for (line in lines) takeChat(change { chatLine = line }, groupId)
}

class LineContentTest {
  @Test
  fun aNoticeOrKindThisAppDoesNotKnowIsHidden() {
    assertEquals(LineContent.Hidden, LineContent.of(chatContent {}))
    assertEquals(LineContent.Hidden, LineContent.of(chatContent { notice = chatNotice {} }))
    assertEquals(LineContent.Hidden, LineContent.of(chatContent { hidden = chatHidden {} }))
    assertEquals(LineContent.Unsent, LineContent.of(chatContent { unsent = chatTakenBack {} }))
    assertEquals(
      LineKind.Notice,
      LineContent.of(chatContent { notice = chatNotice { kind = ChatNotice.Kind.KIND_JOINED } }).kind,
    )
  }
}
