/// How a day's time moved from its pattern's standard time: starting
/// earlier is 早出 and ending later is 残業, the two people most need to
/// see on the month. A later start or an earlier end is neither.
public struct TimeChange: Hashable, Sendable {
  public var early: Bool
  public var late: Bool

  public init(early: Bool, late: Bool) {
    self.early = early
    self.late = late
  }
}

/// The change of a day with its own `start` or `end` against `standard`,
/// nil when it has neither or the pattern has no time. Times are counted
/// from the standard start around the clock, so a night shift's end the
/// next morning, or a start the evening before, compares the right way.
public func timeChange(start: String?, end: String?, standard: ShiftTime?) -> TimeChange? {
  guard let standard, start != nil || end != nil else {
    return nil
  }
  let day = 24 * 60
  let standardStart = minutes(of: standard.start)
  func fromStart(_ time: String) -> Int {
    let offset = minutes(of: time) - standardStart
    if offset > day / 2 {
      return offset - day
    }
    return offset < -day / 2 ? offset + day : offset
  }
  func endOf(_ time: String) -> Int {
    let offset = minutes(of: time) - standardStart
    return offset <= 0 ? offset + day : offset
  }
  return TimeChange(
    early: start.map { fromStart($0) < 0 } ?? false,
    late: end.map { endOf($0) > endOf(standard.end) } ?? false)
}

/// "HH:MM" as minutes since midnight.
private func minutes(of time: String) -> Int {
  let parts = time.split(separator: ":").compactMap { Int($0) }
  return (parts.first ?? 0) * 60 + (parts.dropFirst().first ?? 0)
}
