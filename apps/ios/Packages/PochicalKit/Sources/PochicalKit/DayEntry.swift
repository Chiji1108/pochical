import PochicalDesign

/// A day as it shows: its shift, and what else it has.
public struct DayEntry: Hashable, Sendable {
  public var shift: PatternID
  /// Set only when the time differs from the pattern's standard time.
  public var start: String?
  public var end: String?
  public var note: String?
  /// The coworkers noted on the day, by id, in the order they were added.
  public var people: [String]?

  public init(
    shift: PatternID, start: String? = nil, end: String? = nil, note: String? = nil,
    people: [String]? = nil
  ) {
    self.shift = shift
    self.start = start
    self.end = end
    self.note = note
    self.people = people
  }
}

/// What the person set on a day themselves, the only days kept
/// (spec/shift-patterns.md, Repeating orders): a shift of their own, or
/// `Days.noShift` for a day cleared on purpose. A day without one follows
/// its repeating order.
public struct OwnDay: Hashable, Sendable {
  public var shift: PatternID?
  public var start: String?
  public var end: String?
  public var note: String?
  public var people: [String]?

  public init(
    shift: PatternID? = nil, start: String? = nil, end: String? = nil, note: String? = nil,
    people: [String]? = nil
  ) {
    self.shift = shift
    self.start = start
    self.end = end
    self.note = note
    self.people = people
  }

  var isEmpty: Bool {
    self == OwnDay()
  }
}

/// Every day that shows a shift, from the person's own days and their
/// orders' (`plannedShifts`): its own shift, else its order's, with
/// `known` the person's patterns. A day whose shift is `Days.noShift`, or
/// names a pattern that is gone, shows nothing (spec/sync-protocol.md,
/// Deleted values).
public func shownDays(
  own: [Day: OwnDay], planned: [Day: PatternID], known: Set<PatternID>
) -> [Day: DayEntry] {
  var shown: [Day: DayEntry] = [:]
  for day in Set(own.keys).union(planned.keys) {
    let own = own[day]
    guard let shift = own?.shift ?? planned[day], known.contains(shift) else {
      continue
    }
    shown[day] = DayEntry(
      shift: shift, start: own?.start, end: own?.end, note: own?.note, people: own?.people)
  }
  return shown
}

/// The person's own days once `edits` set the days they name to show an
/// entry, or nothing. Only what differs from the order is kept: a day
/// showing its planned shift keeps no shift of its own, and clearing a day
/// the order fills keeps `Days.noShift` there.
public func editedOwnDays(
  own: [Day: OwnDay], planned: [Day: PatternID], edits: [Day: DayEntry?]
) -> [Day: OwnDay] {
  var edited = own
  for (day, entry) in edits {
    edited[day] = ownDay(showing: entry, planned: planned[day], previous: own[day])
  }
  return edited
}

/// The memo is the day's, not the shift's (spec/shift-patterns.md, A
/// day's memo): an entry without one keeps `previous`'s, and "" clears it.
private func ownDay(showing entry: DayEntry?, planned: PatternID?, previous: OwnDay?)
  -> OwnDay?
{
  let note = (entry?.note ?? previous?.note).flatMap { $0.isEmpty ? nil : $0 }
  guard let entry else {
    let kept = OwnDay(shift: planned == nil ? nil : Days.noShift, note: note)
    return kept.isEmpty ? nil : kept
  }
  // A day with nobody on it keeps no people, not an empty list.
  let kept = OwnDay(
    shift: entry.shift == planned ? nil : entry.shift, start: entry.start, end: entry.end,
    note: note, people: entry.people?.isEmpty == true ? nil : entry.people)
  return kept.isEmpty ? nil : kept
}

/// Starting an order, or correcting the one in use, gives the days from its
/// start back to it: their own shifts and times go, memos and people stay.
public func givingDaysToOrder(own: [Day: OwnDay], from start: Day) -> [Day: OwnDay] {
  var given: [Day: OwnDay] = [:]
  for (day, kept) in own {
    if day < start {
      given[day] = kept
      continue
    }
    let left = OwnDay(note: kept.note, people: kept.people)
    if !left.isEmpty {
      given[day] = left
    }
  }
  return given
}


