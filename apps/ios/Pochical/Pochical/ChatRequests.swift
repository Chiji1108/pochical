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
  /// The device's time its lines not sent are read by, the chat reading
  /// again with a later one as the next line still being sent stops going
  /// by itself (ChatState.failsAt).
  var now: Int64

  struct Value: Hashable, Sendable {
    var state = ChatState(lines: [], waiting: [], atStart: true, marks: [:])
    /// Everyone who has been in the group, those who left too.
    var writers: [GroupMemberRow] = []
  }

  func fetch(_ db: Database) throws -> Value {
    Value(
      state: try Chats.state(
        of: threadID, in: groupID, me: me, from: from, now: now, db: db),
      writers: try Chats.writers(in: groupID, db: db))
  }
}

/// A chat as a view shows it (the chat screen's lines, a list's row),
/// read for it alone. SwiftUI makes a view's state anew each time its
/// parent draws and keeps only the first, so this reads nothing as it is
/// made: the chat is read as the view first draws, in that frame, and
/// again as the database or the request changes. A read made with the
/// view (`@Fetch` given its request) was made again at each of those, on
/// the main thread, and the request it began with kept being read beside
/// the one shown. A row reads for as long as its list keeps it, so it is
/// current as a screen over the list goes; a screen reads only while it
/// is shown (`follow()`).
@MainActor
final class ChatFeed<Request: FetchKeyRequest> where Request.Value: Sendable {
  private var request: Request
  /// What shows before the first read.
  private let empty: Request.Value
  private var fetch: Fetch<Request.Value>?
  /// The `follow()` going on, the last begun; none once it has ended. The
  /// chat is read as the view first draws, before one begins.
  private var follower: UUID? = UUID()

  init(_ request: Request, empty: Request.Value) {
    self.request = request
    self.empty = empty
  }

  var value: Request.Value {
    if let fetch { return fetch.wrappedValue }
    let made = Fetch(wrappedValue: empty, request)
    fetch = made
    return made.wrappedValue
  }

  /// Reads the chat again as `request` asks, and from then on; once the
  /// view is gone, only keeps it for `follow()`.
  func load(_ request: Request) async {
    self.request = request
    guard follower != nil else { return }
    _ = try? await fetch?.load(request)
  }

  /// Reads the chat for as long as the calling task runs, the view's
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
  /// The device's time its lines not sent are read by, the row reading
  /// again with a later one as the next line still being sent stops going
  /// by itself (ChatSummary.failsAt).
  let now: Int64

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
      summary: try Chats.summary(of: threadID, in: groupID, me: me, now: now, db: db),
      names: writers.shownNames,
      deleted: Set(writers.filter(\.deleted).map(\.userID)))
  }
}
