package app.pochical.kit

import androidx.room3.Embedded
import androidx.room3.Entity
import androidx.room3.Index
import androidx.room3.PrimaryKey

// The user's own values as the device shows them: the latest of its edits still waiting in the
// outbox, else the server's (OwnValues.kt). Each table holds a value's fields as the wire carries
// them, as iOS's Tables.swift does.

/**
 * A day's own values (spec/sync-protocol.md, On the wire): a null field is unset, and a day with
 * every field unset has no row.
 */
@Entity(tableName = "days")
data class DayRow(
  /** "YYYY-MM-DD". */
  @PrimaryKey val date: String,
  /** A pattern's id, or `Days.noShift` for a day cleared on purpose. */
  val pattern: String? = null,
  val start: String? = null,
  val end: String? = null,
  val note: String? = null,
  /** Coworker ids separated by spaces, in the order they were added. */
  val people: String? = null,
)

@Entity(tableName = "patterns")
data class PatternRow(
  @PrimaryKey val id: String,
  val name: String,
  val emoji: String,
  val symbol: String,
  val icon: String,
  val color: Int,
  val start: String?,
  val end: String?,
  val countsAsOff: Boolean,
  val nextDay: String?,
  val archived: Boolean,
)

/** The order the patterns are shown in, one row a place. */
@Entity(tableName = "patternOrder")
data class PatternOrderRow(@PrimaryKey val position: Int, val patternId: String)

/** The repeating orders, one row an order, in their timeline's order. */
@Entity(tableName = "repeatOrders")
data class RepeatOrderRow(
  @PrimaryKey val position: Int,
  val start: String,
  val anchor: String?,
  /** Pattern ids separated by spaces, one a day. */
  val sequence: String,
  val holidaysOff: Boolean,
  val holidayShift: String?,
  val holidayCountry: String,
)

@Entity(tableName = "coworkers")
data class CoworkerRow(@PrimaryKey val id: String, val name: String)

/** The order the coworkers are listed in, one row a place. */
@Entity(tableName = "coworkerOrder")
data class CoworkerOrderRow(@PrimaryKey val position: Int, val coworkerId: String)

/**
 * One of the user's preferences (spec/sync-protocol.md, Preferences): the message its key names,
 * encoded (proto/pochical/v1/preferences.proto).
 */
@Entity(tableName = "preferences")
class PreferenceRow(@PrimaryKey val key: String, val value: ByteArray)

/** The last change the server sent for each value, as a `pochical.v1.Change`. */
@Entity(tableName = "serverValues")
class ServerValue(@PrimaryKey val key: String, val change: ByteArray)

/**
 * The device's own edits not yet acknowledged, in the order they were made: each its value as a
 * `pochical.v1.Change`, stamped with its clock.
 */
@Entity(tableName = "outbox", indices = [Index("opId", unique = true), Index("key")])
class OutboxEdit(
  @PrimaryKey(autoGenerate = true) val id: Long = 0,
  val opId: String,
  val key: String,
  val change: ByteArray,
  /** A repeating-orders edit's `clear_from`, "YYYY-MM-DD". */
  val clearFrom: String?,
)

/**
 * The device's own place in sync (spec/sync-protocol.md, HLC; Change log and cursor): its id, its
 * last clock, what it adds to its own time to correct it, the last change it took from its User DO,
 * whose data it holds, and the sync schema it took its values under. One row.
 */
@Entity(tableName = "syncState")
data class SyncState(
  @PrimaryKey val id: Int = 1,
  /** The device's own id, a UUID as it is written. */
  val deviceId: String,
  val lastMs: Long = 0,
  val lastCounter: Long = 0,
  val offsetMs: Long = 0,
  /** The cursor of the last change taken, 0 before any. */
  val cursor: Long = 0,
  /** The user whose data the database holds, empty while it is no one's (`claim`). */
  val owner: String = "",
  /** The sync schema the values were taken under (`SYNC_SCHEMA`). */
  val schema: Int = SYNC_SCHEMA,
) {
  val last: HlcTime
    get() = HlcTime(lastMs, lastCounter.toUInt())

  fun withLast(time: HlcTime) = copy(lastMs = time.ms, lastCounter = time.counter.toLong())

  /** The device's time [now] corrected to the server's (HLC), whatever its own clock says. */
  fun corrected(now: Long): Long = now + offsetMs
}

/**
 * A group the user is in, as their User DO sends it (spec/sync-protocol.md, Groups): its name and
 * mark as last heard, for their list of groups.
 */
@Entity(tableName = "groups")
data class GroupRow(
  @PrimaryKey val id: String,
  val name: String,
  /** When the user joined, in ms since the epoch: the list's order. */
  val joinedAtMs: Long,
  @Embedded val mark: GroupMarkValue,
)

/**
 * A group's mark (/design's GroupMark; proto GroupMark): one emoji, one of the mark icons by name,
 * letters in one of the mark palette's colors, or one of the group's photos.
 */
data class GroupMarkValue(
  val emoji: String = "",
  val icon: String = "",
  val letter: String = "",
  val color: Int = 0,
  val photoId: String = "",
)

// What a group's socket brings (spec/sync-protocol.md, Groups; Group projection): who is in the
// group, and each member's shared days, patterns and repeating orders, kept for each group as the
// server last sent them. Nothing here is edited on the device.

/** Someone in a group, as they appear in it. */
@Entity(tableName = "groupMembers", primaryKeys = ["groupId", "userId"])
data class GroupMemberRow(
  val groupId: String,
  val userId: String,
  val displayName: String,
  /** When they joined, in ms since the epoch: the group's order. */
  val joinedAtMs: Long,
  /** They left: kept for the name on their lines in the chats. */
  val left: Boolean,
  /** Their account is deleted: no name, and their lines taken back. */
  val deleted: Boolean,
  /** displayName is a name of their own for this group, not their usual one. */
  val ownName: Boolean,
  /** Their photo as the group shows it; empty for none. */
  val photoId: String,
  /** photoId is the group's own for them, or none on purpose. */
  val ownPhoto: Boolean,
  /** The shape they draw their marks in; empty before it is known. */
  val markStyle: String,
  val markFill: Boolean,
)

/** A member's day as the group sees it: its pattern and times only. */
@Entity(tableName = "memberDays", primaryKeys = ["groupId", "userId", "date"])
data class MemberDayRow(
  val groupId: String,
  val userId: String,
  val date: String,
  val pattern: String? = null,
  val start: String? = null,
  val end: String? = null,
)

/** One of a member's patterns, so the group can draw their marks: as the member's own row holds it. */
@Entity(tableName = "memberPatterns", primaryKeys = ["groupId", "userId", "id"])
data class MemberPatternRow(val groupId: String, val userId: String, @Embedded val pattern: PatternRow)

/** One of a member's repeating orders, in their timeline's order, as the member's own row holds it. */
@Entity(tableName = "memberOrders", primaryKeys = ["groupId", "userId", "position"])
data class MemberOrderRow(val groupId: String, val userId: String, @Embedded val order: RepeatOrderRow)

/** How far the device has taken a group's log. */
@Entity(tableName = "groupCursors")
data class GroupCursorRow(@PrimaryKey val groupId: String, val cursor: Long)
