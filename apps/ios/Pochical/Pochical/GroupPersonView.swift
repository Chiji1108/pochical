import PochicalDesign
import PochicalKit
import SwiftUI

/// 1人ずつ (/design's PeoplePicker and PersonPager): one member at a time,
/// picked from a row of people, their month in the same kind of calendar
/// as your own, swiped sideways a month at a time under the weekdays.
/// Shift names always show and days off are always lit, whatever the
/// viewer's look, so no list of their patterns is needed; a day you are
/// both off is framed. The month's みんな休み is under it.
struct GroupPersonView: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.look) private var look
  let members: [GroupMember]
  let groupID: String
  /// The viewer among the members, once known.
  let meID: String?
  @Binding var picked: Day?
  let onTogether: (TogetherList) -> Void
  /// Whom it shows, until picked the first who is not the viewer.
  @State private var personID: String?
  /// The month shown, from the swiped pages.
  @State private var month: Day? = Day.today.firstOfMonth
  /// Where the pages are as a finger moves them, for the month's name.
  @State private var position = PagerPosition(pages: span)

  private static let span = 24
  private static let gridHeight = 6 * DayCell.height + 5 * 4

  var body: some View {
    let person =
      members.first { $0.userID == personID }
      ?? members.first { $0.userID != meID } ?? members.first
    let me = members.first { $0.userID == meID }
    let shown = month ?? Day.today.firstOfMonth
    VStack(alignment: .leading, spacing: 12) {
      people(picked: person)
      HStack {
        MonthTitleButton(
          month: shown, first: Day.today.firstOfMonth.addingMonths(-Self.span),
          last: Day.today.firstOfMonth.addingMonths(Self.span)
        ) { picked in
          month = picked
        } label: {
          RollingMonthTitle(position: position) {
            Day.today.firstOfMonth.addingMonths($0 - Self.span)
          }
          .foregroundStyle(colors.textPrimary)
        }
        Spacer()
        if shown != Day.today.firstOfMonth {
          TodayButton(unit: "月") {
            withAnimation(Springs.standard) { month = Day.today.firstOfMonth }
          }
        }
      }
      .frame(minHeight: Metrics.touch)
      .padding(.horizontal, 16)
      VStack(spacing: 4) {
        WeekdayRow(week: settings.device.week)
        if let person {
          pager(person: person, me: me)
        }
      }
      .padding(.horizontal, 16)
      if let person, person.userID != meID, me != nil {
        Text("薄い枠の日は、自分も休みの日です。")
          .font(.footnote)
          .foregroundStyle(colors.textTertiary)
          .padding(.horizontal, 20)
      }
      together(in: shown)
        .padding(.horizontal, 16)
    }
  }

  /// The row of people, scrolled sideways once they outgrow it.
  private func people(picked person: GroupMember?) -> some View {
    ScrollView(.horizontal) {
      HStack(spacing: 8) {
        ForEach(members) { member in
          let isPicked = member.userID == person?.userID
          ChoiceChip(name: member.name, picked: isPicked) {
            personID = member.userID
          } leading: {
            MemberAvatar(
              name: member.name, photoID: member.photoID, groupID: groupID, size: 24,
              userID: member.userID)
          }
        }
      }
      .padding(.horizontal, 16)
    }
    .scrollIndicators(.hidden)
    .accessibilityLabel("表示する人")
  }

  /// The person's months side by side, a swipe turning one.
  private func pager(person: GroupMember, me: GroupMember?) -> some View {
    let thisMonth = Day.today.firstOfMonth
    let months = (-Self.span...Self.span).map { thisMonth.addingMonths($0) }
    return ScrollView(.horizontal) {
      LazyHStack(spacing: 0) {
        ForEach(months, id: \.self) { month in
          grid(month, person: person, me: me)
            .containerRelativeFrame(.horizontal)
        }
      }
      .scrollTargetLayout()
    }
    .scrollTargetBehavior(.paging)
    .scrollPosition(id: $month)
    .onScrollGeometryChange(for: CGFloat.self) { geometry in
      geometry.contentOffset.x / max(geometry.containerSize.width, 1)
    } action: { _, pages in
      position.pages = pages
    }
    .scrollIndicators(.hidden)
    .frame(height: Self.gridHeight)
  }

  private func grid(_ month: Day, person: GroupMember, me: GroupMember?) -> some View {
    let weeks = monthWeeks(month, weekStart: settings.device.week.start)
    let shown = person.calendar.shown(from: weeks[0][0], through: weeks[weeks.count - 1][6])
    let mine = me.map { $0.offDays(from: weeks[0][0], through: weeks[weeks.count - 1][6]) } ?? [:]
    var theirLook = look
    theirLook.options.names = true
    theirLook.options.highlight = true
    theirLook.options.blankOff = false
    return VStack(spacing: 4) {
      ForEach(weeks, id: \.self) { week in
        HStack(spacing: 4) {
          ForEach(week, id: \.self) { day in
            let outside = day.month != month.month
            let entry = outside ? nil : shown[day]
            let pattern = entry.flatMap { person.calendar.patternsByID[$0.shift] }
            let bothOff =
              !outside && person.userID != me?.userID && pattern?.countsAsOff == true
              && mine[day] == true
            DayCell(
              day: day, entry: entry, note: nil, pattern: pattern, outside: outside,
              isToday: day == Day.today,
              isHoliday: day.holidayName != nil,
              colorsHoliday: settings.device.week.holiday, isSelected: day == picked,
              onSelect: outside ? nil : { picked = picked == $0 ? nil : $0 }
            )
            .overlay {
              if bothOff, day != picked {
                RoundedRectangle(cornerRadius: Radius.md)
                  .strokeBorder(colors.accentBorder, lineWidth: 1.5)
              }
            }
            .accessibilityHint(bothOff ? "自分も休み" : "")
          }
        }
      }
    }
    .environment(\.look, theirLook)
    .frame(maxHeight: .infinity, alignment: .top)
  }

  /// The month's みんな休み, which lists its days.
  private func together(in month: Day) -> some View {
    let days = month.daysOfMonth
    let offs = members.map { $0.offDays(from: days[0], through: days[days.count - 1]) }
    let together =
      members.count > 1
      ? Together.days(offs, from: days[0], through: days[days.count - 1])
      : (days: [], unsure: false)
    let title = "\(month == Day.today.firstOfMonth ? "今月" : month.monthText)のみんな休み"
    return TogetherSummary(label: title, together: together) {
      onTogether(TogetherList(title: title, days: together.days))
    }
  }

}
