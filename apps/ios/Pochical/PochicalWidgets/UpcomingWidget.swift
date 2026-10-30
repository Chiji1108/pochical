import AppIntents
import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// これから (/design's UpcomingSmall and UpcomingMedium; spec/widgets.md,
/// Views): today's mark over the next days, and the five days from today
/// a column each.
struct UpcomingWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "upcoming", intent: UpcomingIntent.self, provider: ChosenTimeline<UpcomingIntent>()
    ) { moment in
      WidgetLook(settings: moment.settings) {
        UpcomingView(entry: moment.entry)
      }
    }
    .configurationDisplayName("これから")
    .description("今日からの数日のシフト。一緒に見る人も選べます。")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
  }
}

/// これから's editing: 一緒に見る人, nobody unless picked.
struct UpcomingIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "これから"
  static let description = IntentDescription("一緒に見る人を選ぶと、その人の日も並べます。")

  @Parameter(title: "一緒に見る人")
  var with: MemberEntity?
}

private struct UpcomingView: View {
  @Environment(\.widgetFamily) private var family
  let entry: WidgetEntry

  var body: some View {
    if family == .accessoryRectangular {
      Group {
        if entry.nothingEntered {
          FirstRunLine()
        } else {
          LockDays(days: Array(entry.upcoming.prefix(5)))
        }
      }
      .widgetURL(dayLink(entry.date))
    } else if let group = entry.pickAgain {
      PickAgain(whom: "一緒に見る人", groupID: group)
    } else if entry.nothingEntered {
      FirstRun()
        .widgetURL(dayLink(entry.date))
    } else if let pair = entry.pair {
      // Set to someone: today and tomorrow in the small one, five days in
      // the medium, theirs under the person's.
      let count = family == .systemMedium ? 5 : 2
      PairColumns(entry: entry, pair: pair, count: count)
        .widgetURL(family == .systemMedium ? nil : entry.link(entry.date))
    } else if family == .systemMedium {
      DayColumns(days: Array(entry.upcoming.prefix(5)))
    } else {
      UpcomingSmall(entry: entry)
        .widgetURL(dayLink(entry.today.date))
    }
  }
}

/// Today's line, and the next three days' marks under it, as one group in
/// the middle.
private struct UpcomingSmall: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.english) private var english
  let entry: WidgetEntry

  var body: some View {
    VStack(spacing: 12) {
      UpcomingHead(day: entry.today)
      HStack(spacing: 0) {
        ForEach(entry.upcoming.dropFirst().prefix(3), id: \.date) { day in
          VStack(spacing: 2) {
            Text(day.date.weekdayHead(english: english))
              .font(.caption2)
              .foregroundStyle(colors.color(day.tone, plain: colors.textTertiary))
              .noteStroke(day.noted)
            WidgetMark(
              day: day, size: look.options.names ? 24 - nameRoom : 24,
              named: look.options.names, reserve: true)
          }
          .frame(maxWidth: .infinity)
          .modifier(SpokenDay(day: day))
        }
      }
      .padding(.top, 8)
      .overlay(alignment: .top) {
        Rectangle().fill(colors.separator).frame(height: 1)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}

/// Today's mark large beside its date and what changed, the two together
/// in the middle. Today goes without its weekday: it is today.
private struct UpcomingHead: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.english) private var english
  let day: WidgetDay

  var body: some View {
    let said = day.news != nil
    let named = look.options.names
    var size: CGFloat = said ? 34 : 40
    if named { size -= nameRoom }
    return HStack(spacing: 8) {
      WidgetMark(day: day, size: size, named: named, large: true)
      VStack(alignment: .leading, spacing: 2) {
        Text(day.shortDate(english: english))
          .font(.headline.weight(.bold))
          .foregroundStyle(colors.textPrimary)
          .noteStroke(day.noted)
        if let news = day.news {
          Text(news)
            .font(.footnote.monospacedDigit())
            .foregroundStyle(colors.textSecondary)
        }
      }
      .lineLimit(1)
      // A small widget is narrower on some iPhones (the SE's 148pt): the
      // date gives a little of its size rather than be cut.
      .minimumScaleFactor(0.75)
    }
    .modifier(SpokenDay(day: day))
  }
}

/// Days from today in columns, as a week reads across: each date under its
/// weekday (THU in English: the days start from today, so one letter could
/// be either T), the mark large under it, and only what changed under the
/// mark. A day off is a tile down its whole column, date and all.
private struct DayColumns: View {
  @Environment(\.look) private var look
  let days: [WidgetDay]

  var body: some View {
    let named = look.options.names
    HStack(spacing: 2) {
      ForEach(Array(days.enumerated()), id: \.element.date) { index, day in
        Link(destination: dayLink(day.date)) {
          ColumnDay(day: day, first: index == 0, size: named ? 36 - nameRoom : 36, named: named)
        }
      }
    }
  }
}

private struct ColumnDay: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.english) private var english
  let day: WidgetDay
  /// Today's column, always the first: its month small before its date,
  /// and its date plain.
  let first: Bool
  let size: CGFloat
  let named: Bool

  var body: some View {
    // A day off left empty stays empty: a day with nothing entered has its
    // dash here, so the two still read apart.
    let off = OffDrawing(day, look: look, inWeek: false)
    VStack(spacing: 0) {
      ColumnHead(day: day, first: first, onTile: off.tile)
      // The mark in the middle of the room under the date, and what
      // changed hanging under it, so the marks stay level.
      Color.clear.frame(maxHeight: .infinity)
      if off.mark != .none || day.pattern == nil {
        WidgetMark(day: day, size: size, faint: off.mark == .faint, named: named, reserve: true)
      }
      Color.clear
        .frame(maxHeight: .infinity)
        .overlay(alignment: .top) {
          if let words = widgetColumnHours(day) {
            ColumnLine(words: words)
              .padding(.top, 2)
          }
        }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .offTile(day, shown: off.tile, radius: Radius.sm, inset: EdgeInsets(top: 0, leading: 3, bottom: 0, trailing: 3))
    .modifier(SpokenDay(day: day))
  }
}

/// A column's weekday over its date, as the calendar heads its columns, so
/// the date sits right over its mark. A memo is the calendar's stroke
/// under the date.
private struct ColumnHead: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  let day: WidgetDay
  /// Today's column, always the first: its month small before its date,
  /// and its date plain.
  let first: Bool
  /// The day's tile is under it, which the memo's stroke goes deeper on.
  var onTile = false
  /// Beside someone's row, a size smaller.
  var compact = false

  var body: some View {
    VStack(spacing: 0) {
      Text(day.date.weekdayHead(english: english))
        .font(.caption2)
        .foregroundStyle(colors.color(day.tone, plain: colors.textTertiary))
      date
        .noteStroke(day.noted, onTile: onTile ? day.pattern : nil)
    }
    .padding(.top, 4)
    .padding(.bottom, 2)
  }

  /// The day of the month, with its month on today's column alone: five
  /// days that run into the next month say so plainly (29 30 1).
  private var date: some View {
    HStack(spacing: 2) {
      if first {
        Text(english ? day.date.shortMonth(english: true) : "\(day.date.month)/")
          .font(.system(size: 10, weight: .medium))
      }
      Text(day.date.day, format: .number)
        .font(.system(size: compact ? 13 : 15, weight: .semibold).monospacedDigit())
    }
    .foregroundStyle(day.holiday ? colors.calendarHoliday : colors.textPrimary)
    .lineLimit(1)
  }
}

/// The group's 週ごと in small: the person's row and theirs, each with
/// their face in a first column as wide as a day's, on the group tables'
/// tiles, a band down a day both are off. Their marks are in the person's
/// look, as the group's tables draw them.
private struct PairColumns: View {
  @Environment(\.look) private var look
  let entry: WidgetEntry
  let pair: WidgetPair
  let count: Int

  var body: some View {
    let named = look.options.names
    let days = Array(zip(entry.upcoming, pair.days).prefix(count))
    let worded = days.contains { mine, shown in
      widgetColumnHours(mine) != nil || shown.theirs.flatMap(widgetColumnHours) != nil
    }
    let size: CGFloat = named || worded ? 20 : 26
    HStack(spacing: 2) {
      VStack(spacing: 0) {
        // As tall as a column's head, so the faces sit by their rows.
        if let first = days.first {
          ColumnHead(day: first.0, first: true, compact: true).hidden()
        }
        WidgetFace(person: pair.me, size: 24, me: true)
          .frame(maxHeight: .infinity)
        WidgetFace(person: pair.with, size: 24)
          .frame(maxHeight: .infinity)
      }
      .frame(maxWidth: .infinity)
      .accessibilityHidden(true)
      ForEach(Array(days.enumerated()), id: \.element.0.date) { index, element in
        Link(destination: entry.link(element.0.date)) {
          PairColumn(
            mine: element.0, shown: element.1, first: index == 0, size: size, named: named,
            name: pair.with.name, theirLook: pair.theirLook)
        }
      }
    }
  }
}

private struct PairColumn: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.widgetRenderingMode) private var renderingMode
  @Environment(\.english) private var english
  let mine: WidgetDay
  let shown: WidgetPairDay
  let first: Bool
  let size: CGFloat
  let named: Bool
  let name: String
  let theirLook: MarkLook?

  var body: some View {
    VStack(spacing: 0) {
      ColumnHead(day: mine, first: first, compact: true)
      cell(mine)
        .modifier(SpokenDay(day: mine))
      // Theirs in their own shape, as the group's tables draw them.
      cell(shown.theirs)
        .marks(drawnAs: theirLook)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(
          "\(name)\(english ? ", " : "さん、")\(shown.theirs?.pattern?.name ?? (english ? "not entered" : "未入力"))")
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    // A day both are off: one band down the column.
    .background {
      if shown.together {
        RoundedRectangle(cornerRadius: Radius.sm)
          .fill(tint)
          .padding(.horizontal, 3)
      }
    }
  }

  /// A day's mark and its one line in the middle of its cell, on the
  /// group tables' tile when it is off; a dash where not entered.
  private func cell(_ day: WidgetDay?) -> some View {
    VStack(spacing: 2) {
      if let day {
        WidgetMark(day: day, size: size)
        if let words = widgetColumnHours(day)
          ?? (named ? day.pattern.map { dayName($0.name) } : nil)
        {
          ColumnLine(words: words)
        }
      } else {
        Text("–")
          .font(.system(size: size * 0.5))
          .foregroundStyle(colors.textQuaternary)
          .frame(width: size, height: size)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background {
      if let day, day.off, !shown.together {
        RoundedRectangle(cornerRadius: Radius.sm)
          .fill(tint)
          .padding(3)
      }
    }
  }

  /// The テーマ's light tint, whatever the pattern, as the group's tables
  /// draw days off; faint where the system draws in one color.
  private var tint: Color {
    renderingMode == .fullColor ? colors.accentContainer : .white.opacity(0.24)
  }
}

/// A column's one line of words, at its size or shrunk to the column, down
/// to 8pt; too wide even so, the hours go without their :00 (7〜20).
private struct ColumnLine: View {
  @Environment(\.themeColors) private var colors
  let words: String

  var body: some View {
    ViewThatFits(in: .horizontal) {
      line(words, size: 10)
      line(words, size: 9)
      line(words, size: 8)
      // The last, shrunk further rather than cut.
      Text(widgetWithoutWholeHours(words))
        .font(.system(size: 8).monospacedDigit())
        .lineLimit(1)
        .minimumScaleFactor(0.5)
    }
    .foregroundStyle(colors.textSecondary)
    .padding(.horizontal, 3)
  }

  private func line(_ text: String, size: CGFloat) -> some View {
    Text(text)
      .font(.system(size: size).monospacedDigit())
      .lineLimit(1)
      .fixedSize(horizontal: true, vertical: false)
  }
}

/// Five days from today on the lock screen, each weekday over its mark,
/// as これから's medium: the days ahead at a glance, a day of 早出 or 残業
/// showing on its mark's sides. No memo stroke: at this size it reads as
/// a line through the weekday.
private struct LockDays: View {
  @Environment(\.look) private var look
  @Environment(\.english) private var english
  let days: [WidgetDay]

  var body: some View {
    let named = look.options.names
    // A little room between the columns, so their weekdays never touch.
    HStack(spacing: 2) {
      ForEach(days, id: \.date) { day in
        // A day off as in the calendar's week: faint where 休みの見せ方
        // leaves it empty.
        let off = OffDrawing(day, look: look, inWeek: true)
        VStack(spacing: 4) {
          // One size for every weekday, small enough for MON and WED in
          // a cramped column, so no one of them shrinks alone.
          Text(day.date.weekdayHead(english: english))
            .font(.system(size: 10, weight: .medium))
            .lineLimit(1)
            .opacity(0.75)
          WidgetMark(
            day: day, size: named ? 24 - nameRoom : 24, faint: off.mark == .faint, named: named,
            reserve: true)
        }
        .frame(maxWidth: .infinity)
        .modifier(SpokenDay(day: day))
      }
    }
  }
}
