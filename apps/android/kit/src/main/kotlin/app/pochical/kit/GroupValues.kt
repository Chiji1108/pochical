package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.Change.KindCase
import app.pochical.v1.DayField
import app.pochical.v1.DayValue
import app.pochical.v1.GroupMark

// The user's groups as their User DO lists them, and what each group's socket brings
// (spec/sync-protocol.md, Groups; Group projection), each in one transaction with the cursor it
// moves. Nothing of a group is edited on the device.

/** A group the user is in, from their own socket: a group left goes, with what the device holds of it. */
internal suspend fun SyncDao.takeMembership(change: Change) {
  if (change.kindCase != KindCase.MEMBERSHIP) return
  val membership = change.membership
  if (membership.left) {
    deleteGroup(membership.groupId)
    resetGroup(membership.groupId)
    return
  }
  upsert(GroupRow(membership.groupId, membership.name, membership.joinedAtMs, membership.mark.value))
}

/** A Reset of the user's socket: the groups come again with everything else. */
internal suspend fun SyncDao.resetMemberships() = deleteGroups()

/** The cursor to say in the group's Hello: 0 before any. */
internal suspend fun SyncDao.cursorOf(groupId: String): Long = groupCursor(groupId) ?: 0

/** Changes of a group, in cursor order: each the group's value from now on. */
internal suspend fun SyncDao.take(changes: List<Change>, groupId: String) {
  var cursor = cursorOf(groupId)
  for (change in changes) {
    take(change, groupId)
    cursor = maxOf(cursor, change.cursor)
  }
  upsert(GroupCursorRow(groupId, cursor))
}

/** A Reset of a group: its values go, and its cursor goes back for what follows. */
internal suspend fun SyncDao.resetGroup(groupId: String) {
  deleteGroupMembers(groupId)
  deleteGroupDays(groupId)
  deleteGroupPatterns(groupId)
  deleteGroupOrders(groupId)
  deleteGroupCursor(groupId)
}

private suspend fun SyncDao.take(change: Change, groupId: String) {
  when (change.kindCase) {
    KindCase.GROUP_PROFILE -> {
      // The list of groups shows the name and mark the group last said.
      val mark = change.groupProfile.mark.value
      updateGroup(groupId, change.groupProfile.name, mark.emoji, mark.icon, mark.letter, mark.color, mark.photoId)
    }
    KindCase.MEMBER -> {
      val member = change.member
      // One who left goes with their shifts, their name kept for their lines in the chats.
      if (member.left) {
        deleteMemberDays(groupId, member.userId)
        deleteMemberPatterns(groupId, member.userId)
        deleteMemberOrders(groupId, member.userId)
      }
      upsert(
        GroupMemberRow(
          groupId = groupId,
          userId = member.userId,
          displayName = member.displayName,
          joinedAtMs = member.joinedAtMs,
          left = member.left,
          deleted = member.deleted,
          ownName = member.ownName,
          photoId = member.photoId,
          ownPhoto = member.ownPhoto,
          markStyle = if (member.hasMarkLook()) member.markLook.style else "",
          markFill = if (member.hasMarkLook()) member.markLook.fill else true,
        )
      )
    }
    KindCase.MEMBER_DAY -> takeDay(change.memberDay.day, change.memberDay.userId, groupId)
    KindCase.MEMBER_PATTERN -> {
      val userId = change.memberPattern.userId
      val value = change.memberPattern.pattern
      if (value.hasPattern()) {
        val pattern = value.pattern.row(value.id)
        upsert(
          MemberPatternRow(
            groupId = groupId,
            userId = userId,
            id = pattern.id,
            name = pattern.name,
            emoji = pattern.emoji,
            symbol = pattern.symbol,
            icon = pattern.icon,
            color = pattern.color,
            start = pattern.start,
            end = pattern.end,
            countsAsOff = pattern.countsAsOff,
            nextDay = pattern.nextDay,
          )
        )
      } else {
        deleteMemberPattern(groupId, userId, value.id)
      }
    }
    KindCase.MEMBER_REPEAT_ORDERS -> {
      val userId = change.memberRepeatOrders.userId
      deleteMemberOrders(groupId, userId)
      insertMemberOrders(
        change.memberRepeatOrders.orders.ordersList.mapIndexed { position, order ->
          val own = order.row(position)
          MemberOrderRow(
            groupId = groupId,
            userId = userId,
            position = position,
            start = own.start,
            anchor = own.anchor,
            sequence = own.sequence,
            holidaysOff = own.holidaysOff,
            holidayShift = own.holidayShift,
            holidayCountry = own.holidayCountry,
          )
        }
      )
    }
    else -> return
  }
}

/** One field of a member's day; a day with none left has no row. A group never holds the memo or the people. */
private suspend fun SyncDao.takeDay(value: DayValue, userId: String, groupId: String) {
  val empty = MemberDayRow(groupId, userId, value.date)
  val row = memberDay(groupId, userId, value.date) ?: empty
  val field = if (value.hasValue()) value.value else null
  val shown =
    when (value.field) {
      DayField.DAY_FIELD_PATTERN -> row.copy(pattern = field)
      DayField.DAY_FIELD_START -> row.copy(start = field)
      DayField.DAY_FIELD_END -> row.copy(end = field)
      else -> return
    }
  if (shown == empty) deleteMemberDay(groupId, userId, value.date) else upsert(shown)
}

private val GroupMark.value
  get() = GroupMarkValue(emoji, icon, letter, color, photoId)
