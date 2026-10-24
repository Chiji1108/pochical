package app.pochical.kit

import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

// A group's chats on the device (spec/sync-protocol.md, Chat): the lines and read marks the group
// sent, the member's own edits waiting in a chat outbox of their own, which the group's socket
// sends, and their drafts; and what the user's own socket says of the chats (Unread summary, Chat
// notifications, Reports and blocks). As iOS's ChatValues.swift keeps them.

/**
 * A line of a chat as the group holds it: the `pochical.v1.ChatLine` the group last sent for it,
 * with what is looked up by beside it.
 */
@Entity(tableName = "chatLines", primaryKeys = ["groupId", "threadId", "seq"])
class ChatLineRow(
  val groupId: String,
  val threadId: String,
  val seq: Long,
  val authorId: String,
  /** When the group took it, in ms since the epoch. */
  val sentAtMs: Long,
  /** The sending edit's op_id, to swap the line shown while it waited. */
  val opId: String,
  /** What it is (`LineKind`), for what counts it without reading [line]. */
  val kind: String,
  /** Pinned for everyone: the group's cursor when it was last pinned, the latest the greatest; 0 when not. */
  val pinnedOrder: Long,
  /** The line as the group sent it, a `pochical.v1.ChatLine`. */
  val line: ByteArray,
)

/** How far a member has read a chat. */
@Entity(tableName = "readMarks", primaryKeys = ["groupId", "threadId", "userId"])
data class ReadMarkRow(val groupId: String, val threadId: String, val userId: String, val lastReadSeq: Long)

/**
 * One of the member's chat edits waiting for the group's Acked, in the order made: a send shows at
 * once as a line of theirs still waiting (spec/chat.md, Lines on their way).
 */
@Entity(tableName = "chatOutbox", indices = [Index("opId", unique = true), Index("groupId")])
class ChatOutboxRow(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val groupId: String,
  val opId: String,
  /** The edit as a `pochical.v1.ChatEdit`. */
  val edit: ByteArray,
  /** When it was written, or sent again, by the server's time (HLC). */
  val madeAtMs: Long,
  /**
   * A line not sent: the group refused it (or, with photos, one could not go up). It waits for the
   * member to send it again or delete it. One that waited too long is not sent by its time alone.
   */
  val failed: Boolean = false,
  /** It has gone out on a socket, so the group may have taken it though no answer came. */
  val wentOut: Boolean = false,
  /** A line of photos: the ids of those up, a comma between each (`PhotosUp`). */
  val upIds: String = "",
  /** When the upload of the latest of them began, by the server's time. */
  val upAtMs: Long = 0,
) {
  /** Which of its photos are up. */
  internal val up: PhotosUp
    get() = PhotosUp(upIds.split(",").filter { it.isNotEmpty() }.toSet(), upAtMs)
}

/**
 * How many lines of a chat the user has not read, as the group counted them, from the user's own
 * socket (spec/sync-protocol.md, Unread summary): every group's, without a socket to each.
 */
@Entity(tableName = "unreadCounts", primaryKeys = ["groupId", "threadId"])
data class UnreadCountRow(
  val groupId: String,
  val threadId: String,
  val count: Int,
  /** How many of them mention the user. */
  val mentions: Int,
)

/** Someone the user has blocked, in every group they share (spec/chat.md, Reporting and blocking). */
@Entity(tableName = "blocks")
data class BlockRow(@PrimaryKey val userId: String)

/** A chat whose notifications the user turned off (spec/chat.md, Notifications). */
@Entity(tableName = "chatMutes", primaryKeys = ["groupId", "threadId"])
data class ChatMuteRow(val groupId: String, val threadId: String)

/** メンションはいつも通知, once the user has set it; none before, when it is on. One row. */
@Entity(tableName = "chatNotificationSettings")
data class ChatNotificationSettingsRow(@PrimaryKey val id: Int = 1, val mentionsWhenMuted: Boolean)

/**
 * What was being written in a chat (spec/chat.md, Drafts): its words as they would be sent (its
 * mentions as <@id>), and the line it answers or changes, by seq, at most one of them.
 */
@Entity(tableName = "chatDrafts", primaryKeys = ["groupId", "threadId"])
data class ChatDraftRow(
  val groupId: String,
  val threadId: String,
  val text: String,
  val replyTo: Long?,
  val editing: Long?,
)
