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
  /// The `follow()` going on, the last begun; none once it has ended. The
  /// chat is read as the screen first draws, before one begins.
  private var follower: UUID? = UUID()

  init(_ request: ChatRequest) {
    self.request = request
  }

  var value: ChatRequest.Value {
    if let fetch { return fetch.wrappedValue }
    let made = Fetch(wrappedValue: ChatRequest.Value(), request)
    fetch = made
    return made.wrappedValue
  }

  /// Reads the chat again as `request` asks, and from then on; once the
  /// screen is gone, only keeps it for `follow()`.
  func load(_ request: ChatRequest) async {
    self.request = request
    guard follower != nil else { return }
    _ = try? await fetch?.load(request)
  }

  /// Reads the chat for as long as the calling task runs, the screen's
  /// while it is shown, and stops with it: SwiftUI keeps a closed screen's
  /// state a while longer (its toolbar until the next push, its last
  /// text field's environment until another is typed in), and the read
  /// went on with it.
  func follow() async {
    guard let fetch else { return }
    let me = UUID()
    follower = me
    let subscription = try? await fetch.load(request)
    try? await subscription?.task
    if follower == me { follower = nil }
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
