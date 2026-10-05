import Foundation
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
    var state = try SyncState.current(in: db)
    state.cursor = 0
    try SyncState.upsert { state }.execute(db)
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
    case .memberDay, .memberPattern, .memberRepeatOrders, nil: nil
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
