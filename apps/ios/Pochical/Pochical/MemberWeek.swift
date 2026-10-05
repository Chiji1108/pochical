import PochicalDesign
import PochicalKit
import SwiftUI

/// Today's week, from the day it starts on (0 for Sunday).
func thisWeek(start: Int) -> [Day] {
  let today = Day.today
  let first = today.adding(days: -(((today.weekday - start) % 7 + 7) % 7))
  return (0..<7).map { first.adding(days: $0) }
}

/// How far ahead the hub looks for the next day everyone is off.
let nextTogetherDays = 60

/// This week for everyone in the group (/design's MemberTable, compact),
/// then the next day everyone is off: the weekdays and dates across, a row
/// per member, their face and each day's mark. A day off is on its tile,
/// and a day everyone is off (みんな休み) one band down its column, date
/// and all. Members' marks show in the viewer's look until each member's
/// own comes with them.
struct MemberWeek: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  let members: [GroupMember]

  private static let rowHeight: CGFloat = 26
  private static let dateHeight: CGFloat = 24

  var body: some View {
    let today = Day.today
    let week = settings.device.week
    let days = thisWeek(start: week.start)
    let offs = members.map { $0.offDays(from: days[0], through: today.adding(days: nextTogetherDays - 1)) }
    let together = Set(
      Together.days(offs, from: days[0], through: days[6]).days.filter { _ in members.count > 1 })
    VStack(spacing: 0) {
      HStack(alignment: .top, spacing: 0) {
        VStack(spacing: 0) {
          Color.clear.frame(height: 14 + Self.dateHeight)
          ForEach(members) { member in
            LetterAvatar(name: member.name, size: 20)
              .frame(height: Self.rowHeight)
              .accessibilityLabel(member.name)
          }
        }
        .frame(width: 28)
        ForEach(days, id: \.self) { day in
          column(day, today: today, week: week, offs: offs, together: together.contains(day))
        }
      }
      next(offs, today: today)
    }
    .padding(12)
    .padding(.bottom, -4)
    .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xl))
    .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(colors.separator))
  }

  private func column(
    _ day: Day, today: Day, week: DeviceSettings.Week, offs: [[Day: Bool]], together: Bool
  ) -> some View {
    VStack(spacing: 0) {
      Text(WeekdayRow.names[day.weekday])
        .font(.system(size: 10))
        .foregroundStyle(weekdayColor(day.weekday, week: week))
        .frame(height: 14)
      VStack(spacing: 0) {
        Text("\(day.day)")
          .font(.system(size: 11, weight: .semibold))
          .foregroundStyle(day == today ? colors.accentDefault : colors.textPrimary)
          .frame(height: Self.dateHeight)
        ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
          cell(on: day, of: member, off: offs[index][day] == true, together: together)
        }
      }
      // みんな休み: the day's tiles joined down the column.
      .background {
        if together {
          RoundedRectangle(cornerRadius: Radius.sm)
            .fill(colors.accentContainer)
            .padding(.horizontal, 3)
        }
      }
    }
    .frame(maxWidth: .infinity)
    .accessibilityElement(children: .combine)
    .accessibilityHint(together ? "みんな休み" : "")
  }

  private func cell(on day: Day, of member: GroupMember, off: Bool, together: Bool) -> some View {
    let pattern = member.calendar.shown(from: day, through: day)[day].flatMap {
      member.calendar.patternsByID[$0.shift]
    }
    return Group {
      if let pattern {
        ShiftMark(pattern: pattern, size: 18)
      } else {
        Circle().fill(colors.fillSecondary).frame(width: 4, height: 4)
      }
    }
    .frame(maxWidth: .infinity, minHeight: Self.rowHeight, maxHeight: Self.rowHeight)
    .background {
      if off, !together {
        RoundedRectangle(cornerRadius: Radius.sm)
          .fill(colors.accentContainer)
          .padding(.horizontal, 3)
          .padding(.vertical, 2)
      }
    }
    .accessibilityLabel("\(member.name)：\(pattern?.name ?? "未入力")")
  }

  /// 次のみんな休み: the first day from today, within `nextTogetherDays`,
  /// everyone is off, or なし.
  private func next(_ offs: [[Day: Bool]], today: Day) -> some View {
    let next =
      members.count > 1
      ? Together.days(offs, from: today, through: today.adding(days: nextTogetherDays - 1)).days
        .first
      : nil
    return HStack(spacing: 8) {
      Text("次のみんな休み")
        .foregroundStyle(colors.textSecondary)
      Spacer()
      Text(next.map { "\($0.month)月\($0.day)日(\(WeekdayRow.names[$0.weekday]))・\(fromToday($0, today: today))" } ?? "なし")
        .foregroundStyle(colors.textPrimary)
    }
    .font(.footnote)
    .padding(.top, 12)
    .padding(.bottom, 2)
    .padding(.horizontal, 4)
    .overlay(alignment: .top) {
      Rectangle().fill(colors.separator).frame(height: 1)
    }
    .padding(.top, 2)
    .accessibilityElement(children: .combine)
  }

  /// How far a day is from today, the way people say it: 今日, 明日, 3日後.
  private func fromToday(_ day: Day, today: Day) -> String {
    let count = day.days(since: today)
    switch count {
    case 0: return "今日"
    case 1: return "明日"
    default: return "\(count)日後"
    }
  }

  private func weekdayColor(_ weekday: Int, week: DeviceSettings.Week) -> Color {
    switch weekday {
    case 0 where week.sunday: colors.calendarHoliday
    case 6 where week.saturday: colors.calendarSaturday
    default: colors.textQuaternary
    }
  }
}
