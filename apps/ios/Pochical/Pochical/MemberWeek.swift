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

/// The width of the members' faces beside a week, as /design's columns:
/// room around a face on the hub's card and more on the month's blocks,
/// so none touches the block's edge.
private func facesWidth(compact: Bool) -> CGFloat {
  compact ? 28 : 34
}

/// The weekdays over a group's weeks, from the day the week starts on.
struct GroupWeekdays: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  /// Over the hub's card, beside its narrower faces.
  var compact = false

  var body: some View {
    let week = settings.device.week
    HStack(spacing: 0) {
      Color.clear.frame(width: facesWidth(compact: compact), height: 1)
      ForEach(0..<7, id: \.self) { index in
        let weekday = (week.start + index) % 7
        Text(Day.weekdayNames[weekday])
          .font(.system(size: 10))
          .foregroundStyle(color(of: weekday, week: week))
          .frame(maxWidth: .infinity)
      }
    }
    .accessibilityHidden(true)
  }

  private func color(of weekday: Int, week: DeviceSettings.Week) -> Color {
    switch weekday {
    case 0 where week.sunday: colors.calendarHoliday
    case 6 where week.saturday: colors.calendarSaturday
    default: colors.textQuaternary
    }
  }
}

/// A week of a group's shifts (/design's WeekBlock): its dates across,
/// then a row per member, their face and each day's mark. A day off is on
/// its tile, a day everyone is off (みんな休み) one band down its column,
/// date and all, and the picked day framed the same way. Members' marks
/// show in the viewer's look until each member's own comes with them.
struct GroupWeek: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  let days: [Day]
  let members: [GroupMember]
  /// The month the week is shown under; its other days are faded.
  var month: Day?
  var picked: Day?
  /// Picks a day, to show everyone's that day; nil leaves days alone.
  var onPick: ((Day) -> Void)?
  /// The hub's card draws its rows tighter.
  var compact = false

  var body: some View {
    let today = Day.today
    let shown = members.map { $0.calendar.shown(from: days[0], through: days[6]) }
    let offs = members.indices.map { index in
      shown[index].compactMapValues { members[index].calendar.patternsByID[$0.shift]?.countsAsOff }
    }
    let together = members.count > 1 ? Set(Together.days(offs, from: days[0], through: days[6]).days) : []
    HStack(alignment: .top, spacing: 0) {
      VStack(spacing: 0) {
        Color.clear.frame(height: dateHeight)
        ForEach(members) { member in
          MemberAvatar(
            name: member.name, photoID: member.photoID, size: compact ? 20 : 24,
            userID: member.userID)
            .frame(height: rowHeight)
            .accessibilityLabel(member.name)
        }
      }
      .frame(width: facesWidth(compact: compact))
      ForEach(days, id: \.self) { day in
        let column = VStack(spacing: 0) {
          // A month's 1st says its month, where the week runs into it.
          Text(day.day == 1 && day != days[0] ? day.slashText : "\(day.day)")
            .font(.system(size: 11, weight: day == today ? .heavy : .semibold))
            .foregroundStyle(dateColor(day, today: today))
            .frame(height: dateHeight)
          ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
            let entry = shown[index][day]
            let pattern = entry.flatMap { member.calendar.patternsByID[$0.shift] }
            let change = entry.flatMap {
              timeChange(start: $0.start, end: $0.end, standard: pattern?.time)
            }
            cell(
              pattern, change: change,
              tiled: pattern?.countsAsOff == true && !together.contains(day))
              .accessibilityLabel("\(member.name)：\(pattern?.name ?? "未入力")")
          }
        }
        .frame(maxWidth: .infinity)
        // みんな休み: the day's tiles joined down the column.
        .background {
          if together.contains(day) {
            RoundedRectangle(cornerRadius: Radius.sm)
              .fill(colors.accentContainer)
              .padding(.horizontal, 3)
          }
        }
        .overlay {
          if day == picked {
            RoundedRectangle(cornerRadius: Radius.sm)
              .strokeBorder(colors.accentDefault, lineWidth: 1.5)
              .padding(.horizontal, 3)
          }
        }
        .opacity(month.map { $0.month == day.month } ?? true ? 1 : 0.35)
        .contentShape(.rect)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(day.monthDayText)\(together.contains(day) ? "、みんな休み" : "")")
        .accessibilityAddTraits(day == picked ? .isSelected : [])
        if let onPick {
          Button { onPick(day) } label: { column }
            .buttonStyle(.plain)
        } else {
          column
        }
      }
    }
  }

  /// Today in the accent; else Sundays, Saturdays and holidays in their
  /// colors as the calendar has them.
  private func dateColor(_ day: Day, today: Day) -> Color {
    if day == today {
      return colors.accentDefault
    }
    let week = settings.device.week
    if week.holiday, day.holidayName != nil {
      return colors.calendarHoliday
    }
    switch day.weekday {
    case 0 where week.sunday: return colors.calendarHoliday
    case 6 where week.saturday: return colors.calendarSaturday
    default: return colors.textPrimary
    }
  }

  private var dateHeight: CGFloat { compact ? 24 : 26 }
  private var rowHeight: CGFloat { compact ? 26 : 30 }

  private func cell(_ pattern: Pattern?, change: TimeChange?, tiled: Bool) -> some View {
    Group {
      if let pattern {
        ShiftMark(pattern: pattern, size: 18, change: change)
      } else {
        Circle().fill(colors.fillSecondary).frame(width: 6, height: 6)
      }
    }
    .frame(maxWidth: .infinity, minHeight: rowHeight, maxHeight: rowHeight)
    .background {
      if tiled {
        RoundedRectangle(cornerRadius: Radius.sm)
          .fill(colors.accentContainer)
          .padding(.horizontal, 3)
          .padding(.vertical, 2)
      }
    }
  }
}

/// This week for everyone in the group on the hub's card (/design's
/// MemberTable, compact), then the next day everyone is off.
struct MemberWeek: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  let members: [GroupMember]
  /// Opens the group's month, on a day when one is given.
  let onOpen: (Day?) -> Void

  var body: some View {
    let today = Day.today
    let days = thisWeek(start: settings.device.week.start)
    VStack(spacing: 4) {
      Button {
        onOpen(nil)
      } label: {
        VStack(spacing: 4) {
          GroupWeekdays(compact: true)
          GroupWeek(days: days, members: members, compact: true)
        }
        .contentShape(.rect)
      }
      .buttonStyle(.plain)
      .accessibilityHint("押すと月で見られます")
      next(today: today)
    }
    // Only a frame on the screen's own ground: the card's ground is lifted
    // in dark mode, where the week would float.
    .padding(EdgeInsets(top: 8, leading: 4, bottom: 12, trailing: 8))
    .background(colors.backgroundBase, in: RoundedRectangle(cornerRadius: Radius.xxl))
    .overlay(RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
  }

  /// 次のみんな休み: the first day from today, within `nextTogetherDays`,
  /// everyone is off, which opens on the month; else なし.
  @ViewBuilder private func next(today: Day) -> some View {
    let through = today.adding(days: nextTogetherDays - 1)
    let offs = members.map { $0.offDays(from: today, through: through) }
    let next = members.count > 1 ? Together.days(offs, from: today, through: through).days.first : nil
    let row = HStack(spacing: 8) {
      Text("次のみんな休み")
        .foregroundStyle(colors.textSecondary)
      Spacer()
      Text(next.map { "\($0.fullText)・\(fromToday($0, today: today))" } ?? "なし")
        .fontWeight(.semibold)
        .foregroundStyle(next == nil ? colors.textTertiary : colors.accentDefault)
      if next != nil {
        Image(systemName: "chevron.right")
          .imageScale(.small)
          .foregroundStyle(colors.textQuaternary)
      }
    }
    .font(.footnote)
    .padding(EdgeInsets(top: 12, leading: 12, bottom: 2, trailing: 8))
    .overlay(alignment: .top) {
      Rectangle().fill(colors.separator).frame(height: 1)
    }
    .padding(.top, 2)
    if let next {
      Button { onOpen(next) } label: { row.contentShape(.rect) }
        .buttonStyle(.plain)
    } else {
      row.accessibilityElement(children: .combine)
    }
  }

  /// How far a day is from today, the way people say it: 今日, 明日, 3日後.
  private func fromToday(_ day: Day, today: Day) -> String {
    switch day.days(since: today) {
    case 0: "今日"
    case 1: "明日"
    case let count: "\(count)日後"
    }
  }
}

