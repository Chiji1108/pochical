package app.pochical.kit

import androidx.room3.Dao
import androidx.room3.Query
import kotlinx.coroutines.flow.Flow

/** The patterns in their order, one the order does not name yet after those it does, by id. */
internal const val PATTERNS_IN_ORDER =
  "FROM patterns LEFT JOIN " +
    "(SELECT patternId, MIN(position) AS position FROM patternOrder GROUP BY patternId) AS placed " +
    "ON placed.patternId = patterns.id ORDER BY placed.position IS NULL, placed.position, patterns.id"

/** The coworkers in their order, one the order does not name yet after those it does, by name. */
internal const val COWORKERS_IN_ORDER =
  "FROM coworkers LEFT JOIN " +
    "(SELECT coworkerId, MIN(position) AS position FROM coworkerOrder GROUP BY coworkerId) AS placed " +
    "ON placed.coworkerId = coworkers.id ORDER BY placed.position IS NULL, placed.position, coworkers.name"

/**
 * What the screens read, each a Flow that gives the values as they are and again whenever sync or
 * an edit changes them: the user's own values as the device shows them (the latest waiting edit's,
 * else the server's), their groups, and what each group holds of its members.
 */
@Dao
interface Values {
  /** The person's own days from [from] through [through], "YYYY-MM-DD", in date order. */
  @Query("SELECT * FROM days WHERE date >= :from AND date <= :through ORDER BY date")
  fun days(from: String, through: String): Flow<List<DayRow>>

  /** The person's patterns in their order; one the order does not name yet comes after those it does. */
  @Query("SELECT patterns.* $PATTERNS_IN_ORDER") fun patterns(): Flow<List<PatternRow>>

  /** The person's repeating orders, in their timeline's order. */
  @Query("SELECT * FROM repeatOrders ORDER BY position") fun repeatOrders(): Flow<List<RepeatOrderRow>>

  /** The person's coworkers in their order; one the order does not name yet comes after, by name. */
  @Query("SELECT coworkers.* $COWORKERS_IN_ORDER") fun coworkers(): Flow<List<CoworkerRow>>

  /** The preferences the account holds, each its JSON by key. */
  @Query("SELECT * FROM preferences") fun preferences(): Flow<List<PreferenceRow>>

  /** The user's groups in the order they joined them. */
  @Query("SELECT * FROM groups ORDER BY joinedAtMs") fun groups(): Flow<List<GroupRow>>

  /** Everyone in the group in the order they joined, those who left too, for their lines' names. */
  @Query("SELECT * FROM groupMembers WHERE groupId = :groupId ORDER BY joinedAtMs")
  fun members(groupId: String): Flow<List<GroupMemberRow>>

  /** The group's members' own days from [from] through [through], as the group sees them. */
  @Query("SELECT * FROM memberDays WHERE groupId = :groupId AND date >= :from AND date <= :through")
  fun memberDays(groupId: String, from: String, through: String): Flow<List<MemberDayRow>>

  @Query("SELECT * FROM memberPatterns WHERE groupId = :groupId")
  fun memberPatterns(groupId: String): Flow<List<MemberPatternRow>>

  @Query("SELECT * FROM memberOrders WHERE groupId = :groupId ORDER BY userId, position")
  fun memberOrders(groupId: String): Flow<List<MemberOrderRow>>
}
