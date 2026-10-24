package app.pochical.kit

import java.time.LocalDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.combine

/**
 * Someone in a group with their calendar as the group sees it (spec/sync-protocol.md, Group
 * projection): their own days over their repeating orders, worked out as their own devices work
 * them out, so [calendar] is an [OwnCalendar] of theirs.
 */
data class GroupMember(
  val userId: String,
  /** As they appear in the group. */
  val name: String,
  /** Their photo as the group shows it, one of its photos; empty for none. */
  val photoId: String,
  /** The shape they draw their marks in ("icon", "emoji" or "badge"); empty before it is known. */
  val markStyle: String,
  /** Their icons drawn filled. */
  val markFill: Boolean,
  val calendar: OwnCalendar,
) {
  /** Each day from [from] through [through] that shows a shift: whether it is a day off. */
  fun offDays(from: LocalDate, through: LocalDate): Map<LocalDate, Boolean> =
    calendar.shown(from, through).mapValues { (_, day) -> calendar.pattern(day.shift)?.countsAsOff == true }
}

/**
 * Everyone in the group [groupId] in the order they joined, those who left not among them, each with
 * what the group holds of their shifts, their own days read from [from] through [through]; again
 * whenever the group's socket changes them.
 */
fun Values.groupMembers(groupId: String, from: LocalDate, through: LocalDate): Flow<List<GroupMember>> =
  combine(
    members(groupId),
    memberDays(groupId, from.toString(), through.toString()),
    memberPatterns(groupId),
    memberOrders(groupId),
  ) { members, days, patterns, orders ->
    val daysOf = days.groupBy { it.userId }
    val patternsOf = patterns.groupBy({ it.userId }, { it.pattern })
    val ordersOf = orders.groupBy({ it.userId }, { it.order })
    members
      .filterNot { it.left }
      .map { member ->
        GroupMember(
          userId = member.userId,
          name = member.displayName,
          photoId = member.photoId,
          markStyle = member.markStyle,
          markFill = member.markFill,
          calendar =
            OwnCalendar(
              patternsOf[member.userId].orEmpty(),
              daysOf[member.userId].orEmpty().associate { LocalDate.parse(it.date) to OwnDay(it.pattern, it.start, it.end) },
              ordersOf[member.userId].orEmpty().map { it.order },
            ),
        )
      }
  }
