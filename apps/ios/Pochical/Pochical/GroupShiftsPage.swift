import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// How many months either side of today the list of months holds, as
/// /design's (monthSpan).
private let monthSpan = 24

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
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Fetch private var members: [GroupMember] = []
  /// The viewer's id among the members, for 1人ずつ.
  @State private var meID: String?
  let group: GroupRow
  @State private var picked: Day?
  @State private var togetherSheet: TogetherList?
  /// A day picked in the みんな休み sheet, shown once that sheet has gone:
  /// one sheet cannot come up while another is going.
  @State private var pickedFromList: Day?
  /// The layout picked from the menu; until then the group's size's.
  @State private var pickedLayout: ShiftsLayout?
  /// The month at the top of the list, named in the row pinned over it.
  @State private var monthInSight = Day.today.firstOfMonth
  /// Whether today's day or week is in sight; 今日 shows while it isn't.
  @State private var todayInSight = true
  /// Where 月を選ぶ or 今日 asked the list to go.
  @State private var goal: ListGoal?

  private var layouts: [ShiftsLayout] {
    DayRowsDensity(members: members.count) == .scroll
      ? [.weeks, .person] : ShiftsLayout.allCases
  }

  private var layout: ShiftsLayout {
    pickedLayout.flatMap { layouts.contains($0) ? $0 : nil } ?? layouts[0]
  }

  /// The day it opens on, its sheet up.
  private let openingDay: Day?
  /// That day's sheet has come up, so the list coming back (from 1人ずつ)
  /// does not put it up again.
  @State private var openedDay = false

  init(group: GroupRow, day: Day?) {
    self.group = group
    openingDay = day
  }

  var body: some View {
    let thisMonth = Day.today.firstOfMonth
    let months = (-monthSpan...monthSpan).map { thisMonth.addingMonths($0) }
    let opening = openingDay ?? Day.today
    VStack(spacing: 0) {
      if layout != .person {
        // The month in sight, pinned over the list, which opens 月を選ぶ,
        // and 今日 while today is out of sight (/design's MonthRow).
        HStack {
          MonthTitleButton(
            month: monthInSight, first: months[0], last: months[months.count - 1]
          ) { goal = .month($0) } label: {
            Text(fullMonthName(monthInSight))
              .font(.title3.bold())
              .foregroundStyle(colors.textPrimary)
              .contentTransition(.numericText())
              .animation(.default, value: monthInSight)
          }
          Spacer()
          if !todayInSight {
            TodayButton(unit: "日") { goal = .today }
          }
        }
        .animation(.default, value: todayInSight)
        .frame(minHeight: Metrics.touch)
        .padding(.horizontal, 16)
        .padding(.vertical, 2)
      }
      switch layout {
      case .days: GroupDayHeader(members: members).padding(.horizontal, 16)
      // Over the blocks' columns, which keep room at their trailing end.
      case .weeks:
        GroupWeekdays().padding(.leading, 16).padding(.trailing, 20).padding(.bottom, 6)
      case .person: EmptyView()
      }
      if layout == .person {
        ScrollView {
          GroupPersonView(members: members, meID: meID, picked: $picked) { togetherSheet = $0 }
            .padding(.vertical, 8)
        }
      } else {
        list(months: months, opening: opening)
      }
    }
    .background(colors.backgroundBase)
    .navigationTitle(group.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .toolbar {
      if layouts.count > 1 {
        ToolbarItem(placement: .primaryAction) {
          Menu {
            Picker("表示", selection: Binding { layout } set: { pickedLayout = $0 }) {
              ForEach(layouts, id: \.self) { Text($0.name).tag($0) }
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
    .task {
      meID = await groupCalls.userID()
    }
    .task(id: settings.device.week.start) {
      let first = thisMonth.addingMonths(-monthSpan).adding(days: -6)
      let last = thisMonth.addingMonths(monthSpan + 1).adding(days: 6)
      _ = try? await $members.load(GroupMembersRequest(groupID: group.id, from: first, through: last))
    }
    .sheet(item: $picked) { day in
      // As tall as its rows, as /design's.
      let fitted = PresentationDetent.height(daySheetHeight)
      DaySheet(day: day, members: members)
        .presentationDetents([fitted, .large])
        .presentationBackgroundInteraction(.enabled(upThrough: fitted))
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
  }

  /// A month's heading, over the row of its みんな休み when it has any,
  /// else a note beside its name: none, or that days not entered yet leave
  /// it open (/design's MonthDivider).
  @ViewBuilder private func heading(_ month: Day) -> some View {
    let today = Day.today
    let thisYear = month.year == today.year
    let name = thisYear ? month.monthText : month.yearMonthText
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
        Button {
          let title = month == today.firstOfMonth ? "今月" : name
          togetherSheet = TogetherList(title: "\(title)のみんな休み", days: together.days)
        } label: {
          HStack {
            Text("みんな休み").foregroundStyle(colors.textSecondary)
            Spacer()
            TogetherCount(count: together.days.count)
            Image(systemName: "chevron.right")
              .imageScale(.small)
              .foregroundStyle(colors.textQuaternary)
          }
          .font(.subheadline)
          .padding(.horizontal, 16)
          .frame(minHeight: Metrics.touch)
          .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.lg))
        }
        .buttonStyle(.plain)
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

  /// 一覧 and 週ごと: the months as one list, opening on `opening`.
  private func list(months: [Day], opening: Day) -> some View {
    ScrollViewReader { scroll in
      ScrollView {
        LazyVStack(alignment: .leading, spacing: layout == .weeks ? 12 : 0) {
          ForEach(months, id: \.self) { month in
            heading(month)
              .padding(.top, layout == .weeks ? 12 : 36)
              .padding(.bottom, layout == .weeks ? 0 : 12)
              // Not a day: the month in sight is read off the days.
              .id("heading-\(month.key)")
            if layout == .days {
              ForEach(month.daysOfMonth, id: \.self) { day in
                GroupDayRow(day: day, members: members, picked: day == picked, onPick: pick)
                  .id(day)
              }
            } else {
              ForEach(weeks(endingIn: month), id: \.self) { week in
                GroupWeek(
                  days: week, members: members, month: month, picked: picked, onPick: pick
                )
                // Clear of the rounded corners, a band in the last column too.
                .padding(.vertical, 4)
                .padding(.trailing, 4)
                .background(
                  colors.backgroundBase, in: RoundedRectangle(cornerRadius: Radius.xxl)
                )
                .overlay(
                  RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
                .id(week[0])
              }
            }
          }
        }
        .scrollTargetLayout()
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
      }
      .onScrollTargetVisibilityChange(idType: Day.self, threshold: 0.5) { shown in
        // A week belongs to the month it ends in.
        if let first = shown.min() {
          monthInSight = (layout == .days ? first : first.adding(days: 6)).firstOfMonth
        }
        todayInSight = shown.contains(anchor(of: Day.today))
      }
      .onChange(of: goal) { _, goal in
        switch goal {
        case .month(let month): scroll.scrollTo("heading-\(month.key)", anchor: .top)
        case .today: withAnimation(Springs.standard) { scroll.scrollTo(anchor(of: Day.today), anchor: .top) }
        case nil: return
        }
        self.goal = nil
      }
      // Opening at the top, the day's month named in the pinned row, and
      // its sheet up once there: a sheet coming up as the list appears
      // keeps it from scrolling.
      .onAppear { scroll.scrollTo(anchor(of: opening), anchor: .top) }
      .task {
        if let openingDay, !openedDay {
          openedDay = true
          picked = openingDay
        }
      }
      .onChange(of: layout) { scroll.scrollTo(anchor(of: picked ?? Day.today), anchor: .top) }
      // As /design's: the table stays where it is when a day is picked;
      // room under it while the sheet is up lets a row near the bottom be
      // scrolled above the sheet.
      .contentMargins(.bottom, picked == nil ? 0 : daySheetHeight, for: .scrollContent)
    }
  }

  /// The day's sheet: its bar and a row a member.
  private var daySheetHeight: CGFloat {
    CGFloat(120 + members.count * 52)
  }

  private func pick(_ day: Day) {
    picked = picked == day ? nil : day
  }

  /// Where a day is in the list: its own row, or its week's block.
  private func anchor(of day: Day) -> Day {
    layout == .days ? day : weekStart(of: day)
  }

  private func weekStart(of day: Day) -> Day {
    day.adding(days: -(((day.weekday - settings.device.week.start) % 7 + 7) % 7))
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

  var body: some View {
    let offs = members.map { $0.offDays(from: day, through: day)[day] }
    NavigationStack {
      List(members) { member in
        let entry = member.calendar.shown(from: day, through: day)[day]
        let pattern = entry.flatMap { member.calendar.patternsByID[$0.shift] }
        // On one line, as /design's: the mark, the pattern and its hours.
        HStack(spacing: 8) {
          LetterAvatar(name: member.name, size: 28)
          Text(member.name).lineLimit(1)
          Spacer(minLength: 8)
          if let pattern {
            ShiftMark(pattern: pattern, size: 18)
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
      .navigationTitle(day.fullText)
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
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

/// A month with its year, as the pinned row names it: 2026年10月.
func fullMonthName(_ month: Day) -> String {
  month.yearMonthText
}

/// How many days everyone is off, large in the accent, as /design's
/// SummaryRow counts: 4日.
struct TogetherCount: View {
  @Environment(\.themeColors) private var colors
  let count: Int

  var body: some View {
    HStack(alignment: .firstTextBaseline, spacing: 1) {
      Text("\(count)").font(.title2.bold())
      Text("日").font(.footnote.weight(.semibold))
    }
    .foregroundStyle(colors.accentDefault)
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(count)日")
  }
}

/// Where the list of months is asked to go.
private enum ListGoal: Hashable {
  case month(Day)
  case today
}
