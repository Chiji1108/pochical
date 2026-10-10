import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// シンプル (/design's SimpleSmallView and SimpleMediumView; spec/widgets.md,
/// Views): today alone, large, and beside tomorrow in the medium one.
struct SimpleWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "simple", provider: DayTimeline()) { moment in
      WidgetLook(settings: moment.settings) {
        SimpleView(entry: moment.entry, names: moment.settings.look.options.names)
      }
    }
    .configurationDisplayName("シンプル")
    .description("今日のシフトを大きく。中は明日も。")
    .supportedFamilies([.systemSmall, .systemMedium])
  }
}

private struct SimpleView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.themeColors) private var colors
  let entry: WidgetEntry
  let names: Bool

  var body: some View {
    if entry.nothingEntered {
      FirstRun()
        .widgetURL(dayLink(entry.date))
    } else if family == .systemMedium, entry.upcoming.count > 1 {
      HStack(spacing: 16) {
        Link(destination: dayLink(entry.today.date)) {
          SimpleDay(day: entry.today, names: names)
        }
        Rectangle().fill(colors.separator).frame(width: 1)
        Link(destination: dayLink(entry.upcoming[1].date)) {
          SimpleDay(day: entry.upcoming[1], names: names, label: tomorrow)
        }
      }
    } else {
      SimpleDay(day: entry.today, names: names)
        .widgetURL(dayLink(entry.today.date))
    }
  }

  private var tomorrow: String { english ? "Tomorrow" : "明日" }

  @Environment(\.english) private var english
}

/// A day plainly: its date, its mark large, and only what changed under
/// it, one group in the middle of its room. A day with nothing changed
/// closes up round a larger mark.
private struct SimpleDay: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  let day: WidgetDay
  let names: Bool
  /// Over tomorrow, a word rather than a date.
  var label: String?

  var body: some View {
    let said = day.pattern == nil || day.change != nil
    var size: CGFloat = said ? 48 : 60
    let named = names && day.pattern != nil
    if named { size -= 8 }
    return VStack(spacing: 12) {
      Group {
        if let label {
          Text(english ? label.uppercased() : label)
            .font(.system(size: english ? 11 : 13, weight: english ? .regular : .semibold))
            .tracking(english ? 1.3 : 0)
            .foregroundStyle(colors.textSecondary)
        } else {
          Text(dateText)
            .font(.headline.weight(.bold))
            .foregroundStyle(colors.textPrimary)
        }
      }
      .lineLimit(1)
      .frame(height: 22)
      .background(alignment: .bottom) {
        // A memo: the calendar's stroke under the date; its words are the
        // app's to show.
        if day.noted {
          RoundedRectangle(cornerRadius: Radius.xxs)
            .fill(colors.calendarNoteMarker)
            .frame(height: 7)
            .padding(.horizontal, -3)
            .offset(y: -4)
        }
      }
      VStack(spacing: 2) {
        if let pattern = day.pattern {
          ShiftMark(pattern: pattern, size: size, change: day.timeChange)
          if named {
            Text(dayName(pattern.name))
              .font(.system(size: 11))
              .foregroundStyle(colors.textSecondary)
              .lineLimit(1)
          }
        } else {
          Text("–")
            .font(.system(size: size * 0.5))
            .foregroundStyle(colors.textTertiary)
            .frame(width: size, height: size)
        }
      }
      if said {
        Text(day.pattern == nil ? "予定なし" : day.change ?? "")
          .font(.subheadline.monospacedDigit())
          .foregroundStyle(colors.textSecondary)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(spoken)
  }

  private var dateText: String {
    english
      ? "\(day.date.shortMonth(english: true)) \(day.date.day)."
      : day.date.monthDayText
  }

  /// The whole day read aloud: its date, the shift and its hours.
  private var spoken: String {
    let name = day.pattern?.name ?? "予定なし"
    let memo = day.noted ? "、メモあり" : ""
    return "\(day.date.fullText)、\(name)\(day.time.map { "、\($0)" } ?? "")\(memo)"
  }
}

/// Before anything is entered: where the days will come from, in the
/// middle of the widget's room.
struct FirstRun: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english

  var body: some View {
    Text(english ? "Shifts you enter\nshow here" : "シフトを入れると\nここに出ます")
      .font(.footnote)
      .multilineTextAlignment(.center)
      .foregroundStyle(colors.textSecondary)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
  }
}
