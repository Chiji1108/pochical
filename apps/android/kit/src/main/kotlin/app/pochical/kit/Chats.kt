package app.pochical.kit

import app.pochical.v1.ChatEdit
import app.pochical.v1.ChatLine as WireLine
import app.pochical.v1.chatRead
import app.pochical.v1.chatRecall
import app.pochical.v1.chatSend
import app.pochical.v1.chatSendContent
import app.pochical.v1.chatSendWords
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.transformLatest

/**
 * The chats as the screens read and write them: each chat's lines laid out and the member's own
 * waiting, read again as sync or an edit changes them, and the member's edits, kept in the group's
 * chat outbox in the same transaction as they show, whether its socket is open or not: the group's
 * socket sends them once it is (spec/sync-protocol.md, Chat; spec/chat.md, Lines on their way).
 */
class Chats internal constructor(
  private val database: AppDatabase,
  private val now: () -> Long = System::currentTimeMillis,
  /** Where what outlives the screen that asked runs: a draft kept as its chat is left. */
  private val scope: CoroutineScope = CoroutineScope(SupervisorJob() + Dispatchers.IO),
) {
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
    observe("chatLines", "readMarks", "chatOutbox", "unreadCounts", "chatDrafts") { now ->
      val summary = chatSummary(groupId, threadId, me, now)
      Timed(summary, summary.failsAt)
    }

  /**
   * Sends [text] as a line of words in the chat, shown at once as the member's line on its way.
   * Throws when the device cannot keep it (保存できませんでした), the composer keeping the words.
   */
  suspend fun send(groupId: String, threadId: String, text: String) {
    database.write {
      chatEdit(groupId, now()) {
        send = chatSend {
          this.threadId = threadId
          content = chatSendContent { words = chatSendWords { this.text = text } }
        }
      }
      deleteChatDraft(groupId, threadId)
    }
  }

  /**
   * Marks the chat read on to [seq], the latest line whose foot has come on the screen, never back
   * (spec/vectors/chat.json, readTo); nothing when [me] has read that far already.
   */
  suspend fun read(groupId: String, threadId: String, me: String, seq: Long) {
    database.write {
      val before = maxOf(readMarks(groupId, threadId).firstOrNull { it.userId == me }?.lastReadSeq ?: 0, ownRead(groupId, threadId))
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
    database.write {
      val row = chatEdit(opId) ?: return@write
      deleteChatEdits(listOf(opId))
      val edit = row.chatEdit
      if (!row.wentOut || edit.kindCase != ChatEdit.KindCase.SEND) return@write
      chatEdit(row.groupId, now()) {
        recall = chatRecall {
          threadId = edit.send.threadId
          sendOpId = opId
          // Its photos, uploaded, go with the line, or at once if it never came.
          photoIds += edit.send.content.photos.photosList.map { it.id }
        }
      }
    }
  }

  /** もう一度送る: a line not sent goes again as the newest waiting edit, made now, after what was sent. */
  suspend fun sendAgain(opId: String) {
    database.write {
      val row = chatEdit(opId) ?: return@write
      deleteChatEdits(listOf(opId))
      insert(ChatOutboxRow(groupId = row.groupId, opId = opId, edit = row.edit, madeAtMs = state().corrected(now()), wentOut = row.wentOut))
    }
  }

  /** Keeps what is being written in a chat, or forgets it when it makes no draft (`keptDraft`). */
  suspend fun keepDraft(groupId: String, threadId: String, draft: KeptDraft) {
    database.write {
      deleteChatDraft(groupId, threadId)
      val kept = keptDraft(draft, groupId, threadId) ?: return@write
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
        notKept()
      }
    }
  }

  /** The chat's draft as it opens, with its lines as they are now; null for none. */
  suspend fun draft(groupId: String, threadId: String): KeptDraft? = database.read { keptDraft(groupId, threadId) }

  /** What [read] gives now, and again as [tables] change and at the time it says it changes by time alone. */
  @OptIn(ExperimentalCoroutinesApi::class)
  private fun <T> observe(vararg tables: String, read: suspend SyncDao.(now: Long) -> Timed<T>): Flow<T> =
    database.invalidationTracker
      .createFlow(*tables)
      .transformLatest {
        while (true) {
          val timed = database.read { read(now()) }
          emit(timed.value)
          val at = timed.changesAt ?: break
          delay(maxOf(at - now(), 0))
        }
      }
      .distinctUntilChanged()
}

/** The chat's draft as kept, with its lines as they are now. */
internal suspend fun SyncDao.keptDraft(groupId: String, threadId: String): KeptDraft? {
  val row = chatDraft(groupId, threadId) ?: return null
  return keptDraft(KeptDraft(row.text, row.replyTo, row.editing), groupId, threadId)
}

private suspend fun SyncDao.keptDraft(draft: KeptDraft, groupId: String, threadId: String): KeptDraft? {
  val seq = draft.editing ?: draft.replyTo
  val line = seq?.let { line(groupId, threadId, it) }?.let { ChatLine.of(WireLine.parseFrom(it.line)) }
  // The target's line is the one asked for.
  return keptDraft(draft) { line?.content }
}

/** How far the member's own reads waiting in the group's outbox go in the chat, 0 with none. */
private suspend fun SyncDao.ownRead(groupId: String, threadId: String): Long =
  chatOutbox(groupId).map { it.chatEdit }.filter { it.kindCase == ChatEdit.KindCase.READ && it.read.threadId == threadId }
    .maxOfOrNull { it.read.lastReadSeq } ?: 0

/**
 * The member's lines of the chat waiting in the group's outbox, in the order written, each not sent
 * or not by the device's [now]; and when the next still being sent stops going by itself, by the
 * device's clock. A line the group has taken is no longer in the outbox.
 */
private suspend fun SyncDao.waitingLines(groupId: String, threadId: String, now: Long): Pair<List<WaitingLine>, Long?> {
  val state = state()
  val corrected = state.corrected(now)
  var failsAt: Long? = null
  val lines =
    chatOutbox(groupId).mapNotNull { row ->
      val edit = row.chatEdit
      if (edit.kindCase != ChatEdit.KindCase.SEND || edit.send.threadId != threadId) return@mapNotNull null
      val failed = row.notSent(edit, corrected)
      if (!failed) row.failsAt(edit)?.let { failsAt = minOf(failsAt ?: it, it) }
      WaitingLine(edit.opId, row.madeAtMs, LineContent.of(edit.send.content), edit.send.replyTo.takeIf { it != 0L }, failed)
    }
  return lines to failsAt?.let { it - state.offsetMs }
}

/** The chat as its screen shows it (`Chats.state`). */
internal suspend fun SyncDao.chatState(groupId: String, threadId: String, me: String?, from: Long?, now: Long): ChatState {
  val (waiting, failsAt) = waitingLines(groupId, threadId, now)
  // The member's waiting edits to each line, in the order made, and their read.
  val edits = mutableMapOf<Long, MutableList<ChatEdit>>()
  var ownRead = 0L
  for (edit in chatOutbox(groupId).map { it.chatEdit }) {
    when (edit.kindCase) {
      ChatEdit.KindCase.READ -> if (edit.read.threadId == threadId) ownRead = maxOf(ownRead, edit.read.lastReadSeq)
      ChatEdit.KindCase.UNSEND -> if (edit.unsend.threadId == threadId) edits.getOrPut(edit.unsend.seq, ::mutableListOf) += edit
      ChatEdit.KindCase.CHANGE -> if (edit.change.threadId == threadId) edits.getOrPut(edit.change.seq, ::mutableListOf) += edit
      // Taken back by its send's op_id, should the line have come.
      ChatEdit.KindCase.RECALL ->
        if (edit.recall.threadId == threadId) {
          seqOf(groupId, threadId, edit.recall.sendOpId)?.let { edits.getOrPut(it, ::mutableListOf) += edit }
        }
      else -> {}
    }
  }
  val marks = readMarks(groupId, threadId).associate { it.userId to it.lastReadSeq }
  val read = me?.let { maxOf(marks[it] ?: 0, ownRead) }
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
    lines = lines(groupId, threadId, laidFrom, runThrough).map { showing(edits[it.seq].orEmpty(), ChatLine.of(WireLine.parseFrom(it.line))) }
  }
  val atEnd = runThrough == null || latest == null || runThrough >= latest
  var unreadAfter = 0
  if (!atEnd && me != null && read != null) {
    // Past both the lines laid out and the mark: others' lines held, and every line not held yet.
    val after = maxOf(runThrough!!, read)
    if (after < latest!!) unreadAfter = (latest - after).toInt() - heldAfter(groupId, threadId, after) + othersAfter(groupId, threadId, after, me)
  }
  val atStart = (lines.firstOrNull()?.seq ?: 1) <= 1
  // A line not sent shows where it falls among the lines laid out, not past them while later or
  // earlier lines are still to be laid out.
  val shownWaiting =
    waiting.filter { line ->
      when {
        !line.failed -> true
        !atEnd && lines.isNotEmpty() && line.madeAtMs >= lines.last().sentAtMs -> false
        !atStart && lines.isNotEmpty() && line.madeAtMs < lines.first().sentAtMs -> false
        else -> true
      }
    }
  return ChatState(
    lines = lines,
    waiting = shownWaiting,
    failsAt = failsAt,
    atStart = atStart,
    heldBefore = runFrom?.let { maxOf(laidFrom - it, 0).toInt() } ?: 0,
    heldFrom = runFrom,
    atEnd = atEnd,
    unreadAfter = unreadAfter,
    marks = marks,
    ownRead = ownRead,
  )
}

/** [line] as the screen shows it, with the member's waiting [edits] to it in place, in the order made. */
private fun showing(edits: List<ChatEdit>, line: ChatLine): ChatLine =
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
      else -> shown
    }
  }

/**
 * The chat as a list shows it, for [me]: its latest line, and its unread lines as the group counted
 * them, or, while a read of theirs waits to be sent, others' lines the device holds past it, so
 * reading clears it at once.
 */
internal suspend fun SyncDao.chatSummary(groupId: String, threadId: String, me: String, now: Long): ChatSummary {
  val ownRead = ownRead(groupId, threadId)
  val last = lastLine(groupId, threadId)?.let { ChatLine.of(WireLine.parseFrom(it.line)) }
  val (waiting, failsAt) = waitingLines(groupId, threadId, now)
  // The chat's latest line: one of the member's waiting, or null for the group's.
  val latest =
    chatOrder(
        sent = listOfNotNull(last?.let { TimedLine<WaitingLine?>(null, it.sentAtMs) }),
        waiting = waiting.map { TimedLine<WaitingLine?>(it, it.madeAtMs, it.failed) },
      )
      .lastOrNull()
  val unread =
    if (ownRead == 0L) {
      unreadCount(groupId, threadId)?.count ?: 0
    } else {
      val read = maxOf(readMarks(groupId, threadId).firstOrNull { it.userId == me }?.lastReadSeq ?: 0, ownRead)
      othersAfter(groupId, threadId, read, me)
    }
  return ChatSummary(last, latest, failsAt, unread, keptDraft(groupId, threadId))
}
