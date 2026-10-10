import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// これから (/design's UpcomingSmall and UpcomingMedium; spec/widgets.md,
/// Views): today's mark over the next days, and the five days from today
/// a column each.
struct UpcomingWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "upcoming", provider: DayTimeline()) { moment in
      WidgetLook(settings: moment.settings) {
        UpcomingView(entry: moment.entry)
      }
    }
    .configurationDisplayName("これから")
    .description("今日からの数日のシフト。一緒に見る人も選べます。")
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular])
  }
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
    } else if entry.nothingEntered {
      FirstRun()
        .widgetURL(dayLink(entry.date))
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
              .foregroundStyle(colors.weekday(day.tone))
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
    let off = OffLook(day, look: look, inWeek: false)
    VStack(spacing: 0) {
      VStack(spacing: 0) {
        Text(day.date.weekdayHead(english: english))
          .font(.caption2)
          .foregroundStyle(colors.weekday(day.tone))
        date
          .noteStroke(day.noted, onTile: off.tile ? day.pattern : nil)
      }
      .padding(.top, 4)
      .padding(.bottom, 2)
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

  /// The day of the month, with its month on today's column alone: five
  /// days that run into the next month say so plainly (29 30 1).
  private var date: some View {
    HStack(spacing: 2) {
      if first {
        Text(english ? day.date.shortMonth(english: true) : "\(day.date.month)/")
          .font(.system(size: 10, weight: .medium))
      }
      Text(day.date.day, format: .number)
        .font(.system(size: 15, weight: .semibold).monospacedDigit())
    }
    .foregroundStyle(day.holiday ? colors.calendarHoliday : colors.textPrimary)
    .lineLimit(1)
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
    HStack(spacing: 3) {
      ForEach(days, id: \.date) { day in
        // A day off as in the calendar's week: faint where 休みの見せ方
        // leaves it empty.
        let off = OffLook(day, look: look, inWeek: true)
        VStack(spacing: 4) {
          Text(day.date.weekdayHead(english: english))
            .font(.caption)
            .lineLimit(1)
            // MON and WED fit a cramped column a little smaller.
            .minimumScaleFactor(0.7)
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
