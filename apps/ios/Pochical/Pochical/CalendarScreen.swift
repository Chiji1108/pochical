import PochicalDesign
import PochicalKit
import SQLiteData
import StoreKit
import SwiftUI
import SwiftUINavigation
import UIKit

/// カレンダー: the person's month, a page a month, turned by swiping; with
/// a シフトの期間, a page a period, named by the month it starts in
/// (spec/calendar.md, The shift period).
struct CalendarScreen: View {
  /// Where the calendar is, which both of the root's calendars show: a
  /// phone's under the tab bar and a wide screen's beside the sidebar.
  let place: CalendarPlace
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  @Environment(\.write) private var write
  /// Regular on a wide screen, where the month never folds and the day's
  /// detail stands in a pane beside it (spec/calendar.md, On a wide
  /// screen).
  @Environment(\.horizontalSizeClass) private var sizeClass
  @Fetch(OwnCalendarRequest()) private var calendar = OwnCalendar.empty
  @State private var today = Day.today
  /// The month naming the page shown; none for the page holding today,
  /// which the calendar opens on.
  private var shownMonth: Day? {
    get { place.shownMonth }
    nonmutating set { place.shownMonth = newValue }
  }
  /// The day ポチポチ入力 enters next, while entering.
  private var entering: Day? {
    get { place.entering }
    nonmutating set { place.entering = newValue }
  }
  @State private var gaps: [Day] = []
  /// The first day of the page the gaps are on.
  @State private var gapsPageFirst = Day.today
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
  private var changed: Bool {
    get { place.changed }
    nonmutating set { place.changed = newValue }
  }
  @Environment(\.requestReview) private var requestReview
  /// The reminders offered, once, after shifts were first entered: the
  /// time they come at.
  @State private var offeringReminders: String?
  /// The day opened from the month: on a phone its week alone left above
  /// its detail, on a wide screen shown in the pane beside the month.
  private var opened: Day? {
    get { place.opened }
    nonmutating set { place.opened = newValue }
  }
  /// What the day's detail is in the middle of, for it to go on with as
  /// it moves between the sheet and the pane.
  private var handover: DayDetailHandover { place.handover }
  /// The day last entered, open in the pane on a wide screen once
  /// entering has ended and its blank days were asked about.
  private var lastEntered: Day? {
    get { place.lastEntered }
    nonmutating set { place.lastEntered = newValue }
  }
  /// The tray's page of keys, kept as the screen widens or narrows.
  private var trayPage: Int {
    get { place.trayPage }
    nonmutating set { place.trayPage = newValue }
  }
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
  /// The calendar is on screen: its sheet is up only then, not while
  /// the root moves it between navigations or another tab is shown.
  @State private var onScreen = false
  /// Each time the pane's day is tapped again, for it to show afresh.
  @State private var paneShowing = 0
  /// The fold dividing the screen, while a folding iPhone is half folded.
  @State private var hinge: Hinge?
  private struct Room {
    var total: CGFloat = 0
    var heading: CGFloat = 0
    var weekdays: CGFloat = 0
    var bottom: CGFloat = 0
    /// A week's width, its seven days and the gaps between them.
    var week: CGFloat = 0
  }
  /// How tall a day is: a sixth of the room between the weekdays and the
  /// bottom, which keep their size, so the six weeks fill it, down to the
  /// least a day can be and up to a phone's day for its width.
  private var cellHeight: CGFloat {
    guard room.total > 0 else { return DayCell.fullHeight }
    return MonthPage.cellHeight(
      fitting: room.total - room.heading - room.weekdays - room.bottom - Self.leastSpare,
      upTo: MonthPage.tallestDay(across: room.week))
  }
  /// Kept free over the bottom however short the screen.
  private static let leastSpare: CGFloat = 8
  /// Between the tab bar's glass and what stands over it, as /design's.
  private static let clearOfTabBar: CGFloat = 24
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
  /// シフトの期間, which each page holds.
  private var period: ShiftPeriod { settings.device.period }

  var body: some View {
    VStack(spacing: 0) {
      heading
        .padding(.horizontal, Self.screenEdge)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { room.heading = $0 }
      WeekdayRow(week: settings.device.week)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { room.week = $0 }
        .padding(.horizontal, Self.screenEdge)
        .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { room.weekdays = $0 }
      // The month at the top, filling the room down to the bottom; a
      // side too short for six weeks at their shortest, an iPhone on its
      // side, scrolls them under the heading. Only then: folded to its
      // week, or with room for its weeks, it has nothing to scroll, and the
      // pages inside keep their own swipe.
      ScrollView(.vertical) {
        pager(calendar)
      }
      .scrollBounceBehavior(.basedOnSize)
      // The days ease to the room the foot leaves them, as the tray comes
      // under the month on a wide screen.
      .animation(reduceMotion ? nil : Springs.standard, value: cellHeight)
      .safeAreaBar(edge: .bottom, spacing: 0) {
        // The day's detail is a sheet over the folded week on a phone
        // (below), and beside the month on a wide screen, which never folds.
        if shownFolded == nil { under(calendar) }
      }
    }
    // Off the fold, which the pane begins past.
    .padding(.trailing, wide ? hinge?.width ?? 0 : 0)
    .environment(\.dayCellHeight, cellHeight)
    .environment(\.dayMarkScale, MonthPage.markScale(cell: cellHeight, across: room.week))
    // Measured at rest, as the tabs give way on a phone; the month on a
    // wide screen is as tall whatever the pane shows. Widened or
    // narrowed, it is measured anew as it comes, a day open or not.
    .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
      if wide || entering == nil && opened == nil || room.total == 0 { room.total = height }
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
    // On a wide screen the detail stands beside the month in the system's
    // inspector, always there while the calendar is shown. The inspector
    // would be a sheet on a phone, but one that closes as the width
    // narrows and lacks the sheet's height under the week, so a phone
    // keeps the sheet below and has no inspector at all; what the detail
    // is in the middle of goes across with `handover`.
    .modifier(Pane(shown: wide && onScreen, width: hinge?.paneWidth) { pane(calendar) })
    // iPhone Duo half folded: the fold the system reserves for dividing
    // the screen, which the month and the pane keep to either side of.
    .onGeometryChange(for: Hinge?.self) { proxy in
      Hinge(dividing: proxy)
    } action: { hinge = $0 }
    // The month has nothing to type in: it stays where it is as the
    // keyboard comes up for the memo in the pane beside it, whose rows
    // scroll the memo above it.
    .ignoresSafeArea(.keyboard)
    // The tabs give way to entering and to a day's week, as /design's do;
    // on a wide screen, where the tabs are not under the tray and the
    // day is in the pane, the tabs stay.
    .tabBarHidden(!wide && (entering != nil || shownOpen != nil))
    // A page turned to while entering starts on its first blank day; a
    // day picked on a page around it turns to that page.
    .onChange(of: shownMonth) { _, month in
      if let month, let day = entering, !period.page(month).contains(day) {
        let page = period.page(month)
        entering = firstBlankDay(in: page, days: pageDays(page, calendar))
      }
    }
    // A シフトの期間 changed, here or on another device, turns to the page
    // holding today, and entering goes on from that page's first blank day.
    .onChange(of: period) {
      shownMonth = nil
      if entering != nil {
        let page = period.page(thisMonth)
        entering = firstBlankDay(in: page, days: pageDays(page, calendar))
      }
    }
    // A widget's day: its month, the day open in its week; from a day
    // already open, as 今週 goes to today's.
    .onChange(of: OpenedDay.shared.day, initial: true) { _, day in
      guard let day else { return }
      OpenedDay.shared.day = nil
      entering = nil
      if folded != nil {
        go(to: day)
      } else {
        shownMonth = monthShowing(day)
        withAnimation(folding) { opened = day }
      }
    }
    .onChange(of: opened) { _, day in
      // Whatever closed or changed the day, its sheet's going is over, and
      // the next day's detail starts afresh.
      leaving = false
      handover.day = nil
      guard let day else {
        // A swipe left unsettled as the week closed goes with it.
        swipedWeek = nil
        landing = nil
        askForReviewIfDue()
        return
      }
      shownMonth = monthShowing(day)
      // On a wide screen a day closes as another takes the pane, today's
      // shown while none was open included.
      if wide { askForReviewIfDue() }
    }
    .onChange(of: entering) { _, day in
      if day == nil { askForReviewIfDue(afterEntering: true) }
      if let day, period.month(holding: day) != shownMonth {
        withAnimation(Springs.standard) {
          shownMonth = period.month(holding: day)
        }
      }
    }
    // A day's detail rises as the system's sheet over the folded week, to
    // just under it with the week still to tap, and goes down as it is
    // swiped away, the month unfolding behind it.
    .daySheet(onScreen ? folded : nil, first: underWeek) {
      withAnimation(folding) { opened = nil }
    } onDismiss: {
      handover.sheetGoing = false
    } content: { day in
      detail(calendar, of: day, inPane: false)
        // Closed by its × or in code, the day has closed already.
        .onSheetLeaving { going in
          if opened != nil { withAnimation(folding) { leaving = going } }
        }
        .presentationDragIndicator(.visible)
        .presentationBackground(colors.backgroundBase)
    }
    // Widened or narrowed with a day open, its detail moves to the pane or
    // the sheet as it is (spec/calendar.md, On a wide screen).
    .onChange(of: wide) {
      room.total = 0
      show()
    }
    .onAppear { show() }
    .onDisappear { onScreen = false }
    .sheet(item: $breakingDown, id: \.self) { month in
      let page = period.page(month)
      let summary = calendar.summary(of: page)
      MonthBreakdownSheet(
        page: page, byPeriod: period.byPeriod,
        counts: summary.counts.compactMap { count in
          calendar.patternsByID[count.pattern].map { ($0, count.days) }
        },
        unfilled: summary.unfilled)
    }
    .sheet(item: $picturing, id: \.self) { month in
      MonthPicturePage(
        page: period.page(month), byPeriod: period.byPeriod, calendar: calendar)
    }
    .sheet(item: $addingToCalendar, id: \.self) { month in
      DeviceCalendarSheet(
        page: period.page(month), byPeriod: period.byPeriod, calendar: calendar)
    }
    .onChange(of: gaps) { _, gaps in
      if gaps.isEmpty {
        gapFill = nil
        askForReviewIfDue(afterEntering: true)
        openLastEntered()
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

  /// The pages, turned by swiping: the months, or with a day opened on a
  /// phone its month folded into the week between the weeks around it.
  private func pager(_ calendar: OwnCalendar) -> some View {
    // The pages run to the screen's edges, so a month slides out of
    // sight rather than being cut off inside them.
    ScrollView(.horizontal) {
      LazyHStack(spacing: 0) {
        ForEach(pages, id: \.self) { page in
          Group {
            switch page {
            case .month(let month):
              MonthPage(
                page: period.page(month), byPeriod: period.byPeriod, weekStart: weekStart,
                days: pageDays(calendar), openedWeek: folded, fold: fold)
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
    // A page a swipe, each page brought to the scroll view's own frame.
    // The scroll view reaches into the safe area beside it, a phone's
    // side on its side or the pane's column, and takes it as content
    // insets: paging by its bounds would land between pages there, so
    // the pages are aligned as views, and what lies in that area is
    // clipped, the month beside never peeking in (#1223).
    .scrollTargetBehavior(.viewAligned(limitBehavior: .alwaysByOne))
    .scrollPosition(id: shownPage)
    .scrollIndicators(.hidden)
    .clipped()
    // A week swiped to opens once the swipe settles, so the pages are
    // not changed under the finger.
    .onScrollPhaseChange { _, phase in
      if phase == .idle { openSwipedWeek() }
    }
    .onScrollGeometryChange(for: CGFloat.self) { geometry in
      // From the content's start, inside the insets of the safe area.
      (geometry.contentOffset.x + geometry.contentInsets.leading)
        / max(geometry.containerSize.width, 1)
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
        isEnabled: folded != nil,
        onChange: { down in pull = pullShare(down) },
        onEnd: pullEnded))
  }

  /// Under the month: 今月のお休み with ポチポチ入力, or its tray while
  /// entering.
  private func under(_ calendar: OwnCalendar) -> some View {
    bottom(calendar)
      .padding(.horizontal, Self.screenEdge)
      // Clear of the tab bar's glass, as /design's; while entering the
      // tabs give way on a phone, and the tray sits low for the thumb.
      .padding(.bottom, entering == nil ? Self.clearOfTabBar : 8)
      // Measured at rest on a phone, so the days keep their size while
      // entering, the tray taking the tabs' room; on a wide screen the
      // tabs stay, and the days give the tray its room.
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height in
        if wide || entering == nil { room.bottom = height }
      }
  }

  /// This calendar comes on screen, or its width changes (the root says
  /// so to `place` as it swaps its calendars).
  private func show() {
    onScreen = true
    // A sheet that went as the screen widened leaves the day open, and a
    // day open is framed again as it narrows.
    leaving = false
  }

  /// The month naming the page holding today.
  private var thisMonth: Day {
    period.month(holding: today)
  }

  /// The days off on the page `month` names.
  private func daysOff(in month: Day, _ calendar: OwnCalendar) -> Int {
    calendar.summary(of: period.page(month)).daysOff
  }

  /// The page's days that show a shift.
  private func pageDays(_ page: Period, _ calendar: OwnCalendar) -> [Day: DayEntry] {
    calendar.shown(from: page.first, through: page.last)
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

  /// A wide screen: a regular width, the month beside the day's pane.
  private var wide: Bool { sizeClass == .regular }

  /// The day whose week the month folds into: the day open, on a phone.
  private var folded: Day? { wide ? nil : opened }

  /// The day folded into as the screen shows it, `shownOpen`'s.
  private var shownFolded: Day? { wide ? nil : shownOpen }

  /// How far the month is folded into the opened week, 0 to 1: moved by
  /// opening and closing the week, or by a finger pulling it open.
  private var fold: CGFloat {
    shownFolded == nil ? 0 : 1 - pull
  }

  /// The pane beside the month on a wide screen: the day being entered
  /// while entering, else the day open, the last day entered while 完了
  /// asks about the blank days, and today's while none is.
  private func pane(_ calendar: OwnCalendar) -> some View {
    detail(calendar, of: entering ?? opened ?? (gaps.isEmpty ? nil : lastEntered) ?? today, inPane: true)
  }

  /// `day`'s detail, in the sheet or the pane.
  ///
  /// Which of the two it is in is said by where it is put, never by the
  /// width now: the one going is drawn again at the new width before it
  /// goes, and must not take itself for the one coming.
  private func detail(_ calendar: OwnCalendar, of day: Day, inPane: Bool) -> some View {
    let entry = calendar.shown(from: day, through: day)[day]
    // One day gives way to the next however it is opened, by a tap,
    // ‹ ›, 今週 or a swipe.
    return DayNavigation { lists in
      ZStack {
        DayDetail(
          day: day, entry: entry, note: calendar.note(on: day), patterns: calendar.patterns,
          coworkers: calendar.coworkers,
          onChange: { entry in
            keep { db, now in try OwnValues.set(day, to: entry, now: now, in: db) }
          },
          onNoteChange: { note in
            keep { db, now in try OwnValues.setNote(day, to: note, now: now, in: db) }
          },
          // Someone added from a day is on that day too, while it takes
          // one more, counting those still listed as the day's list does.
          onAddCoworker: { name in
            keep { db, now in
              let id = try OwnValues.addCoworker(named: name, now: now, in: db)
              let listed = (entry?.people ?? []).filter { id in
                calendar.coworkers.contains { $0.id == id }
              }
              if var entry, fitsDayPeople(listed + [id]) {
                entry.people = listed + [id]
                try OwnValues.set(day, to: entry, now: now, in: db)
              }
            }
          },
          // While entering, ‹ › move the day being entered, as a day tapped
          // in the month does.
          onStep: { step in
            if entering != nil {
              select(day.adding(days: step))
            } else {
              go(to: day.adding(days: step))
            }
          },
          closes: !inPane, entering: entering != nil, handover: handover, lists: lists
        )
        .id(PaneShowing(day: day, time: paneShowing))
      }
      .animation(folding, value: day)
    }
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

  /// The pages: the months, or with a day opened on a phone its month,
  /// folded into the week, between the weeks before and after it.
  private var pages: [CalendarPage] {
    guard let day = folded else {
      return (-Self.monthsAround...Self.monthsAround).map { .month(thisMonth.addingMonths($0)) }
    }
    // The month keeps its place among the pages, so the scroll view stays
    // on it as the weeks come in and go.
    let month = shownMonth ?? thisMonth
    let place = monthsAfterThis(month)
    let week = weekOf(day)
    return (-Self.monthsAround...Self.monthsAround).map {
      $0 == place ? .month(month) : .week(week.adding(days: 7 * ($0 - place)))
    }
  }

  /// The page in view: the month, or the week being swiped to.
  private var shownPage: Binding<CalendarPage?> {
    Binding(
      get: { swipedWeek.map(CalendarPage.week) ?? .month(shownMonth ?? thisMonth) },
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
    guard let week = swipedWeek, let day = folded else { return }
    let next = landing ?? day.adding(days: week.days(since: weekOf(day)))
    landing = nil
    // All at once, so the pages never stand on the month left behind.
    opened = next
    shownMonth = monthShowing(next)
    swipedWeek = nil
  }

  /// Opens a day from the one open: in its week the frame moves to it, as
  /// a tap does; in another the pages slide to that week first, as a swipe
  /// does, and with reduced motion it just opens. On a wide screen, off
  /// the page shown, the pages turn to the page holding it.
  private func go(to day: Day) {
    if wide {
      withAnimation(folding) {
        shownMonth = monthShowing(day)
        opened = day
      }
      return
    }
    guard let open = opened, weekOf(day) != weekOf(open), folding != nil else {
      withAnimation(folding) { opened = day }
      return
    }
    landing = day
    withAnimation(folding) { swipedWeek = weekOf(day) }
  }

  /// The page shown with `day` opened: the one shown while the day's week
  /// is one of its rows, as each holds a day of it, else the day's own.
  private func monthShowing(_ day: Day) -> Day {
    let month = shownMonth ?? thisMonth
    let rows = period.page(month).weeks(weekStart: weekStart)
    return rows.contains(where: { $0.contains(day) }) ? month : period.month(holding: day)
  }

  /// Days off left blank on the month come back faint while entering and
  /// in a day's week, where they are what is being looked at (休みの見せ方
  /// 空白).
  private var offShown: OffShown {
    entering != nil || shownFolded != nil ? .faint : .hidden
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
      offShown: offShown, selected: entering ?? (wide ? opened : shownOpen), isEntering: entering != nil,
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
      // The day the pane shows, tapped again, shows afresh, a list open
      // over it gone (spec/calendar.md, On a wide screen).
      if wide, day == opened ?? today {
        handover.day = nil
        paneShowing += 1
      }
      withAnimation(folding) { opened = day }
    }
  }

  /// Under the month: 今月のお休み and ポチポチ入力, or its tray while
  /// entering.
  @ViewBuilder private func bottom(_ calendar: OwnCalendar) -> some View {
    if let day = entering {
      tray(calendar, entering: day)
    } else {
      // One piece, so what is padded below it is padded once.
      VStack(spacing: 12) {
        summary(calendar)
        enterButton(calendar)
      }
    }
  }

  /// ポチポチ入力's tray, entering `day`.
  private func tray(_ calendar: OwnCalendar, entering day: Day) -> some View {
    let shown = calendar.shown(from: day, through: day)
    // Entering stays on the page of the day entered, to its last day.
    let last = Period(holding: day, start: period.start).last
    return EntryTray(
      day: day, week: settings.device.week, patterns: calendar.patterns.inUse,
      canClear: shown[day] != nil,
      canSkip: day != last,
      page: Bindable(place).trayPage,
      onEnter: { shift in
        // A shift not kept leaves the day to enter again.
        guard keep({ db, now in try OwnValues.enter(shift, on: day, now: now, in: db) }) else {
          return
        }
        lastEntered = day
        let next = selectedAfterEntering(
          shift, on: day, through: last, patterns: calendar.patternsByID)
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
        let next = selectedAfterEntering(nil, on: day, through: last, patterns: [:])
        entering = next
        announce("変更せずに進みました", on: day, next: next)
      }
    )
  }

  /// 今月のお休み, opening 今月の内訳.
  private func summary(_ calendar: OwnCalendar) -> some View {
    // The months a swipe can bring in, counted as the screen is drawn,
    // that is as the days or the month change; the rolling row only
    // reads them while a finger moves the pages (POC-33).
    let around = shownMonth ?? thisMonth
    let counted = Dictionary(
      uniqueKeysWithValues: (-2...2).map { around.addingMonths($0) }.map {
        ($0, daysOff(in: $0, calendar))
      })
    return MonthSummary(
      position: position, monthAt: monthOfPage, byPeriod: period.byPeriod,
      daysOff: { month in counted[month] ?? daysOff(in: month, calendar) }
    ) { month in
      breakingDown = month
    }
  }

  /// ポチポチ入力, starting on the page's first blank day whatever day is
  /// open.
  private func enterButton(_ calendar: OwnCalendar) -> some View {
    Button {
      let page = period.page(shownMonth ?? thisMonth)
      let first = firstBlankDay(in: page, days: pageDays(page, calendar))
      trayPage = 0
      lastEntered = nil
      // With the tabs giving way, so the tray and the tab bar move as one;
      // on a wide screen the pane shows the day entered.
      withAnimation(entryChange) {
        opened = nil
        entering = first
      }
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

  /// 完了: entering ends, and blank days before the page's last entered
  /// one are asked about.
  private func finish() {
    guard let day = entering else {
      return
    }
    // With the tabs coming back, so the month's foot and the tab bar move
    // as one rather than the tab bar a frame after.
    withAnimation(entryChange) { entering = nil }
    // With no pattern that counts as off there is nothing to offer.
    guard holidayShift(of: calendar.patterns.inUse) != nil else {
      openLastEntered()
      return
    }
    let page = Period(holding: day, start: period.start)
    gapsPageFirst = page.first
    gaps = gapDays(in: page, days: pageDays(page, calendar))
    if gaps.isEmpty { openLastEntered() }
  }

  /// On a wide screen, once entering has ended and its blank days were
  /// asked about, the last day entered opens in the pane, for what was
  /// put on it to be seen there.
  private func openLastEntered() {
    if wide, let day = lastEntered { opened = day }
    lastEntered = nil
  }

  /// What 完了 asks about the month's blank days, while there are some
  /// and a pattern that counts as off to fill them with.
  private func gapSheet(_ calendar: OwnCalendar) -> GapSheet? {
    let offPatterns = calendar.patterns.inUse.filter(\.countsAsOff)
    guard !offPatterns.isEmpty, !gaps.isEmpty else { return nil }
    return GapSheet(
      days: gaps, pageFirst: gapsPageFirst, offPatterns: offPatterns, picked: $gapFill,
      openedLook: settings.device.look.options
    ) { off in
      keep { db, now in try OwnValues.fill(gaps, with: off.id, now: now, in: db) }
    }
  }

  /// Asks the store for its review prompt once entering, a day and 完了's
  /// question have all closed after something was put on the days, if the
  /// person has used Pochical long enough (spec/review.md).
  private func askForReviewIfDue(afterEntering: Bool = false) {
    guard changed, entering == nil, wide || opened == nil, gaps.isEmpty else { return }
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
    // A memo kept as its day closes comes after the day has gone; the
    // pane beside the month never closes, and its edits wait for another
    // day to take it.
    if !wide { askForReviewIfDue() }
    return true
  }

  /// Says what entering did and where it goes on, for VoiceOver, as
  /// /design's live region: the page's last day stays until 完了.
  private func announce(_ done: String, on day: Day, next: Day) {
    let end = period.byPeriod ? "期間の最後の日です" : "月末です"
    // The next day by its date alone, in the month of the day entered.
    let nextName = next.month == day.month ? "\(next.day)日" : next.monthDayText
    let after = next == day ? "\(end)。入力が終わったら完了を押してください" : "\(nextName)を選択中"
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
    if shownFolded != nil {
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
          // A period's page is no month: its way back is to today's.
          TodayButton(unit: period.byPeriod ? "日" : "月") {
            withAnimation(Springs.standard) {
              shownMonth = thisMonth
              // The pane would otherwise show a day off the page.
              if wide { opened = today }
            }
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
          Label(
            period.byPeriod ? "この期間のシフトを保存" : "この月のシフトを保存",
            systemImage: "square.and.arrow.down")
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
      if entering == nil, shownFolded == nil, settings.device.heading.surprise {
        // おたのしみ: the name drifts the sky to another.
        Button {
          settings.device.heading.sky = SurpriseSky.next(
            after: settings.device.heading.sky, theme: settings.device.theme)
        } label: {
          MonthName(position: position, monthAt: monthOfPage, period: period)
        }
        .buttonStyle(.plain)
        .accessibilityHint("空の色を変えます")
      } else if entering == nil, shownFolded == nil {
        MonthTitleButton(
          month: shownMonth ?? thisMonth, first: thisMonth.addingMonths(-Self.monthsAround),
          last: thisMonth.addingMonths(Self.monthsAround), chevron: false
        ) { picked in
          withAnimation(Springs.standard) { shownMonth = picked }
        } label: {
          MonthName(position: position, monthAt: monthOfPage, period: period)
        }
      } else {
        MonthName(position: position, monthAt: monthOfPage, period: period)
      }
      Spacer()
      actions
        .foregroundStyle(colors.textPrimary)
    }
    // Clear of an iPad window's controls at its top-leading corner, which
    // the calendar has no bar to wrap its buttons around (spec/calendar.md,
    // In a narrow window).
    .containerCornerOffset(.leading, sizeToFit: true)
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
    guard let day = folded else {
      return thisMonth.addingMonths(place)
    }
    let month = shownMonth ?? thisMonth
    let weeks = place - monthsAfterThis(month)
    return weeks == 0 ? month : monthShowing(day.adding(days: 7 * weeks))
  }

  /// The page of this month, or with a day opened, of this week.
  private var todayPage: Int {
    guard let day = folded else { return Self.monthsAround }
    let month = shownMonth ?? thisMonth
    return Self.monthsAround + monthsAfterThis(month)
      + weekOf(today).days(since: weekOf(day)) / 7
  }
}

/// Where the calendar is: the page shown, the day open, entering, and
/// what the day's detail is in the middle of, kept by the root, which
/// moves the calendar's screen between navigations as the width changes
/// (RootController) and tells it here first, so the day's detail goes on
/// from the sheet to the pane or back (spec/calendar.md, On a wide
/// screen).
@MainActor @Observable final class CalendarPlace {
  /// The month naming the page shown; none for the page holding today,
  /// which the calendar opens on.
  var shownMonth: Day?
  /// The day ポチポチ入力 enters next, while entering.
  var entering: Day?
  /// The day opened from the month: on a phone its week alone left above
  /// its detail, on a wide screen shown in the pane beside the month.
  var opened: Day?
  /// The day last entered, open in the pane on a wide screen once
  /// entering has ended and its blank days were asked about.
  var lastEntered: Day?
  /// The tray's page of keys.
  var trayPage = 0
  /// Something was put on the days since entering or a day was opened,
  /// so closing them is a moment to ask for a review (spec/review.md).
  var changed = false
  /// What the day's detail is in the middle of, for it to go on with as
  /// it moves between the sheet and the pane.
  let handover = DayDetailHandover()
  /// The width changes, said by the root before the calendar moves: the
  /// detail of a day open goes on in the sheet or the pane it comes to,
  /// and what the one going says as it goes is not taken.
  func show(wide: Bool) {
    guard handover.inPane != wide else { return }
    // Widened with a day open, the sheet it was in goes.
    handover.sheetGoing = wide && handover.inPane != nil && opened != nil
    handover.inPane = wide
  }
}

/// A day shown in the pane, the time it was shown.
private struct PaneShowing: Hashable {
  let day: Day
  let time: Int
}

/// A fold dividing the calendar side by side, as iPhone Duo's does half
/// folded: the region the system reserves for the screen to divide at
/// (HIG, Reserved regions), the month to its leading side and the pane
/// to its trailing one, so it never runs through the month's seven
/// columns (spec/calendar.md, On a wide screen).
nonisolated struct Hinge: Equatable, Sendable {
  /// Where it begins and ends across the calendar, its margins included.
  let start: CGFloat
  let end: CGFloat
  /// The calendar's width.
  let total: CGFloat

  /// The fold dividing what `proxy` measures from top to bottom, if one
  /// does now.
  init?(dividing proxy: GeometryProxy) {
    guard #available(iOS 27.1, *),
      let region = proxy.reservedRegions(kind: .division).first(where: {
        $0.isActive && $0.frame.minX > 0 && $0.frame.maxX < proxy.size.width
          && $0.frame.height >= proxy.size.height
      })
    else { return nil }
    start = region.frame.minX
    end = region.frame.maxX
    total = proxy.size.width
  }

  var width: CGFloat { end - start }
  /// The pane's width: the side past the fold.
  var paneWidth: CGFloat { total - end }
}

/// The day's pane beside the month, the system's inspector at its own
/// width or as wide as the side a fold leaves it. Not there at all on a
/// phone, nor while the calendar is not shown: an inspector kept presented
/// in a width that has no room for it, as the calendar kept under another
/// tab has as the screen turns, lays the month out against it without end.
private struct Pane<Detail: View>: ViewModifier {
  let shown: Bool
  let width: CGFloat?
  @ViewBuilder let detail: () -> Detail

  func body(content: Content) -> some View {
    if shown {
      content.inspector(isPresented: .constant(true)) {
        if let width {
          detail().inspectorColumnWidth(width)
        } else {
          detail()
        }
      }
    } else {
      content
    }
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
        let weekday = week.weekday(atColumn: index)
        Text(Day.weekdayLetter(weekday, english: english))
          .font(.system(size: 11))
          .foregroundStyle(colors.color(week.tone(weekday), plain: colors.textTertiary))
          .frame(maxWidth: .infinity)
      }
    }
    .padding(.bottom, compact ? 8 : 12)
    .accessibilityHidden(true)
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

  /// A week's row, its days off `page` faded when it is given; with
  /// `byPeriod`, a month's 1st within it dated 11/1.
  func row(
    _ week: [Day], shown: [Day: DayEntry], fadingOutside page: Period?, byPeriod: Bool = false
  ) -> some View {
    HStack(spacing: MonthPage.gap) {
      ForEach(week, id: \.self) { day in
        let entry = shown[day]
        let previewed = entry == nil ? preview[day] : nil
        DayCell(
          day: day, entry: entry, note: calendar.note(on: day),
          pattern: previewed ?? entry.flatMap { calendar.patternsByID[$0.shift] },
          outside: page.map { !$0.contains(day) } ?? false, isToday: day == today,
          isHoliday: day.holidayName != nil,
          colorsHoliday: colorsHolidays, offShown: offShown, isSelected: day == selected,
          // Only today's frame gives way to entering: the rest stay as they
          // were, not made again.
          isEntering: isEntering && day == today, preview: previewed != nil,
          withMonth: byPeriod && day.day == 1 && page?.contains(day) == true,
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
  /// The page's days: a month, or a シフトの期間's period.
  let page: Period
  let byPeriod: Bool
  let weekStart: Int
  let days: PageDays
  /// The day opened, whose week the page folds into.
  let openedWeek: Day?
  /// How far the page is folded into that week, 0 to 1.
  let fold: CGFloat
  @Environment(\.dayCellHeight) private var cell

  /// Between the weeks, and between a week's days.
  static let gap: CGFloat = 4

  /// Six weeks of days `cell` tall.
  static func height(cell: CGFloat) -> CGFloat { 6 * cell + 5 * gap }

  /// How tall a day can be for six weeks to fit in `room`: up to `most`,
  /// DayCell's full height as /design's unless said otherwise, else less,
  /// down to what keeps a date and its mark clear.
  static func cellHeight(fitting room: CGFloat, upTo most: CGFloat = DayCell.fullHeight) -> CGFloat {
    let fitted = ((room - 5 * gap) / 6).rounded(.down)
    return max(leastCell, min(most, fitted))
  }

  /// How much larger than a phone's a day `cell` tall in a week `width`
  /// wide draws its mark: the smaller of how much taller and how much
  /// wider it is than a phone's day (design/src/metrics.ts,
  /// DAY_PROPORTION), so the mark keeps to the day either way; never
  /// smaller, as a short day fits its mark to its room instead.
  static func markScale(cell: CGFloat, across width: CGFloat) -> CGFloat {
    let wide = (width - 6 * gap) / 7 * Metrics.dayProportion
    return max(1, min(cell, wide) / DayCell.fullHeight)
  }

  /// The tallest a day of a week `width` wide is drawn: a phone's day for
  /// its width (design/src/metrics.ts, DAY_PROPORTION), never under
  /// DayCell's full height.
  static func tallestDay(across width: CGFloat) -> CGFloat {
    max(DayCell.fullHeight, ((width - 6 * gap) / 7 * Metrics.dayProportion).rounded(.down))
  }
  private static let leastCell: CGFloat = 44

  var body: some View {
    let weeks = page.weeks(weekStart: weekStart)
    let row = openedWeek.flatMap { day in weeks.firstIndex { $0.contains(day) } } ?? 0
    let shown = days.calendar.shown(from: weeks.first![0], through: weeks.last![6])
    VStack(spacing: Self.gap) {
      ForEach(Array(weeks.enumerated()), id: \.element.first) { index, week in
        // Folded away, the rest of the month is out of reach.
        let away = openedWeek != nil && index != row
        days.row(
          week, shown: shown, fadingOutside: openedWeek == nil ? page : nil, byPeriod: byPeriod)
          .opacity(away ? 1 - fold : 1)
          .allowsHitTesting(!away)
          .accessibilityHidden(away)
      }
    }
    .offset(y: -CGFloat(row) * (cell + Self.gap) * fold)
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
