import PochicalKit
import SQLiteData
import SwiftUI

/// A group's chat and who wrote its lines, read again as either changes.
struct ChatRequest: FetchKeyRequest, Hashable {
  let groupID: String
  let threadID: String
  /// The reader, whose reactions still on their way show at once.
  var me: String?
  /// The first line shown, once the chat has opened; none as it opens
  /// (Chats.state).
  var from: Int64?

  struct Value: Hashable, Sendable {
    var state = ChatState(lines: [], waiting: [], atStart: true, marks: [:])
    /// Everyone who has been in the group, those who left too.
    var writers: [GroupMemberRow] = []
  }

  func fetch(_ db: Database) throws -> Value {
    Value(
      state: try Chats.state(of: threadID, in: groupID, me: me, from: from, db: db),
      writers: try Chats.writers(in: groupID, db: db))
  }
}

/// The chat a screen shows, read for it alone for as long as the screen
/// is there. SwiftUI makes a screen's state anew each time its parent
/// draws and keeps only the first, so this reads nothing as it is made:
/// the chat is read as the screen first draws, in that frame, and again
/// as the database or the request changes. A read made with the screen
/// (`@Fetch` given its request) was made again at each of those, and the
/// request it began with kept being read beside the one laid out.
@MainActor
final class ChatFeed {
  private var request: ChatRequest
  private var fetch: Fetch<ChatRequest.Value>?

  init(_ request: ChatRequest) {
    self.request = request
  }

  var value: ChatRequest.Value {
    if let fetch { return fetch.wrappedValue }
    let made = Fetch(wrappedValue: ChatRequest.Value(), request)
    fetch = made
    return made.wrappedValue
  }

  /// Reads the chat again as `request` asks, and from then on.
  func load(_ request: ChatRequest) async {
    self.request = request
    _ = try? await fetch?.load(request)
  }
}

/// A chat's latest line and unread count for `me`, and everyone's names
/// for its writer and mentions, read again as they change.
struct ChatSummaryRequest: FetchKeyRequest, Hashable {
  let groupID: String
  let threadID: String
  let me: String

  struct Value: Hashable, Sendable {
    var summary = ChatSummary()
    /// Everyone who has been in the group by id, those who left too.
    var names: [String: String] = [:]
    /// Those whose account is deleted, whose lines are gone.
    var deleted: Set<String> = []
  }

  func fetch(_ db: Database) throws -> Value {
    let writers = try Chats.writers(in: groupID, db: db)
    return Value(
      summary: try Chats.summary(of: threadID, in: groupID, me: me, db: db),
      names: writers.shownNames,
      deleted: Set(writers.filter(\.deleted).map(\.userID)))
  }
}
