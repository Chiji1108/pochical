/// A device's last hybrid logical clock (spec/sync-protocol.md, HLC); its
/// edits add the device's id. Only the server compares clocks: a device
/// shows what the server has decided (spec/vectors/local-edits.json).
public struct HlcTime: Hashable, Sendable, Codable {
  public var ms: Int64
  public var counter: UInt32

  public init(ms: Int64, counter: UInt32) {
    self.ms = ms
    self.counter = counter
  }

  /// The clock of a local edit, after this one, at the device's corrected
  /// now. At the counter's end the clock moves to the next millisecond.
  public func tick(now: Int64) -> HlcTime {
    if now > ms {
      return HlcTime(ms: now, counter: 0)
    }
    if counter == .max {
      return HlcTime(ms: ms + 1, counter: 0)
    }
    return HlcTime(ms: ms, counter: counter + 1)
  }

  /// The device's last clock once it takes a change, so its next edit
  /// orders after the change.
  public func receiving(_ remote: HlcTime) -> HlcTime {
    let isAfter = remote.ms > ms || (remote.ms == ms && remote.counter > counter)
    return isAfter ? remote : self
  }
}

/// What the device adds to its own time to correct it, from when it sent
/// Hello, when Welcome arrived and Welcome's server_ms: the server's time
/// against the middle of the round trip.
public func clockOffset(sentMs: Int64, receivedMs: Int64, serverMs: Int64) -> Int64 {
  serverMs - (sentMs + receivedMs) / 2
}
