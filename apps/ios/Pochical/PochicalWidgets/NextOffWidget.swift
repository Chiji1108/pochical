import AppIntents
import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// 次の休み (/design's NextOffSmall and NextOffCircular; spec/widgets.md,
/// Views): how soon the next day off comes.
struct NextOffWidget: Widget {
  var body: some WidgetConfiguration {
    AppIntentConfiguration(
      kind: "nextOff", intent: NextOffIntent.self, provider: ChosenTimeline<NextOffIntent>()
    ) { moment in
      WidgetLook(settings: moment.settings) {
        NextOffView(entry: moment.entry)
      }
    }
    .configurationDisplayName("次の休み")
    .description("次の休みまであと何日か。一緒に休む人も選べます。")
    .supportedFamilies([.systemSmall, .accessoryCircular])
  }
}

/// 次の休み's editing: 一緒に休む人, nobody unless picked.
struct NextOffIntent: WidgetConfigurationIntent {
  static let title: LocalizedStringResource = "次の休み"
  static let description = IntentDescription("一緒に休む人を選ぶと、その人と一緒に休める日を数えます。")

  @Parameter(title: "一緒に休む人")
  var with: CompanionEntity?
}

private struct NextOffView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.english) private var english
  let entry: WidgetEntry

  var body: some View {
    let soonest = entry.soonestOff
    Group {
      if family == .accessoryCircular {
        NextOffCircular(entry: entry, soonest: soonest)
      } else if let group = entry.pickAgain {
        PickAgain(whom: "一緒に休む人", groupID: group)
      } else if entry.nothingEntered {
        FirstRun()
      } else if entry.offs.today {
        RestToday(entry: entry)
      } else {
        NextOffSmall(entry: entry, soonest: soonest)
      }
    }
    .widgetURL(entry.offLink)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(entry.spokenOff(english: english))
  }
}

/// The widget's title, and the face of who it is set to beside it.
private struct OffsHead: View {
  @Environment(\.themeColors) private var colors
  let text: String
  let with: WidgetWith?

  var body: some View {
    HStack(spacing: 4) {
      Text(text)
        .lineLimit(1)
      Spacer(minLength: 0)
      if let with {
        CompanionFace(with: with)
      }
    }
    .font(.footnote)
    .foregroundStyle(colors.textSecondary)
  }
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
      OffsHead(text: offTitle(entry.with, english: english), with: entry.with)
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
      OffsHead(text: words.date(entry.date), with: entry.with)
      Text(restTitle)
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

extension RestToday {
  /// 今日はおやすみ, or with someone ふたりとも, with a group みんな.
  fileprivate var restTitle: String {
    switch entry.with?.kind {
    case nil: english ? "Day off\ntoday" : "今日は\nおやすみ"
    case .person: english ? "Both off\ntoday" : "ふたりとも\nおやすみ"
    case .group: english ? "Everyone off\ntoday" : "みんな\nおやすみ"
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
        Text(word)
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

  /// 休み, else 一緒 with someone, or みんな with a group.
  private var word: String {
    switch entry.with?.kind {
    case nil: english ? "Off" : "休み"
    case .person: english ? "Together" : "一緒"
    case .group: english ? "Everyone" : "みんな"
    }
  }

  private var count: String {
    // Too small to ask for someone to be picked again.
    if entry.pickAgain != nil { return english ? "Unset" : "未設定" }
    guard let soonest else { return "–" }
    switch soonest.inDays {
    case 0: return english ? "Today" : "今日"
    case 1: return english ? soonest.day.date.weekdayName(english: true) : "明日"
    default: return "\(soonest.inDays)"
    }
  }
}
