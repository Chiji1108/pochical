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
    .supportedFamilies([.systemSmall, .systemMedium, .accessoryCircular, .accessoryInline])
  }
}

private struct SimpleView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.themeColors) private var colors
  let entry: WidgetEntry
  let names: Bool

  var body: some View {
    if family == .accessoryCircular {
      // The round ones stay as on a day with nothing entered, a dash.
      TodayCircular(day: entry.today)
        .widgetURL(dayLink(entry.date))
    } else if family == .accessoryInline {
      TodayInline(entry: entry)
        .widgetURL(dayLink(entry.date))
    } else if entry.nothingEntered {
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

/// Today's mark on the lock screen's round face, with 早出 or 残業 under it
/// on such a day, and なし with nothing entered.
private struct TodayCircular: View {
  let day: WidgetDay

  var body: some View {
    let word = day.pattern == nil ? "なし" : movedWord
    ZStack {
      AccessoryWidgetBackground()
      VStack(spacing: 2) {
        WidgetMark(day: day, size: word == nil ? 36 : 28)
        if let word {
          Text(word).font(.caption2.weight(.semibold))
        }
      }
    }
    .modifier(SpokenDay(day: day))
  }

  /// 早出 and 残業 alone, all a round face this small has room to say.
  private var movedWord: String? {
    switch (day.timeChange?.early ?? false, day.timeChange?.late ?? false) {
    case (true, true): "早出・残業"
    case (true, false): "早出"
    case (false, true): "残業"
    case (false, false): nil
    }
  }
}

/// One line over the clock, after the system's date: today's mark and
/// name, as a line of text names the shift; 早出 and 残業 show on the
/// mark's sides. A line holds text and one image, so the mark is drawn
/// into an image.
private struct TodayInline: View {
  @Environment(\.english) private var english
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  let entry: WidgetEntry

  var body: some View {
    let day = entry.today
    if entry.nothingEntered {
      Text(WidgetWords(english: english).firstRunLine)
    } else if let pattern = day.pattern {
      Label {
        Text(pattern.name)
      } icon: {
        markImage(pattern)
      }
      .modifier(SpokenDay(day: day))
    } else {
      Text("予定なし")
    }
  }

  @MainActor private func markImage(_ pattern: Pattern) -> Image {
    let renderer = ImageRenderer(
      content: ShiftMark(pattern: pattern, size: 18, change: entry.today.timeChange)
        .environment(\.themeColors, colors)
        .environment(\.look, look))
    renderer.scale = 3
    return renderer.uiImage.map { Image(uiImage: $0).renderingMode(.template) } ?? Image(systemName: "circle")
  }
}
