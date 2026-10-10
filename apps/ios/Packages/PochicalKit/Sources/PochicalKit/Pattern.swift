import Foundation
import PochicalDesign
/// A pattern's id, as a day names its shift.
public typealias PatternID = String

/// A shift pattern, as the person made it (spec/shift-patterns.md, A
/// pattern): its name, its mark in each look, its standard time, and what
/// it means for the days it is on.
public struct Pattern: Hashable, Sendable, Identifiable {
  public var id: PatternID
  public var name: String
  public var emoji: String
  public var symbol: String
  public var icon: String
  /// The mark's color slot, an index into the mark palette.
  public var color: Int
  /// Without one it is all-day, with no time to change.
  public var time: ShiftTime?
  /// Counted among the month's days off, and marked as one.
  public var countsAsOff: Bool
  /// Another pattern entered on the following day too, like 明け after 夜勤.
  public var nextDay: PatternID?

  public init(
    id: PatternID, name: String, emoji: String, symbol: String, icon: String, color: Int,
    time: ShiftTime? = nil, countsAsOff: Bool = false, nextDay: PatternID? = nil
  ) {
    self.id = id
    self.name = name
    self.emoji = emoji
    self.symbol = symbol
    self.icon = icon
    self.color = color
    self.time = time
    self.countsAsOff = countsAsOff
    self.nextDay = nextDay
  }
}

/// A standard start and end, "HH:MM". An end at or before the start runs
/// past midnight.
public struct ShiftTime: Hashable, Sendable {
  public var start: String
  public var end: String

  public init(start: String, end: String) {
    self.start = start
    self.end = end
  }
}

/// What a holiday becomes for someone off on them: the pattern picked,
/// while it counts as a day off, else their first that does
/// (spec/vectors/repeat.json, holidayShift).
public func holidayShift(of patterns: [Pattern], picked: PatternID? = nil) -> PatternID? {
  let offs = patterns.filter(\.countsAsOff)
  return (offs.first { $0.id == picked } ?? offs.first)?.id
}

/// The patterns once `id` is deleted (spec/shift-patterns.md, Deleting a
/// pattern): it goes from the list and nothing that names it changes, as
/// days, orders and next days read it as a pattern that is gone.
public func patterns(_ patterns: [Pattern], without id: PatternID) -> [Pattern] {
  patterns.filter { $0.id != id }
}

/// The patterns after changing jobs (spec/shift-patterns.md, Changing
/// jobs): the new job's take over, and an old one still on a day before
/// the switch (`usedBefore`) stays after them. A ready-made one the person
/// has changed, still on those days, keeps its id; the new job's then
/// comes in under a fresh one (`newID`), which its order and next days use.
public func patternsForJob(
  own: [Pattern], incoming: [Pattern], sequence: [PatternID],
  usedBefore: (PatternID) -> Bool, newID: () -> PatternID
) -> (patterns: [Pattern], sequence: [PatternID]) {
  var renamed: [PatternID: PatternID] = [:]
  for pattern in incoming {
    if let theirs = own.first(where: { $0.id == pattern.id }), usedBefore(theirs.id),
      !theirs.isSame(as: pattern)
    {
      renamed[pattern.id] = newID()
    }
  }
  let renameOf = { (id: PatternID) in renamed[id] ?? id }
  let coming = incoming.map { pattern in
    var pattern = pattern
    pattern.id = renameOf(pattern.id)
    pattern.nextDay = pattern.nextDay.map(renameOf)
    return pattern
  }
  let kept = own.filter { pattern in
    !coming.contains { $0.id == pattern.id } && usedBefore(pattern.id)
  }
  return (coming + kept, sequence.map(renameOf))
}

extension Pattern {
  /// Whether two patterns would show and count a day the same way.
  func isSame(as other: Pattern) -> Bool {
    var other = other
    other.id = id
    return self == other
  }
}

/// A new pattern's mark from its name (spec/vectors/patterns.json,
/// guessLook): the first hint with a word anywhere in the name gives its
/// emoji and icon, else a star and the letter icon; the letter is the
/// name's first character, trimmed.
public func guessLook(_ name: String) -> (emoji: String, icon: String, symbol: String) {
  let hint = ReadyPatterns.lookHints.first { hint in
    hint.words.contains { name.contains($0) }
  }
  let letter = name.trimmingCharacters(in: .whitespacesAndNewlines).first.map(String.init) ?? ""
  return (
    hint?.emoji ?? ReadyPatterns.fallbackEmoji, hint?.icon ?? ReadyPatterns.fallbackIcon, letter
  )
}

/// A new pattern's color slot (spec/vectors/patterns.json, nextColor): the
/// first of the palette's `slots` no pattern uses, else the count of
/// patterns modulo the slots.
public func nextColor(_ used: [Int], slots: Int) -> Int {
  (0..<slots).first { !used.contains($0) } ?? used.count % slots
}
