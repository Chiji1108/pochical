import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// How many months either side of today the list of months holds, as
/// /design's (monthSpan).
private let monthSpan = 24

/// Everyone's shifts in a group, 週ごと (/design's ShiftsPage with its list
/// of months): each month under its heading with its みんな休み, its weeks a
/// block each, two years either side of today, drawn as they come into
/// sight. It opens on the day asked for, else today. A day pressed shows
/// everyone's that day in a sheet along the bottom, the table left live
/// above it. 一覧 and 1人ずつ come later.
struct GroupShiftsPage: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Fetch private var members: [GroupMember] = []
  let group: GroupRow
  @State private var picked: Day?
  @State private var togetherSheet: TogetherList?
  /// A day picked in the みんな休み sheet, shown once that sheet has gone:
  /// one sheet cannot come up while another is going.
  @State private var pickedFromList: Day?

  init(group: GroupRow, day: Day?) {
    self.group = group
    _picked = State(initialValue: day)
  }

  var body: some View {
    let thisMonth = Day.today.firstOfMonth
    let months = (-monthSpan...monthSpan).map { thisMonth.addingMonths($0) }
    let opening = picked ?? Day.today
    VStack(spacing: 0) {
      GroupWeekdays()
        .padding(.horizontal, 16)
        .padding(.bottom, 6)
      ScrollViewReader { scroll in
        ScrollView {
          LazyVStack(alignment: .leading, spacing: 12) {
            ForEach(months, id: \.self) { month in
              heading(month)
                .padding(.top, 12)
              ForEach(weeks(endingIn: month), id: \.self) { week in
                GroupWeek(days: week, members: members, month: month, picked: picked) { day in
                  picked = picked == day ? nil : day
                }
                .padding(.vertical, 4)
                .background(colors.backgroundBase, in: RoundedRectangle(cornerRadius: Radius.xxl))
                .overlay(
                  RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
                .id(week[0])
              }
            }
          }
          .padding(.horizontal, 16)
          .padding(.bottom, 24)
        }
        .onAppear {
          scroll.scrollTo(weekStart(of: opening), anchor: .center)
        }
      }
    }
    .background(colors.backgroundBase)
    .navigationTitle(group.name)
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .task(id: settings.device.week.start) {
      let first = thisMonth.addingMonths(-monthSpan).adding(days: -6)
      let last = thisMonth.addingMonths(monthSpan + 1).adding(days: 6)
      try? await $members.load(GroupMembersRequest(groupID: group.id, from: first, through: last))
    }
    .sheet(item: $picked) { day in
      DaySheet(day: day, members: members)
        .presentationDetents([.medium, .large])
        .presentationBackgroundInteraction(.enabled(upThrough: .medium))
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
    let name = thisYear ? "\(month.month)月" : "\(month.year)年\(month.month)月"
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
            Text("\(together.days.count)日").foregroundStyle(colors.textPrimary)
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

  private func weekStart(of day: Day) -> Day {
    day.adding(days: -(((day.weekday - settings.device.week.start) % 7 + 7) % 7))
  }
}

/// A month's days everyone is off, for its sheet.
private struct TogetherList: Identifiable {
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
          LabeledContent(dayName(day), value: Holidays.name(on: day.key, in: "JP") ?? "")
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
        HStack(spacing: 12) {
          LetterAvatar(name: member.name, size: 28)
          Text(member.name).lineLimit(1)
          Spacer()
          if let pattern {
            ShiftMark(pattern: pattern, size: 18)
          }
          VStack(alignment: .trailing, spacing: 2) {
            Text(pattern?.name ?? "未入力")
              .foregroundStyle(pattern == nil ? colors.textTertiary : colors.textPrimary)
            if let hours = hours(entry, pattern) {
              Text(hours)
                .font(.caption)
                .foregroundStyle(colors.textSecondary)
            }
          }
        }
        .accessibilityElement(children: .combine)
      }
      .navigationTitle(dayName(day))
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
        if members.count > 1, Together.allOff(offs) {
          ToolbarItem(placement: .principal) {
            VStack(spacing: 2) {
              Text(dayName(day)).font(.headline)
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
      return "\(start)〜\(end)"
    }
    let moves = [change.early ? "早出" : nil, change.late ? "残業" : nil].compactMap(\.self)
    return "\(moves.joined(separator: "・")) \(start)〜\(end)"
  }
}
