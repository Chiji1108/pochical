import PochicalDesign
import PochicalKit
import SQLiteData
import StoreKit
import SwiftUI

/// カレンダー: the person's month, a page a month, turned by swiping.
struct CalendarScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Dependency(\.defaultDatabase) private var database
  @FetchAll private var days: [DayRow]
  @FetchAll private var patterns: [PatternRow]
  @FetchAll private var patternOrder: [PatternOrderRow]
  @FetchAll private var orders: [RepeatOrderRow]
  @FetchAll private var coworkerRows: [CoworkerRow]
  @FetchAll private var coworkerOrder: [CoworkerOrderRow]
  @State private var today = Day.today
  @State private var shownMonth: Day? = Day.today.firstOfMonth
  /// The day ポチポチ入力 enters next, while entering.
  @State private var entering: Day?
  @State private var gaps: [Day] = []
  /// The pattern picked in the gap sheet to fill them with.
  @State private var gapFill: PatternID?
  /// The month being saved as a picture.
  /// The month whose 今月の内訳 is open.
  @State private var breakingDown: Day?
  @State private var picturing: Day?
  /// The month being put in the device's calendar.
  @State private var addingToCalendar: Day?
  /// Something was put on the days since entering or a day was opened,
  /// so closing them is a moment to ask for a review (spec/review.md).
  @State private var changed = false
  @Environment(\.requestReview) private var requestReview
  /// The day opened from the month, its week alone left above its detail.
  @State private var opened: Day?
  /// The week swiped to beside an opened one, until the swipe settles and
  /// opens the same weekday there.
  @State private var swipedWeek: Day?
  /// How far a pull down has unfolded the month around an opened week, 0
  /// to 1, while the finger is on it.
  @State private var pull: CGFloat = 0
  /// Where the pages are, which the heading follows; on this month's
  /// page until the pages first say.
  @State private var position = PagerPosition(pages: monthsAround)
  /// Whether a finger is on the week, so a pull the system takes away,
  /// which never ends, folds back too.
  @GestureState private var pulling = false
  /// Pulled since the finger went down, so letting go on a day presses
  /// nothing, as /design's pull does.
  @State private var pulled = false

  /// How far the pages reach either side of this month. Only the pages in
  /// view are drawn, so they can reach far without a cost.
  private static let monthsAround = 120
  /// Past this share of the way, a pull let go unfolds the month; short of
  /// it, the week folds back. A flick faster than `unfoldFlick`, in points
  /// a second, goes the way it is flicked wherever it is let go.
  private static let unfoldShare: CGFloat = 1 / 3
  private static let unfoldFlick: CGFloat = 400
  private static let screenEdge: CGFloat = 16
  private var weekStart: Int { settings.device.week.start }

  var body: some View {
    let calendar = OwnCalendar(
      days: days, patterns: patterns, patternOrder: patternOrder, orders: orders)
    VStack(spacing: 0) {
      heading
        .padding(.horizontal, Self.screenEdge)
      WeekdayRow(week: settings.device.week)
        .padding(.horizontal, Self.screenEdge)
      // The pages run to the screen's edges, so a month slides out of
      // sight rather than being cut off inside them.
      ScrollView(.horizontal) {
        LazyHStack(spacing: 0) {
          ForEach(pages, id: \.self) { page in
            Group {
              switch page {
              case .month(let month):
                MonthPage(
                  month: month, weekStart: weekStart, days: pageDays(calendar),
                  openedWeek: opened, fold: fold)
              case .week(let week):
                WeekPage(week: week, days: pageDays(calendar))
              }
            }
            .padding(.horizontal, Self.screenEdge)
            .containerRelativeFrame(.horizontal)
          }
        }
        .scrollTargetLayout()
      }
      .scrollTargetBehavior(.paging)
      .scrollPosition(id: shownPage)
      .scrollIndicators(.hidden)
      // A week swiped to opens once the swipe settles, so the pages are
      // not changed under the finger.
      .onScrollPhaseChange { _, phase in
        if phase == .idle { openSwipedWeek() }
      }
      .onScrollGeometryChange(for: CGFloat.self) { geometry in
        geometry.contentOffset.x / max(geometry.containerSize.width, 1)
      } action: { _, pages in
        position.pages = pages
      }
      .frame(height: DayCell.height + (MonthPage.height - DayCell.height) * (1 - fold))
      // While a day is open, a pull down unfolds the month, following the
      // finger (spec/calendar.md, A day's detail).
      .simultaneousGesture(
        DragGesture(minimumDistance: 12)
          .updating($pulling) { _, pulling, _ in pulling = true }
          .onChanged { drag in
            pull = pullShare(drag, from: pull)
            if pull > 0 { pulled = true }
          }
          .onEnded(pullEnded),
        including: opened == nil ? .none : .all)
      if let day = opened {
        let entry = calendar.shown(from: day, through: day)[day]
        // The day's detail is new for each day, its fields with it, inside
        // what shows as the week opens.
        VStack(spacing: 0) {
          DayDetail(
            day: day, entry: entry, note: calendar.note(on: day), patterns: calendar.patterns,
            coworkers: ordered(coworkerRows, by: coworkerOrder),
            onChange: { entry in
              write { db, now in try OwnValues.set(day, to: entry, now: now, in: db) }
            },
            onNoteChange: { note in
              write { db, now in try OwnValues.setNote(day, to: note, now: now, in: db) }
            },
            // Someone added from a day is on that day too.
            onAddCoworker: { name in
              write { db, now in
                let id = try OwnValues.addCoworker(named: name, now: now, in: db)
                if var entry {
                  entry.people = (entry.people ?? []) + [id]
                  try OwnValues.set(day, to: entry, now: now, in: db)
                }
              }
            },
            onStep: { step in opened = day.adding(days: step) }
          )
          .id(day)
        }
        .padding(.top, 16)
        // A line from edge to edge between the week and the day, as a
        // bar's runs.
        .overlay(alignment: .top) {
          Rectangle().fill(colors.separator).frame(height: 1)
        }
        .padding(.top, 12)
        .opacity(max(1 - 2 * pull, 0))
        // It shows as the month folds into the week, and goes at once as
        // the month unfolds, as /design's does.
        .transition(
          .asymmetric(
            insertion: .opacity.animation(Springs.quick.delay(0.1)), removal: .identity))
      } else {
        Spacer(minLength: 0)
        bottom(calendar)
          .padding(.horizontal, Self.screenEdge)
          .padding(.bottom, 8)
      }
    }
    .background(colors.backgroundBase)
    // The tabs give way to entering and to a day's week, as /design's do.
    .toolbarVisibility(entering == nil && opened == nil ? .visible : .hidden, for: .tabBar)
    // A month turned to while entering starts on its first blank day; a
    // day picked in a month around it turns to that month.
    .onChange(of: shownMonth) { _, month in
      if let month, let day = entering, day.firstOfMonth != month {
        entering = firstBlankDay(in: month, days: monthDays(month, currentCalendar))
      }
    }
    .onChange(of: pulling) { _, pulling in
      if !pulling, pull > 0 {
        withAnimation(Springs.standard) { pull = 0 }
      }
    }
    .onChange(of: opened) { _, day in
      guard let day else {
        // A swipe left unsettled as the week closed goes with it.
        swipedWeek = nil
        askForReviewIfDue()
        return
      }
      shownMonth = monthShowing(day)
    }
    .onChange(of: entering) { _, day in
      if day == nil { askForReviewIfDue() }
      if let day, day.firstOfMonth != shownMonth {
        withAnimation(Springs.standard) {
          shownMonth = day.firstOfMonth
        }
      }
    }
    .sheet(isPresented: Binding { breakingDown != nil } set: { if !$0 { breakingDown = nil } }) {
      if let month = breakingDown {
        let days = monthDays(month, calendar)
        MonthBreakdownSheet(
          month: month,
          counts: calendar.patterns.map { pattern in
            (pattern, days.values.count { $0.shift == pattern.id })
          },
          unfilled: month.daysOfMonth.count - days.count)
      }
    }
    .sheet(isPresented: Binding { picturing != nil } set: { if !$0 { picturing = nil } }) {
      if let month = picturing {
        MonthPicturePage(month: month, calendar: currentCalendar)
      }
    }
    .sheet(isPresented: Binding { addingToCalendar != nil } set: { if !$0 { addingToCalendar = nil } }) {
      if let month = addingToCalendar {
        DeviceCalendarSheet(month: month, calendar: currentCalendar)
      }
    }
    .onChange(of: gaps) { _, gaps in
      if gaps.isEmpty {
        gapFill = nil
        askForReviewIfDue()
      }
    }
    .sheet(isPresented: Binding(get: { !gaps.isEmpty }, set: { if !$0 { gaps = [] } })) {
      gapSheet(calendar)
    }
    .task {
      // Past midnight, while the app is open or waiting in the background.
      for await _ in NotificationCenter.default.notifications(named: .NSCalendarDayChanged) {
        today = .today
      }
    }
  }

  private var thisMonth: Day {
    today.firstOfMonth
  }

  private var currentCalendar: OwnCalendar {
    OwnCalendar(days: days, patterns: patterns, patternOrder: patternOrder, orders: orders)
  }

  /// The days of `month`'s month that show a shift.
  private func monthDays(_ month: Day, _ calendar: OwnCalendar) -> [Day: DayEntry] {
    calendar.shown(from: month.firstOfMonth, through: month.daysOfMonth.last!)
  }

  /// The first day of the week `day` is in, from the week start.
  private func weekOf(_ day: Day) -> Day {
    day.adding(days: -(((day.weekday - weekStart) % 7 + 7) % 7))
  }

  /// How far the month is folded into the opened week, 0 to 1: moved by
  /// opening and closing the week, or by a finger pulling it open.
  private var fold: CGFloat {
    opened == nil ? 0 : 1 - pull
  }

  /// How far a pull unfolds the month: the month's foot comes down with
  /// the finger.
  private static let unfoldDistance = MonthPage.height - DayCell.height

  /// How far `drag` pulls the month open, from `pull` so far.
  private func pullShare(_ drag: DragGesture.Value, from pull: CGFloat) -> CGFloat {
    let (dx, dy) = (drag.translation.width, drag.translation.height)
    // A pull starts going down, not sideways, which is the week's swipe.
    guard pull > 0 || dy > abs(dx) else { return 0 }
    return min(max(dy / Self.unfoldDistance, 0), 1)
  }

  private func pullEnded(_ drag: DragGesture.Value) {
    // A day's button lets go after the pull, in the same touch.
    Task { @MainActor in pulled = false }
    let share = pullShare(drag, from: pull)
    guard share > 0 else { return }
    let speed = drag.velocity.height
    let unfolds = abs(speed) > Self.unfoldFlick ? speed > 0 : share > Self.unfoldShare
    withAnimation(folding) {
      if unfolds { opened = nil }
      pull = 0
    }
  }

  /// The pages: the months, or with a day opened its month, folded into
  /// the week, between the weeks before and after it.
  private var pages: [CalendarPage] {
    guard let day = opened, let month = shownMonth else {
      return (-Self.monthsAround...Self.monthsAround).map { .month(thisMonth.addingMonths($0)) }
    }
    // The month keeps its place among the pages, so the scroll view stays
    // on it as the weeks come in and go.
    let place = monthsAfterThis(month)
    let week = weekOf(day)
    return (-Self.monthsAround...Self.monthsAround).map {
      $0 == place ? .month(month) : .week(week.adding(days: 7 * ($0 - place)))
    }
  }

  /// The page in view: the month, or the week being swiped to.
  private var shownPage: Binding<CalendarPage?> {
    Binding(
      get: { swipedWeek.map(CalendarPage.week) ?? shownMonth.map(CalendarPage.month) },
      set: { page in
        switch page {
        case .month(let month):
          shownMonth = month
          swipedWeek = nil
        case .week(let week):
          swipedWeek = week
        case nil:
          break
        }
      })
  }

  /// Opens the same weekday in the week swiped to, which becomes the month's
  /// folded week in place of the page beside it, drawn the same.
  private func openSwipedWeek() {
    guard let week = swipedWeek, let day = opened else { return }
    let next = day.adding(days: week.days(since: weekOf(day)))
    // All at once, so the pages never stand on the month left behind.
    opened = next
    shownMonth = monthShowing(next)
    swipedWeek = nil
  }

  /// The month shown with `day` opened: the one shown while the day's week
  /// is one of its rows, as each holds a day of it, else the day's own.
  private func monthShowing(_ day: Day) -> Day {
    if let month = shownMonth,
      monthWeeks(month, weekStart: weekStart).contains(where: { $0.contains(day) })
    {
      return month
    }
    return day.firstOfMonth
  }

  /// Days off left blank on the month come back faint while entering and
  /// in a day's week, where they are what is being looked at (休みの見せ方
  /// 空白).
  private var offShown: OffShown {
    guard settings.device.look.options.blankOff else { return .shown }
    return entering != nil || opened != nil ? .faint : .hidden
  }

  /// While the gap sheet asks, its days drawn faint as the pattern picked
  /// would fill them, so the question points at them.
  private func gapPreview(_ calendar: OwnCalendar) -> [Day: Pattern] {
    let offPatterns = calendar.patterns.filter(\.countsAsOff)
    guard let fill = offPatterns.first(where: { $0.id == gapFill }) ?? offPatterns.first else {
      return [:]
    }
    return Dictionary(uniqueKeysWithValues: gaps.map { ($0, fill) })
  }

  private func pageDays(_ calendar: OwnCalendar) -> PageDays {
    PageDays(
      today: today, calendar: calendar, colorsHolidays: settings.device.week.holiday,
      offShown: offShown, selected: entering ?? opened, isEntering: entering != nil,
      preview: gapPreview(calendar),
      onSelect: { day in
        if pulled { return }
        if entering != nil {
          entering = day
        } else {
          withAnimation(folding) { opened = day }
        }
      })
  }

  /// ポチポチ入力 to start entering, or its tray while entering.
  @ViewBuilder private func bottom(_ calendar: OwnCalendar) -> some View {
    if let day = entering {
      let shown = calendar.shown(from: day, through: day)
      EntryTray(
        day: day, week: settings.device.week, patterns: calendar.patterns,
        canClear: shown[day] != nil,
        canSkip: day != day.daysOfMonth.last,
        onEnter: { shift in
          write { db, now in try OwnValues.enter(shift, on: day, now: now, in: db) }
          let next = selectedAfterEntering(shift, on: day, patterns: calendar.patternsByID)
          entering = next
          let pattern = shift.flatMap { calendar.patternsByID[$0] }
          let following = pattern?.nextDay.flatMap { calendar.patternsByID[$0] }
          announce(
            pattern.map { pattern in
              following.map { "\(pattern.name)を入力しました。翌日は\($0.name)です" }
                ?? "\(pattern.name)を入力しました"
            } ?? "シフトを消しました", on: day, next: next)
        },
        onSkip: {
          let next = selectedAfterEntering(nil, on: day, patterns: [:])
          entering = next
          announce("変更せずに進みました", on: day, next: next)
        }
      )
    } else {
      MonthSummary(
        position: position, monthAt: monthOfPage,
        daysOff: { month in
          monthDays(month, calendar).values.count {
            calendar.patternsByID[$0.shift]?.countsAsOff == true
          }
        }
      ) { month in
        breakingDown = month
      }
      .padding(.bottom, 12)
      Button {
        let month = shownMonth ?? thisMonth
        entering = firstBlankDay(in: month, days: monthDays(month, calendar))
      } label: {
        Label("ポチポチ入力", systemImage: "pencil")
          .font(.body.weight(.medium))
          .frame(maxWidth: .infinity, minHeight: Metrics.control)
      }
      .buttonStyle(.borderedProminent)
      .buttonBorderShape(.capsule)
      .tint(colors.accentFill)
      .foregroundStyle(colors.accentOnFill)
    }
  }

  /// 完了: entering ends, and blank days before the month's last entered
  /// one are asked about.
  private func finish() {
    guard let day = entering else {
      return
    }
    entering = nil
    let calendar = currentCalendar
    // With no pattern that counts as off there is nothing to offer.
    guard holidayShift(of: calendar.patterns) != nil else {
      return
    }
    let month = day.firstOfMonth
    let shown = calendar.shown(from: month, through: month.daysOfMonth.last!)
    gaps = gapDays(in: month, days: shown)
  }

  /// What 完了 asks about the month's blank days, while there are some
  /// and a pattern that counts as off to fill them with.
  private func gapSheet(_ calendar: OwnCalendar) -> GapSheet? {
    let offPatterns = calendar.patterns.filter(\.countsAsOff)
    guard !offPatterns.isEmpty, !gaps.isEmpty else { return nil }
    return GapSheet(
      days: gaps, offPatterns: offPatterns, picked: $gapFill,
      blankOff: settings.device.look.options.blankOff
    ) { off in
      write { db, now in try OwnValues.fill(gaps, with: off.id, now: now, in: db) }
    }
  }

  /// Asks the store for its review prompt once entering, a day and 完了's
  /// question have all closed after something was put on the days, if the
  /// person has used Pochical long enough (spec/review.md).
  private func askForReviewIfDue() {
    guard changed, entering == nil, opened == nil, gaps.isEmpty else { return }
    changed = false
    guard ReviewPrompt.mayAsk else { return }
    requestReview()
    ReviewPrompt.asked()
  }

  /// Writes the person's edits at once; they wait in the outbox for sync.
  private func write(_ edit: @escaping (Database, Int64) throws -> Void) {
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    do {
      try database.write { db in try edit(db, now) }
      changed = true
      // A memo kept as its day closes comes after the day has gone.
      askForReviewIfDue()
    } catch {
      // Not expected: the edit is the device's own, and its tables are.
      ReviewPrompt.troubled = true
      assertionFailure("Could not keep the edit: \(error)")
    }
  }

  /// Says what entering did and where it goes on, for VoiceOver, as
  /// /design's live region: the month's last day stays until 完了.
  private func announce(_ done: String, on day: Day, next: Day) {
    let after = next == day ? "月末です。入力が終わったら完了を押してください" : "\(next.day)日を選択中"
    AccessibilityNotification.Announcement("\(day.monthDayText)、\(done)。\(after)").post()
  }

  /// How the month folds into a day's week and back: at once with Reduce
  /// Motion on, as /design's fold.
  private var folding: Animation? {
    reduceMotion ? nil : Springs.standard
  }

  /// The heading's buttons, on the month's line: 今月 away from this
  /// month, 完了 while entering, and in a day's week 今週 away from this
  /// week and × (spec/calendar.md).
  @ViewBuilder private var actions: some View {
    if opened != nil {
      // Back to this week and closing are of different kinds, so they
      // stand apart.
      HStack(spacing: 12) {
        TodayFade(position: position, todayPage: todayPage) {
          TodayButton(unit: "週") { opened = today }
        }
        Button("閉じる", systemImage: "xmark", role: .close) {
          withAnimation(folding) { opened = nil }
        }
        .labelStyle(.iconOnly)
        .buttonStyle(BarButton())
      }
    } else if entering != nil {
      Button("完了", systemImage: "checkmark", role: .confirm) {
        finish()
      }
      .labelStyle(.iconOnly)
      .buttonStyle(BarButton(tint: colors.accentFill))
      .foregroundStyle(colors.accentOnFill)
    } else {
      HStack(spacing: 12) {
        TodayFade(position: position, todayPage: todayPage) {
          TodayButton(unit: "月") {
            withAnimation(Springs.standard) { shownMonth = thisMonth }
          }
        }
        // The month kept as a picture or put in the device's calendar
        // (/design's save menu).
        Menu {
          Button("画像で保存", systemImage: "photo") {
            picturing = shownMonth ?? thisMonth
          }
          Button("端末カレンダーに追加", systemImage: "calendar.badge.plus") {
            addingToCalendar = shownMonth ?? thisMonth
          }
        } label: {
          Label("この月のシフトを保存", systemImage: "square.and.arrow.down")
            .labelStyle(.iconOnly)
        }
        .buttonStyle(BarButton())
      }
    }
  }

  private var heading: some View {
    HStack(alignment: .bottom) {
      // Only the month on its own opens 月を選ぶ; entering and a day's week
      // keep to the days around (/design's calendar heading).
      if entering == nil, opened == nil {
        MonthTitleButton(
          month: shownMonth ?? thisMonth, first: thisMonth.addingMonths(-Self.monthsAround),
          last: thisMonth.addingMonths(Self.monthsAround), chevron: false
        ) { picked in
          withAnimation(Springs.standard) { shownMonth = picked }
        } label: {
          MonthName(position: position, monthAt: monthOfPage)
        }
      } else {
        MonthName(position: position, monthAt: monthOfPage)
      }
      Spacer()
      actions
        .foregroundStyle(colors.textPrimary)
    }
    .padding(.horizontal, 8)
    .padding(.top, 8)
    .padding(.bottom, 12)
  }

  /// How many months `month` is after this one, which is where its page
  /// lies from this month's.
  private func monthsAfterThis(_ month: Day) -> Int {
    (month.year - thisMonth.year) * 12 + month.month - thisMonth.month
  }

  /// The month the page at `index` shows: its own, or for a week beside
  /// the opened one, the month that week opens in.
  private func monthOfPage(_ index: Int) -> Day {
    let place = index - Self.monthsAround
    guard let day = opened, let month = shownMonth else {
      return thisMonth.addingMonths(place)
    }
    let weeks = place - monthsAfterThis(month)
    return weeks == 0 ? month : monthShowing(day.adding(days: 7 * weeks))
  }

  /// The page of this month, or with a day opened, of this week.
  private var todayPage: Int {
    guard let day = opened, let month = shownMonth else { return Self.monthsAround }
    return Self.monthsAround + monthsAfterThis(month)
      + weekOf(today).days(since: weekOf(day)) / 7
  }
}

/// The weekday names over the pages, from the week start, Sundays and
/// Saturdays in their colors unless the person turned them off.
struct WeekdayRow: View {
  @Environment(\.themeColors) private var colors
  let week: DeviceSettings.Week
  /// Closer to the days, as a picture of the month draws it.
  var compact = false

  var body: some View {
    HStack(spacing: 4) {
      ForEach(0..<7, id: \.self) { index in
        let weekday = (week.start + index) % 7
        Text(Day.weekdayNames[weekday])
          .font(.system(size: 11))
          .foregroundStyle(color(of: weekday))
          .frame(maxWidth: .infinity)
      }
    }
    .padding(.bottom, compact ? 8 : 12)
    .accessibilityHidden(true)
  }

  private func color(of weekday: Int) -> Color {
    switch weekday {
    case 0 where week.sunday: colors.calendarHoliday
    case 6 where week.saturday: colors.calendarSaturday
    default: colors.textTertiary
    }
  }
}

/// A page of the calendar: a month, or beside an opened week the weeks
/// before and after it.
enum CalendarPage: Hashable {
  case month(Day)
  /// A week, by its first day.
  case week(Day)
}

/// What a page's days are drawn with.
struct PageDays {
  let today: Day
  let calendar: OwnCalendar
  /// Whether holidays' dates take Sunday's red.
  let colorsHolidays: Bool
  /// How days off show while the person leaves them blank.
  let offShown: OffShown
  /// The day being entered or opened, framed.
  let selected: Day?
  let isEntering: Bool
  /// Days drawn faint as a pattern would fill them, while the gap sheet
  /// asks about them.
  var preview: [Day: Pattern] = [:]
  /// Picks a day: to enter while entering, else to open.
  let onSelect: ((Day) -> Void)?

  /// A week's row, its days of other months faded when `month` is given.
  func row(_ week: [Day], shown: [Day: DayEntry], fadingOutside month: Day?) -> some View {
    HStack(spacing: 4) {
      ForEach(week, id: \.self) { day in
        let entry = shown[day]
        let previewed = entry == nil ? preview[day] : nil
        DayCell(
          day: day, entry: entry, note: calendar.note(on: day),
          pattern: previewed ?? entry.flatMap { calendar.patternsByID[$0.shift] },
          outside: month.map { day.month != $0.month } ?? false, isToday: day == today,
          isHoliday: day.holidayName != nil,
          colorsHoliday: colorsHolidays, offShown: offShown, isSelected: day == selected,
          isEntering: isEntering, preview: previewed != nil,
          onSelect: onSelect)
      }
    }
  }
}

/// A month's page: its weeks, a row each, with room kept for six, the most
/// a month spans, so what is under it stays put as the months turn.
///
/// A day opened folds the page into its week, as the Calendar apps do and
/// /design's FoldingGrid: the days lie on one sheet, which moves up to
/// bring the week to the top while the other weeks fade on it, and the
/// page's height follows. All of it follows `fold`, so a finger pulling the
/// week open moves it as the animations do.
struct MonthPage: View {
  let month: Day
  let weekStart: Int
  let days: PageDays
  /// The day opened, whose week the page folds into.
  let openedWeek: Day?
  /// How far the page is folded into that week, 0 to 1.
  let fold: CGFloat

  private static let rowGap: CGFloat = 4
  private static let rowStep = DayCell.height + rowGap
  static let height = 6 * DayCell.height + 5 * rowGap

  var body: some View {
    let weeks = monthWeeks(month, weekStart: weekStart)
    let row = openedWeek.flatMap { day in weeks.firstIndex { $0.contains(day) } } ?? 0
    let shown = days.calendar.shown(from: weeks.first![0], through: weeks.last![6])
    VStack(spacing: Self.rowGap) {
      ForEach(Array(weeks.enumerated()), id: \.element.first) { index, week in
        // Folded away, the rest of the month is out of reach.
        let away = openedWeek != nil && index != row
        days.row(week, shown: shown, fadingOutside: openedWeek == nil ? month : nil)
          .opacity(away ? 1 - fold : 1)
          .allowsHitTesting(!away)
          .accessibilityHidden(away)
      }
    }
    .offset(y: -CGFloat(row) * Self.rowStep * fold)
    .frame(height: DayCell.height + (Self.height - DayCell.height) * (1 - fold), alignment: .top)
  }
}

/// A week beside an opened one, drawn as the month folded into it is, so
/// it can take that page's place once swiped to.
struct WeekPage: View {
  let week: Day
  let days: PageDays

  var body: some View {
    let week = (0..<7).map { self.week.adding(days: $0) }
    days.row(week, shown: days.calendar.shown(from: week[0], through: week[6]), fadingOutside: nil)
      .frame(height: DayCell.height, alignment: .top)
  }
}
