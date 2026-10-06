import Foundation
import PochicalDesign
import PochicalProto
import SQLiteData

/// What the user's socket brings into the device's database
/// (spec/sync-protocol.md, Sockets; Change log and cursor), each in one
/// transaction with the cursor it moves.
public enum Sync {
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
    for var edit in try OutboxEdit.order(by: \.id).fetchAll(db) {
      last = last.tick(now: now + state.offsetMs)
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
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .groupProfile, .member,
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
    case .hello, .ping, .chatEdits, .chatPageRequest, nil: 0
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
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .groupProfile, .member,
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
    case .memberDay, .memberPattern, .memberRepeatOrders, .membership, .groupProfile, .member,
      .chatLine, .readMark, nil:
      break
    }
  }
}

/// The most a device waits before a try to reconnect, `tries` counting the
/// tries since the last Welcome, this one included: `firstMs` doubled for
/// each try before it, up to `mostMs` (spec/vectors/reconnect.json). The
/// wait is drawn at random from 0 up to it.
public func reconnectWaitMost(tries: Int, firstMs: Int, mostMs: Int) -> Int {
  var most = firstMs
  for _ in 1..<max(tries, 1) where most < mostMs {
    most *= 2
  }
  return min(most, mostMs)
}
