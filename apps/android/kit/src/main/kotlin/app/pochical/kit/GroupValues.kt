package app.pochical.kit

import app.pochical.design.Chat
import app.pochical.v1.Change
import app.pochical.v1.Change.KindCase
import app.pochical.v1.DayField
import app.pochical.v1.DayValue
import app.pochical.v1.GroupMark
import app.pochical.v1.groupMark

// The user's groups as their User DO lists them, and what each group's socket brings
// (spec/sync-protocol.md, Groups; Group projection), each in one transaction with the cursor it
// moves. Nothing of a group is edited on the device.

/**
 * What the user's own socket says of them beside their values: a group they are in, a group left
 * going with what the device holds of it, and their usual name, photo and marks' shape.
 */
internal suspend fun SyncDao.takeMembership(change: Change) {
  if (change.kindCase == KindCase.PROFILE) {
    val profile = change.profile
    upsert(
      ProfileRow(
        name = profile.name,
        photoId = profile.photoId,
        markStyle = if (profile.hasMarkLook()) profile.markLook.style else "",
        markFill = if (profile.hasMarkLook()) profile.markLook.fill else true,
      )
    )
    return
  }
  if (change.kindCase != KindCase.MEMBERSHIP) return
  val membership = change.membership
  if (membership.left) {
    leaveGroup(membership.groupId)
    return
  }
  upsert(GroupRow(membership.groupId, membership.name, membership.joinedAtMs, membership.mark.value))
}

/** A group left goes from the device, with everything it holds of it. */
internal suspend fun SyncDao.leaveGroup(groupId: String) {
  deleteGroup(groupId)
  resetGroup(groupId)
  dropChats(groupId)
}

/**
 * The groups the user is in as the device holds them, each with its faces (its members' and its
 * mark's), read before a Reset of the user's socket empties the list until its catch-up brings the
 * groups again: the mark's photo goes with the list, the rest stays until the group is let go of.
 */
internal suspend fun SyncDao.facesHeld(): Map<String, List<String>> = groupIds().associateWith { groupFaces(it) }

/**
 * After a Reset's catch-up: the groups held before it ([held], with their faces then) that it did
 * not mention at all, as one the User DO, restored from an older copy, does not know. Each goes as a
 * group left does, and is said with the photos the device held of it. One it said was left went
 * with that change.
 */
internal suspend fun SyncDao.placesGone(held: Map<String, List<String>>): Map<String, List<String>> =
  held.filterKeys { !isListed(it) }.mapValues { (groupId, faces) ->
    (photosHeld(groupId) + groupFaces(groupId) + faces).distinct().also { leaveGroup(groupId) }
  }

/** A Reset of the user's socket: the groups and the profile come again with everything else. */
internal suspend fun SyncDao.resetMemberships() {
  deleteGroups()
  deleteProfile()
}

/** The cursor to say in the group's Hello: 0 before any. */
internal suspend fun SyncDao.cursorOf(groupId: String): Long = groupCursor(groupId) ?: 0

/**
 * Takes what a group's socket brought, only while the user is in the group: a frame on its way as
 * they left it (a catch-up, a page asked for, an Acked) would otherwise bring back what leaving it
 * dropped. The chat with Pochical's people is always the user's. Everything a place's socket writes
 * goes through here, in the transaction it is taken in.
 */
internal suspend fun SyncDao.intoGroup(groupId: String, block: suspend SyncDao.() -> Unit) {
  if (groupId == Chat.supportPlace || isListed(groupId)) block()
}

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
  resetChats(groupId)
}

private suspend fun SyncDao.take(change: Change, groupId: String) {
  if (takeChat(change, groupId)) return
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
        upsert(MemberPatternRow(groupId, userId, value.pattern.row(value.id)))
      } else {
        deleteMemberPattern(groupId, userId, value.id)
      }
    }
    KindCase.MEMBER_REPEAT_ORDERS -> {
      val userId = change.memberRepeatOrders.userId
      deleteMemberOrders(groupId, userId)
      insertMemberOrders(
        change.memberRepeatOrders.orders.ordersList.mapIndexed { position, order ->
          MemberOrderRow(groupId, userId, order.row(position))
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

internal val GroupMark.value
  get() = GroupMarkValue(emoji, icon, letter, color, photoId)

internal val GroupMarkValue.proto: GroupMark
  get() = groupMark {
    emoji = this@proto.emoji
    icon = this@proto.icon
    letter = this@proto.letter
    color = this@proto.color.coerceAtLeast(0)
    photoId = this@proto.photoId
  }
