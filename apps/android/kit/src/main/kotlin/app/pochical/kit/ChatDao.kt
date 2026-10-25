package app.pochical.kit

import androidx.room3.Dao
import androidx.room3.Insert
import androidx.room3.Query
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** The chats' part of what sync reads and writes ([SyncDao]), each call inside the transaction it opens. */
@Dao
internal interface ChatDao {
  @Upsert suspend fun upsert(line: ChatLineRow)

  @Query("SELECT * FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND seq = :seq")
  suspend fun line(groupId: String, threadId: String, seq: Long): ChatLineRow?

  @Query("SELECT * FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND seq >= :from AND seq <= :through ORDER BY seq")
  suspend fun lines(groupId: String, threadId: String, from: Long, through: Long): List<ChatLineRow>

  /** The chat's pinned lines, the latest pinned first; a line taken back holds no pin. */
  @Query(
    "SELECT seq FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND pinnedOrder > 0 AND kind != 'unsent' " +
      "ORDER BY pinnedOrder DESC"
  )
  suspend fun pinnedSeqs(groupId: String, threadId: String): List<Long>

  @Query("SELECT seq FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND opId = :opId")
  suspend fun seqOf(groupId: String, threadId: String, opId: String): Long?

  @Query("SELECT MAX(seq) FROM chatLines WHERE groupId = :groupId AND threadId = :threadId")
  suspend fun latestSeq(groupId: String, threadId: String): Long?

  /** The latest line the reader sees: a line never delivered to them is not. */
  @Query(
    "SELECT * FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND kind != 'hidden' " +
      "ORDER BY seq DESC LIMIT 1"
  )
  suspend fun lastLine(groupId: String, threadId: String): ChatLineRow?

  @Query("SELECT MIN(seq) FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND seq >= :from")
  suspend fun firstHeld(groupId: String, threadId: String, from: Long): Long?

  /** Where the run of lines without a gap that holds [seq] begins. */
  @Query(
    "SELECT MAX(seq) FROM chatLines AS line WHERE groupId = :groupId AND threadId = :threadId AND seq <= :seq " +
      "AND NOT EXISTS (SELECT 1 FROM chatLines AS earlier WHERE earlier.groupId = line.groupId " +
      "AND earlier.threadId = line.threadId AND earlier.seq = line.seq - 1)"
  )
  suspend fun runFrom(groupId: String, threadId: String, seq: Long): Long?

  /** Where the run of lines without a gap that holds [seq] ends. */
  @Query(
    "SELECT MIN(seq) FROM chatLines AS line WHERE groupId = :groupId AND threadId = :threadId AND seq >= :seq " +
      "AND NOT EXISTS (SELECT 1 FROM chatLines AS later WHERE later.groupId = line.groupId " +
      "AND later.threadId = line.threadId AND later.seq = line.seq + 1)"
  )
  suspend fun runThrough(groupId: String, threadId: String, seq: Long): Long?

  @Query("SELECT COUNT(*) FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND seq > :after")
  suspend fun heldAfter(groupId: String, threadId: String, after: Long): Int

  /** How many of the lines after [after] are others' to [me] (`writerOf`). */
  @Query(
    "SELECT COUNT(*) FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND seq > :after " +
      "AND authorId != :me AND kind NOT IN ('notice', 'hidden')"
  )
  suspend fun othersAfter(groupId: String, threadId: String, after: Long, me: String): Int

  /** The group's chats that have a line held. */
  @Query("SELECT DISTINCT threadId FROM chatLines WHERE groupId = :groupId")
  suspend fun lineThreads(groupId: String): List<String>

  @Query("DELETE FROM chatLines WHERE groupId = :groupId") suspend fun deleteChatLines(groupId: String)

  @Query("DELETE FROM chatLines") suspend fun deleteAllChatLines()

  @Upsert suspend fun upsert(mark: ReadMarkRow)

  @Query("SELECT * FROM readMarks WHERE groupId = :groupId AND threadId = :threadId")
  suspend fun readMarks(groupId: String, threadId: String): List<ReadMarkRow>

  @Query("DELETE FROM readMarks WHERE groupId = :groupId") suspend fun deleteReadMarks(groupId: String)

  @Query("DELETE FROM readMarks") suspend fun deleteAllReadMarks()

  @Insert suspend fun insert(edit: ChatOutboxRow)

  @Query("SELECT * FROM chatOutbox ORDER BY id") suspend fun chatOutbox(): List<ChatOutboxRow>

  @Query("SELECT * FROM chatOutbox WHERE groupId = :groupId AND id > :after ORDER BY id")
  suspend fun chatOutbox(groupId: String, after: Long = 0): List<ChatOutboxRow>

  @Query("SELECT * FROM chatOutbox WHERE opId = :opId") suspend fun chatEdit(opId: String): ChatOutboxRow?

  @Query("SELECT * FROM chatOutbox WHERE opId IN (:opIds)") suspend fun chatEdits(opIds: List<String>): List<ChatOutboxRow>

  @Query("DELETE FROM chatOutbox WHERE opId IN (:opIds)") suspend fun deleteChatEdits(opIds: List<String>)

  @Query("UPDATE chatOutbox SET failed = 1, wentOut = 0 WHERE opId IN (:opIds)")
  suspend fun failChatEdits(opIds: List<String>)

  @Query("UPDATE chatOutbox SET wentOut = 1 WHERE opId IN (:opIds)") suspend fun wentOut(opIds: List<String>)

  @Query("UPDATE chatOutbox SET upIds = :upIds, upAtMs = :upAtMs WHERE opId = :opId")
  suspend fun photosUp(opId: String, upIds: String, upAtMs: Long)

  /** × on a line of photos: not sent, unless it is being sent already; how many it marked. */
  @Query("UPDATE chatOutbox SET failed = 1, wentOut = 0 WHERE opId = :opId AND sending = 0")
  suspend fun stopGoingUp(opId: String): Int

  @Query("UPDATE chatOutbox SET sending = 1 WHERE opId = :opId") suspend fun markSending(opId: String)

  @Query("DELETE FROM chatOutbox WHERE groupId = :groupId") suspend fun deleteChatOutbox(groupId: String)

  @Query("DELETE FROM chatOutbox") suspend fun deleteAllChatOutbox()

  /** The group's newest waiting chat edit, null when none waits. */
  @Query("SELECT MAX(id) FROM chatOutbox WHERE groupId = :groupId") fun lastChatWaiting(groupId: String): Flow<Long?>

  @Upsert suspend fun upsert(unread: UnreadCountRow)

  @Query("SELECT * FROM unreadCounts WHERE groupId = :groupId AND threadId = :threadId")
  suspend fun unreadCount(groupId: String, threadId: String): UnreadCountRow?

  /** The group's chats with unread lines, as the user's socket counted them. */
  @Query("SELECT threadId FROM unreadCounts WHERE groupId = :groupId AND count > 0")
  suspend fun unreadThreads(groupId: String): List<String>

  @Query("DELETE FROM unreadCounts WHERE groupId = :groupId") suspend fun deleteUnreadCounts(groupId: String)

  @Query("DELETE FROM unreadCounts") suspend fun deleteAllUnreadCounts()

  @Upsert suspend fun upsert(block: BlockRow)

  @Query("SELECT userId FROM blocks") suspend fun blockedIds(): List<String>

  /** A chat's lines of [kinds], in order. */
  @Query("SELECT * FROM chatLines WHERE groupId = :groupId AND threadId = :threadId AND kind IN (:kinds) ORDER BY seq")
  suspend fun linesOfKinds(groupId: String, threadId: String, kinds: List<String>): List<ChatLineRow>

  @Query("DELETE FROM blocks WHERE userId = :userId") suspend fun deleteBlock(userId: String)

  @Query("DELETE FROM blocks") suspend fun deleteBlocks()

  @Upsert suspend fun upsert(mute: ChatMuteRow)

  @Query("DELETE FROM chatMutes WHERE groupId = :groupId AND threadId = :threadId")
  suspend fun deleteChatMute(groupId: String, threadId: String)

  @Query("DELETE FROM chatMutes") suspend fun deleteChatMutes()

  @Upsert suspend fun upsert(settings: ChatNotificationSettingsRow)

  @Query("DELETE FROM chatNotificationSettings") suspend fun deleteChatNotificationSettings()

  @Upsert suspend fun upsert(draft: ChatDraftRow)

  @Query("SELECT * FROM chatDrafts WHERE groupId = :groupId AND threadId = :threadId")
  suspend fun chatDraft(groupId: String, threadId: String): ChatDraftRow?

  @Query("DELETE FROM chatDrafts WHERE groupId = :groupId AND threadId = :threadId")
  suspend fun deleteChatDraft(groupId: String, threadId: String)

  @Query("SELECT threadId FROM chatDrafts WHERE groupId = :groupId") suspend fun draftThreads(groupId: String): List<String>

  @Query("DELETE FROM chatDrafts WHERE groupId = :groupId") suspend fun deleteChatDrafts(groupId: String)

  @Query("DELETE FROM chatDrafts") suspend fun deleteAllChatDrafts()
}
