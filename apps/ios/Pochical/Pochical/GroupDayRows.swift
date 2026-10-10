import PochicalDesign
import PochicalKit
import SwiftUI

/// How much of a member fits across 一覧 (/design's densityOf): names up
/// to four people, marks alone up to seven; more scroll sideways.
enum DayRowsDensity {
  case names, marks, scroll

  init(members: Int) {
    if members <= 4 {
      self = .names
    } else {
      self = members <= 7 ? .marks : .scroll
    }
  }

  /// A member's column: shared out across the screen, or as wide as a
  /// mark when they scroll.
  var columnWidth: CGFloat? { self == .scroll ? 40 : nil }
}

/// The width of a day's date at the start of its row.
private let dateWidth: CGFloat = 46

/// Today's bar at a row's start, where every row keeps the room for it.
private let todayBar: CGFloat = 3

/// How far in a row's band and frame are: clear of today's bar, and of
/// the row's lines.
private let rowInset = EdgeInsets(top: 3, leading: todayBar + 3, bottom: 3, trailing: 3)

/// 一覧's pinned heading (/design's DayRowsTable): a column per member,
/// their face, and their name while few.
struct GroupDayHeader: View {
  @Environment(\.themeColors) private var colors
  let members: [GroupMember]
  let groupID: String

  var body: some View {
    let density = DayRowsDensity(members: members.count)
    HStack(spacing: 0) {
      Color.clear.frame(width: dateWidth, height: 1)
      ForEach(members) { member in
        HStack(spacing: 4) {
          MemberAvatar(
            name: member.name, photoID: member.photoID, groupID: groupID, size: 24,
            userID: member.userID)
          if density == .names {
            Text(member.name)
              .font(.footnote.weight(.semibold))
              .foregroundStyle(colors.textPrimary)
              .lineLimit(1)
          }
        }
        .padding(.horizontal, 4)
        .frame(maxWidth: density.columnWidth == nil ? .infinity : nil)
        .frame(width: density.columnWidth)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(member.name)
      }
    }
    .padding(.vertical, 8)
    .overlay(alignment: .bottom) {
      Rectangle().fill(colors.separator).frame(height: 1)
    }
  }
}

/// A day of 一覧, a row across everyone (/design's DayRow): its date and
/// weekday, today barred in the accent, then each member's mark, named
/// while few. A day off is on its tile; a day everyone is off one band
/// along the row, date and all, and the picked day framed the same way.
/// The whole row picks the day.
struct GroupDayRow: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  let day: Day
  let members: [GroupMember]
  let picked: Bool
  let onPick: (Day) -> Void

  var body: some View {
    let density = DayRowsDensity(members: members.count)
    let entries = members.map { $0.calendar.shown(from: day, through: day)[day] }
    let patterns = zip(members, entries).map { member, entry in
      entry.flatMap { member.calendar.patternsByID[$0.shift] }
    }
    let offs: [Bool?] = patterns.map { $0?.countsAsOff }
    let together = members.count > 1 && Together.allOff(offs)
    let isToday = day == Day.today
    Button {
      onPick(day)
    } label: {
      HStack(spacing: 0) {
        date()
        ForEach(Array(members.enumerated()), id: \.element.id) { index, member in
          cell(
            patterns[index],
            change: entries[index].flatMap {
              timeChange(start: $0.start, end: $0.end, standard: patterns[index]?.time)
            },
            names: density == .names,
            tiled: patterns[index]?.countsAsOff == true && !together
          )
          .frame(maxWidth: density.columnWidth == nil ? .infinity : nil)
          .frame(width: density.columnWidth)
          .accessibilityLabel("\(member.name)：\(patterns[index]?.name ?? "未入力")")
        }
      }
      .frame(minHeight: 36)
      // みんな休み: the day's tiles joined along the row.
      .background {
        if together {
          RoundedRectangle(cornerRadius: Radius.sm)
            .fill(colors.accentContainer)
            .padding(rowInset)
        }
      }
      .overlay {
        if picked {
          RoundedRectangle(cornerRadius: Radius.sm)
            .strokeBorder(colors.accentDefault, lineWidth: 1.5)
            .padding(rowInset)
        }
      }
      // Today: a bar down the row's start, its whole height, as /design's
      // border; the band and frame start inside it.
      .overlay(alignment: .leading) {
        if isToday {
          Rectangle().fill(colors.accentDefault).frame(width: todayBar)
        }
      }
      .overlay(alignment: .bottom) {
        Rectangle().fill(colors.separator).frame(height: 1)
      }
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityElement(children: .combine)
    .accessibilityLabel(
      "\(day.monthDayText)\(together ? "、みんな休み" : "")")
    .accessibilityAddTraits(picked ? .isSelected : [])
  }

  private func date() -> some View {
    let week = settings.device.week
    let holiday = week.holiday && day.holidayName != nil
    let tone: Color =
      switch day.weekday {
      case _ where day == Day.today: colors.accentDefault
      case 0 where week.sunday: colors.calendarHoliday
      case 6 where week.saturday: colors.calendarSaturday
      default: holiday ? colors.calendarHoliday : colors.textPrimary
      }
    return HStack(alignment: .firstTextBaseline, spacing: 3) {
      Text("\(day.day)")
        .font(.system(size: 12, weight: day == Day.today ? .heavy : .semibold))
      Text(day.weekdayName)
        .font(.system(size: 9))
    }
    .foregroundStyle(tone)
    .padding(.leading, 12)
    .frame(width: dateWidth, alignment: .leading)
  }

  private func cell(_ pattern: Pattern?, change: TimeChange?, names: Bool, tiled: Bool)
    -> some View
  {
    Group {
      if let pattern {
        HStack(spacing: 4) {
          ShiftMark(pattern: pattern, size: 16, change: change)
          if names {
            Text(pattern.name)
              .font(.system(size: 11))
              .foregroundStyle(colors.textPrimary)
              .lineLimit(1)
          }
        }
      } else {
        Text(names ? "未入力" : "・")
          .font(.system(size: 10))
          .foregroundStyle(colors.textDisabled)
      }
    }
    .padding(.horizontal, 4)
    .frame(maxWidth: .infinity, minHeight: 36)
    .background {
      if tiled {
        RoundedRectangle(cornerRadius: Radius.sm)
          .fill(colors.accentContainer)
          .padding(3)
      }
    }
  }
}
