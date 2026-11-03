import PochicalDesign
import PochicalProto

// What the server takes of each value the app edits (design/src/values.ts;
// spec/vectors/fits.json), checked before the value is kept, so a value
// kept stays once sent rather than going back on the next sync with the
// edits around it. A pattern's own rule is `fitsPattern`.

/// A value the server would refuse, so it is not kept.
public struct Unfit: Error, Equatable {}

/// Whether the text can be an id or an icon's name: 1 to
/// `SyncLimits.idLength` UTF-16 units, as the server counts them, with no
/// spaces.
func isID(_ text: String) -> Bool {
  !text.isEmpty && text.utf16.count <= SyncLimits.idLength
    && !text.contains(where: \.isWhitespace)
}

/// Whether the text is a time of day as "HH:MM", 00:00 to 23:59.
func isClockTime(_ text: String) -> Bool {
  text.wholeMatch(of: /(?:[01][0-9]|2[0-3]):[0-5][0-9]/) != nil
}

/// Whether the server keeps `value` for a day's `field`; clearing, nil,
/// always fits (spec/vectors/fits.json, dayField).
public func fitsDayField(_ field: Pochical_V1_DayField, _ value: String?) -> Bool {
  guard let value else { return true }
  switch field {
  case .pattern: return value == Days.noShift || isID(value)
  case .start, .end: return isClockTime(value)
  case .note: return fitsDayNote(value)
  case .people: return fitsDayPeople(value.split(separator: " ", omittingEmptySubsequences: false).map(String.init))
  case .unspecified, .UNRECOGNIZED: return false
  }
}

/// A day's memo: up to `TextLimits.dayNote` characters, spaces and all.
public func fitsDayNote(_ note: String) -> Bool {
  withinLimit(note, TextLimits.dayNote)
}

/// A day's people: coworker ids, each once, and `SyncLimits.peopleADay` at
/// most, so a day that has them all takes no one more.
public func fitsDayPeople(_ ids: [String]) -> Bool {
  !ids.isEmpty && ids.count <= SyncLimits.peopleADay && Set(ids).count == ids.count
    && ids.allSatisfy(isID)
}

/// A coworker's name: 1 to `TextLimits.personName` characters, not only
/// spaces.
public func fitsCoworkerName(_ name: String) -> Bool {
  fitsText(name, limit: TextLimits.personName)
}

/// A person's name as their profile or a group shows it, trimmed: up to
/// `TextLimits.personName` characters; empty is no name of their own.
public func fitsPersonName(_ name: String) -> Bool {
  withinLimit(name.trimmingCharacters(in: .whitespacesAndNewlines), TextLimits.personName)
}

/// A group's name: 1 to `TextLimits.groupName` characters, not only spaces.
public func fitsGroupName(_ name: String) -> Bool {
  fitsText(name, limit: TextLimits.groupName)
}

/// A group's mark: exactly one of one emoji, a mark icon (never "letter",
/// which only patterns draw), 1 to `TextLimits.groupMark` letters, not
/// only spaces, and a photo's id, with a color of the palette.
public func fitsGroupMark(_ mark: GroupMarkValue) -> Bool {
  [mark.emoji, mark.icon, mark.letter, mark.photoID].count { !$0.isEmpty } == 1
    && (mark.emoji.isEmpty || isEmoji(mark.emoji))
    && (mark.icon.isEmpty || MarkIcons.layers(mark.icon, filled: false, size: 1) != nil)
    && (mark.letter.isEmpty || fitsText(mark.letter, limit: TextLimits.groupMark))
    && (mark.photoID.isEmpty || isID(mark.photoID))
    && (0..<markSlots).contains(mark.color)
}

/// The patterns' order: pattern ids, each once, and `SyncLimits.patterns`
/// at most, so a person who keeps that many adds no more.
public func fitsPatternOrder(_ ids: [PatternID]) -> Bool {
  ids.count <= SyncLimits.patterns && Set(ids).count == ids.count && ids.allSatisfy(isID)
}

/// A repeating order's rotation: pattern ids, each as often as it comes
/// round, and `SyncLimits.sequence` at most; empty ends repeating.
public func fitsRotation(_ sequence: [PatternID]) -> Bool {
  sequence.count <= SyncLimits.sequence && sequence.allSatisfy(isID)
}

/// The repeating orders of one timeline: `SyncLimits.orders` at most, each
/// rotation fitting.
public func fitsRepeatOrders(_ orders: [RepeatOrder]) -> Bool {
  orders.count <= SyncLimits.orders && orders.allSatisfy { fitsRotation($0.sequence) }
}
