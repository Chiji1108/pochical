import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// 次の休み (/design's NextOffSmall and NextOffCircular; spec/widgets.md,
/// Views): how soon the next day off comes.
struct NextOffWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "nextOff", provider: DayTimeline()) { moment in
      WidgetLook(settings: moment.settings) {
        NextOffView(entry: moment.entry)
      }
    }
    .configurationDisplayName("次の休み")
    .description("次の休みまであと何日か。一緒に休む人も選べます。")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

private struct NextOffView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.english) private var english
  let entry: WidgetEntry

  var body: some View {
    let soonest = soonestOff(entry)
    Group {
      if family == .accessoryCircular {
        NextOffCircular(entry: entry, soonest: soonest)
      } else if entry.nothingEntered {
        FirstRun()
      } else if entry.offs.today {
        RestToday(entry: entry)
      } else {
        NextOffSmall(entry: entry, soonest: soonest)
      }
    }
    // The day off it counts, else today.
    .widgetURL(dayLink(soonest?.day.date ?? entry.date))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(spokenOff(soonest, none: entry.offs.none, english: english))
  }
}

/// The soonest day off: today when it is off, else the next one.
private func soonestOff(_ entry: WidgetEntry) -> (day: WidgetDay, inDays: Int)? {
  entry.offs.today ? (entry.today, 0) : entry.offs.next
}

/// What is said with no day off ahead.
private func noOffWords(_ none: WidgetNoOff?, words: WidgetWords) -> String {
  switch none {
  case .waiting(let names):
    let others = names.count > 1 ? (words.english ? " +\(names.count - 1)" : "ほか\(names.count - 1)人") : ""
    return words.english
      ? "Waiting on \(names.first ?? "")\(others)" : "\(names.first ?? "")さん\(others)の入力待ち"
  case .apart:
    return words.english ? "No days off together yet" : "重なる休みはまだありません"
  case .notEntered, nil:
    return words.nothingYet
  }
}

/// The whole of it as read aloud.
private func spokenOff(
  _ off: (day: WidgetDay, inDays: Int)?, none: WidgetNoOff?, english: Bool
) -> String {
  let words = WidgetWords(english: english)
  let title = english ? "Next day off" : "次の休み"
  guard let off else { return "\(title), \(noOffWords(none, words: words))" }
  let parts = [title, words.inDays(off.inDays), words.date(off.day.date), off.day.pattern?.name]
  return parts.compactMap(\.self).joined(separator: english ? ", " : "、")
}

/// The next day off large: how soon, and its date and mark.
private struct NextOffSmall: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  let entry: WidgetEntry
  let soonest: (day: WidgetDay, inDays: Int)?

  var body: some View {
    let words = WidgetWords(english: english)
    VStack(alignment: .leading) {
      Text(english ? "Next day off" : "次の休み")
        .font(.footnote)
        .foregroundStyle(colors.textSecondary)
        .lineLimit(1)
      Spacer(minLength: 0)
      Group {
        if let soonest, soonest.inDays > 1 {
          // The number large, with 日後 small after it.
          let unit = Text(english ? " days" : "日後").font(.system(size: 13, weight: .semibold))
          Text("\(Text("\(soonest.inDays)").font(.system(size: 48, weight: .bold)))\(unit)")
        } else if let soonest {
          Text(words.inDays(soonest.inDays)).font(.system(size: 36, weight: .bold))
        } else {
          Text("–").font(.system(size: 36, weight: .bold))
        }
      }
      .monospacedDigit()
      .foregroundStyle(colors.textPrimary)
      .lineLimit(1)
      // Tomorrow, too wide at its size, shrinks to the widget's width.
      .minimumScaleFactor(0.5)
      Spacer(minLength: 0)
      HStack(spacing: 4) {
        if let soonest {
          Text(words.date(soonest.day.date))
          WidgetMark(day: soonest.day, size: 16)
        } else {
          Text(noOffWords(entry.offs.none, words: words))
        }
      }
      .font(.footnote.monospacedDigit())
      .foregroundStyle(colors.textSecondary)
      .lineLimit(1)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
  }
}

/// A day off today, said as such rather than counted: おやすみ, with the
/// date over it, tomorrow's mark under it, and the app icon's poodle
/// looking up from the corner. 次の休み's days, about being off, go
/// without a memo's stroke.
private struct RestToday: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  @Environment(\.widgetContentMargins) private var margins
  let entry: WidgetEntry

  var body: some View {
    let words = WidgetWords(english: english)
    VStack(alignment: .leading, spacing: 8) {
      Text(words.date(entry.date))
        .font(.footnote)
        .foregroundStyle(colors.textSecondary)
        .lineLimit(1)
      Text(english ? "Day off\ntoday" : "今日は\nおやすみ")
        .font(.title3.weight(.semibold))
        .foregroundStyle(colors.textPrimary)
        .lineSpacing(2)
      Spacer(minLength: 0)
      if entry.upcoming.count > 1 {
        let tomorrow = entry.upcoming[1]
        HStack(spacing: 4) {
          Text(words.nextDay(tomorrow.date))
          WidgetMark(day: tomorrow, size: 16)
        }
        .font(.footnote)
        .foregroundStyle(colors.textSecondary)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    .background(alignment: .bottomTrailing) {
      // Looking up from the bottom edge at the right, its head weighing
      // against the words on the left; desaturated where the system draws
      // in one color, so its lines stay.
      Image("PeekingPoodle")
        .resizable()
        .widgetAccentedRenderingMode(.desaturated)
        .frame(width: 92, height: 92)
        .offset(x: margins.trailing + 4, y: margins.bottom + 26)
    }
  }
}

/// How soon on the lock screen's round face: 休み over the count, or
/// 今日 and 明日 (Today, or tomorrow's weekday in English).
private struct NextOffCircular: View {
  @Environment(\.english) private var english
  let entry: WidgetEntry
  let soonest: (day: WidgetDay, inDays: Int)?

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      VStack(spacing: 1) {
        Text(english ? "Off" : "休み")
          .font(.caption2.weight(.semibold))
        Text(count)
          .font(.system(size: 20, weight: .bold).monospacedDigit())
          .lineLimit(1)
          // Kept clear of the round edge: Wed at full size, Today a little
          // smaller.
          .minimumScaleFactor(0.6)
          .frame(maxWidth: 48)
      }
    }
  }

  private var count: String {
    guard let soonest else { return "–" }
    switch soonest.inDays {
    case 0: return english ? "Today" : "今日"
    case 1: return english ? soonest.day.date.weekdayName(english: true) : "明日"
    default: return "\(soonest.inDays)"
    }
  }
}
