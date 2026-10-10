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
    let said = day.news != nil
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
          Text(day.shortDate(english: english))
            .font(.headline.weight(.bold))
            .foregroundStyle(colors.textPrimary)
        }
      }
      .lineLimit(1)
      .frame(height: 22)
      // A memo: the calendar's stroke under the date; its words are the
      // app's to show.
      .noteStroke(day.noted, offset: -4)
      WidgetMark(day: day, size: size, named: named, large: true)
      if said {
        Text(day.news ?? "")
          .font(.subheadline.monospacedDigit())
          .foregroundStyle(colors.textSecondary)
          .lineLimit(1)
          .minimumScaleFactor(0.7)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .modifier(SpokenDay(day: day))
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
