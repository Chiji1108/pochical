package app.pochical.kit

import app.pochical.v1.ChatEdit
import app.pochical.v1.ChatSendKt
import app.pochical.v1.LinkPreview
import app.pochical.v1.ChatLine as WireLine
import app.pochical.v1.chatChange
import app.pochical.v1.chatDecide
import app.pochical.v1.chatPin
import app.pochical.v1.chatVote
import app.pochical.v1.chatReact
import app.pochical.v1.chatRead
import app.pochical.v1.chatRecall
import app.pochical.v1.chatSend
import app.pochical.v1.chatSendContent
import app.pochical.v1.chatAlbum
import app.pochical.v1.chatSendWords
import app.pochical.v1.chatUnsend
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged

/**
 * The chats as the screens read and write them: each chat's lines laid out and the member's own
 * waiting, read again as sync or an edit changes them, and the member's edits, kept in the group's
 * chat outbox in the same transaction as they show, whether its socket is open or not: the group's
 * socket sends them once it is (spec/sync-protocol.md, Chat; spec/chat.md, Lines on their way).
 */
class Chats internal constructor(
  private val database: AppDatabase,
  /** The member's photos kept to send, and how far each has gone up. */
  private val photos: LinePhotos,
  private val now: () -> Long = System::currentTimeMillis,
  /** Where what outlives the screen that asked runs: a draft kept as its chat is left. */
  private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
  /**
   * The app's version and the device (ポチカル 1.0・Pixel 10a・Android 17), sent with each line where the
   * place's rules ask for it (`sendsDevice`: the chat with Pochical's people, whose head says so).
   */
  private val deviceWords: () -> String = { "" },
) {
  /** The app's version and the device, as each line of a place that keeps them takes them. */
  val device: String
    get() = deviceWords()

  /**
   * The chat as its screen shows it, for [me]: the lines of the run without a gap holding the first
   * line held at or after [from], from [from] to the run's last, so they stay as later lines come
   * past a gap; with no [from], as the chat opens, the latest run's, from where `openingFrom` says
   * (spec/vectors/chat.json, window). Read again as its lines, marks or outbox change, and as one
   * of the member's lines waits too long.
   */
  fun state(groupId: String, threadId: String, me: String?, from: Long?): Flow<ChatState> =
    observe("chatLines", "readMarks", "chatOutbox") { now ->
      val state = chatState(groupId, threadId, me, from, now)
      Timed(state, state.failsAt)
    }

  /** The chat as the group's list of chats shows it, for [me]. */
  fun summary(groupId: String, threadId: String, me: String): Flow<ChatSummary> =
    observe("chatLines", "readMarks", "chatOutbox", "unreadCounts", "chatDrafts", "chatMutes") { now ->
      val summary = chatSummary(groupId, threadId, me, now)
      Timed(summary, summary.failsAt)
    }

  /**
   * The line [seq] as the screen shows it, the member's waiting edits to it in place, however far
   * from the lines laid out (the line the composer answers); null while the device does not hold it.
   */
  fun line(groupId: String, threadId: String, seq: Long): Flow<ChatLine?> =
    observe("chatLines", "chatOutbox") { now -> Timed(shownLine(groupId, threadId, seq, waitingEdits(groupId, threadId, now)), null) }

  /**
   * The group's chats that have a line, unread lines counted before their lines come, one of the
   * member's own on its way, or a draft: the one-to-one chats its list shows beside its own.
   */
  fun threads(groupId: String): Flow<Set<String>> =
    observe("chatLines", "unreadCounts", "chatOutbox", "chatDrafts") {
      val sending = chatOutbox(groupId).map { it.chatEdit }.filter { it.kindCase == ChatEdit.KindCase.SEND }.map { it.send.threadId }
      Timed(lineThreads(groupId).toSet() + unreadThreads(groupId) + sending + draftThreads(groupId), null)
    }

  /**
   * Sends [text] as a line of words in the chat, shown at once as the member's line on its way.
   * Throws when the device cannot keep it (保存できませんでした), the composer keeping the words.
   */
  suspend fun send(groupId: String, threadId: String, text: String, replyTo: Long? = null, preview: LinkPreview? = null, withoutPreview: Boolean = false) {
    database.write {
      chatEdit(groupId, now()) {
        send = chatSend {
          this.threadId = threadId
          content = chatSendContent {
            words = chatSendWords {
              this.text = text
              // Its first link's page as it came while writing; none taken off with ×, or the
              // server reads the page itself once it has the line (spec/chat.md, Previews).
              preview?.let { this.preview = it }
              this.withoutPreview = withoutPreview
            }
          }
          replyTo?.let { this.replyTo = it }
          stamp(groupId)
        }
      }
      deleteChatDraft(groupId, threadId)
    }
  }

  /**
   * Sends [photos], shrunk, as one line of the chat (spec/chat.md, Albums), kept on the device to
   * upload before the group's socket sends it, and shown at once as the member's line on its way.
   * Throws when the device cannot keep them (保存できませんでした), keeping nothing of them.
   */
  suspend fun sendPhotos(groupId: String, threadId: String, photos: List<ShrunkPhoto>, replyTo: Long? = null) {
    val lined = photos.map { newId() to it }
    try {
      for ((id, photo) in lined) this.photos.files.keep(groupId, id, photo)
      database.write {
        chatEdit(groupId, now()) {
          send = chatSend {
            this.threadId = threadId
            content = chatSendContent { this.photos = chatAlbum { this.photos += lined.map { (id, photo) -> photo.line(id) } } }
            replyTo?.let { this.replyTo = it }
            stamp(groupId)
          }
        }
      }
    } catch (e: Exception) {
      withContext(NonCancellable) { this@Chats.photos.files.forget(groupId, lined.map { it.first }) }
      throw e
    }
  }

  /**
   * 送信をやめる: the member's line of photos [opId] stops going up, and is not sent, its ! offering
   * もう一度送る and 削除 (spec/chat.md, Photos); nothing once its photos are up and it is being sent.
   */
  suspend fun stopSending(opId: String) {
    // Decided in the row, in one write against the socket's marking it sent (`sendOnceUp`).
    val stopped = database.write { stopGoingUp(opId) > 0 }
    if (stopped) photos.uploads.cancel(opId)
  }

  /**
   * 編集: new words for the member's line of words [seq], marked 編集済み for everyone. Its link's
   * page stays while its first link does (spec/vectors/chat.json, edited); else the line goes
   * without one. Throws when the device cannot keep it, the composer keeping the words.
   */
  suspend fun change(groupId: String, threadId: String, seq: Long, text: String, preview: LinkPreview? = null) {
    database.write {
      val was = shownLine(groupId, threadId, seq, waitingEdits(groupId, threadId, now()))?.content as? LineContent.Words ?: return@write
      chatEdit(groupId, now()) {
        change = chatChange {
          this.threadId = threadId
          this.seq = seq
          this.text = text
          keepsPreview = keepsPreview(was.text, text)
          // Else the new first link's page, if it has come.
          if (!keepsPreview) preview?.let { this.preview = it }
        }
      }
      deleteChatDraft(groupId, threadId)
    }
  }

  /**
   * The member's reaction [emoji] on the line [seq], put on or taken back ([on]), shown at once. Throws
   * when the device cannot keep it.
   */
  suspend fun react(groupId: String, threadId: String, seq: Long, emoji: String, on: Boolean) {
    database.write {
      chatEdit(groupId, now()) {
        react = chatReact {
          this.threadId = threadId
          this.seq = seq
          this.emoji = emoji
          this.on = on
        }
      }
    }
  }

  /**
   * The line [seq] pinned for everyone in the chat ([on]), or its pin taken off; a pin past
   * `chatRules.maxPins` takes the place of the oldest; the pins after it. Throws when the device cannot keep it.
   */
  suspend fun pin(groupId: String, threadId: String, seq: Long, on: Boolean): PinStep =
    database.write {
      // What it does to the pins as the device has them in the same transaction: the oldest that made room, said by the app.
      val before = pinned(groupId, threadId, waitingEdits(groupId, threadId, now()))
      chatEdit(groupId, now()) {
        pin = chatPin {
          this.threadId = threadId
          this.seq = seq
          this.on = on
        }
      }
      if (on) pinning(before, seq) else unpinning(before, seq)
    }

  /** 行ける: the member can come on [day] of the poll [seq] ([on]), or takes it back, until it is settled. */
  suspend fun vote(groupId: String, threadId: String, seq: Long, day: String, on: Boolean) {
    database.write {
      chatEdit(groupId, now()) {
        vote = chatVote {
          this.threadId = threadId
          this.seq = seq
          this.day = day
          this.on = on
        }
      }
    }
  }

  /** 日にちを決める, 決め直す: the poll [seq] settled on [day], which pins it for everyone; the pins after it. */
  suspend fun decide(groupId: String, threadId: String, seq: Long, day: String): PinStep =
    database.write {
      val before = pinned(groupId, threadId, waitingEdits(groupId, threadId, now()))
      chatEdit(groupId, now()) {
        decide = chatDecide {
          this.threadId = threadId
          this.seq = seq
          this.day = day
        }
      }
      pinning(before, seq)
    }

  /** 送信取消: the member's line [seq] taken back for everyone, its reactions, reply and pin with it. */
  suspend fun unsend(groupId: String, threadId: String, seq: Long) {
    database.write {
      chatEdit(groupId, now()) {
        unsend = chatUnsend {
          this.threadId = threadId
          this.seq = seq
        }
      }
    }
  }

  /**
   * Marks the chat read on to [seq], the latest line whose foot has come on the screen, never back
   * (spec/vectors/chat.json, readTo); nothing when [me] has read that far already.
   */
  suspend fun read(groupId: String, threadId: String, me: String, seq: Long) {
    database.write {
      val before = lastRead(groupId, threadId, me, now())
      if (readTo(listOf(seq), before) == before) return@write
      chatEdit(groupId, now()) { read = chatRead { this.threadId = threadId; lastReadSeq = seq } }
    }
  }

  /**
   * A line of the member's taken out of the outbox while it waited (送信取消, or 削除 once not
   * sent). One that went out on a socket the group may have taken meanwhile, its answer not yet
   * come, so it is taken back from the group by its send's op_id (`ChatRecall`), which also keeps
   * the send from coming after should the group not have it yet. One that never went out the
   * group cannot have: nothing is left to take back.
   */
  suspend fun takeBack(opId: String) {
    val taken =
      database.write {
        val row = chatEdit(opId) ?: return@write null
        deleteChatEdits(listOf(opId))
        val edit = row.chatEdit
        if (row.wentOut && edit.kindCase == ChatEdit.KindCase.SEND) {
          chatEdit(row.groupId, now()) {
            recall = chatRecall {
              threadId = edit.send.threadId
              sendOpId = opId
              // Its photos, uploaded, go with the line, or at once if it never came.
              photoIds += edit.send.content.photos.photosList.map { it.id }
            }
          }
        }
        row.groupId to edit.send.content.photos.photosList.map { it.id }
      } ?: return
    // The photos kept for it go too, and one of them going up stops.
    val (groupId, photoIds) = taken
    photos.uploads.forget(listOf(opId))
    photos.files.forget(groupId, photoIds)
  }

  /**
   * もう一度送る: a line not sent goes again as the newest waiting edit, made now, after what was
   * sent; its photos not up go again from waiting their turn, × stopping it.
   */
  suspend fun sendAgain(opId: String) {
    // A new row, not yet stopped nor being sent: × works on it again. Its rings start again too.
    photos.uploads.forget(listOf(opId))
    database.write {
      val row = chatEdit(opId) ?: return@write
      deleteChatEdits(listOf(opId))
      // Its photos up stay up, as long as the group keeps them (`PhotosUp`).
      insert(
        ChatOutboxRow(
          groupId = row.groupId,
          opId = opId,
          edit = row.edit,
          madeAtMs = state().corrected(now()),
          wentOut = row.wentOut,
          upIds = row.upIds,
          upAtMs = row.upAtMs,
        )
      )
    }
  }

  /**
   * A chat's photos on the device as they change, for those open large or listed to follow
   * ([PhotoRun.follow]): each change of them once, at the group's cursor where it came, read again
   * only as the chat's lines or the blocks change (the cursor moves with the lines that move it).
   */
  fun photoLines(groupId: String, threadId: String): Flow<PhotoLines> =
    observe("chatLines", "blocks") { Timed(photoLines(groupId, threadId), null) }.distinctUntilChanged { was, now -> now.samePhotos(was) }

  /** Keeps what is being written in a chat, or forgets it when it makes no draft (`keptDraft`). */
  suspend fun keepDraft(groupId: String, threadId: String, draft: KeptDraft) {
    database.write {
      deleteChatDraft(groupId, threadId)
      val kept = keptDraft(draft, groupId, threadId, now()) ?: return@write
      upsert(ChatDraftRow(groupId, threadId, kept.text, kept.replyTo, kept.editing))
    }
  }

  /**
   * Keeps the draft as the chat is left or the app leaves the screen, finishing though the screen
   * goes; [notKept] is told should the device not keep it.
   */
  fun keepDraftLeaving(groupId: String, threadId: String, draft: KeptDraft, notKept: () -> Unit = {}) {
    scope.launch {
      try {
        keepDraft(groupId, threadId, draft)
      } catch (e: CancellationException) {
        throw e
      } catch (_: Exception) {
        withContext(Dispatchers.Main) { notKept() }
      }
    }
  }

  /** The chat's draft as it opens, with its lines as they are now; null for none. */
  suspend fun draft(groupId: String, threadId: String): KeptDraft? = database.read { keptDraft(groupId, threadId, now()) }

  /** The app and the device on a line sent where the place [placeId] keeps them. */
  private fun ChatSendKt.Dsl.stamp(placeId: String) {
    if (placeRules(placeId).sendsDevice) device = this@Chats.device
  }

  private fun <T> observe(vararg tables: String, read: suspend SyncDao.(now: Long) -> Timed<T>): Flow<T> =
    database.observe(*tables, now = now, read = read)
}

/**
 * The member's edits of one chat waiting in its group's outbox, read once: the lines they send, in
 * the order written, each not sent or not at the device's [now], and when the next still being
 * sent stops going by itself, by the device's clock; their changes to each line, in the order made
 * (a recall by its send's op_id); and how far their reads go.
 */
private class WaitingEdits(rows: List<ChatOutboxRow>, threadId: String, state: SyncState, now: Long) {
  val lines = mutableListOf<WaitingLine>()
  val toLines = mutableMapOf<Long, MutableList<ChatEdit>>()
  val recalls = mutableListOf<ChatEdit>()

  /** The member's pins on their way, and the unsending and recalls that take a pin with them, in the order made. */
  val pinEdits = mutableListOf<ChatEdit>()
  var ownRead = 0L
    private set

  /** Whose the edits are: the user the device is signed in as. */
  val owner = state.owner

  var failsAt: Long? = null
    private set

  init {
    val corrected = state.corrected(now)
    for (row in rows) {
      val edit = row.chatEdit
      when (edit.kindCase) {
        ChatEdit.KindCase.SEND ->
          if (edit.send.threadId == threadId) {
            val failed = row.notSent(edit, corrected)
            if (!failed) row.failsAt(edit)?.let { at -> failsAt = minOf(failsAt ?: at, at) }
            lines += WaitingLine(edit.opId, row.madeAtMs, LineContent.of(edit.send.content), edit.send.replyTo.takeIf { it != 0L }, failed, sending = row.sending)
          }
        ChatEdit.KindCase.READ -> if (edit.read.threadId == threadId) ownRead = maxOf(ownRead, edit.read.lastReadSeq)
        ChatEdit.KindCase.UNSEND ->
          if (edit.unsend.threadId == threadId) {
            toLines.getOrPut(edit.unsend.seq, ::mutableListOf) += edit
            pinEdits += edit
          }
        ChatEdit.KindCase.CHANGE -> if (edit.change.threadId == threadId) toLines.getOrPut(edit.change.seq, ::mutableListOf) += edit
        ChatEdit.KindCase.REACT -> if (edit.react.threadId == threadId) toLines.getOrPut(edit.react.seq, ::mutableListOf) += edit
        ChatEdit.KindCase.PIN -> if (edit.pin.threadId == threadId) pinEdits += edit
        ChatEdit.KindCase.VOTE -> if (edit.vote.threadId == threadId) toLines.getOrPut(edit.vote.seq, ::mutableListOf) += edit
        ChatEdit.KindCase.DECIDE ->
          if (edit.decide.threadId == threadId) {
            toLines.getOrPut(edit.decide.seq, ::mutableListOf) += edit
            // Settling pins the poll (spec/vectors/chat.json, pins).
            pinEdits += edit
          }
        ChatEdit.KindCase.RECALL ->
          if (edit.recall.threadId == threadId) {
            recalls += edit
            pinEdits += edit
          }
        else -> {}
      }
    }
    failsAt = failsAt?.let { it - state.offsetMs }
  }
}

/** The member's waiting edits of the chat, each recall placed on the line the group has for it. */
private suspend fun SyncDao.waitingEdits(groupId: String, threadId: String, now: Long): WaitingEdits =
  WaitingEdits(chatOutbox(groupId), threadId, state(), now).also { waiting ->
    for (recall in waiting.recalls) {
      seqOf(groupId, threadId, recall.recall.sendOpId)?.let { waiting.toLines.getOrPut(it, ::mutableListOf) += recall }
    }
  }

/** The line [seq] as the screen shows it, the member's waiting edits to it in place; null when not held. */
private suspend fun SyncDao.shownLine(groupId: String, threadId: String, seq: Long, waiting: WaitingEdits): ChatLine? =
  line(groupId, threadId, seq)?.let { showing(waiting.toLines[seq].orEmpty(), ChatLine.of(WireLine.parseFrom(it.line)), waiting.owner) }

/** How far [me] has read the chat: their mark, or on to their read still waiting. */
private fun lastRead(marks: List<ReadMarkRow>, me: String, waiting: WaitingEdits): Long =
  maxOf(marks.firstOrNull { it.userId == me }?.lastReadSeq ?: 0, waiting.ownRead)

/** The chat's draft as kept, with its lines as they show now. */
internal suspend fun SyncDao.keptDraft(groupId: String, threadId: String, now: Long): KeptDraft? =
  keptDraft(groupId, threadId, waitingEdits(groupId, threadId, now))

private suspend fun SyncDao.keptDraft(groupId: String, threadId: String, waiting: WaitingEdits): KeptDraft? {
  val row = chatDraft(groupId, threadId) ?: return null
  return keptDraft(KeptDraft(row.text, row.replyTo, row.editing), groupId, threadId, waiting)
}

private suspend fun SyncDao.keptDraft(draft: KeptDraft, groupId: String, threadId: String, now: Long): KeptDraft? =
  keptDraft(draft, groupId, threadId, waitingEdits(groupId, threadId, now))

private suspend fun SyncDao.keptDraft(draft: KeptDraft, groupId: String, threadId: String, waiting: WaitingEdits): KeptDraft? {
  // The target's line is the one asked for, as the screen shows it: one being taken back is.
  val line = (draft.editing ?: draft.replyTo)?.let { shownLine(groupId, threadId, it, waiting) }
  return keptDraft(draft) { line?.content }
}

/**
 * How many of others' lines after [read] are unread: those held, and every line not held yet up to
 * the latest held, as ↓ counts them past the lines laid out.
 */
private suspend fun SyncDao.unreadPast(groupId: String, threadId: String, read: Long, me: String): Int {
  val latest = latestSeq(groupId, threadId) ?: return 0
  if (latest <= read) return 0
  return (latest - read).toInt() - heldAfter(groupId, threadId, read) + othersAfter(groupId, threadId, read, me)
}

/** The chat as its screen shows it (`Chats.state`). */
internal suspend fun SyncDao.chatState(groupId: String, threadId: String, me: String?, from: Long?, now: Long): ChatState {
  val waiting = waitingEdits(groupId, threadId, now)
  val markRows = readMarks(groupId, threadId)
  val marks = markRows.associate { it.userId to it.lastReadSeq }
  val read = me?.let { lastRead(markRows, it, waiting) }
  val latest = latestSeq(groupId, threadId)
  // The line the run laid out holds: the first held from `from`, else the latest, laid out as the chat opens.
  val firstHeld = from?.let { firstHeld(groupId, threadId, it) }
  val anchor = firstHeld ?: latest
  val start = if (firstHeld != null && from != null) from else openingFrom(latest ?: 0, read)
  val runFrom = anchor?.let { runFrom(groupId, threadId, it) }
  val runThrough = anchor?.let { runThrough(groupId, threadId, it) }
  var laidFrom = start
  var lines = emptyList<ChatLine>()
  if (runFrom != null && runThrough != null) {
    laidFrom = minOf(maxOf(runFrom, start), runThrough)
    lines = lines(groupId, threadId, laidFrom, runThrough).map { showing(waiting.toLines[it.seq].orEmpty(), ChatLine.of(WireLine.parseFrom(it.line)), waiting.owner) }
  }
  val atEnd = runThrough == null || latest == null || runThrough >= latest
  // Past both the lines laid out and the mark: others' lines held, and every line not held yet.
  val unreadAfter = if (!atEnd && me != null && read != null) unreadPast(groupId, threadId, maxOf(runThrough!!, read), me) else 0
  val atStart = (lines.firstOrNull()?.seq ?: 1) <= 1
  // A line not sent shows where it falls among the lines laid out, not past them while later or
  // earlier lines are still to be laid out.
  val shownWaiting =
    waiting.lines.filter { line ->
      when {
        !line.failed -> true
        !atEnd && lines.isNotEmpty() && line.madeAtMs >= lines.last().sentAtMs -> false
        !atStart && lines.isNotEmpty() && line.madeAtMs < lines.first().sentAtMs -> false
        else -> true
      }
    }
  // The lines replies answer that are not laid out, held however far back (spec/chat.md, Replies).
  val laid = lines.mapTo(HashSet()) { it.seq }
  val quoted =
    (lines.mapNotNull { it.replyTo } + waiting.lines.mapNotNull { it.replyTo })
      .filter { it !in laid }
      .distinct()
      .mapNotNull { seq -> shownLine(groupId, threadId, seq, waiting)?.let { seq to it } }
      .toMap()
  val byLine = lines.associateBy { it.seq }
  // A line shown as nothing (of a kind this app does not know) is pinned nowhere it can show.
  val pins =
    pinned(groupId, threadId, waiting).mapNotNull { seq -> byLine[seq] ?: shownLine(groupId, threadId, seq, waiting) }.filter {
      it.content != LineContent.Unsent && it.content != LineContent.Hidden
    }
  return ChatState(
    pins = pins,
    quoted = quoted,
    lines = lines,
    waiting = shownWaiting,
    failsAt = waiting.failsAt,
    atStart = atStart,
    heldBefore = runFrom?.let { maxOf(laidFrom - it, 0).toInt() } ?: 0,
    heldFrom = runFrom,
    atEnd = atEnd,
    unreadAfter = unreadAfter,
    marks = marks,
    ownRead = waiting.ownRead,
  )
}

/**
 * The chat's pins as the group keeps them, the latest first, then the member's own steps on their
 * way, in the order made: a pin, a pin taken off, and a line taken back taking its pin with it.
 */
private suspend fun SyncDao.pinned(groupId: String, threadId: String, waiting: WaitingEdits): List<Long> =
  waiting.pinEdits.fold(pinnedSeqs(groupId, threadId)) { pinned, edit ->
    when (edit.kindCase) {
      ChatEdit.KindCase.PIN -> if (edit.pin.on) pinning(pinned, edit.pin.seq).pins else unpinning(pinned, edit.pin.seq).pins
      ChatEdit.KindCase.UNSEND -> unpinning(pinned, edit.unsend.seq).pins
      ChatEdit.KindCase.RECALL -> seqOf(groupId, threadId, edit.recall.sendOpId)?.let { unpinning(pinned, it).pins } ?: pinned
      ChatEdit.KindCase.DECIDE -> pinning(pinned, edit.decide.seq).pins
      else -> pinned
    }
  }

/** [line] as the screen shows it, with the member's ([me]) waiting [edits] to it in place, in the order made. */
private fun showing(edits: List<ChatEdit>, line: ChatLine, me: String): ChatLine =
  edits.fold(line) { shown, edit ->
    when (edit.kindCase) {
      ChatEdit.KindCase.CHANGE -> {
        val words = shown.content as? LineContent.Words ?: return@fold shown
        val change = edit.change
        val preview = if (change.keepsPreview) words.preview else if (change.hasPreview()) change.preview else null
        shown.copy(content = words.copy(text = change.text, edited = true, preview = preview))
      }
      ChatEdit.KindCase.UNSEND,
      ChatEdit.KindCase.RECALL -> shown.copy(content = LineContent.Unsent, reactions = emptyList(), replyTo = null, pinnedOrder = 0)
      ChatEdit.KindCase.REACT -> shown.copy(reactions = shown.reactions.toggling(edit.react.emoji, me, edit.react.on))
      ChatEdit.KindCase.VOTE -> {
        // Only while it is open: a settled poll takes no more votes.
        val poll = (shown.content as? LineContent.Poll)?.poll?.takeIf { it.decided.isEmpty() } ?: return@fold shown
        val votes = voting(poll.votesList, edit.vote.day, me, edit.vote.on, poll.daysList)
        shown.copy(content = LineContent.Poll(poll.toBuilder().clearVotes().addAllVotes(votes).build()))
      }
      ChatEdit.KindCase.DECIDE -> {
        val poll = (shown.content as? LineContent.Poll)?.poll ?: return@fold shown
        shown.copy(content = LineContent.Poll(poll.toBuilder().setDecided(edit.decide.day).build()))
      }
      else -> shown
    }
  }

/**
 * The chat as a list shows it, for [me]: its latest line as the chat shows it, and its unread lines
 * as the group counted them, or, while a read of theirs waits to be sent, others' lines the device
 * holds past it, so reading clears it at once (spec/sync-protocol.md, Unread summary).
 */
internal suspend fun SyncDao.chatSummary(groupId: String, threadId: String, me: String, now: Long): ChatSummary {
  val waiting = waitingEdits(groupId, threadId, now)
  val last = lastLine(groupId, threadId)?.let { shownLine(groupId, threadId, it.seq, waiting) }
  // The chat's latest line: one of the member's waiting, or null for the group's.
  val latest =
    chatOrder(
        sent = listOfNotNull(last?.let { TimedLine<WaitingLine?>(null, it.sentAtMs) }),
        waiting = waiting.lines.map { TimedLine<WaitingLine?>(it, it.madeAtMs, it.failed) },
      )
      .lastOrNull()
  val counted = unreadCount(groupId, threadId)
  val read = lastRead(readMarks(groupId, threadId), me, waiting)
  val unread = if (waiting.ownRead == 0L) counted?.count ?: 0 else othersAfter(groupId, threadId, read, me)
  // An unread line mentions the reader: as the group counted them, or, while a read of theirs
  // waits, among others' lines the device holds past it.
  val mentioned =
    unread > 0 &&
      if (waiting.ownRead == 0L) {
        (counted?.mentions ?: 0) > 0
      } else {
        lines(groupId, threadId, read + 1, Long.MAX_VALUE).any { row ->
          val line = ChatLine.of(WireLine.parseFrom(row.line))
          line.writer(me) == LineWriter.Others && me in mentions((line.content as? LineContent.Words)?.text.orEmpty())
        }
      }
  return ChatSummary(last, latest, waiting.failsAt, unread, keptDraft(groupId, threadId, waiting), mentioned, muted(groupId, threadId))
}

/** How far [me] has read the chat, their read still waiting included. */
internal suspend fun SyncDao.lastRead(groupId: String, threadId: String, me: String, now: Long): Long =
  lastRead(readMarks(groupId, threadId), me, waitingEdits(groupId, threadId, now))
