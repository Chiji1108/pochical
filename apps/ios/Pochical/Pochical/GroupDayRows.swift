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

/// The page's margin left of a big group's pinned dates.
let pinnedMargin: CGFloat = 16

/// A row of 一覧 across a big group: the date and every member's column.
func dayRowsWidth(members: Int, english: Bool) -> CGFloat {
  (english ? englishDateWidth : dateWidth) + CGFloat(members) * (DayRowsDensity.scroll.columnWidth ?? 0)
}

/// The width of a day's date at the start of its row.
private let dateWidth: CGFloat = 46
private let englishDateWidth: CGFloat = 56

/// Today's bar at a row's start, where every row keeps the room for it.
private let todayBar: CGFloat = 3

/// How far in a row's band and frame are: clear of today's bar, and of
/// the row's lines.
private let rowInset = EdgeInsets(top: 3, leading: todayBar + 3, bottom: 3, trailing: 3)

/// 一覧's pinned heading (/design's DayRowsTable): a column per member,
/// their face, and their name while few.
struct GroupDayHeader: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  let members: [GroupMember]
  let groupID: String
  /// The rows scrolled sideways this far, a big group's: the first face
  /// (the viewer's) stays over its pinned column, the others follow the
  /// rows. Nil while everyone fits.
  var scrollX: CGFloat?

  var body: some View {
    if let scrollX {
      HStack(spacing: 0) {
        Color.clear.frame(width: english ? englishDateWidth : dateWidth, height: 1)
        if let first = members.first {
          face(first)
            .overlay(alignment: .trailing) {
              if scrollX > 0 {
                Rectangle().fill(colors.separator).frame(width: 1)
              }
            }
        }
        // Laid over the room left, so a long row of faces never widens
        // the page; it moves with the rows under it.
        Color.clear
          .frame(maxWidth: .infinity)
          .frame(height: 24)
          .overlay(alignment: .leading) {
            HStack(spacing: 0) {
              ForEach(members.dropFirst()) { face($0) }
            }
            .fixedSize()
            .offset(x: -scrollX)
          }
          .clipped()
      }
      .padding(.vertical, 8)
      .overlay(alignment: .bottom) {
        Rectangle().fill(colors.separator).frame(height: 1)
      }
    } else {
      fitting
    }
  }

  private func face(_ member: GroupMember) -> some View {
    MemberAvatar(
      name: member.name, photoID: member.photoID, groupID: groupID, size: 24,
      userID: member.userID)
      .opensLegend(of: member)
      .padding(.horizontal, 4)
      .frame(width: DayRowsDensity.scroll.columnWidth)
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(member.name)
  }

  private var fitting: some View {
    let density = DayRowsDensity(members: members.count)
    return HStack(spacing: 0) {
      // Over the rows' dates, as wide as theirs.
      Color.clear.frame(width: english ? englishDateWidth : dateWidth, height: 1)
      ForEach(members) { member in
        HStack(spacing: 4) {
          MemberAvatar(
            name: member.name, photoID: member.photoID, groupID: groupID, size: 24,
            userID: member.userID)
          .opensLegend(of: member)
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
  @Environment(\.english) private var english
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  let day: Day
  let members: [GroupMember]
  let picked: Bool
  let onPick: (Day) -> Void
  /// A big group's table scrolled sideways this far: the date and the
  /// first member's column (the viewer's own) stay at the left, over the
  /// others. Nil while everyone fits.
  var pinX: CGFloat?

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
      let column = { (index: Int) in
        cell(
          patterns[index],
          change: entries[index].flatMap {
            timeChange(start: $0.start, end: $0.end, standard: patterns[index]?.time)
          },
          names: density == .names,
          tiled: patterns[index]?.countsAsOff == true && !together
        )
        .marks(drawnAs: members[index].markLook)
        .frame(maxWidth: density.columnWidth == nil ? .infinity : nil)
        .frame(width: density.columnWidth)
        .accessibilityLabel("\(members[index].name)：\(patterns[index]?.name ?? "未入力")")
      }
      HStack(spacing: 0) {
        if let pinX {
          // The date and the viewer's own column, kept at the left on the
          // page's ground as the others pass under them; the day's band
          // and today's bar go with them.
          HStack(spacing: 0) {
            date()
            if !members.isEmpty { column(0) }
          }
          .background {
            if together {
              UnevenRoundedRectangle(
                topLeadingRadius: Radius.sm, bottomLeadingRadius: Radius.sm, style: .continuous
              )
              .fill(colors.accentContainer)
              .padding(.vertical, rowInset.top)
              .padding(.leading, rowInset.leading)
            }
          }
          // The page's ground, out over its margin too, so nothing passing
          // under shows beside the dates.
          .background(colors.backgroundBase.padding(.leading, -pinnedMargin))
          .overlay(alignment: .leading) {
            if isToday {
              Rectangle().fill(colors.accentDefault).frame(width: todayBar)
            }
          }
          // An edge beside them only while others pass under.
          .overlay(alignment: .trailing) {
            if pinX > 0 {
              Rectangle().fill(colors.separator).frame(width: 1)
            }
          }
          .offset(x: pinX)
          .zIndex(1)
          ForEach(1..<max(members.count, 1), id: \.self) { index in
            column(index)
          }
        } else {
          date()
          ForEach(members.indices, id: \.self) { index in
            column(index)
          }
        }
      }
      .frame(minHeight: 36)
      // みんな休み: the day's tiles joined along the row.
      .background {
        if together {
          RoundedRectangle(cornerRadius: Radius.sm)
            .fill(colors.accentContainer)
            .padding(rowInset)
            // Scrolled sideways, from the pinned date on.
            .padding(.leading, pinX ?? 0)
        }
      }
      .overlay {
        if picked {
          RoundedRectangle(cornerRadius: Radius.sm)
            .strokeBorder(colors.accentDefault, lineWidth: 1.5)
            .padding(rowInset)
            .padding(.leading, pinX ?? 0)
        }
      }
      // Today: a bar down the row's start, its whole height, as /design's
      // border; the band and frame start inside it. Pinned, the pinned
      // columns draw it.
      .overlay(alignment: .leading) {
        if isToday, pinX == nil {
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
      Text(day.weekdayName(english: english))
        .font(.system(size: 9))
    }
    .foregroundStyle(tone)
    .padding(.leading, 12)
    // Thu takes more room than 木.
    .frame(width: english ? englishDateWidth : dateWidth, alignment: .leading)
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
