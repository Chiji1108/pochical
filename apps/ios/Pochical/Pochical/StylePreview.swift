import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// The preview at the top of スタイル and カレンダー (/design's
/// StylePreview): this week and the next as a made-up run of the person's
/// own patterns, drawn in the settings being chosen, on a card with
/// ☀︎ / ☾ on its edge; swiped aside, the home screen with the カレンダー
/// widget drawn from the same fortnight, the page shown named at the
/// card's top end and its dots under it. Under the month's heading, as
/// カレンダー shows its weekdays, one week is enough on the calendar's page.
struct StylePreview: View {
  @Environment(Settings.self) private var settings
  @Environment(\.colorScheme) private var colorScheme
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  var heading = false
  /// The light or dark picked by its ☀︎ / ☾, kept by the page, which may
  /// show more in it (スタイル's テーマ cards); the screen's until picked.
  @Binding var picked: ColorScheme?
  @State private var page = 0
  /// The calendar's page's height, which the home screen's keeps, so
  /// nothing under the pages moves as they turn.
  @State private var calendarHeight: CGFloat?

  private static let pageNames = ["カレンダー", "ウィジェット"]
  /// Half the room between the pages, which reach into the page's margins
  /// by as much, so each card keeps the width of the rows under it.
  private static let pageGap: CGFloat = 6

  var body: some View {
    let theme = settings.device.theme
    let shown = Binding { picked ?? colorScheme } set: { picked = $0 }
    let preview = PreviewDays(
      today: Day.today, week: settings.device.week,
      calendar: OwnCalendar(days: [], patterns: patterns, patternOrder: patternOrder, orders: []))
    VStack(spacing: 4) {
      SwipePages(count: Self.pageNames.count, current: $page) { index in
        Group {
          if index == 0 {
            card(preview)
              .onGeometryChange(for: CGFloat.self) { $0.size.height } action: {
                calendarHeight = $0
              }
          } else {
            HomePreview(preview: preview, height: calendarHeight)
          }
        }
        .padding(.horizontal, Self.pageGap)
      }
      .padding(.horizontal, -Self.pageGap)
      .shown(in: theme, shown.wrappedValue)
      // On the preview's top edge, as /design's, kept still while the
      // pages move. A テーマ drawn dark has no light to switch to: its ☾
      // stays on.
      .overlay(alignment: .topLeading) {
        SchemeSwitch(
          shown: theme.isAlwaysDark ? .constant(.dark) : shown,
          disabled: theme.isAlwaysDark
        )
        .offset(x: 12, y: -10)
      }
      .overlay(alignment: .topTrailing) {
        PageName(name: Self.pageNames[page])
          .offset(x: -12, y: -8)
      }
      // Room for the switch over the edge.
      .padding(.top, 10)
      PageDots(
        count: Self.pageNames.count, current: $page, label: "プレビュー（カレンダー、ウィジェット）")
    }
  }

  private func card(_ preview: PreviewDays) -> some View {
    let today = preview.today
    let days = heading ? Array(preview.fortnight.prefix(7)) : preview.fortnight
    let pageDays = PageDays(
      today: today, calendar: preview.calendar, colorsHolidays: preview.week.holiday,
      offShown: .hidden, selected: nil,
      isEntering: false, onSelect: nil)
    return VStack(alignment: .leading, spacing: 4) {
      if heading {
        // The page holding today, as the calendar heads it: by its days
        // with a シフトの期間.
        MonthName(
          position: PagerPosition(pages: 0),
          monthAt: { _ in settings.device.period.month(holding: today) },
          period: settings.device.period)
          .padding(.horizontal, 8)
          .padding(.bottom, 8)
      }
      WeekdayRow(week: preview.week)
      ForEach(stride(from: 0, to: days.count, by: 7).map { $0 }, id: \.self) { start in
        pageDays.row(Array(days[start..<start + 7]), shown: preview.shown, fadingOutside: nil)
      }
    }
    .padding(12)
    .modifier(PreviewGround())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(heading ? "今週の見え方" : "今週と来週の見え方")
  }
}

/// What both of the preview's pages are drawn from: the fortnight from the
/// week holding today and the made-up run of the person's patterns in use
/// on it, so the two pages show the same days and change together.
private struct PreviewDays {
  let today: Day
  let week: DeviceSettings.Week
  /// The person's patterns alone, without their days, so no memo shows.
  let calendar: OwnCalendar
  let fortnight: [Day]
  let shown: [Day: DayEntry]

  init(today: Day, week: DeviceSettings.Week, calendar: OwnCalendar) {
    self.today = today
    self.week = week
    self.calendar = calendar
    let first = today.adding(days: -(((today.weekday - week.start) % 7 + 7) % 7))
    fortnight = (0..<14).map { first.adding(days: $0) }
    shown = stylePreviewDays(fortnight, patterns: calendar.patterns.inUse)
  }

  /// The fortnight as the カレンダー widget draws it.
  var widgetDays: [WidgetDay] {
    fortnight.map { date in
      let entry = shown[date]
      return WidgetDay(
        date, entry: entry, pattern: entry.flatMap { calendar.patternsByID[$0.shift] },
        noted: false, week: week, holiday: date.holidayName != nil)
    }
  }
}

/// The home screen's page of the preview (/design's HomePreview): the
/// カレンダー widget at an iPhone's medium size, drawn by the widget's own
/// view from the same fortnight, on a wallpaper in the テーマ's colors,
/// fitted to `height`, the calendar page's. It is a picture: a touch on it
/// opens no day, and the pages swipe under it.
private struct HomePreview: View {
  @Environment(\.themeColors) private var colors
  let preview: PreviewDays
  let height: CGFloat?

  /// The medium widget on a 6.3-inch iPhone, and the room the system keeps
  /// inside its edges.
  private static let widget = CGSize(width: 338, height: 158)
  private static let margin: CGFloat = 16
  /// Room kept round the widget: on top for the page's name and ☀︎ / ☾, at
  /// the sides and foot for the wallpaper to show.
  private static let top: CGFloat = 28
  private static let side: CGFloat = 12
  private static let bottom: CGFloat = 12

  var body: some View {
    let tall = height ?? Self.widget.height + Self.top + Self.bottom
    let room = tall - Self.top - Self.bottom
    GeometryReader { space in
      let scale = min(
        1, (space.size.width - 2 * Self.side) / Self.widget.width, room / Self.widget.height)
      TwoWeeksView(days: preview.widgetDays, today: preview.today, week: preview.week)
        .padding(Self.margin)
        .frame(width: Self.widget.width, height: Self.widget.height)
        .background(
          colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xxl, style: .continuous)
        )
        .scaleEffect(scale)
        // In the middle of the room under the page's name.
        .position(x: space.size.width / 2, y: Self.top + room / 2)
    }
    .frame(height: tall)
    .background(
      LinearGradient(
        colors: [colors.accentContainer, colors.backgroundElevated],
        startPoint: .topLeading, endPoint: .bottomTrailing)
    )
    .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(colors.separator))
    .allowsHitTesting(false)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("ホーム画面のカレンダーのウィジェットの見え方")
  }
}

/// Which page of the preview is shown, on the card's top end (/design's
/// SampleTag), in the page's colors as ☀︎ / ☾ beside it; VoiceOver hears the
/// pages named in order on the dots under them.
private struct PageName: View {
  @Environment(\.themeColors) private var colors
  let name: String

  var body: some View {
    Text(name)
      .font(.caption2.weight(.semibold))
      .foregroundStyle(colors.textTertiary)
      .padding(.horizontal, 8)
      .padding(.vertical, 1)
      .background(colors.backgroundBase, in: RoundedRectangle(cornerRadius: Radius.sm))
      .overlay(RoundedRectangle(cornerRadius: Radius.sm).strokeBorder(colors.separator))
      .accessibilityHidden(true)
  }
}

/// The preview's card, in the colors of the light or dark it is shown in,
/// read where `shown(in:_:)` has set them rather than from the page.
private struct PreviewGround: ViewModifier {
  @Environment(\.themeColors) private var colors

  func body(content: Content) -> some View {
    content
      .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xl))
      .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(colors.separator))
  }
}
