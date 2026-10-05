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
        RollingMonthTitle(position: position) { Day.today.firstOfMonth.addingMonths($0 - Self.span) }
        Spacer()
        if shown != Day.today.firstOfMonth {
          Button("今月") {
            withAnimation(Springs.standard) { month = Day.today.firstOfMonth }
          }
          .buttonStyle(BarButton())
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
          Button {
            personID = member.userID
          } label: {
            HStack(spacing: 6) {
              LetterAvatar(name: member.name, size: 22)
              Text(member.name)
                .font(.subheadline.weight(isPicked ? .semibold : .regular))
                .foregroundStyle(isPicked ? colors.accentDefault : colors.textSecondary)
                .lineLimit(1)
            }
            .padding(.leading, 4)
            .padding(.trailing, 12)
            .frame(minHeight: 32)
            .background(isPicked ? colors.accentContainer : colors.backgroundCard, in: Capsule())
            .overlay {
              Capsule().strokeBorder(
                isPicked ? colors.accentDefault : colors.separator, lineWidth: isPicked ? 1.5 : 1)
            }
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(isPicked ? .isSelected : [])
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
              isHoliday: Holidays.name(on: day.key, in: "JP") != nil,
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
  @ViewBuilder private func together(in month: Day) -> some View {
    let days = month.daysOfMonth
    let offs = members.map { $0.offDays(from: days[0], through: days[days.count - 1]) }
    let together =
      members.count > 1
      ? Together.days(offs, from: days[0], through: days[days.count - 1])
      : (days: [], unsure: false)
    let title = "\(month == Day.today.firstOfMonth ? "今月" : "\(month.month)月")のみんな休み"
    let row = HStack {
      Text(title).foregroundStyle(colors.textSecondary)
      Spacer()
      if together.days.isEmpty {
        Text(together.unsure ? "未入力あり" : "なし").foregroundStyle(colors.textTertiary)
      } else {
        TogetherCount(count: together.days.count)
        Image(systemName: "chevron.right")
          .imageScale(.small)
          .foregroundStyle(colors.textQuaternary)
      }
    }
    .font(.subheadline)
    .padding(.horizontal, 16)
    .frame(minHeight: Metrics.touch)
    .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.lg))
    if together.days.isEmpty {
      row.accessibilityElement(children: .combine)
    } else {
      Button {
        onTogether(TogetherList(title: title, days: together.days))
      } label: {
        row
      }
      .buttonStyle(.plain)
    }
  }

}
