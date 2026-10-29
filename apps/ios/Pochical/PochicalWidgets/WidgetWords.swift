import Foundation
import PochicalKit

// The words the widgets write and read their days in (/design's
// useWords), which the controls and the shortcuts say too
// (spec/widgets.md, Shortcuts and controls). Built into the app as well
// as the widgets.

/// The widgets' few words in Japanese or English.
nonisolated struct WidgetWords {
  let english: Bool

  /// A date as a widget names a day: 9月24日(木), or Thu, Sep 24.
  func date(_ day: Day) -> String {
    english
      ? "\(day.weekdayName(english: true)), \(day.shortMonth(english: true)) \(day.day)"
      : day.fullText
  }

  /// When a day comes: 今日, 明日, else how many days on.
  func inDays(_ count: Int) -> String {
    if english {
      return count == 0 ? "Today" : count == 1 ? "Tomorrow" : "in \(count) days"
    }
    return count == 0 ? "今日" : count == 1 ? "明日" : "\(count)日後"
  }

  /// The day after a day off: 明日, or its weekday (Fri) in English,
  /// short enough to keep clear of the poodle in the corner.
  func nextDay(_ day: Day) -> String {
    english ? day.weekdayName(english: true) : "明日"
  }

  var nothingYet: String { english ? "Nothing yet" : "まだ入っていません" }
  var firstRunLine: String { english ? "Enter shifts to see them" : "シフトを入れると出ます" }

  /// Parts of what is said, one after another.
  func joined(_ parts: [String?]) -> String {
    parts.compactMap(\.self).joined(separator: english ? ", " : "、")
  }
}

nonisolated extension WidgetDay {
  /// The whole day read aloud: its date, the shift and its hours, in the
  /// language its date is shown in (Sat, Oct 10).
  func spoken(english: Bool) -> String {
    let words = WidgetWords(english: english)
    let memo = noted ? (english ? "memo" : "メモあり") : nil
    return words.joined([words.date(date), pattern?.name ?? "予定なし", time, memo])
  }
}

/// What is said with no day off ahead.
nonisolated func noOffWords(_ none: WidgetNoOff?, words: WidgetWords) -> String {
  switch none {
  case .waiting(let names):
    let others = names.count > 1 ? (words.english ? " +\(names.count - 1)" : "ほか\(names.count - 1)人") : ""
    return words.english
      ? "Waiting on \(names.first ?? "")\(others)" : "\(names.first ?? "")さん\(others)の入力待ち"
  case .apart:
    return words.english ? "No days off together yet" : "重なる休みはまだありません"
  case .alone:
    return words.english ? "No one else in the group yet" : "ほかのメンバーがまだいません"
  case .notEntered, nil:
    return words.nothingYet
  }
}

/// 次の休み, 一緒に休める日 with someone, or みんな休み with a group.
nonisolated func offTitle(_ with: WidgetWith?, english: Bool) -> String {
  switch with?.kind {
  case nil: english ? "Next day off" : "次の休み"
  case .person: english ? "Off together" : "一緒に休める日"
  case .group: english ? "Everyone off" : "みんな休み"
  }
}

nonisolated extension WidgetEntry {
  /// The soonest day off: today when it is off, else the next one.
  var soonestOff: (day: WidgetDay, inDays: Int)? {
    offs.today ? (today, 0) : offs.next
  }

  /// Today read aloud: 今日, then the day as `spoken`.
  func spokenToday(english: Bool) -> String {
    let words = WidgetWords(english: english)
    return nothingEntered
      ? words.firstRunLine : words.joined([words.inDays(0), today.spoken(english: english)])
  }

  /// 次の休み read aloud: who it is with, how soon, the date and the day
  /// off's name, or why none is ahead.
  func spokenOff(english: Bool) -> String {
    let words = WidgetWords(english: english)
    var title = offTitle(with, english: english)
    if let with {
      title =
        with.kind == .group
        ? (english ? "\(title), \(with.name)" : "\(with.name)のみんな休み")
        : (english ? "\(title) with \(with.name)" : "\(with.name)さんと一緒に休める日")
    }
    guard let off = soonestOff else {
      return words.joined([title, noOffWords(offs.none, words: words)])
    }
    return words.joined([
      title, words.inDays(off.inDays), words.date(off.day.date), off.day.pattern?.name,
    ])
  }
}
