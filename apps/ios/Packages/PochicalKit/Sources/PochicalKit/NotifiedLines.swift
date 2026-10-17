import Foundation
import SQLiteData

// What the device does with a chat line's notification (spec/chat.md,
// Notifications): who it is from, for the Notification Service Extension
// to show their face, and taking it back once the line is read.

/// The category of a chat line's notification, as the server sends it,
/// which can be answered from.
public let chatLineCategory = "CHAT_LINE"

/// A chat line's notification the device has shown: which chat and line
/// it is of, from what the server put in it.
public struct NotifiedLine: Hashable, Sendable {
  /// The notification's own id.
  public var id: String
  public var groupID: String
  public var threadID: String
  public var seq: Int64

  public init(id: String, groupID: String, threadID: String, seq: Int64) {
    self.id = id
    self.groupID = groupID
    self.threadID = threadID
    self.seq = seq
  }

  /// One read from a notification's payload; nil for one not of a line,
  /// an answer from Pochical's people or a reminder.
  public init?(id: String, payload: [AnyHashable: Any]) {
    guard let groupID = payload["groupId"] as? String, !groupID.isEmpty,
      let threadID = payload["threadId"] as? String,
      let seq = (payload["seq"] as? NSNumber)?.int64Value
    else { return nil }
    self.init(id: id, groupID: groupID, threadID: threadID, seq: seq)
  }
}

/// A chat read up to `readTo`, from a withdrawal the server sent; nil for
/// any other payload.
public struct ChatWithdrawal: Hashable, Sendable {
  public var groupID: String
  public var threadID: String
  public var readTo: Int64

  public init?(payload: [AnyHashable: Any]) {
    guard let withdraw = payload["withdraw"] as? [String: Any],
      let groupID = withdraw["groupId"] as? String,
      let threadID = withdraw["threadId"] as? String,
      let readTo = (withdraw["readTo"] as? NSNumber)?.int64Value
    else { return nil }
    self.groupID = groupID
    self.threadID = threadID
    self.readTo = readTo
  }
}

/// The ids of the notifications shown that a read of one chat takes back,
/// in the order shown: that chat's lines at or before `readTo`, all of them
/// when nil, the chat having nothing unread left (spec/vectors/chat.json,
/// withdrawn).
public func withdrawn(
  _ shown: [NotifiedLine], groupID: String, threadID: String, readTo: Int64?
) -> [String] {
  shown.filter { line in
    line.groupID == groupID && line.threadID == threadID && line.seq <= readTo ?? .max
  }
  .map(\.id)
}

/// The ids of the notifications shown whose lines the device knows are
/// read: the user's own read mark in the chat is at or past them, or the
/// chat has nothing unread left, as another device's read says.
public func readNotified(_ shown: [NotifiedLine], me: String, in db: Database) throws -> [String] {
  let marks = try ReadMarkRow.where { $0.userID.eq(me) }.fetchAll(db)
  let counts = try UnreadCountRow.fetchAll(db)
  var ids: [String] = []
  for chat in Set(shown.map { [$0.groupID, $0.threadID] }) {
    let (groupID, threadID) = (chat[0], chat[1])
    let cleared = counts.contains {
      $0.groupID == groupID && $0.threadID == threadID && $0.count == 0
    }
    let mark = marks.filter { $0.groupID == groupID && $0.threadID == threadID }
      .map(\.lastReadSeq).max()
    guard cleared || mark != nil else { continue }
    ids += withdrawn(shown, groupID: groupID, threadID: threadID, readTo: cleared ? nil : mark)
  }
  return ids
}

/// Who a chat line's notification is from and where, as the extension
/// shows it: the writer as the group shows them, and for the group's chat
/// the group with its mark and the user, for the system to show a group's
/// conversation.
public struct NotifiedFrom: Sendable {
  public var writer: WidgetWith
  /// The group, for the group's chat; nil for a one-to-one chat.
  public var group: WidgetWith?
  /// The user as the group shows them.
  public var me: WidgetWith?
}

/// Who a line of `groupID`'s chat `threadID` by `authorID` is from, as the
/// device holds them; nil before it has the group.
public func notifiedFrom(
  groupID: String, threadID: String, authorID: String, me: String?, in db: Database
) throws -> NotifiedFrom? {
  guard let group = try GroupRow.where({ $0.id.eq(groupID) }).fetchOne(db),
    let writer = try GroupMemberRow.where({ $0.groupID.eq(groupID) && $0.userID.eq(authorID) })
      .fetchOne(db)
  else { return nil }
  let mine = try me.flatMap { me in
    try GroupMemberRow.where { $0.groupID.eq(groupID) && $0.userID.eq(me) }.fetchOne(db)
  }
  return NotifiedFrom(
    writer: WidgetWith(
      kind: .person, name: writer.shownName, groupID: groupID, photoID: writer.photoID),
    group: threadID == groupThread
      ? WidgetWith(kind: .group, name: group.name, groupID: groupID, mark: group.mark) : nil,
    me: mine.map {
      WidgetWith(kind: .person, name: $0.shownName, groupID: groupID, photoID: $0.photoID)
    })
}
