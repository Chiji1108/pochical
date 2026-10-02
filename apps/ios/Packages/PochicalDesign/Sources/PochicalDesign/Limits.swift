// Code generated from design/ by `mise run gen`. Do not edit.

/// How long free text may be, in characters as a reader sees them, by what it is (spec/text-limits.md).
public enum TextLimits {
  public static let chatMessage = 1000
  public static let dayNote = 100
  public static let groupMark = 2
  public static let groupName = 30
  public static let personName = 20
  public static let shiftMark = 1
  public static let shiftName = 8
}

/// How a field shows its count and how a shift's name shortens in a day (spec/text-limits.md).
public enum TextFields {
  public static let countAlwaysUpTo = 30
  public static let countWhenLeft = 20
  public static let dayNameLength = 3
}

/// The most days one chat message shares.
public let sharedDaysMax = 31

/// The most people in one group.
public let groupMaxMembers = 100

/// The most people one person keeps in 一緒に働く人.
public let coworkersMax = 100
