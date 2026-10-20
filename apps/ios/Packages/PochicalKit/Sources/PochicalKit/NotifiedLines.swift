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

/// Whether a notification the server sent is for `me`, the user the device
/// is signed in as (spec/sync-protocol.md, Push): one for anyone else, or
/// sent while the device knows no one, shows nothing, as the device may
/// have gone on as another user since its token was sent.
public func isForSignedIn(_ payload: [AnyHashable: Any], me: String?) -> Bool {
  guard let me, let recipient = payload["recipientId"] as? String else { return false }
  return recipient == me
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

/// What the device knows is read in each chat, for taking back the
/// notifications of lines read elsewhere: the chats with nothing unread
/// left, and how far the user read each.
public struct ReadState: Hashable, Sendable {
  /// Each chat with nothing unread left.
  public var cleared: Set<ChatKey> = []
  /// The user's own read mark in each chat.
  public var marks: [ChatKey: Int64] = [:]

  public init() {}

  /// As the database holds it for the user `me`.
  public init(me: String, in db: Database) throws {
    for count in try UnreadCountRow.where({ $0.count.eq(0) }).fetchAll(db) {
      cleared.insert(ChatKey(groupID: count.groupID, threadID: count.threadID))
    }
    for mark in try ReadMarkRow.where({ $0.userID.eq(me) }).fetchAll(db) {
      let chat = ChatKey(groupID: mark.groupID, threadID: mark.threadID)
      marks[chat] = max(marks[chat] ?? 0, mark.lastReadSeq)
    }
  }
}

/// The ids of the notifications shown whose lines `read` says are read:
/// the user's own read mark in the chat is at or past them, or the chat
/// has nothing unread left, as another device's read says.
public func readNotified(_ shown: [NotifiedLine], _ read: ReadState) -> [String] {
  var ids: [String] = []
  for chat in Set(shown.map { ChatKey(groupID: $0.groupID, threadID: $0.threadID) }) {
    let cleared = read.cleared.contains(chat)
    guard cleared || read.marks[chat] != nil else { continue }
    ids += withdrawn(
      shown, groupID: chat.groupID, threadID: chat.threadID,
      readTo: cleared ? nil : read.marks[chat])
  }
  return ids
}

/// The user's ReadState, read again as the counts and marks change.
public struct ReadStateRequest: FetchKeyRequest, Hashable {
  let me: String

  public init(me: String) {
    self.me = me
  }

  public func fetch(_ db: Database) throws -> ReadState {
    try ReadState(me: me, in: db)
  }
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
