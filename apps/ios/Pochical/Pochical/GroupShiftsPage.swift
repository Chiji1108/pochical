import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// How many months either side of today the list of months holds, as
/// /design's (monthSpan).
private let monthSpan = 24

/// The room a week's block keeps inside its border, on every side.
private let weekInset = Metrics.spacingStep

/// How everyone's shifts are laid out (/design's Layout): a row a day
/// (一覧), a block a week (週ごと), or one member's month at a time
/// (1人ずつ).
enum ShiftsLayout: Hashable, CaseIterable {
  case days, weeks, person

  var name: String {
    switch self {
    case .days: "一覧"
    case .weeks: "週ごと"
    case .person: "1人ずつ"
    }
  }
}

/// Everyone's shifts in a group (/design's ShiftsPage with its list of
/// months): each month under its heading with its みんな休み, then its days
/// a row each (一覧) or its weeks a block each (週ごと), two years either
/// side of today, drawn as they come into sight; or 1人ずつ. A group of up
/// to seven opens on 一覧, which shows everyone across; a bigger one on
/// 週ごと, and 一覧 for it, scrolling sideways, comes later. It opens on the
/// day asked for, else today. A day pressed shows everyone's that day in a sheet
/// along the bottom, the table left live above it.
struct GroupShiftsPage: View {
  @Environment(\.english) private var english
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.rootNavigator) private var navigator
  @Fetch private var members: [GroupMember] = []
  /// Whether the members have been read once, the page empty until then.
  @State private var membersRead = false
  /// Whose シフトパターン is open, from a face or the menu.
  @State private var legendOf: LegendOf?
  /// シフトパターン asked for from a face while the day's sheet was up.
  @State private var legendAfterDay: LegendOf?
  /// The viewer's id among the members, for 1人ずつ.
  @Environment(\.meID) private var meID
  let group: GroupRow
  @State private var picked: Day?
  /// The day's sheet as tall as its bar and rows, told by the sheet.
  @State private var daySheetHeight: CGFloat = 0
  /// What a tap on a day does, for every row and week of the table.
  @State private var pickDay = Handler<Day>()
  @State private var togetherSheet: TogetherList?
  /// A day picked in the みんな休み sheet, shown once that sheet has gone:
  /// one sheet cannot come up while another is going.
  @State private var pickedFromList: Day?
  /// The layout picked from the menu; until then the group's size's.
  @State private var pickedLayout: ShiftsLayout?
  /// Whether today's day or week is in sight, told by its own row as it
  /// is laid out; 今日 shows while it isn't. At first, whether the list
  /// opens on today, which puts that row at its top.
  @State private var todayInSight: Bool
  /// How far a big group's 一覧 is scrolled sideways, for the faces over
  /// it; whether it is, for the edge beside its pinned columns; and how
  /// wide its view is, for the months' headings.
  @State private var sidewaysOffset = SidewaysOffset()
  @State private var scrolledSideways = false
  @State private var viewWidth: CGFloat = 0
  /// The row or heading at the list's top, which it keeps there as the
  /// screen turns; 月を選ぶ and 今日 send it there.
  @State private var position = ScrollPosition(idType: ListPlace.self)

  /// A big group's 一覧 scrolls sideways, so it opens on 週ごと, where
  /// everyone fits; picked, 一覧 keeps the dates and the viewer's column.
  private var layout: ShiftsLayout {
    pickedLayout ?? (wide ? .weeks : .days)
  }

  /// More people than 一覧's columns fit across the screen.
  private var wide: Bool { DayRowsDensity(members: members.count) == .scroll }

  /// 一覧's columns: the viewer's own first in a big group, pinned beside
  /// the dates, as /design's.
  private var tableMembers: [GroupMember] {
    guard wide, let mine = members.firstIndex(where: { $0.userID == meID }) else { return members }
    var ordered = members
    ordered.insert(ordered.remove(at: mine), at: 0)
    return ordered
  }

  /// The day it opens on, its sheet up.
  private let openingDay: Day?
  /// That day's sheet has come up, so the list coming back (from 1人ずつ)
  /// does not put it up again.
  @State private var openedDay = false

  init(group: GroupRow, day: Day?) {
    self.group = group
    openingDay = day
    _todayInSight = State(initialValue: day.map { $0 == Day.today } ?? true)
  }

  var body: some View {
    let thisMonth = Day.today.firstOfMonth
    let months = (-monthSpan...monthSpan).map { thisMonth.addingMonths($0) }
    let opening = openingDay ?? Day.today
    VStack(spacing: 0) {
      // Laid out once the members are read: they decide the layout and
      // the rows' heights, and a list laid out without them, then made
      // anew, lands where the heights it guessed put it.
      if membersRead {
        if layout != .person {
          // The month in sight, pinned over the list, which opens 月を選ぶ,
          // and 今日 while today is out of sight (/design's MonthRow).
          HStack {
            MonthTitleButton(
              month: monthInSight, first: months[0], last: months[months.count - 1]
            ) { go(to: .month($0)) } label: {
              // Quieter than the months' own headings under it.
              Text(monthInSight.monthWithYear(english: english))
                .font(.headline)
                .foregroundStyle(colors.textPrimary)
                .contentTransition(.numericText())
                .animation(.default, value: monthInSight)
            }
            Spacer()
            if !todayInSight {
              TodayButton(unit: "日") { go(to: anchor(of: Day.today)) }
            }
          }
          .animation(.default, value: todayInSight)
          .frame(minHeight: Metrics.touch)
          .padding(.horizontal, 16)
          .padding(.vertical, 2)
        }
        switch layout {
        case .days:
          GroupDayHeader(
            members: tableMembers, groupID: group.id, offset: wide ? sidewaysOffset : nil,
            edged: scrolledSideways
          )
          .padding(.horizontal, 16)
        // Over the blocks' columns, in from the list's margins as far as
        // the blocks keep their own room.
        case .weeks:
          GroupWeekdays().padding(.horizontal, 16 + weekInset).padding(.bottom, 6)
        case .person: EmptyView()
        }
        if layout == .person {
          ScrollView {
            GroupPersonView(members: members, groupID: group.id, meID: meID, picked: $picked) {
              togetherSheet = $0
            }
              .padding(.vertical, 8)
          }
        } else {
          list(months: months)
        }
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity)
    .background(colors.backgroundBase)
    // A new layout goes to the picked day or today, and a list laid out
    // anew, as on coming back from 1人ずつ, rests at its left edge. Here,
    // not on the list, which is made anew coming back from 1人ずつ.
    .onChange(of: layout) {
      sidewaysOffset.x = 0
      scrolledSideways = false
      go(to: anchor(of: picked ?? Day.today))
    }
    .navigationTitle(group.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbar {
      // One pull-down for the page's secondary actions: how the table is
      // laid out and what the marks mean. No 画像で保存: the members see it
      // live, and a picture would take their shifts out of the group.
      if membersRead {
        ToolbarItem(placement: .primaryAction) {
          Menu {
            Picker("表示", selection: Binding { layout } set: { pickedLayout = $0 }) {
              ForEach(ShiftsLayout.allCases, id: \.self) { Text($0.name).tag($0) }
            }
            Divider()
            Button("シフトパターン", systemImage: "info.circle") {
              let first = members.first { $0.userID != meID } ?? members.first
              if let first { legendOf = LegendOf(userID: first.userID) }
            }
          } label: {
            HStack(spacing: 4) {
              Text(layout.name)
              Image(systemName: "chevron.down").imageScale(.small)
            }
          }
        }
      }
    }
    .environment(
      \.openLegend,
      OpenLegendAction { userID in
        // Over the day's sheet, once it has gone: one sheet cannot come up
        // while another is up.
        if picked != nil {
          legendAfterDay = LegendOf(userID: userID)
          picked = nil
        } else {
          legendOf = LegendOf(userID: userID)
        }
      })
    .sheet(item: $legendOf) { legend in
      LegendSheet(members: members, groupID: group.id, picked: legend.userID)
        .presentationDetents([.medium, .large])
    }
    .task(id: settings.device.week.start) {
      let first = thisMonth.addingMonths(-monthSpan).adding(days: -6)
      let last = thisMonth.addingMonths(monthSpan + 1).adding(days: 6)
      _ = try? await $members.load(GroupMembersRequest(groupID: group.id, from: first, through: last))
      // A read cut short by a new week start leaves the next to do this.
      guard !Task.isCancelled, !membersRead else { return }
      // Where the list opens, set before it is first laid out.
      position = ScrollPosition(id: anchor(of: opening), anchor: .topLeading)
      membersRead = true
    }
    // As tall as its rows, as /design's; half the screen until it has
    // said, as a sheet of no height lays out no rows to measure.
    .daySheet(
      picked, first: daySheetHeight > 0 ? .height(daySheetHeight) : .medium,
      onClose: { picked = nil },
      onDismiss: {
        if let legend = legendAfterDay {
          legendAfterDay = nil
          legendOf = legend
        }
      }
    ) { day in
      DaySheet(day: day, members: members, groupID: group.id, height: $daySheetHeight) {
        picked = nil
        navigator?.open(.group(.chat(group, thread: groupThread, with: nil, sharing: day)))
      }
    }
    .sheet(item: $togetherSheet) {
      if let day = pickedFromList {
        pickedFromList = nil
        picked = day
      }
    } content: { list in
      TogetherSheet(list: list) { day in
        pickedFromList = day
        togetherSheet = nil
      }
      .presentationDetents([.medium, .large])
    }
    .handles(pickDay, by: pick)
  }

  /// A month's heading, over the row of its みんな休み when it has any,
  /// else a note beside its name: none, or that days not entered yet leave
  /// it open (/design's MonthDivider).
  @ViewBuilder private func heading(_ month: Day) -> some View {
    let today = Day.today
    let thisYear = month.year == today.year
    let name = thisYear ? month.monthTitle(english: english) : month.monthWithYear(english: english)
    let days = month.daysOfMonth
    let offs = members.map { $0.offDays(from: days[0], through: days[days.count - 1]) }
    let together =
      members.count > 1
      ? Together.days(offs, from: days[0], through: days[days.count - 1]) : (days: [], unsure: false)
    if together.days.isEmpty {
      HStack(alignment: .firstTextBaseline, spacing: 12) {
        Text(name).font(.title3.bold()).accessibilityAddTraits(.isHeader)
        Text(together.unsure ? "未入力の日あり" : "みんな休みなし")
          .font(.subheadline)
          .foregroundStyle(colors.textTertiary)
      }
    } else {
      VStack(alignment: .leading, spacing: 12) {
        Text(name).font(.title3.bold()).accessibilityAddTraits(.isHeader)
        let title = month == today.firstOfMonth ? "今月" : name
        TogetherSummary(label: "みんな休み", together: together) {
          togetherSheet = TogetherList(title: "\(title)のみんな休み", days: together.days)
        }
      }
    }
  }

  /// The weeks a month's list holds: a week belongs to the month it ends
  /// in, so the month's heading comes before the week of its 1st.
  private func weeks(endingIn month: Day) -> [[Day]] {
    var start = weekStart(of: month.firstOfMonth)
    var weeks: [[Day]] = []
    while start.adding(days: 6).month == month.month {
      weeks.append((0..<7).map { start.adding(days: $0) })
      start = start.adding(days: 7)
    }
    return weeks
  }

  /// 一覧 and 週ごと: the months as one list.
  private func list(months: [Day]) -> some View {
    Group {
      let sideways = wide && layout == .days
      let pinning: Sideways = sideways ? .scrolls(edged: scrolledSideways) : .fits
      let today = anchor(of: Day.today)
      ScrollView(sideways ? [.vertical, .horizontal] : .vertical) {
        LazyVStack(alignment: .leading, spacing: layout == .weeks ? 12 : 0) {
          ForEach(months, id: \.self) { month in
            heading(month)
              .padding(.top, layout == .weeks ? 12 : 36)
              .padding(.bottom, layout == .weeks ? 0 : 12)
              // As wide as the view, kept at its left as the rows scroll
              // sideways.
              .frame(width: sideways ? max(viewWidth - 32, 0) : nil, alignment: .leading)
              .pinnedSideways(sideways)
              // Each with its own margins, not the list's, so a month or day
              // gone to lies at the left edge, not a margin past it.
              .padding(.horizontal, 16)
              .id(ListPlace.month(month))
            if layout == .days {
              ForEach(month.daysOfMonth, id: \.self) { day in
                GroupDayRow(
                  day: day, members: tableMembers, picked: day == picked,
                  onPick: pickDay,
                  sideways: pinning, drawing: drawing
                )
                .equatable()
                .padding(.horizontal, 16)
                .placed(at: .day(day), inSight: .day(day) == today ? $todayInSight : nil)
              }
            } else {
              ForEach(weeks(endingIn: month), id: \.self) { week in
                // The picked day only to its own week, so the others stay
                // as they are.
                GroupWeek(
                  days: week, members: members, month: month,
                  picked: picked.flatMap { week.contains($0) ? $0 : nil },
                  onPick: pickDay, drawing: drawing
                )
                .equatable()
                // Clear of the rounded corners all round: the faces, and a
                // band in the last column.
                .padding(weekInset)
                .background(
                  colors.backgroundBase, in: RoundedRectangle(cornerRadius: Radius.xxl)
                )
                .overlay(
                  RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
                .padding(.horizontal, 16)
                .placed(at: .day(week[0]), inSight: .day(week[0]) == today ? $todayInSight : nil)
              }
            }
          }
        }
        .scrollTargetLayout()
        // Sideways, as wide as its columns: a scroll view lays its content
        // out at its own width otherwise, leaving nothing to scroll.
        .frame(
          width: sideways
            ? max(dayRowsWidth(members: members.count, english: english) + 32, viewWidth) : nil,
          alignment: .leading)
        .padding(.bottom, 24)
      }
      // Made anew for each layout, and as it starts or stops scrolling
      // sideways. 一覧's day and 週ごと's week from it are one place, kept
      // across the change; in one list, the new layout's week would be
      // drawn with the old one's row, which it found under that place.
      // And one whose axes change in place keeps the safe area at its
      // sides as it had it: made scrolling down only, it lays its rows out
      // inside the safe area but, scrolling sideways, draws them from the
      // screen's edge, so in landscape they lie under the notch, apart
      // from the faces.
      .id(ListShape(layout: layout, sideways: sideways))
      // A big group's 一覧: how far it is scrolled sideways from where it
      // rests, read by the faces alone, so each frame of a scroll makes
      // only them again; then what changes seldom: the safe area at its
      // leading edge (in landscape), which the pinned columns cross before
      // they stop, and whether they have stopped.
      .onScrollGeometryChange(for: CGFloat.self) {
        $0.contentOffset.x + $0.contentInsets.leading
      } action: {
        sidewaysOffset.x = $1
      }
      .onScrollGeometryChange(for: CGFloat.self) { $0.contentInsets.leading } action: {
        sidewaysOffset.inset = $1
      }
      .onScrollGeometryChange(for: Bool.self) { $0.contentOffset.x > 0 } action: {
        scrolledSideways = $1
      }
      // Its width; and, laid out at a new width as the screen turns, back
      // to the row at the top: SwiftUI keeps that row in place from the
      // heights it guesses for the months above, which at large text wrap
      // anew at the new width, and leaves the list where the guess put it.
      .onScrollGeometryChange(for: CGFloat.self) { $0.containerSize.width } action: {
        viewWidth = $1
        if let top = position.viewID(type: ListPlace.self) { go(to: top) }
      }
      .scrollIndicators(.hidden, axes: .horizontal)
      // At the leading edge too: .top alone would center a big group's
      // wide rows sideways.
      .scrollPosition($position, anchor: .topLeading)
      // The opening day's sheet up once the list is there: a sheet coming
      // up as the list appears keeps it from scrolling.
      .task {
        if let openingDay, !openedDay {
          openedDay = true
          picked = openingDay
        }
      }
      // As /design's: the table stays where it is when a day is picked;
      // room under it while the sheet is up lets a row near the bottom be
      // scrolled above the sheet.
      .contentMargins(.bottom, picked == nil ? 0 : daySheetHeight, for: .scrollContent)
    }
  }

  /// What the days are drawn with, for the rows and weeks to compare.
  private var drawing: DayDrawing {
    DayDrawing(colors: colors, look: look, english: english, week: settings.device.week)
  }

  private func pick(_ day: Day) {
    picked = picked == day ? nil : day
  }

  /// The month at the top of the list, named in the row pinned over it:
  /// its heading's, or its first row's; a week belongs to the month it
  /// ends in.
  private var monthInSight: Day {
    switch position.viewID(type: ListPlace.self) {
    case .month(let month): month
    case .day(let day): (layout == .days ? day : day.adding(days: 6)).firstOfMonth
    case nil: Day.today.firstOfMonth
    }
  }

  /// Where a day is in the list: its own row, or its week's block.
  private func anchor(of day: Day) -> ListPlace {
    .day(layout == .days ? day : weekStart(of: day))
  }

  /// To `place`, at the list's top, at once: SwiftUI lays out only the
  /// rows in sight and guesses the heights of those between, so a scroll
  /// animated over them moves the row gone to from where the guess put
  /// it while the rows around it are drawn where they are.
  private func go(to place: ListPlace) {
    position.scrollTo(id: place, anchor: .topLeading)
  }

  private func weekStart(of day: Day) -> Day {
    day.adding(days: -(((day.weekday - settings.device.week.start) % 7 + 7) % 7))
  }
}

/// A place in the list of months, which it is scrolled to and keeps at
/// its top: a month's heading, or a day's row (一覧) or week's block (週ごと),
/// named by its first day.
/// What makes the list of months a list of its own: its layout, and
/// whether it scrolls sideways.
private struct ListShape: Hashable {
  let layout: ShiftsLayout
  let sideways: Bool
}

nonisolated private enum ListPlace: Hashable, Sendable {
  case month(Day)
  case day(Day)
}

extension View {
  /// A day's row or week's block at its place in the list; today's tells
  /// `inSight` whether it is in sight from its own layout, which every
  /// move of the list lays out anew. The list's visible targets can be
  /// left empty by a jump with ScrollPosition until a hand scrolls it.
  /// Taken out of the list while in sight, as by a new layout, the row
  /// reports nothing, so it says so as it goes.
  @ViewBuilder
  fileprivate func placed(at place: ListPlace, inSight: Binding<Bool>?) -> some View {
    if let inSight {
      onScrollVisibilityChange(threshold: 0.5) { inSight.wrappedValue = $0 }
        .onDisappear { inSight.wrappedValue = false }
        .id(place)
    } else {
      id(place)
    }
  }
}

/// A month's days everyone is off, for its sheet.
struct TogetherList: Identifiable {
  let title: String
  let days: [Day]
  var id: String { title }
}

extension Day: @retroactive Identifiable {
  public var id: String { key }
}

/// The days everyone is off in a month, a date to a row; picking one
/// shows everyone that day.
private struct TogetherSheet: View {
  @Environment(\.dismiss) private var dismiss
  let list: TogetherList
  let onPick: (Day) -> Void

  var body: some View {
    NavigationStack {
      List(list.days, id: \.self) { day in
        Button {
          onPick(day)
        } label: {
          LabeledContent(day.fullText, value: day.holidayName ?? "")
        }
        .tint(.primary)
      }
      .navigationTitle(list.title)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
  }
}

/// Everyone's shifts on a day (/design's PickedDaySheet): a row a member,
/// their mark, the pattern's name and hours, 早出 and 残業 said in words
/// with the day's own hours; みんな休み by the date when it is one.
private struct DaySheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let day: Day
  let members: [GroupMember]
  let groupID: String
  /// As tall as its bar and rows are, at the text size they are in.
  @Binding var height: CGFloat
  /// Opens 全体チャット with the day set over its composer, to send.
  let onShare: () -> Void

  var body: some View {
    let offs = members.map { $0.offDays(from: day, through: day)[day] }
    NavigationStack {
      List(members) { member in
        let entry = member.calendar.shown(from: day, through: day)[day]
        let pattern = entry.flatMap { member.calendar.patternsByID[$0.shift] }
        // On one line, as /design's: the mark, the pattern and its hours.
        HStack(spacing: 8) {
          MemberAvatar(
            name: member.name, photoID: member.photoID, shelf: .group(groupID), size: 28,
            userID: member.userID)
          Text(member.name).lineLimit(1)
          Spacer(minLength: 8)
          if let pattern {
            ShiftMark(pattern: pattern, size: 18)
              .marks(drawnAs: member.markLook)
          }
          Text(pattern?.name ?? "未入力")
            .foregroundStyle(pattern == nil ? colors.textTertiary : colors.textSecondary)
          if let hours = hours(entry, pattern) {
            Text(hours)
              .font(.caption)
              .foregroundStyle(colors.textTertiary)
          }
        }
        .lineLimit(1)
        .accessibilityElement(children: .combine)
      }
      .onScrollGeometryChange(for: CGFloat.self) { geometry in
        geometry.contentSize.height + geometry.contentInsets.top
      } action: { _, fitted in
        height = fitted
      }
      .navigationTitle(day.fullText)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
        ToolbarItem(placement: .primaryAction) {
          Button("全体チャットで共有", systemImage: "square.and.arrow.up", action: onShare)
        }
        if members.count > 1, Together.allOff(offs) {
          ToolbarItem(placement: .principal) {
            VStack(spacing: 2) {
              Text(day.fullText).font(.headline)
              Text("みんな休み")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(colors.accentDefault)
            }
          }
        }
      }
    }
  }

  /// The pattern's hours, or the day's own with 早出 and 残業 in words.
  private func hours(_ entry: DayEntry?, _ pattern: Pattern?) -> String? {
    guard let entry, let pattern, let standard = pattern.time else { return nil }
    let start = entry.start ?? standard.start
    let end = entry.end ?? standard.end
    guard let change = timeChange(start: entry.start, end: entry.end, standard: standard) else {
      return hoursText(start, end)
    }
    let moves = [change.early ? "早出" : nil, change.late ? "残業" : nil].compactMap(\.self)
    return "\(moves.joined(separator: "・")) \(hoursText(start, end))"
  }
}

/// A month's days everyone is off (/design's TogetherSummary): how many,
/// as 今月のお休み counts them, opening the dates; none, it says so, or
/// that days not entered yet leave it open, in a row that cannot be
/// pressed.
struct TogetherSummary: View {
  @Environment(\.themeColors) private var colors
  let label: String
  let together: (days: [Day], unsure: Bool)
  let onOpen: () -> Void

  var body: some View {
    if together.days.isEmpty {
      HStack {
        Text(label)
          .font(.footnote)
          .foregroundStyle(colors.textSecondary)
        Spacer()
        Text(together.unsure ? "未入力あり" : "なし")
          .font(.headline)
          .foregroundStyle(colors.textTertiary)
      }
      // As tall as SummaryRow, whose count is larger.
      .frame(minHeight: 30)
      .padding(.horizontal, 16)
      .padding(.vertical, 12)
      .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.xxl))
      .accessibilityElement(children: .combine)
    } else {
      SummaryRow(spoken: "\(label) \(together.days.count)日", onOpen: onOpen) {
        Text(label)
      } days: {
        Text(together.days.count, format: .number)
      }
    }
  }
}

/// Whose シフトパターン is open.
struct LegendOf: Identifiable {
  let userID: String
  var id: String { userID }
}
