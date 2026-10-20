import PochicalProto

/// Orders taken at `clock` that clear the days from `from`, "YYYY-MM-DD":
/// a new job's order (spec/sync-protocol.md, Repeating orders).
public struct OrderFloor: Hashable, Sendable, Decodable {
  public var from: String
  public var clock: Clock

  public init(from: String, clock: Clock) {
    self.from = from
    self.clock = clock
  }
}

/// Whether a day's value gives way to orders taken from `floor.from` at
/// `floor.clock`: a shift or a time, on or after `from`, set before them
/// (spec/vectors/order-clears.json).
public func givesWay(date: String, field: Pochical_V1_DayField, set: Clock, floor: OrderFloor)
  -> Bool
{
  let ordered: Set<Pochical_V1_DayField> = [.pattern, .start, .end]
  return date >= floor.from && ordered.contains(field) && set < floor.clock
}

extension Clock {
  /// The clock as the wire carries it.
  init(_ hlc: Pochical_V1_Hlc) {
    self.init(ms: hlc.physicalMs, counter: hlc.counter, device: hlc.deviceID)
  }
}
