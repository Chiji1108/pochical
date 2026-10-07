import PochicalDesign
import PochicalKit
import SwiftUI

/// ポチポチ入力's tray: the day being entered, a button for each pattern
/// and 消す and 翌日へ. It is entered like a keyboard, so every key ticks
/// alike (spec/haptics.md).
struct EntryTray: View {
  @Environment(\.themeColors) private var colors
  let day: Day
  /// Which days take their colors (the person's カレンダー settings).
  let week: DeviceSettings.Week
  let patterns: [Pattern]
  /// Whether the day has a shift to clear.
  let canClear: Bool
  /// Whether a day of the month comes after it.
  let canSkip: Bool
  let onEnter: (PatternID?) -> Void
  let onSkip: () -> Void
  @State private var keys = 0
  @State private var page = 0

  var body: some View {
    VStack(spacing: 8) {
      TrayDateLabel(day: day, week: week)
      PatternKeys(patterns: patterns, page: $page) { pattern in
        keys += 1
        onEnter(pattern.id)
      }
      TrayActionsRow(pages: pageCount, page: $page) {
        TrayAction(title: "消す", systemImage: "trash", enabled: canClear) {
          keys += 1
          onEnter(nil)
        }
      } trailing: {
        TrayAction(title: "翌日へ", systemImage: "arrow.right", enabled: canSkip, trailingIcon: true) {
          keys += 1
          onSkip()
        }
      }
    }
    .sensoryFeedback(.selection, trigger: keys)
  }

  private var pageCount: Int {
    (patterns.count + patternsPerPage - 1) / patternsPerPage
  }
}

/// The day ポチポチ入力 enters next, over its keys.
struct TrayDateLabel: View {
  @Environment(\.themeColors) private var colors
  let day: Day
  /// Which days take their colors (the person's カレンダー settings).
  let week: DeviceSettings.Week

  var body: some View {
    HStack(spacing: 2) {
      Text("\(day.month)月\(day.day)日")
        .font(.system(size: 17, weight: .semibold))
        .foregroundStyle(colors.textPrimary)
      Text("(\(WeekdayRow.names[day.weekday]))")
        .font(.system(size: 14))
        .foregroundStyle(weekdayColor)
    }
    .accessibilityElement(children: .combine)
    .accessibilityLabel("入力する日付：\(day.month)月\(day.day)日")
  }

  private var weekdayColor: Color {
    let isHoliday = Holidays.name(on: day.key, in: "JP") != nil
    if (isHoliday && week.holiday) || (day.weekday == 0 && week.sunday) {
      return colors.calendarHoliday
    }
    return day.weekday == 6 && week.saturday ? colors.calendarSaturday : colors.textTertiary
  }

}

/// A tray's words under its keys with the pages' dots between them, the
/// dots in the middle of the tray whatever the words, so they sit in one
/// place in every tray.
struct TrayActionsRow<Leading: View, Trailing: View>: View {
  let pages: Int
  @Binding var page: Int
  @ViewBuilder let leading: () -> Leading
  @ViewBuilder let trailing: () -> Trailing

  var body: some View {
    HStack(spacing: 8) {
      leading().frame(maxWidth: .infinity, alignment: .trailing)
      if pages > 1 {
        PageDots(count: pages, current: $page, label: "シフトのページ")
      }
      trailing().frame(maxWidth: .infinity, alignment: .leading)
    }
  }
}

/// One of a tray's words beside its dots, small and quiet: 消す and 翌日へ,
/// and ⌫ for an order being typed.
struct TrayAction: View {
  @Environment(\.themeColors) private var colors
  let title: String
  let systemImage: String
  let enabled: Bool
  var trailingIcon = false
  let action: () -> Void

  var body: some View {
    Button(action: action) {
      HStack(spacing: 4) {
        if !trailingIcon {
          Image(systemName: systemImage).imageScale(.small)
        }
        Text(title)
          // One line, whatever room the dots leave.
          .lineLimit(1)
          .fixedSize()
        if trailingIcon {
          Image(systemName: systemImage).imageScale(.small)
        }
      }
      .font(.caption)
      .foregroundStyle(enabled ? colors.textTertiary : colors.textDisabled)
      .padding(.horizontal, 16)
      .frame(minHeight: Metrics.touch)
      .contentShape(Rectangle())
    }
    .buttonStyle(TrayPress())
    .disabled(!enabled)
  }
}

/// A tray key pressed: the accent laid over it, as /design's state layer,
/// and a pattern's key giving a little under the finger.
private struct TrayPress: ButtonStyle {
  @Environment(\.themeColors) private var colors
  var scale: CGFloat = 1

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .overlay {
        RoundedRectangle(cornerRadius: Radius.lg)
          .fill(colors.accentDefault.opacity(configuration.isPressed ? Metrics.pressedOpacity : 0))
      }
      .scaleEffect(configuration.isPressed ? scale : 1)
      .animation(Springs.quick, value: configuration.isPressed)
  }
}

/// A key for each pattern, as ポチポチ入力's tray has them: up to
/// `patternsPerPage` on a page, fewer in fewer columns, more paged and
/// swiped. The tray and 働き方's order are entered with them alike.
struct PatternKeys: View {
  @Environment(\.themeColors) private var colors
  let patterns: [Pattern]
  @Binding var page: Int
  let onPick: (Pattern) -> Void

  /// One page for up to `patternsPerPage`, else pages of them, swiped.
  var body: some View {
    let pages = stride(from: 0, to: patterns.count, by: patternsPerPage).map {
      Array(patterns[$0..<min($0 + patternsPerPage, patterns.count)])
    }
    if pages.count > 1 {
      TabView(selection: $page) {
        ForEach(pages.indices, id: \.self) { index in
          grid(pages[index], columns: 5)
            .frame(maxHeight: .infinity, alignment: .top)
            .tag(index)
        }
      }
      .tabViewStyle(.page(indexDisplayMode: .never))
      .frame(height: 2 * 64 + 8)
    } else {
      grid(patterns, columns: columns)
    }
  }

  /// Fewer patterns sit in fewer columns, as /design lays them out.
  private var columns: Int {
    switch patterns.count {
    case 9...: 5
    case 7...8: 4
    case 5...6: 3
    default: patterns.count
    }
  }

  private func grid(_ patterns: [Pattern], columns: Int) -> some View {
    let tall = patterns.count <= 4
    return LazyVGrid(
      columns: Array(repeating: GridItem(.flexible(maximum: 72), spacing: 8), count: max(columns, 1)),
      spacing: 8
    ) {
      ForEach(patterns, id: \.id) { pattern in
        Button {
          onPick(pattern)
        } label: {
          VStack(spacing: 8) {
            ShiftMark(pattern: pattern, size: 26)
              .frame(height: 28)
            Text(pattern.name)
              .font(.caption)
              .lineLimit(1)
              .padding(.horizontal, 4)
          }
          .foregroundStyle(colors.textPrimary)
          .frame(maxWidth: .infinity)
          .frame(height: tall ? 77 : 64)
          .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.lg))
          .overlay(
            RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(colors.borderDefault)
          )
        }
        .buttonStyle(TrayPress(scale: 0.97))
      }
    }
    .accessibilityElement(children: .contain)
    .accessibilityLabel("入力するシフト")
  }
}
