package app.pochical.kit

import app.pochical.design.Chat
import app.pochical.design.SyncLimits
import app.pochical.v1.Change
import app.pochical.v1.Change.KindCase
import app.pochical.v1.ChatEdit
import app.pochical.v1.ChatPage
import app.pochical.v1.ClientFrame
import app.pochical.v1.chatEdits
import app.pochical.v1.clientFrame
import app.pochical.v1.ChatLine as WireLine

// What the sockets bring of the chats into the device's database, and what the group's socket
// sends from its chat outbox (spec/sync-protocol.md, Chat; Unread summary; Chat notifications;
// Reports and blocks), each in the transaction of the frame it came in or goes out with.

/** A line or a read mark from the group's socket; false for any other change. */
internal suspend fun SyncDao.takeChat(change: Change, groupId: String): Boolean {
  when (change.kindCase) {
    KindCase.CHAT_LINE -> take(change.chatLine, groupId)
    KindCase.READ_MARK -> {
      val mark = change.readMark
      upsert(ReadMarkRow(groupId, mark.threadId, mark.userId, mark.lastReadSeq))
    }
    else -> return false
  }
  return true
}

/**
 * A line as the group holds it now. A line of the member's that waited stops waiting, as the
 * group's line from then on: one whose answer is still to come or was lost, and one not sent that
 * the group took after all.
 */
private suspend fun SyncDao.take(line: WireLine, groupId: String) {
  val kind = LineContent.of(line.content).kind
  upsert(ChatLineRow(groupId, line.threadId, line.seq, line.authorId, line.sentAtMs, line.opId, kind.key, line.pinnedOrder, line.toByteArray()))
  if (line.opId.isNotEmpty()) deleteChatEdits(listOf(line.opId))
}

/** A page of a chat's lines, answering the device's request, and the lines its replies answer from before it. */
internal suspend fun SyncDao.take(page: ChatPage, groupId: String) {
  for (line in page.quotedList + page.linesList) take(line, groupId)
}

/** A Reset of the group: its lines and read marks come again; the outbox and drafts stay. */
internal suspend fun SyncDao.resetChats(groupId: String) {
  deleteChatLines(groupId)
  deleteReadMarks(groupId)
}

/** A group left takes the member's waiting edits, drafts and counts with it, so none is sent should they join again. */
internal suspend fun SyncDao.dropChats(groupId: String) {
  deleteChatOutbox(groupId)
  deleteChatDrafts(groupId)
  deleteUnreadCounts(groupId)
}

/** What the user's own socket says of their chats; false for any other change. */
internal suspend fun SyncDao.takeUserChat(change: Change): Boolean {
  when (change.kindCase) {
    KindCase.UNREAD_COUNT -> {
      val unread = change.unreadCount
      upsert(UnreadCountRow(unread.groupId, unread.threadId, unread.count, unread.mentions))
    }
    KindCase.BLOCK -> if (change.block.on) upsert(BlockRow(change.block.userId)) else deleteBlock(change.block.userId)
    KindCase.CHAT_MUTE -> {
      val mute = change.chatMute
      if (mute.muted) upsert(ChatMuteRow(mute.groupId, mute.threadId)) else deleteChatMute(mute.groupId, mute.threadId)
    }
    KindCase.CHAT_NOTIFICATIONS -> upsert(ChatNotificationSettingsRow(mentionsWhenMuted = change.chatNotifications.mentionsWhenMuted))
    else -> return false
  }
  return true
}

/** A Reset of the user's socket: what it says of the chats comes again with everything else. */
internal suspend fun SyncDao.resetUserChats() {
  deleteAllUnreadCounts()
  deleteBlocks()
  deleteChatMutes()
  deleteChatNotificationSettings()
}

/** Erases every chat the database holds, with the user's data (`eraseUserData`). */
internal suspend fun SyncDao.eraseChats() {
  deleteAllChatLines()
  deleteAllReadMarks()
  deleteAllChatOutbox()
  deleteAllChatDrafts()
  resetUserChats()
}

/** Puts the member's [edit] in the group's chat outbox, made at the device's corrected [now]; its op_id. */
internal suspend fun SyncDao.chatEdit(groupId: String, now: Long, edit: ChatEdit.Builder.() -> Unit): String {
  val made = ChatEdit.newBuilder().setOpId(newId()).apply(edit).build()
  insert(ChatOutboxRow(groupId = groupId, opId = made.opId, edit = made.toByteArray(), madeAtMs = state().corrected(now)))
  return made.opId
}

/** When the line [edit] sends stops going by itself, by the server's time; null for an edit that sends no line. */
internal fun ChatOutboxRow.failsAt(edit: ChatEdit): Long? =
  if (edit.kindCase == ChatEdit.KindCase.SEND) madeAtMs + Chat.unsentAfterMs else null

/** Not sent at the server's time [now]: marked so, or a line whose wait is over, from that moment whatever runs then. */
internal fun ChatOutboxRow.notSent(edit: ChatEdit, now: Long): Boolean = failed || (failsAt(edit)?.let { it <= now } ?: false)

/** The row's edit. */
internal val ChatOutboxRow.chatEdit: ChatEdit
  get() = ChatEdit.parseFrom(edit)

/**
 * The group's edits after [after] still to send at the device's [now], in the order made, and the
 * last one's id, past those not sent, which wait for the member instead.
 */
internal suspend fun SyncDao.toSend(groupId: String, after: Long, now: Long): Pair<List<ChatEdit>, Long> {
  val corrected = state().corrected(now)
  val rows = chatOutbox(groupId, after)
  val going = rows.map { it.chatEdit to it }.filter { (edit, row) -> !row.notSent(edit, corrected) }.map { it.first }
  return going to (rows.lastOrNull()?.id ?: after)
}

/** The group's edits after [after] still to send at [now], as frames of up to `editsPerFrame`, and the last one's id. */
internal suspend fun SyncDao.chatFrames(groupId: String, after: Long, now: Long): Pair<List<ClientFrame>, Long> {
  val (edits, last) = toSend(groupId, after, now)
  val frames = edits.chunked(SyncLimits.editsPerFrame).map { chunk -> clientFrame { chatEdits = chatEdits { this.edits += chunk } } }
  return frames to last
}

/**
 * Of a frame's [edits] about to go out on a socket at [now], those still going (not taken back nor
 * not sent since the frame was made), each marked as gone out before it goes, so one taken back
 * from then on is taken back from the group too (`takeBack`).
 */
internal suspend fun SyncDao.goOut(edits: List<ChatEdit>, now: Long): List<ChatEdit> {
  val corrected = state().corrected(now)
  val going = chatEdits(edits.map { it.opId }).filter { !it.notSent(it.chatEdit, corrected) }.map { it.opId }.toSet()
  wentOut(going.toList())
  return edits.filter { it.opId in going }
}

/**
 * The edits an Acked names stop waiting, but for the sends the group [refused]: those stay as lines
 * not sent (spec/chat.md, Lines on their way), which the group does not have.
 */
internal suspend fun SyncDao.acknowledgeChat(opIds: List<String>, refused: List<String>) {
  failChatEdits(refused)
  deleteChatEdits(opIds - refused.toSet())
}

/**
 * The groups whose chat outbox has edits still to send at the device's [now], and when the next of
 * them stops going by itself, by the device's clock.
 */
internal suspend fun SyncDao.chatsToSend(now: Long): Timed<Set<String>> {
  val state = state()
  val corrected = state.corrected(now)
  val going = chatOutbox().map { it.chatEdit to it }.filter { (edit, row) -> !row.notSent(edit, corrected) }
  val next = going.mapNotNull { (edit, row) -> row.failsAt(edit) }.minOrNull()
  return Timed(going.map { it.second.groupId }.toSet(), next?.let { it - state.offsetMs })
}

/** A value read now, and when, by the device's clock, it may change by time alone; null for never. */
internal data class Timed<T>(val value: T, val changesAt: Long?)
