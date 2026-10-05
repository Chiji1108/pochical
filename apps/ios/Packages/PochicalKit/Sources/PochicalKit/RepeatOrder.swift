import PochicalDesign

/// A repeating order of shifts (spec/shift-patterns.md, Repeating orders):
/// its sequence laid over the days from `start`, without end, counted from
/// `anchor`, a day that falls on its first shift (the start unless set).
/// An empty sequence ends repeating: from its start, days are entered by
/// hand.
public struct RepeatOrder: Hashable, Sendable {
  public var sequence: [PatternID]
  public var start: Day
  public var anchor: Day?
  /// 祝日は休みにする: the national holidays of `holidayCountry` take
  /// `holidayShift` in place of the sequence's shift.
  public var holidaysOff: Bool
  public var holidayShift: PatternID?
  /// The device's region when the order was made, like "JP".
  public var holidayCountry: String

  public init(
    sequence: [PatternID], start: Day, anchor: Day? = nil, holidaysOff: Bool = false,
    holidayShift: PatternID? = nil, holidayCountry: String
  ) {
    self.sequence = sequence
    self.start = start
    self.anchor = anchor
    self.holidaysOff = holidaysOff
    self.holidayShift = holidayShift
    self.holidayCountry = holidayCountry
  }
}

/// A sequence laid over the days from `from` through `to`, counted in whole
/// days from `anchor`, so days before the anchor line up too. With a
/// `holidayShift`, the national holidays of `holidayCountry` take it.
public func repeatSchedule(
  _ sequence: [PatternID], anchor: Day, from: Day, through to: Day,
  holidayShift: PatternID? = nil, holidayCountry: String
) -> [Day: PatternID] {
  guard !sequence.isEmpty, from <= to else {
    return [:]
  }
  var schedule: [Day: PatternID] = [:]
  var day = from
  var offset = from.days(since: anchor)
  while day <= to {
    let index = ((offset % sequence.count) + sequence.count) % sequence.count
    if let holidayShift, Holidays.name(on: day.key, in: holidayCountry) != nil {
      schedule[day] = holidayShift
    } else {
      schedule[day] = sequence[index]
    }
    day = day.adding(days: 1)
    offset += 1
  }
  return schedule
}

/// Each day's shift from `from` through `through` by the orders alone: a
/// day follows the latest order that starts on or before it. A pattern no
/// longer in `known` leaves its days empty.
public func plannedShifts(
  orders: [RepeatOrder], known: Set<PatternID>, from: Day, through: Day
) -> [Day: PatternID] {
  let ordered = orders.sorted { $0.start < $1.start }
  var planned: [Day: PatternID] = [:]
  for (index, order) in ordered.enumerated() {
    let end = index + 1 < ordered.count ? ordered[index + 1].start.adding(days: -1) : through
    let days = repeatSchedule(
      order.sequence, anchor: order.anchor ?? order.start, from: max(order.start, from),
      through: min(end, through), holidayShift: order.holidaysOff ? order.holidayShift : nil,
      holidayCountry: order.holidayCountry)
    for (day, shift) in days where known.contains(shift) {
      planned[day] = shift
    }
  }
  return planned
}

/// The orders with `order` added: it takes over from its start, so an order
/// starting on or after that day gives way to it entirely, and the newest
/// order is always the last.
public func orders(_ orders: [RepeatOrder], adding order: RepeatOrder) -> [RepeatOrder] {
  orders.filter { $0.start < order.start } + [order]
}

/// Whether a new order starts with 祝日は休みにする on: a week of shifts
/// with a pattern that counts as off on a Saturday or Sunday reads as
/// office hours, which usually have national holidays off too.
public func holidaysOffByDefault(
  _ sequence: [PatternID], start: Day, patterns: [PatternID: Pattern]
) -> Bool {
  let week = 7
  guard sequence.count == week else {
    return false
  }
  return sequence.enumerated().contains { index, shift in
    let weekday = start.adding(days: index).weekday
    return patterns[shift]?.countsAsOff == true && (weekday == 0 || weekday == 6)
  }
}
