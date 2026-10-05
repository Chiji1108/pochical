import PochicalDesign
import PochicalKit
import SwiftUI

/// This week for everyone in the group (/design's MemberTable, compact):
/// the weekdays and dates across, then a row per member, their face and
/// each day's mark, days off on their tile. Members' marks show in the
/// viewer's look until each member's own comes with them.
struct MemberWeek: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  let members: [GroupMember]

  var body: some View {
    let today = Day.today
    let week = settings.device.week
    let first = today.adding(days: -(((today.weekday - week.start) % 7 + 7) % 7))
    let days = (0..<7).map { first.adding(days: $0) }
    Grid(horizontalSpacing: 0, verticalSpacing: 4) {
      GridRow {
        Color.clear.frame(width: 28, height: 1)
        ForEach(days, id: \.self) { day in
          Text(WeekdayRow.names[day.weekday])
            .font(.system(size: 10))
            .foregroundStyle(weekdayColor(day.weekday, week: week))
            .frame(maxWidth: .infinity)
        }
      }
      GridRow {
        Color.clear.frame(width: 28, height: 1)
        ForEach(days, id: \.self) { day in
          Text("\(day.day)")
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(day == today ? colors.accentDefault : colors.textPrimary)
            .frame(maxWidth: .infinity)
        }
      }
      ForEach(members) { member in
        let shown = member.calendar.shown(from: days[0], through: days[6])
        GridRow {
          LetterAvatar(name: member.name, size: 22)
            .accessibilityLabel(member.name)
          ForEach(days, id: \.self) { day in
            cell(shown[day].flatMap { member.calendar.patternsByID[$0.shift] }, on: day, of: member)
          }
        }
      }
    }
    .padding(12)
    .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.xl))
    .overlay(RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(colors.separator))
  }

  private func cell(_ pattern: Pattern?, on day: Day, of member: GroupMember) -> some View {
    Group {
      if let pattern {
        ShiftMark(pattern: pattern, size: 18)
      } else {
        Circle().fill(colors.fillSecondary).frame(width: 4, height: 4)
      }
    }
    .frame(maxWidth: .infinity, minHeight: 32)
    .background {
      if pattern?.countsAsOff == true {
        RoundedRectangle(cornerRadius: Radius.sm)
          .fill(colors.calendarOffTint)
          .padding(.horizontal, 3)
      }
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel("\(day.month)月\(day.day)日 \(member.name)：\(pattern?.name ?? "未入力")")
  }

  private func weekdayColor(_ weekday: Int, week: DeviceSettings.Week) -> Color {
    switch weekday {
    case 0 where week.sunday: colors.calendarHoliday
    case 6 where week.saturday: colors.calendarSaturday
    default: colors.textQuaternary
    }
  }
}
