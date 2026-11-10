// Code generated from design/ by `mise run gen`. Do not edit.

/// What a day's values mean (design/src/days.ts): noShift is a day cleared on purpose, unlike no pattern, which follows the repeating order; periodLastStart and periodFirstPick bound シフトの期間; reflectedMonthsAhead is how many pages after today's 自動で反映 keeps in the device's calendar.
public enum Days {
  public static let noShift = ""
  public static let periodFirstPick = 15
  public static let periodLastStart = 28
  public static let reflectedMonthsAhead = 3
}
