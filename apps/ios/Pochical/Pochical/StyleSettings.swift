import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// スタイル (/design's MarkPage): how shifts are marked, each choice drawn
/// on the person's own patterns, and this week in the look over them, so
/// there is nothing to confirm. テーマ and シフトの色 come next.
struct StyleSettings: View {
  @Environment(Settings.self) private var settings
  @FetchAll private var days: [DayRow]
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  @FetchAll private var orders: [RepeatOrderRow]

  var body: some View {
    @Bindable var settings = settings
    let calendar = OwnCalendar(
      days: days, patterns: patterns, patternOrder: patternOrder, orders: orders)
    let work = calendar.patterns.first { !$0.countsAsOff }
    let off = calendar.patterns.first(where: \.countsAsOff)
    Form {
      Section {
        ThisWeek(calendar: calendar)
      }
      .listRowBackground(Color.clear)
      .listRowInsets(EdgeInsets())
      Section {
        Choices(
          options: Shape.allCases, picked: Shape(settings.device.look),
          label: \.name
        ) { shape in
          sample(work) { $0 = shape.look(from: settings.device.look) }
        } onPick: { shape in
          settings.device.look = shape.look(from: settings.device.look)
        }
      } header: {
        Text("シフトの見た目")
      } footer: {
        Text("グループの人にも、この見た目で表示されます。")
      }
      Section("休みの見せ方") {
        Choices(
          options: OffLook.allCases, picked: OffLook(settings.device.look.options),
          label: \.name
        ) { offLook in
          sample(off) { offLook.apply(to: &$0.options) }
        } onPick: { offLook in
          offLook.apply(to: &settings.device.look.options)
        }
      }
      Section("シフト名") {
        Choices(
          options: [false, true], picked: settings.device.look.options.names,
          label: { $0 ? "あり" : "なし" }
        ) { names in
          sample(work) { $0.options.names = names }
        } onPick: { names in
          settings.device.look.options.names = names
        }
      }
    }
    .navigationTitle("スタイル")
    .navigationBarTitleDisplayMode(.inline)
  }

  /// A day drawn small in the person's look as `change` leaves it: its
  /// date, and the pattern's mark on it, as the month would show it.
  @ViewBuilder private func sample(_ pattern: Pattern?, change: (inout Look) -> Void) -> some View {
    var look = settings.device.look
    let _ = change(&look)
    if let pattern {
      DayCell(
        day: Day(year: 2026, month: 10, day: 5), entry: DayEntry(shift: pattern.id), note: nil,
        pattern: pattern, outside: false, isToday: false, isHoliday: false,
        offShown: look.options.blankOff ? .hidden : .shown
      )
      .frame(width: 44)
      .environment(\.look, look)
    }
  }
}

/// The four shapes members see: icons filled (塗り) or outlined (線),
/// emoji, and letters on their tile.
private enum Shape: CaseIterable, Hashable {
  case filled, outlined, emoji, badge

  init(_ look: Look) {
    switch look.style {
    case .icon: self = look.fill ? .filled : .outlined
    case .emoji: self = .emoji
    case .badge: self = .badge
    }
  }

  var name: String {
    switch self {
    case .filled: "塗り"
    case .outlined: "線"
    case .emoji: "絵文字"
    case .badge: "文字"
    }
  }

  /// The look in this shape; only icons carry their fill, so the others
  /// leave it as it was.
  func look(from look: Look) -> Look {
    var look = look
    switch self {
    case .filled, .outlined:
      look.style = .icon
      look.fill = self == .filled
    case .emoji: look.style = .emoji
    case .badge: look.style = .badge
    }
    return look
  }
}

/// How days off show: on a tint of their color (強調), as a mark alone
/// (印だけ), or left blank (空白), faint again while entering and in a day's
/// week.
private enum OffLook: CaseIterable, Hashable {
  case highlight, mark, blank

  init(_ options: MarkOptions) {
    if options.blankOff {
      self = .blank
    } else {
      self = options.highlight ? .highlight : .mark
    }
  }

  var name: String {
    switch self {
    case .highlight: "強調"
    case .mark: "印だけ"
    case .blank: "空白"
    }
  }

  func apply(to options: inout MarkOptions) {
    options.highlight = self == .highlight
    options.blankOff = self == .blank
  }
}

/// Choices side by side, each drawing what it does over its name, as
/// /design's tall segments: the one picked framed in the accent.
private struct Choices<Option: Hashable, Sample: View>: View {
  @Environment(\.themeColors) private var colors
  let options: [Option]
  let picked: Option
  let label: (Option) -> String
  @ViewBuilder let sample: (Option) -> Sample
  let onPick: (Option) -> Void

  var body: some View {
    HStack(spacing: 8) {
      ForEach(options, id: \.self) { option in
        let isPicked = option == picked
        Button {
          onPick(option)
        } label: {
          VStack(spacing: 6) {
            sample(option)
              .allowsHitTesting(false)
              .accessibilityHidden(true)
            Text(label(option))
              .font(.footnote)
              .foregroundStyle(isPicked ? colors.accentDefault : colors.textSecondary)
          }
          .padding(.vertical, 8)
          .frame(maxWidth: .infinity)
          .background(
            colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.lg)
          )
          .overlay {
            if isPicked {
              RoundedRectangle(cornerRadius: Radius.lg)
                .strokeBorder(colors.accentDefault, lineWidth: 2)
            }
          }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label(option))
        .accessibilityAddTraits(isPicked ? .isSelected : [])
      }
    }
  }
}

/// This week of the person's month, in the look being set.
private struct ThisWeek: View {
  @Environment(Settings.self) private var settings
  let calendar: OwnCalendar

  var body: some View {
    let today = Day.today
    let week = settings.device.week
    let first = today.adding(days: -(((today.weekday - week.start) % 7 + 7) % 7))
    let days = (0..<7).map { first.adding(days: $0) }
    VStack(spacing: 0) {
      WeekdayRow(week: week)
      PageDays(
        today: today, calendar: calendar, colorsHolidays: week.holiday,
        offShown: settings.device.look.options.blankOff ? .hidden : .shown, selected: nil,
        isEntering: false, onSelect: nil
      )
      .row(days, shown: calendar.shown(from: days[0], through: days[6]), fadingOutside: nil)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("今週の見え方")
  }
}
