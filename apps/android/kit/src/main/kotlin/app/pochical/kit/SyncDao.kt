package app.pochical.kit

import androidx.room3.Dao
import androidx.room3.Insert
import androidx.room3.Query
import androidx.room3.Upsert
import kotlinx.coroutines.flow.Flow

/** What sync reads and writes, each call inside the transaction `AppDatabase.write` opens. */
@Dao
internal interface SyncDao : ChatDao {
  @Query("SELECT * FROM syncState WHERE id = 1") suspend fun syncState(): SyncState?

  /** What the device adds to its own time to correct it (HLC), 0 before its first Welcome. */
  @Query("SELECT COALESCE((SELECT offsetMs FROM syncState WHERE id = 1), 0)") fun offsetMs(): Flow<Long>

  @Upsert suspend fun upsert(state: SyncState)

  @Query("SELECT COALESCE((SELECT firstRunDone FROM syncState WHERE id = 1), 0)") fun firstRunDone(): Flow<Boolean>

  @Query("SELECT * FROM days WHERE date = :date") suspend fun day(date: String): DayRow?

  @Query("SELECT * FROM days WHERE date >= :from AND date <= :through")
  suspend fun days(from: String, through: String): List<DayRow>

  @Upsert suspend fun upsert(day: DayRow)

  @Query("DELETE FROM days WHERE date = :date") suspend fun deleteDay(date: String)

  @Upsert suspend fun upsert(pattern: PatternRow)

  @Query("DELETE FROM patterns WHERE id = :id") suspend fun deletePattern(id: String)

  @Query("SELECT * FROM patterns WHERE id = :id") suspend fun pattern(id: String): PatternRow?

  @Insert suspend fun insertPatternOrder(rows: List<PatternOrderRow>)

  @Query("DELETE FROM patternOrder") suspend fun deletePatternOrder()

  @Insert suspend fun insertRepeatOrders(rows: List<RepeatOrderRow>)

  @Query("DELETE FROM repeatOrders") suspend fun deleteRepeatOrders()

  @Upsert suspend fun upsert(coworker: CoworkerRow)

  @Query("DELETE FROM coworkers WHERE id = :id") suspend fun deleteCoworker(id: String)

  @Query("SELECT coworkerId FROM coworkerOrder ORDER BY position")
  suspend fun coworkerOrder(): List<String>

  @Query("SELECT patterns.id $PATTERNS_IN_ORDER") suspend fun patternIds(): List<String>

  @Query("SELECT patterns.* $PATTERNS_IN_ORDER") suspend fun patterns(): List<PatternRow>

  @Query("SELECT * FROM repeatOrders ORDER BY position") suspend fun repeatOrders(): List<RepeatOrderRow>

  @Query("SELECT coworkers.id $COWORKERS_IN_ORDER") suspend fun coworkerIds(): List<String>

  @Insert suspend fun insertCoworkerOrder(rows: List<CoworkerOrderRow>)

  @Query("DELETE FROM coworkerOrder") suspend fun deleteCoworkerOrder()

  @Upsert suspend fun upsert(preference: PreferenceRow)

  @Query("DELETE FROM preferences WHERE `key` = :key") suspend fun deletePreference(key: String)

  @Query("DELETE FROM days") suspend fun deleteDays()

  @Query("DELETE FROM patterns") suspend fun deletePatterns()

  @Query("DELETE FROM coworkers") suspend fun deleteCoworkers()

  @Query("DELETE FROM preferences") suspend fun deletePreferences()

  @Query("SELECT * FROM serverValues WHERE `key` = :key") suspend fun serverValue(key: String): ServerValue?

  @Query("SELECT * FROM serverValues") suspend fun serverValues(): List<ServerValue>

  /** The server's day values from the day [first] names, "day/YYYY-MM-DD"; "0" sorts after "/". */
  @Query("SELECT * FROM serverValues WHERE `key` >= :first AND `key` < 'day0'")
  suspend fun serverDayValues(first: String): List<ServerValue>

  @Upsert suspend fun upsert(value: ServerValue)

  @Query("DELETE FROM serverValues") suspend fun deleteServerValues()

  @Insert suspend fun insert(edit: OutboxEdit)

  @Query("SELECT * FROM outbox ORDER BY id") suspend fun outbox(): List<OutboxEdit>

  @Query("SELECT * FROM outbox WHERE id > :id ORDER BY id") suspend fun outboxAfter(id: Long): List<OutboxEdit>

  @Query("SELECT * FROM outbox WHERE opId IN (:opIds)") suspend fun outboxEdits(opIds: List<String>): List<OutboxEdit>

  @Query("SELECT * FROM outbox WHERE clearFrom IS NOT NULL") suspend fun waitingOrders(): List<OutboxEdit>

  /** The waiting day edits from the day [first] names, in outbox order. */
  @Query("SELECT * FROM outbox WHERE `key` >= :first AND `key` < 'day0' ORDER BY id")
  suspend fun waitingDayEdits(first: String): List<OutboxEdit>

  @Query("SELECT EXISTS(SELECT 1 FROM outbox WHERE `key` = :key)") suspend fun isWaiting(key: String): Boolean

  @Query("DELETE FROM outbox WHERE opId IN (:opIds)") suspend fun deleteOutboxEdits(opIds: List<String>)

  @Query("UPDATE outbox SET change = :change WHERE id = :id") suspend fun restamp(id: Long, change: ByteArray)

  /** The newest edit in the outbox, null when none waits. */
  @Query("SELECT MAX(id) FROM outbox") fun lastWaiting(): Flow<Long?>

  @Upsert suspend fun upsert(profile: ProfileRow)

  @Query("DELETE FROM profile") suspend fun deleteProfile()

  @Upsert suspend fun upsert(group: GroupRow)

  @Query(
    "UPDATE groups SET name = :name, emoji = :emoji, icon = :icon, letter = :letter, color = :color, " +
      "photoId = :photoId WHERE id = :id"
  )
  suspend fun updateGroup(
    id: String,
    name: String,
    emoji: String,
    icon: String,
    letter: String,
    color: Int,
    photoId: String,
  )

  @Query("DELETE FROM groups WHERE id = :id") suspend fun deleteGroup(id: String)

  @Query("SELECT EXISTS(SELECT 1 FROM groups WHERE id = :id)") suspend fun isListed(id: String): Boolean

  @Query("DELETE FROM groups") suspend fun deleteGroups()

  @Query("SELECT COUNT(*) FROM groups") suspend fun groupCount(): Int

  @Query("SELECT COUNT(*) FROM days WHERE pattern IS NOT NULL AND pattern != ''") suspend fun shiftDayCount(): Int

  @Query("SELECT EXISTS(SELECT 1 FROM repeatOrders)") suspend fun repeats(): Boolean

  @Query("SELECT COUNT(*) FROM coworkers") suspend fun coworkerCount(): Int

  @Upsert suspend fun upsert(member: GroupMemberRow)

  @Query("SELECT * FROM memberDays WHERE groupId = :groupId AND userId = :userId AND date = :date")
  suspend fun memberDay(groupId: String, userId: String, date: String): MemberDayRow?

  @Upsert suspend fun upsert(day: MemberDayRow)

  @Query("DELETE FROM memberDays WHERE groupId = :groupId AND userId = :userId AND date = :date")
  suspend fun deleteMemberDay(groupId: String, userId: String, date: String)

  @Upsert suspend fun upsert(pattern: MemberPatternRow)

  @Query("DELETE FROM memberPatterns WHERE groupId = :groupId AND userId = :userId AND id = :id")
  suspend fun deleteMemberPattern(groupId: String, userId: String, id: String)

  @Insert suspend fun insertMemberOrders(rows: List<MemberOrderRow>)

  @Query("DELETE FROM memberDays WHERE groupId = :groupId AND userId = :userId")
  suspend fun deleteMemberDays(groupId: String, userId: String)

  @Query("DELETE FROM memberPatterns WHERE groupId = :groupId AND userId = :userId")
  suspend fun deleteMemberPatterns(groupId: String, userId: String)

  @Query("DELETE FROM memberOrders WHERE groupId = :groupId AND userId = :userId")
  suspend fun deleteMemberOrders(groupId: String, userId: String)

  @Query("DELETE FROM groupMembers WHERE groupId = :groupId") suspend fun deleteGroupMembers(groupId: String)

  @Query("DELETE FROM memberDays WHERE groupId = :groupId") suspend fun deleteGroupDays(groupId: String)

  @Query("DELETE FROM memberPatterns WHERE groupId = :groupId") suspend fun deleteGroupPatterns(groupId: String)

  @Query("DELETE FROM memberOrders WHERE groupId = :groupId") suspend fun deleteGroupOrders(groupId: String)

  @Query("SELECT cursor FROM groupCursors WHERE groupId = :groupId") suspend fun groupCursor(groupId: String): Long?

  @Upsert suspend fun upsert(cursor: GroupCursorRow)

  @Query("DELETE FROM groupCursors WHERE groupId = :groupId") suspend fun deleteGroupCursor(groupId: String)

  @Query("DELETE FROM outbox") suspend fun deleteOutbox()

  @Query("DELETE FROM groupMembers") suspend fun deleteAllMembers()

  @Query("DELETE FROM memberDays") suspend fun deleteAllMemberDays()

  @Query("DELETE FROM memberPatterns") suspend fun deleteAllMemberPatterns()

  @Query("DELETE FROM memberOrders") suspend fun deleteAllMemberOrders()

  @Query("DELETE FROM groupCursors") suspend fun deleteGroupCursors()

}
