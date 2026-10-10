import PochicalDesign
import PochicalKit
import SwiftUI
import WidgetKit

/// いまのシフト (/design's NowSmall, NowCircular and NowRectangular;
/// spec/widgets.md, Views): how long the shift on now runs, else how soon
/// the next one with hours starts, for long shifts like 当番. The counts go
/// on as the system's clock keeps them (relative times and
/// ProgressView(timerInterval:)), the entry made again at its turns.
struct NowWidget: Widget {
  var body: some WidgetConfiguration {
    StaticConfiguration(kind: "now", provider: DayTimeline()) { moment in
      WidgetLook(settings: moment.settings) {
        NowView(entry: moment.entry)
      }
    }
    .configurationDisplayName("いまのシフト")
    .description("勤務があと何時間か。なければ次の勤務まで。")
    .supportedFamilies([.systemSmall, .accessoryCircular, .accessoryRectangular])
  }
}

/// What いまのシフト says now: on, with its end, or the next, with its
/// start, as a countdown within a day or as the day further off.
private enum NowState {
  case on(WidgetSpan)
  case next(WidgetSpan, inDays: Int?)
  case none

  init(_ now: WidgetNow) {
    if let on = now.on {
      self = .on(on)
    } else if let next = now.next {
      self = .next(next, inDays: now.nextInDays)
    } else {
      self = .none
    }
  }

  var span: WidgetSpan? {
    switch self {
    case .on(let span), .next(let span, _): span
    case .none: nil
    }
  }
}

/// The words of いまのシフト, in Japanese or English.
private struct NowWords {
  let english: Bool
  let at: Date

  var words: WidgetWords { WidgetWords(english: english) }

  func on(_ name: String) -> String { english ? "\(name) now" : "\(name)中" }
  func next(_ name: String) -> String { english ? "Next: \(name)" : "次は\(name)" }

  var none: String {
    english ? "No shifts with\nhours ahead" : "これからの勤務は\nまだ入っていません"
  }

  /// When a shift ends: 18:00まで, 翌8:30まで past midnight.
  func until(_ span: WidgetSpan) -> String {
    let later = days(to: span.end) > 0
    let clock = clockWords(span.end)
    return english ? "Until \(clock)\(later ? " tomorrow" : "")" : "\(later ? "翌" : "")\(clock)まで"
  }

  /// When the next one starts: 8:30から today, 明日 8:30から, else its date.
  func from(_ span: WidgetSpan) -> String {
    let inDays = days(to: span.start)
    let clock = clockWords(span.start)
    let date = span.day.date
    if english {
      if inDays == 0 { return "From \(clock)" }
      return "\(inDays == 1 ? "Tomorrow" : words.date(date)) \(clock)"
    }
    if inDays == 0 { return "\(clock)から" }
    // The date short, 9/26(土), to keep to the foot's one line.
    let day = inDays == 1 ? "明日" : "\(date.slashText)(\(date.weekdayName))"
    return "\(day) \(clock)から"
  }

  /// How many days off the next one is, short for the round face: 明日,
  /// 2日後; in English the weekday for tomorrow (Fri), else 2 days.
  func daysOff(_ span: WidgetSpan, inDays: Int) -> String {
    guard english else { return words.inDays(inDays) }
    return inDays == 1 ? span.day.date.weekdayName(english: true) : "\(inDays) days"
  }

  /// Whole days from now to `date`'s day.
  private func days(to date: Date) -> Int {
    Day(date, in: .current).days(since: Day(at, in: .current))
  }

  /// The whole of it as read aloud, the times as at the entry's moment.
  func spoken(_ state: NowState) -> String {
    let separator = english ? ", " : "、"
    switch state {
    case .none:
      return none.replacingOccurrences(of: "\n", with: english ? " " : "")
    case .on(let span):
      return [on(span.day.pattern?.name ?? ""), until(span)].joined(separator: separator)
    case .next(let span, let inDays):
      return [next(span.day.pattern?.name ?? ""), inDays.map(words.inDays), from(span)]
        .compactMap(\.self).joined(separator: separator)
    }
  }
}

private struct NowView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.english) private var english
  let entry: WidgetEntry

  var body: some View {
    let state = NowState(entry.now)
    let words = NowWords(english: english, at: entry.now.at)
    Group {
      switch family {
      case .accessoryCircular:
        NowCircular(state: state, words: words)
      case .accessoryRectangular:
        if entry.nothingEntered {
          FirstRunLine()
        } else {
          NowRectangular(state: state, words: words)
        }
      default:
        if entry.nothingEntered {
          FirstRun()
        } else {
          NowSmall(state: state, words: words)
        }
      }
    }
    // The shift's day, on or next; with none, today.
    .widgetURL(dayLink(state.span?.day.date ?? entry.date))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(words.spoken(state))
  }
}

/// あと and the time left, as the system writes a relative time and keeps
/// it going: あと3時間12分, or 3 hr, 12 min left.
private func leftText(until date: Date, english: Bool) -> Text {
  let time = Text(date, style: .relative)
  return english ? Text("\(time) left") : Text("あと\(time)")
}

/// What is left of a shift as a ring, draining as it runs, as the system
/// counts it down.
private struct Ring: View {
  let span: WidgetSpan
  var tint: Color?

  var body: some View {
    ProgressView(timerInterval: span.start...span.end, countsDown: true) {
    } currentValueLabel: {
    }
    .progressViewStyle(.circular)
    .tint(tint)
  }
}

private struct NowSmall: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.widgetRenderingMode) private var renderingMode
  let state: NowState
  let words: NowWords

  var body: some View {
    switch state {
    case .none:
      Text(words.none)
        .font(.footnote)
        .multilineTextAlignment(.center)
        .foregroundStyle(colors.textSecondary)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    case .on(let span):
      // The ring says 勤務中 and its mark which shift, so no heading says
      // them again; in the shift's own color unless the system draws the
      // widget in one.
      VStack(spacing: 8) {
        ZStack {
          Ring(span: span, tint: renderingMode == .fullColor ? tint(of: span) : nil)
            .frame(width: 76, height: 76)
          WidgetMark(
            day: span.day, size: look.options.names ? 34 - nameRoom : 34,
            named: look.options.names)
        }
        VStack(alignment: .leading, spacing: 1) {
          leftText(until: span.end, english: words.english)
            .font(.system(size: 15, weight: .bold).monospacedDigit())
            .foregroundStyle(colors.textPrimary)
            .lineLimit(1)
            .minimumScaleFactor(0.6)
          Text(words.until(span))
            .font(.footnote.monospacedDigit())
            .foregroundStyle(colors.textSecondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
      }
      .frame(maxHeight: .infinity)
    case .next(let span, let inDays):
      VStack(alignment: .leading) {
        HStack(spacing: 4) {
          WidgetMark(day: span.day, size: 18)
          Text(words.next(span.day.pattern?.name ?? ""))
            .lineLimit(1)
        }
        .font(.footnote)
        .foregroundStyle(colors.textSecondary)
        Spacer(minLength: 0)
        Group {
          if let inDays {
            Text(words.words.inDays(inDays))
              .font(.system(size: 36, weight: .bold))
          } else {
            // The countdown large, with あと over it (left after it in
            // English).
            VStack(alignment: .leading, spacing: 0) {
              if !words.english {
                Text("あと")
                  .font(.footnote.weight(.semibold))
                  .foregroundStyle(colors.textSecondary)
              }
              Text(span.start, style: .relative)
                .font(.system(size: 30, weight: .bold))
              if words.english {
                Text("left")
                  .font(.footnote.weight(.semibold))
                  .foregroundStyle(colors.textSecondary)
              }
            }
          }
        }
        .monospacedDigit()
        .foregroundStyle(colors.textPrimary)
        .lineLimit(1)
        .minimumScaleFactor(0.5)
        Spacer(minLength: 0)
        Text(words.from(span))
          .font(.footnote.monospacedDigit())
          .foregroundStyle(colors.textSecondary)
          .lineLimit(1)
      }
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
  }

  private func tint(of span: WidgetSpan) -> Color? {
    span.day.pattern.map { colors.mark(look.colored ? $0.color : 0).color }
  }
}

/// The round one: on a shift, its run as a ring round its mark; else the
/// next one's mark over when it starts (8:30), or the day further off.
private struct NowCircular: View {
  let state: NowState
  let words: NowWords

  var body: some View {
    ZStack {
      AccessoryWidgetBackground()
      switch state {
      case .none:
        Text("–").font(.caption2.weight(.semibold))
      case .on(let span):
        Ring(span: span)
        WidgetMark(day: span.day, size: 30)
      case .next(let span, let inDays):
        VStack(spacing: 1) {
          WidgetMark(day: span.day, size: 24)
          Text(inDays.map { words.daysOff(span, inDays: $0) } ?? clockWords(span.start))
            .font(.caption2.weight(.semibold).monospacedDigit())
            .lineLimit(1)
            .minimumScaleFactor(0.7)
        }
      }
    }
  }
}

/// The rectangular one: the shift and the time left, or the next and how
/// soon, over when it ends or starts.
private struct NowRectangular: View {
  let state: NowState
  let words: NowWords

  var body: some View {
    VStack(alignment: .leading, spacing: 1) {
      switch state {
      case .none:
        Text(words.none.replacingOccurrences(of: "\n", with: words.english ? " " : ""))
          .font(.caption)
          .opacity(0.75)
      case .on(let span):
        head(span, words.on(span.day.pattern?.name ?? ""))
        leftText(until: span.end, english: words.english)
          .font(.headline.weight(.bold).monospacedDigit())
        Text(words.until(span)).font(.caption).opacity(0.75)
      case .next(let span, let inDays):
        head(span, words.next(span.day.pattern?.name ?? ""))
        Group {
          if let inDays {
            Text(words.words.inDays(inDays))
          } else if words.english {
            Text("in \(Text(span.start, style: .relative))")
          } else {
            Text("あと\(Text(span.start, style: .relative))")
          }
        }
        .font(.headline.weight(.bold).monospacedDigit())
        Text(words.from(span)).font(.caption).opacity(0.75)
      }
    }
    .lineLimit(1)
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func head(_ span: WidgetSpan, _ title: String) -> some View {
    HStack(spacing: 4) {
      WidgetMark(day: span.day, size: 14)
      Text(title)
    }
    .font(.caption.weight(.semibold))
  }
}

/// Before anything is entered, on the lock screen's rectangle: where the
/// days will come from.
struct FirstRunLine: View {
  @Environment(\.english) private var english

  var body: some View {
    Text(english ? "Shifts you enter show here" : "シフトを入れると\nここに出ます")
      .font(.caption)
      .frame(maxWidth: .infinity, alignment: .leading)
  }
}
