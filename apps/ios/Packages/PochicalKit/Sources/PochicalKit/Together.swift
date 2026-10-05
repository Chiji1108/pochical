/// Days everyone in a group is off (みんな休み, spec/shift-patterns.md),
/// from each member's day: true where it is a day off, false where it is
/// a work day, nil where they have not entered it
/// (spec/vectors/together.json).
public enum Together {
  /// Everyone is off. A day someone has not entered never counts, since
  /// nobody knows yet.
  public static func allOff(_ days: [Bool?]) -> Bool {
    days.allSatisfy { $0 == true }
  }

  /// Everyone may yet be off: no one who has entered the day works, but
  /// someone has not entered it.
  public static func mayAllBeOff(_ days: [Bool?]) -> Bool {
    days.contains(nil) && days.allSatisfy { $0 != false }
  }

  /// The days from `from` through `through` everyone is off, and whether
  /// some other day may yet be one.
  public static func days(_ members: [[Day: Bool]], from: Day, through: Day) -> (
    days: [Day], unsure: Bool
  ) {
    var together: [Day] = []
    var unsure = false
    var day = from
    while day <= through {
      let offs = members.map { $0[day] }
      if allOff(offs) {
        together.append(day)
      } else if mayAllBeOff(offs) {
        unsure = true
      }
      day = day.adding(days: 1)
    }
    return (together, unsure)
  }
}

extension GroupMember {
  /// Each day from `from` through `through` the member has entered or an
  /// order fills: whether it is a day off.
  public func offDays(from: Day, through: Day) -> [Day: Bool] {
    calendar.shown(from: from, through: through).compactMapValues {
      calendar.patternsByID[$0.shift]?.countsAsOff
    }
  }
}
