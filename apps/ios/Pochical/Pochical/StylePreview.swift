import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// The preview at the top of スタイル and カレンダー (/design's
/// StylePreview): this week and the next as a made-up run of the person's
/// own patterns, drawn in the settings being chosen, on a card with
/// ☀︎ / ☾ on its edge. Under the month's heading, as カレンダー shows its
/// weekdays, one week is enough.
struct StylePreview: View {
  @Environment(Settings.self) private var settings
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.themeColors) private var colors
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  var heading = false
  /// The light or dark picked by its ☀︎ / ☾, kept by the page, which may
  /// show more in it (スタイル's テーマ cards); the screen's until picked.
  @Binding var picked: ColorScheme?

  var body: some View {
    let theme = settings.device.theme
    let shown = Binding { picked ?? colorScheme } set: { picked = $0 }
    card
      .shown(in: theme, shown.wrappedValue)
      // On the preview's top edge, as /design's. A テーマ drawn dark has
      // no light to switch to: its ☾ stays on.
      .overlay(alignment: .topLeading) {
        SchemeSwitch(
          shown: theme.isAlwaysDark ? .constant(.dark) : shown,
          disabled: theme.isAlwaysDark
        )
        .offset(x: 12, y: -10)
      }
      // Room for the switch over the edge.
      .padding(.top, 10)
  }

  private var card: some View {
    let today = Day.today
    let week = settings.device.week
    let first = today.adding(days: -(((today.weekday - week.start) % 7 + 7) % 7))
    let days = (0..<(heading ? 7 : 14)).map { first.adding(days: $0) }
    // The person's patterns alone, without their days, so no memo shows.
    let calendar = OwnCalendar(days: [], patterns: patterns, patternOrder: patternOrder, orders: [])
    let shown = stylePreviewDays(days, patterns: calendar.patterns)
    let pageDays = PageDays(
      today: today, calendar: calendar, colorsHolidays: week.holiday,
      offShown: settings.device.look.options.blankOff ? .hidden : .shown, selected: nil,
      isEntering: false, onSelect: nil)
    return VStack(alignment: .leading, spacing: 4) {
      if heading {
        MonthName(position: PagerPosition(pages: 0), monthAt: { _ in today })
          .padding(.horizontal, 8)
          .padding(.bottom, 8)
      }
      WeekdayRow(week: week)
      ForEach(stride(from: 0, to: days.count, by: 7).map { $0 }, id: \.self) { start in
        pageDays.row(Array(days[start..<start + 7]), shown: shown, fadingOutside: nil)
      }
    }
    .padding(12)
    .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xl))
    .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(colors.separator))
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(heading ? "今週の見え方" : "今週と来週の見え方")
  }
}
