// What a screen reader is told of a day (spec/calendar.md, Screen
// readers): the calendar's days and a group's alike say the date with its
// weekday, 今日 before it on today, and a holiday's name after it.
extension Day {
  /// 今日、11月3日(火)、文化の日, `holiday` being the day's holiday where
  /// the person has holidays (`holidayName`).
  public func spokenText(isToday: Bool, holiday: String?) -> String {
    [isToday ? "今日" : nil, fullText, holiday].compactMap(\.self)
      .joined(separator: "、")
  }
}

extension TimeChange {
  /// 早出, 残業 or 早出・残業; 時間変更 for hours moved the other way.
  public var spokenText: String {
    let moves = [early ? "早出" : nil, late ? "残業" : nil].compactMap(\.self)
    return moves.isEmpty ? "時間変更" : moves.joined(separator: "・")
  }
}

/// One member's day in a group's table, as it is read.
public struct SpokenShift: Sendable {
  public var member: String
  /// The pattern's name, nil for a day not entered.
  public var pattern: String?
  public var change: TimeChange?

  public init(member: String, pattern: String?, change: TimeChange? = nil) {
    self.member = member
    self.pattern = pattern
    self.change = change
  }

  /// しんご：日勤 早出, しんご：未入力
  var text: String {
    "\(member)：\([pattern ?? "未入力", change?.spokenText].compactMap(\.self).joined(separator: " "))"
  }
}

/// A group's day read whole, since its row or column is one element: the
/// date, みんな休み, then who has which shift, in the table's order.
///
///     今日、11月12日(木)、みんな休み、しんご：休み、お母さん：有休
public func spokenGroupDay(
  _ day: Day, isToday: Bool, holiday: String?, together: Bool, shifts: [SpokenShift]
) -> String {
  ([day.spokenText(isToday: isToday, holiday: holiday), together ? "みんな休み" : nil] + shifts.map(\.text))
    .compactMap(\.self).joined(separator: "、")
}
