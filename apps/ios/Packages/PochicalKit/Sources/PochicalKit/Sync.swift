import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData

/// What the user's socket brings into the device's database
/// (spec/sync-protocol.md, Sockets; Change log and cursor), each in one
/// transaction with the cursor it moves.
public enum Sync {
  /// The sync schema the app reads Changes by. Raise it whenever the app
  /// starts reading a Change, or a field of one, it did not read before.
  /// A device moves its cursors past Changes it cannot read, so after the
  /// update it takes everything again (`takeAllAgainIfOlder`). 3: a
  /// chat line's content as one kind (`ChatLine.content`). 4: the notice
  /// of a member Pochical's people took out (`REMOVED_BY_POCHICAL`). 5 and
  /// 6: a preference's value as its key's message, 5 recorded before it
  /// moved to its own field (`PreferenceValue.message`), never shipped.
  /// `mise run sync:check` fails when `Change`'s messages in proto/ change
  /// while this stays, and its `--write` records each raise in
  /// `sync-wire.json`.
  static let schema = 6

  /// A device that took its values under an older schema moves every
  /// cursor back to the start, its User DO's and every place's, so its
  /// next Hellos bring everything again, read as the app reads now. Its
  /// values stay until overwritten, so its calendar still shows offline,
  /// and its outboxes stay to send. Its chats' lines go, as at a Reset: a
  /// catch-up from the start brings only each chat's latest page, so a
  /// change to an earlier line held would never come; they come again as
  /// pages.
  static func takeAllAgainIfOlder(in db: Database) throws {
    var state = try SyncState.current(in: db)
    guard state.schema < schema else { return }
    state.cursor = 0
    state.schema = schema
    try SyncState.upsert { state }.execute(db)
    for place in try GroupCursorRow.fetchAll(db) {
      try Chats.reset(place.groupID, in: db)
    }
    try GroupCursorRow.update { $0.cursor = Int64(0) }.execute(db)
  }

  /// The cursor to say in Hello: the last change taken, 0 before any.
  public static func cursor(in db: Database) throws -> UInt64 {
    UInt64(max(try SyncState.current(in: db).cursor, 0))
  }

  /// Welcome: the device's time is corrected by the server's from now on
  /// (HLC).
  public static func welcome(sentMs: Int64, receivedMs: Int64, serverMs: Int64, in db: Database)
    throws
  {
    var state = try SyncState.current(in: db)
    state.offsetMs = clockOffset(sentMs: sentMs, receivedMs: receivedMs, serverMs: serverMs)
    try SyncState.upsert { state }.execute(db)
  }

  /// Changes, in cursor order: each is the server's value from now on,
  /// the device's clock goes past each, so its next edit orders after
  /// them, and the cursor moves to the last.
  public static func take(_ changes: [Pochical_V1_Change], in db: Database) throws {
    var state = try SyncState.current(in: db)
    var last = HlcTime(ms: state.lastMs, counter: UInt32(state.lastCounter))
    for change in changes {
      try OwnValues.take(change, in: db)
      try Groups.take(change, in: db)
      if let hlc = change.hlc {
        last = last.receiving(HlcTime(ms: hlc.physicalMs, counter: hlc.counter))
      }
      state.cursor = max(state.cursor, Int64(change.cursor))
    }
    state.lastMs = last.ms
    state.lastCounter = Int64(last.counter)
    try SyncState.upsert { state }.execute(db)
  }

  /// Reset: the server's values go, the outbox stays, and the cursor goes
  /// back to the start for the Changes with everything that follow.
  public static func reset(in db: Database) throws {
    try OwnValues.reset(in: db)
    try Groups.reset(in: db)
    var state = try SyncState.current(in: db)
    state.cursor = 0
    try SyncState.upsert { state }.execute(db)
  }
}

extension Sync {
  /// The newest edit in the outbox, nil when none waits.
  public static func lastWaiting(in db: Database) throws -> Int? {
    try OutboxEdit.order { $0.id.desc() }.fetchOne(db)?.id
  }

  /// The outbox's edits after `id`, in order, as frames: a run of edits of
  /// one kind goes in one frame, up to `editsPerFrame`, each with its
  /// `op_id` and its clock (Outbox). Also the last edit's id.
  public static func frames(after id: Int, in db: Database) throws -> (
    frames: [Pochical_V1_ClientFrame], last: Int
  ) {
    var frames: [Pochical_V1_ClientFrame] = []
    var last = id
    for edit in try OutboxEdit.where({ $0.id > id }).order(by: \.id).fetchAll(db) {
      last = edit.id
      let change = try Pochical_V1_Change(serializedBytes: edit.change)
      var frame = frames.popLast() ?? Pochical_V1_ClientFrame()
      if !frame.add(change, opID: edit.opID, clearFrom: edit.clearFrom) {
        if frame.kind != nil {
          frames.append(frame)
        }
        frame = Pochical_V1_ClientFrame()
        frame.add(change, opID: edit.opID, clearFrom: edit.clearFrom)
      }
      frames.append(frame)
    }
    return (frames, last)
  }

  /// After CODE_CLOCK_AHEAD, once Welcome has corrected the device's time
  /// (HLC): the clock starts again from the latest among the changes taken,
  /// dropping the device's own far-ahead one, and every waiting edit takes
  /// a new clock from it, in outbox order, so they keep their order and
  /// come after everything taken.
  public static func restamp(now: Int64, in db: Database) throws {
    var state = try SyncState.current(in: db)
    var last = HlcTime(ms: 0, counter: 0)
    for value in try ServerValue.fetchAll(db) {
      if let hlc = try Pochical_V1_Change(serializedBytes: value.change).hlc {
        last = last.receiving(HlcTime(ms: hlc.physicalMs, counter: hlc.counter))
      }
    }
    let edits = try OutboxEdit.order(by: \.id).fetchAll(db)
    for var edit in edits {
      last = last.tick(now: state.corrected(now))
      var hlc = Pochical_V1_Hlc()
      hlc.physicalMs = last.ms
      hlc.counter = last.counter
      hlc.deviceID = state.deviceID
      var change = try Pochical_V1_Change(serializedBytes: edit.change)
      change.setHlc(hlc)
      edit.change = try change.serializedData()
      try OutboxEdit.upsert { edit }.execute(db)
    }
    state.lastMs = last.ms
    state.lastCounter = Int64(last.counter)
    try SyncState.upsert { state }.execute(db)
    // A waiting new job's order with its new clock may take back more.
    try OwnValues.showDays(from: edits.compactMap(\.clearFrom), in: db)
  }
}

extension Pochical_V1_ClientFrame {
  /// Adds the edit to the frame when the frame is empty or carries edits
  /// of its kind, with room left; false otherwise.
  @discardableResult
  mutating func add(_ change: Pochical_V1_Change, opID: String, clearFrom: String?) -> Bool {
    guard editCount < SyncLimits.editsPerFrame else { return false }
    switch change.kind {
    case .day(let value):
      switch kind {
      case nil, .dayEdits: break
      default: return false
      }
      var edit = Pochical_V1_DayEdit()
      edit.opID = opID
      edit.value = value
      dayEdits.edits.append(edit)
    case .pattern, .patternOrder:
      switch kind {
      case nil, .patternEdits: break
      default: return false
      }
      var edit = Pochical_V1_PatternEdit()
      edit.opID = opID
      if case .pattern(let value) = change.kind { edit.pattern = value }
      if case .patternOrder(let order) = change.kind { edit.order = order }
      patternEdits.edits.append(edit)
    case .repeatOrders(let orders):
      switch kind {
      case nil, .repeatOrdersEdits: break
      default: return false
      }
      var edit = Pochical_V1_RepeatOrdersEdit()
      edit.opID = opID
      edit.orders = orders
      if let clearFrom { edit.clearFrom_p = clearFrom }
      repeatOrdersEdits.edits.append(edit)
    case .coworker, .coworkerOrder:
      switch kind {
      case nil, .coworkerEdits: break
      default: return false
      }
      var edit = Pochical_V1_CoworkerEdit()
      edit.opID = opID
      if case .coworker(let value) = change.kind { edit.coworker = value }
      if case .coworkerOrder(let order) = change.kind { edit.order = order }
      coworkerEdits.edits.append(edit)
    case .preference(let value):
      switch kind {
      case nil, .preferenceEdits: break
      default: return false
      }
      var edit = Pochical_V1_PreferenceEdit()
      edit.opID = opID
      edit.value = value
      preferenceEdits.edits.append(edit)
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .unreadCount, .block, .chatMute, .chatNotifications, .profile,
      .groupProfile,
      .member,
      .chatLine, .readMark, nil:
      return false
    }
    return true
  }

  private var editCount: Int {
    switch kind {
    case .dayEdits(let edits): edits.edits.count
    case .patternEdits(let edits): edits.edits.count
    case .repeatOrdersEdits(let edits): edits.edits.count
    case .coworkerEdits(let edits): edits.edits.count
    case .preferenceEdits(let edits): edits.edits.count
    case .hello, .ping, .chatEdits, .chatPageRequest, .chatPhotosRequest, .typing, nil: 0
    }
  }
}

extension Pochical_V1_Change {
  /// The clock of the value the change carries.
  var hlc: Pochical_V1_Hlc? {
    switch kind {
    case .day(let value): value.hasHlc ? value.hlc : nil
    case .pattern(let value): value.hasHlc ? value.hlc : nil
    case .patternOrder(let value): value.hasHlc ? value.hlc : nil
    case .repeatOrders(let value): value.hasHlc ? value.hlc : nil
    case .coworker(let value): value.hasHlc ? value.hlc : nil
    case .coworkerOrder(let value): value.hasHlc ? value.hlc : nil
    case .preference(let value): value.hasHlc ? value.hlc : nil
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .unreadCount, .block, .chatMute, .chatNotifications, .profile,
      .groupProfile,
      .member,
      .chatLine, .readMark, nil:
      nil
    }
  }

  /// Puts `hlc` on the value the change carries.
  fileprivate mutating func setHlc(_ hlc: Pochical_V1_Hlc) {
    switch kind {
    case .day: day.hlc = hlc
    case .pattern: pattern.hlc = hlc
    case .patternOrder: patternOrder.hlc = hlc
    case .repeatOrders: repeatOrders.hlc = hlc
    case .coworker: coworker.hlc = hlc
    case .coworkerOrder: coworkerOrder.hlc = hlc
    case .preference: preference.hlc = hlc
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .unreadCount, .block, .chatMute, .chatNotifications, .profile,
      .groupProfile,
      .member,
      .chatLine, .readMark, nil:
      break
    }
  }
}

/// The most a device waits before a try to reconnect, `tries` counting the
/// tries since a socket last caught up, this one included: `firstMs` doubled for
/// each try before it, up to `mostMs` (spec/vectors/reconnect.json). The
/// wait is drawn at random from 0 up to it.
public func reconnectWaitMost(tries: Int, firstMs: Int, mostMs: Int) -> Int {
  var most = firstMs
  for _ in 1..<max(tries, 1) where most < mostMs {
    most *= 2
  }
  return min(most, mostMs)
}

/// The tries a socket makes since it last caught up, the one under way or
/// waited for included, which the wait before each grows by
/// (spec/sync-protocol.md, Reconnecting; spec/vectors/reconnect.json, tries).
struct ReconnectTries: Sendable {
  private var count = 0

  /// A try at once, the count started again: the socket was asked to be
  /// open, another network became the default, or its clocks were ahead.
  mutating func atOnce() {
    count = 1
  }

  /// The Pong to the Ping after Welcome: the next try is the first again.
  mutating func caughtUp() {
    count = 0
  }

  /// The socket dropped: the try after it, which waits up to
  /// `reconnectWaitMost` for the count it returns.
  mutating func dropped() -> Int {
    count += 1
    return count
  }
}

/// What the sockets hear of the device's default network (spec/sync-protocol.md,
/// Keepalive): none, or another than the one before.
enum NetworkChange: Equatable, Sendable {
  case lost
  case changed
}

/// Which network is the device's default (spec/vectors/reconnect.json,
/// defaultNetwork), `now` the one as the watch begins, nil for none.
struct DefaultNetwork<Network: Equatable & Sendable>: Sendable {
  private(set) var now: Network?

  /// `network` is the default now, nil for none: what the sockets hear of
  /// it, nothing when it already was.
  mutating func becomes(_ network: Network?) -> NetworkChange? {
    guard network != now else { return nil }
    now = network
    return network == nil ? .lost : .changed
  }
}
