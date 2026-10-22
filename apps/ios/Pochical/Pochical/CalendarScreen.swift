import PochicalDesign
import PochicalKit
import SQLiteData
import StoreKit
import SwiftUI
import SwiftUINavigation
import UIKit

/// カレンダー: the person's month, a page a month, turned by swiping.
struct CalendarScreen: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.write) private var write
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
  /// What a tap on a day does, for every day of the pages.
  @State private var selectDay = Handler<Day>()
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
  /// The reminders offered, once, after shifts were first entered: the
  /// time they come at.
  @State private var offeringReminders: String?
  /// The day opened from the month, its week alone left above its detail.
  @State private var opened: Day?
  /// The day's sheet is going: the month unfolds as it goes, not once it
  /// has gone, and folds again if a swipe is taken back.
  @State private var leaving = false
  /// The week swiped to beside an opened one, until the swipe settles and
  /// opens the same weekday there.
  @State private var swipedWeek: Day?
  /// The day ‹ › or 今週 opens in another week, once the pages have slid
  /// to it; a swipe opens the same weekday.
  @State private var landing: Day?
  /// How far a pull down has unfolded the month around an opened week, 0
  /// to 1, while the finger is on it.
  @State private var pull: CGFloat = 0
  /// Where the pages are, which the heading follows; on this month's
  /// page until the pages first say.
  @State private var position = PagerPosition(pages: monthsAround)

  /// How far the pages reach either side of this month. Only the pages in
  /// view are drawn, so they can reach far without a cost.
  private static let monthsAround = 120
  /// Where the folded week ends and the screen's own room does, on the
  /// screen, for the day's sheet to rise to just under the week.
  @State private var weekEnd: CGFloat = 0
  @State private var foot: CGFloat = 0
  /// The screen's room and what stands around the month, measured, so a
  /// short screen fits its six weeks (`cellHeight`).
  @State private var room = Room()
  private struct Room {
    var total: CGFloat = 0
    var heading: CGFloat = 0
    var weekdays: CGFloat = 0
    var bottom: CGFloat = 0
  }
  /// How tall a day is: DayCell.fullHeight where the screen has room, as
  /// /design's; on a short screen, as tall as six weeks fit between the
  /// heading and the bottom, which keep their size.
  private var cellHeight: CGFloat {
    guard room.total > 0 else { return DayCell.fullHeight }
    return MonthPage.cellHeight(
      fitting: room.total - room.heading - room.weekdays - room.bottom - Self.leastSpare)
  }
  /// Kept free over the bottom however short the screen.
  private static let leastSpare: CGFloat = 8
  /// The day's sheet as it opens: up to just under the folded week, which
  /// stays in sight to tap, measured so it fits each screen.
  private var underWeek: PresentationDetent {
    let room = foot - weekEnd - Self.underWeekGap
    return room > 0 ? .height(room) : .medium
  }
  /// Between the folded week and the sheet.
  private static let underWeekGap: CGFloat = 8
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
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { room.heading = $0 }
      WeekdayRow(week: settings.device.week)
        .padding(.horizontal, Self.screenEdge)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { room.weekdays = $0 }
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
      .frame(height: cellHeight + (MonthPage.height(cell: cellHeight) - cellHeight) * (1 - fold))
      // Where the folded week ends, however folded the pages are now.
      .onGeometryChange(for: CGFloat.self) { proxy in
        proxy.frame(in: .global).minY
      } action: { weekEnd = $0 + cellHeight }
      // While a day is open, a pull down unfolds the month, following the
      // finger (spec/calendar.md, A day's detail).
      .gesture(
        PullDown(
          isEnabled: opened != nil,
          onChange: { down in pull = pullShare(down) },
          onEnd: pullEnded))
      if shownOpen != nil {
        // The day's detail is a sheet over the week (below).
        Spacer(minLength: 0)
      } else {
        Spacer(minLength: 0)
        bottom(calendar)
          .padding(.horizontal, Self.screenEdge)
          // Clear of the tab bar's glass, as /design's; while entering the
          // tabs give way, and the tray sits low for the thumb.
          .padding(.bottom, entering == nil ? 24 : 8)
          // Measured at rest, so the days keep their size while entering.
          .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
            if entering == nil { room.bottom = height }
          }
      }
    }
    .environment(\.dayCellHeight, cellHeight)
    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
      if entering == nil, opened == nil { room.total = height }
    }
    .onGeometryChange(for: CGFloat.self) { proxy in
      proxy.frame(in: .global).maxY
    } action: { foot = $0 }
    // おたのしみ's sky, over the heading only, behind everything else.
    .background {
      GeometryReader { proxy in
        ZStack(alignment: .top) {
          colors.backgroundBase
          SurpriseSky()
            .frame(height: proxy.size.height * 0.34)
            .frame(maxHeight: .infinity, alignment: .top)
        }
      }
      .ignoresSafeArea()
    }
    // The tabs give way to entering and to a day's week, as /design's do.
    .toolbarVisibility(entering == nil && shownOpen == nil ? .visible : .hidden, for: .tabBar)
    // A month turned to while entering starts on its first blank day; a
    // day picked in a month around it turns to that month.
    .onChange(of: shownMonth) { _, month in
      if let month, let day = entering, day.firstOfMonth != month {
        entering = firstBlankDay(in: month, days: monthDays(month, currentCalendar))
      }
    }
    // A widget's day: its month, the day open in its week; from a day
    // already open, as 今週 goes to today's.
    .onChange(of: OpenedDay.shared.day, initial: true) { _, day in
      guard let day else { return }
      OpenedDay.shared.day = nil
      entering = nil
      if opened != nil {
        go(to: day)
      } else {
        shownMonth = monthShowing(day)
        withAnimation(folding) { opened = day }
      }
    }
    .onChange(of: opened) { _, day in
      // Whatever closed or changed the day, its sheet's going is over.
      leaving = false
      guard let day else {
        // A swipe left unsettled as the week closed goes with it.
        swipedWeek = nil
        landing = nil
        askForReviewIfDue()
        return
      }
      shownMonth = monthShowing(day)
    }
    .onChange(of: entering) { _, day in
      if day == nil { askForReviewIfDue(afterEntering: true) }
      if let day, day.firstOfMonth != shownMonth {
        withAnimation(Springs.standard) {
          shownMonth = day.firstOfMonth
        }
      }
    }
    // A day's detail rises as the system's sheet over the folded week, to
    // just under it with the week still to tap, and goes down as it is
    // swiped away, the month unfolding behind it.
    .daySheet(opened, first: underWeek) {
      withAnimation(folding) { opened = nil }
    } content: { day in
      let entry = calendar.shown(from: day, through: day)[day]
      // One day gives way to the next however it is opened, by a tap,
      // ‹ ›, 今週 or a swipe.
      ZStack {
        DayDetail(
          day: day, entry: entry, note: calendar.note(on: day), patterns: calendar.patterns,
          coworkers: ordered(coworkerRows, by: coworkerOrder),
          onChange: { entry in
            keep { db, now in try OwnValues.set(day, to: entry, now: now, in: db) }
          },
          onNoteChange: { note in
            keep { db, now in try OwnValues.setNote(day, to: note, now: now, in: db) }
          },
          // Someone added from a day is on that day too.
          onAddCoworker: { name in
            keep { db, now in
              let id = try OwnValues.addCoworker(named: name, now: now, in: db)
              if var entry {
                entry.people = (entry.people ?? []) + [id]
                try OwnValues.set(day, to: entry, now: now, in: db)
              }
            }
          },
          onStep: { step in go(to: day.adding(days: step)) }
        )
        .id(day)
      }
      .animation(folding, value: day)
      // Closed by its × or in code, the day has closed already.
      .onSheetLeaving { going in
        if opened != nil { withAnimation(folding) { leaving = going } }
      }
      .presentationDragIndicator(.visible)
      .presentationBackground(colors.backgroundBase)
    }
    .sheet(item: $breakingDown, id: \.self) { month in
      let days = monthDays(month, calendar)
      MonthBreakdownSheet(
        month: month,
        counts: calendar.patterns.map { pattern in
          (pattern, days.values.count { $0.shift == pattern.id })
        },
        unfilled: month.daysOfMonth.count - days.count)
    }
    .sheet(item: $picturing, id: \.self) { month in
      MonthPicturePage(month: month, calendar: currentCalendar)
    }
    .sheet(item: $addingToCalendar, id: \.self) { month in
      DeviceCalendarSheet(
        month: month, calendar: currentCalendar,
        coworkers: Dictionary(uniqueKeysWithValues: coworkerRows.map { ($0.id, $0.name) }))
    }
    .onChange(of: gaps) { _, gaps in
      if gaps.isEmpty {
        gapFill = nil
        askForReviewIfDue(afterEntering: true)
      }
    }
    .sheet(isPresented: Binding(get: { !gaps.isEmpty }, set: { if !$0 { gaps = [] } })) {
      gapSheet(calendar)
    }
    // Shifts first entered: what the reminders are for, then the system's
    // question only if wanted (spec/calendar.md, Reminders).
    .alert(
      "前の晩に、明日のシフトをお知らせしますか？",
      isPresented: Binding($offeringReminders),
      presenting: offeringReminders
    ) { _ in
      Button("あとで", role: .cancel) {}
      Button("お知らせする") { Notifications.shared.askOnce() }
    } message: { time in
      Text("\(time)に通知が届きます。")
    }
    // A repeating order just set up fills the days without ポチポチ入力:
    // the reminders are offered as the calendar shows, each time it does,
    // as 新しい仕事にする is set up from 設定 while the calendar's tab stays.
    .onAppear {
      guard ReminderOffer.takePending() else { return }
      Task {
        await Notifications.shared.readPermission()
        if let time = ReminderOffer.due(reminders: settings.device.reminders) {
          ReminderOffer.offered()
          offeringReminders = time
        }
      }
    }
    .task {
      // Past midnight, while the app is open or waiting in the background.
      for await _ in NotificationCenter.default.notifications(named: .NSCalendarDayChanged) {
        today = .today
      }
    }
    .handles(selectDay, by: select)
  }

  private var thisMonth: Day {
    today.firstOfMonth
  }

  private var currentCalendar: OwnCalendar {
    OwnCalendar(days: days, patterns: patterns, patternOrder: patternOrder, orders: orders)
  }

  /// The days of `month`'s month that show a shift.
  /// A month's days whose pattern counts as off.
  private func daysOff(in month: Day, _ calendar: OwnCalendar) -> Int {
    monthDays(month, calendar).values.count {
      calendar.patternsByID[$0.shift]?.countsAsOff == true
    }
  }

  private func monthDays(_ month: Day, _ calendar: OwnCalendar) -> [Day: DayEntry] {
    calendar.shown(from: month.firstOfMonth, through: month.daysOfMonth.last!)
  }

  /// The first day of the week `day` is in, from the week start.
  private func weekOf(_ day: Day) -> Day {
    day.adding(days: -(((day.weekday - weekStart) % 7 + 7) % 7))
  }

  /// The day open as the screen shows it: none once its sheet starts to
  /// go, so the month, the tabs and the heading close with it.
  private var shownOpen: Day? {
    leaving ? nil : opened
  }

  /// How far the month is folded into the opened week, 0 to 1: moved by
  /// opening and closing the week, or by a finger pulling it open.
  private var fold: CGFloat {
    shownOpen == nil ? 0 : 1 - pull
  }

  /// How far a pull unfolds the month: the month's foot comes down with
  /// the finger.
  private var unfoldDistance: CGFloat { MonthPage.height(cell: cellHeight) - cellHeight }

  /// How far a pull `down` points opens the month.
  private func pullShare(_ down: CGFloat) -> CGFloat {
    min(max(down / unfoldDistance, 0), 1)
  }

  /// A pull let go `down` points at `speed`, or taken away by the system
  /// with neither.
  private func pullEnded(down: CGFloat, speed: CGFloat) {
    let share = pullShare(down)
    // Let go with nothing pulled, the week stays however it is flicked.
    let unfolds =
      share > 0 && (abs(speed) > Self.unfoldFlick ? speed > 0 : share > Self.unfoldShare)
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
          landing = nil
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
    let next = landing ?? day.adding(days: week.days(since: weekOf(day)))
    landing = nil
    // All at once, so the pages never stand on the month left behind.
    opened = next
    shownMonth = monthShowing(next)
    swipedWeek = nil
  }

  /// Opens a day from the one open: in its week the frame moves to it, as
  /// a tap does; in another the pages slide to that week first, as a swipe
  /// does, and with reduced motion it just opens.
  private func go(to day: Day) {
    guard let open = opened, weekOf(day) != weekOf(open), folding != nil else {
      withAnimation(folding) { opened = day }
      return
    }
    landing = day
    withAnimation(folding) { swipedWeek = weekOf(day) }
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
    entering != nil || shownOpen != nil ? .faint : .hidden
  }

  /// While the gap sheet asks, its days drawn faint as the pattern picked
  /// would fill them, so the question points at them.
  private func gapPreview(_ calendar: OwnCalendar) -> [Day: Pattern] {
    let offPatterns = calendar.patterns.inUse.filter(\.countsAsOff)
    guard let fill = offPatterns.first(where: { $0.id == gapFill }) ?? offPatterns.first else {
      return [:]
    }
    return Dictionary(uniqueKeysWithValues: gaps.map { ($0, fill) })
  }

  private func pageDays(_ calendar: OwnCalendar) -> PageDays {
    PageDays(
      today: today, calendar: calendar, colorsHolidays: settings.device.week.holiday,
      offShown: offShown, selected: entering ?? shownOpen, isEntering: entering != nil,
      preview: gapPreview(calendar),
      onSelect: selectDay)
  }

  /// A day tapped: to enter while entering, else to open.
  private func select(_ day: Day) {
    // Not while the pages slide to another week, which opens its own day
    // as they settle.
    if swipedWeek != nil { return }
    if entering != nil {
      entering = day
    } else {
      withAnimation(folding) { opened = day }
    }
  }

  /// ポチポチ入力 to start entering, or its tray while entering.
  @ViewBuilder private func bottom(_ calendar: OwnCalendar) -> some View {
    if let day = entering {
      let shown = calendar.shown(from: day, through: day)
      EntryTray(
        day: day, week: settings.device.week, patterns: calendar.patterns.inUse,
        canClear: shown[day] != nil,
        canSkip: day != day.daysOfMonth.last,
        onEnter: { shift in
          // A shift not kept leaves the day to enter again.
          guard keep({ db, now in try OwnValues.enter(shift, on: day, now: now, in: db) }) else {
            return
          }
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
      // One piece, so what is padded below it is padded once.
      // The months a swipe can bring in, counted as the screen is drawn,
      // that is as the days or the month change; the rolling row only
      // reads them while a finger moves the pages (POC-33).
      let around = shownMonth ?? thisMonth
      let counted = Dictionary(
        uniqueKeysWithValues: (-2...2).map { around.addingMonths($0) }.map {
          ($0, daysOff(in: $0, calendar))
        })
      VStack(spacing: 12) {
        MonthSummary(
          position: position, monthAt: monthOfPage,
          daysOff: { month in counted[month] ?? daysOff(in: month, calendar) }
        ) { month in
          breakingDown = month
        }
        Button {
          let month = shownMonth ?? thisMonth
          let first = firstBlankDay(in: month, days: monthDays(month, calendar))
          // With the tabs giving way, so the tray and the tab bar move as one.
          withAnimation(entryChange) { entering = first }
        } label: {
          Label("ポチポチ入力", systemImage: "pencil")
            .font(.headline)
            .frame(maxWidth: .infinity, minHeight: Metrics.control)
        }
        .buttonStyle(.borderedProminent)
        .buttonBorderShape(.capsule)
        .tint(colors.accentFill)
        .foregroundStyle(colors.accentOnFill)
      }
    }
  }

  /// 完了: entering ends, and blank days before the month's last entered
  /// one are asked about.
  private func finish() {
    guard let day = entering else {
      return
    }
    // With the tabs coming back, so the month's foot and the tab bar move
    // as one rather than the tab bar a frame after.
    withAnimation(entryChange) { entering = nil }
    let calendar = currentCalendar
    // With no pattern that counts as off there is nothing to offer.
    guard holidayShift(of: calendar.patterns.inUse) != nil else {
      return
    }
    let month = day.firstOfMonth
    let shown = calendar.shown(from: month, through: month.daysOfMonth.last!)
    gaps = gapDays(in: month, days: shown)
  }

  /// What 完了 asks about the month's blank days, while there are some
  /// and a pattern that counts as off to fill them with.
  private func gapSheet(_ calendar: OwnCalendar) -> GapSheet? {
    let offPatterns = calendar.patterns.inUse.filter(\.countsAsOff)
    guard !offPatterns.isEmpty, !gaps.isEmpty else { return nil }
    return GapSheet(
      days: gaps, offPatterns: offPatterns, picked: $gapFill,
      openedLook: settings.device.look.options
    ) { off in
      keep { db, now in try OwnValues.fill(gaps, with: off.id, now: now, in: db) }
    }
  }

  /// Asks the store for its review prompt once entering, a day and 完了's
  /// question have all closed after something was put on the days, if the
  /// person has used Pochical long enough (spec/review.md).
  private func askForReviewIfDue(afterEntering: Bool = false) {
    guard changed, entering == nil, opened == nil, gaps.isEmpty else { return }
    changed = false
    // The first time shifts are entered, the reminders are offered
    // instead, once; the review waits for another time.
    if afterEntering, let time = ReminderOffer.due(reminders: settings.device.reminders) {
      ReminderOffer.offered()
      offeringReminders = time
      return
    }
    guard ReviewPrompt.mayAsk else { return }
    requestReview()
    ReviewPrompt.asked()
  }

  /// Keeps the person's edit (WriteAction); true when kept.
  @discardableResult
  private func keep(_ edit: (Database, Int64) throws -> Void) -> Bool {
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    guard write({ try edit($0, now) }) else { return false }
    changed = true
    // A memo kept as its day closes comes after the day has gone.
    askForReviewIfDue()
    return true
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

  /// Starting and finishing ポチポチ入力: the tray and ポチポチ入力 trade
  /// places in a fade, the tab bar with them. Not none with Reduce Motion,
  /// which fades rather than moves: at once, the tab bar would come a frame
  /// after the month's foot was laid out without it.
  private var entryChange: Animation {
    reduceMotion ? .easeInOut(duration: 0.2) : Springs.standard
  }

  /// The heading's buttons, on the month's line: 今月 away from this
  /// month, 完了 while entering, and in a day's week 今週 away from this
  /// week (spec/calendar.md).
  @ViewBuilder private var actions: some View {
    if shownOpen != nil {
      // The detail's sheet closes the day, with its own ×.
      TodayFade(position: position, todayPage: todayPage) {
        TodayButton(unit: "週") { go(to: today) }
      }
    } else if entering != nil {
      Button("完了", systemImage: "checkmark", role: .confirm) {
        finish()
      }
      .labelStyle(.iconOnly)
      .buttonStyle(BarButton(prominent: true))
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
      if entering == nil, shownOpen == nil, settings.device.heading.surprise {
        // おたのしみ: the name drifts the sky to another.
        Button {
          settings.device.heading.sky = SurpriseSky.next(
            after: settings.device.heading.sky, theme: settings.device.theme)
        } label: {
          MonthName(position: position, monthAt: monthOfPage)
        }
        .buttonStyle(.plain)
        .accessibilityHint("空の色を変えます")
      } else if entering == nil, shownOpen == nil {
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
  @Environment(\.english) private var english
  @Environment(\.themeColors) private var colors
  let week: DeviceSettings.Week
  /// Closer to the days, as a picture of the month draws it.
  var compact = false

  var body: some View {
    HStack(spacing: 4) {
      ForEach(0..<7, id: \.self) { index in
        let weekday = (week.start + index) % 7
        Text(Day.weekdayLetter(weekday, english: english))
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
  let onSelect: Handler<Day>?

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
          // Only today's frame gives way to entering: the rest stay as they
          // were, not made again.
          isEntering: isEntering && day == today, preview: previewed != nil,
          onSelect: onSelect
        )
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
  @Environment(\.dayCellHeight) private var cell

  static let rowGap: CGFloat = 4

  /// Six weeks of days `cell` tall.
  static func height(cell: CGFloat) -> CGFloat { 6 * cell + 5 * rowGap }

  /// How tall a day can be for six weeks to fit in `room`: DayCell's
  /// full height where there is room, as /design's, else less, down to
  /// what keeps a date and its mark clear.
  static func cellHeight(fitting room: CGFloat) -> CGFloat {
    let fitted = ((room - 5 * rowGap) / 6).rounded(.down)
    return min(DayCell.fullHeight, max(leastCell, fitted))
  }
  private static let leastCell: CGFloat = 44

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
    .offset(y: -CGFloat(row) * (cell + Self.rowGap) * fold)
    .frame(height: cell + (Self.height(cell: cell) - cell) * (1 - fold), alignment: .top)
  }
}

/// A week beside an opened one, drawn as the month folded into it is, so
/// it can take that page's place once swiped to.
struct WeekPage: View {
  @Environment(\.dayCellHeight) private var cell
  let week: Day
  let days: PageDays

  var body: some View {
    let week = (0..<7).map { self.week.adding(days: $0) }
    days.row(week, shown: days.calendar.shown(from: week[0], through: week[6]), fadingOutside: nil)
      .frame(height: cell, alignment: .top)
  }
}

/// A pull down on an opened day's week. It is UIKit's pan, which begins
/// only going down more than sideways, so a sideways swipe stays the
/// pages'. Once it begins, UIKit fails the day's press under the finger,
/// as a recognizer that has begun does to the ones still waiting, so
/// letting go presses nothing; a tap never begins it and presses the day.
private struct PullDown: UIGestureRecognizerRepresentable {
  var isEnabled: Bool
  /// How far down the finger has come, in points.
  let onChange: (CGFloat) -> Void
  /// How far down and how fast it was let go; both 0 when the system
  /// takes the pull away.
  let onEnd: (_ down: CGFloat, _ speed: CGFloat) -> Void

  func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

  func makeUIGestureRecognizer(context: Context) -> UIPanGestureRecognizer {
    let pan = UIPanGestureRecognizer()
    pan.delegate = context.coordinator
    return pan
  }

  func updateUIGestureRecognizer(_ pan: UIPanGestureRecognizer, context: Context) {
    pan.isEnabled = isEnabled
  }

  func handleUIGestureRecognizerAction(_ pan: UIPanGestureRecognizer, context: Context) {
    switch pan.state {
    case .began, .changed:
      onChange(pan.translation(in: pan.view).y)
    case .ended:
      onEnd(pan.translation(in: pan.view).y, pan.velocity(in: pan.view).y)
    case .cancelled, .failed:
      onEnd(0, 0)
    default:
      break
    }
  }

  final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
      guard let pan = recognizer as? UIPanGestureRecognizer else { return false }
      let moved = pan.translation(in: pan.view)
      return moved.y > abs(moved.x)
    }
  }
}
