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

/// How a big group's 一覧 sits sideways: everyone fits, or its columns
/// scroll, the date and the viewer's own column pinned at the left, an
/// edge beside them while others pass under.
enum Sideways: Equatable {
  case fits
  case scrolls(edged: Bool)
}

extension View {
  /// Kept at the left of a sideways scroll view, its margin clear, as
  /// what is after it scrolls under; a view at the content's leading
  /// edge. Moved in drawing, as the scroll view's offset changes, so
  /// nothing is laid out again; at the left edge's bounce it goes with
  /// the rest.
  func pinnedSideways() -> some View {
    visualEffect { content, proxy in
      content.offset(
        x: max(pinnedMargin - proxy.frame(in: .scrollView(axis: .horizontal)).minX, 0))
    }
  }
}

/// How far a big group's 一覧 is scrolled sideways, read by its faces
/// alone: they sit over the scroll view, outside it, so they follow it as
/// it moves, and nothing else is made again with each frame of a scroll.
@Observable final class SidewaysOffset {
  var x: CGFloat = 0
}

/// 一覧's heading (/design's DayRowsTable): a column per member, their
/// face, and their name while few. A big group's follows the rows under
/// it as they scroll sideways: the viewer's face kept over their pinned
/// column, the others moving with theirs, past either edge too.
struct GroupDayHeader: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.english) private var english
  let members: [GroupMember]
  let groupID: String
  /// How far the rows are scrolled sideways; nil while everyone fits.
  var offset: SidewaysOffset?

  var body: some View {
    let density = DayRowsDensity(members: members.count)
    HStack(spacing: 0) {
      if let offset {
        HStack(spacing: 0) {
          dateRoom
          if let first = members.first { face(first, density: density) }
        }
        .modifier(FollowsRows(offset: offset, pinned: true))
        .zIndex(1)
        // Laid over the room left, so a long row of faces never widens
        // the page.
        Color.clear
          .frame(maxWidth: .infinity)
          .frame(height: 24)
          .overlay(alignment: .leading) {
            HStack(spacing: 0) {
              ForEach(members.dropFirst()) { face($0, density: density) }
            }
            .fixedSize()
            .modifier(FollowsRows(offset: offset, pinned: false))
          }
          .clipped()
      } else {
        dateRoom
        ForEach(members) { face($0, density: density) }
      }
    }
    .padding(.vertical, 8)
    .overlay(alignment: .bottom) {
      Rectangle().fill(colors.separator).frame(height: 1)
    }
  }

  /// Over the rows' dates, as wide as theirs.
  private var dateRoom: some View {
    Color.clear.frame(width: english ? englishDateWidth : dateWidth, height: 1)
  }

  private func face(_ member: GroupMember, density: DayRowsDensity) -> some View {
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

/// A part of 一覧's heading moved as the rows under it scroll sideways.
/// Pinned, the viewer's face: kept at the left, an edge beside it while
/// others pass under, and pulled right with the rows past the left edge.
private struct FollowsRows: ViewModifier {
  @Environment(\.themeColors) private var colors
  let offset: SidewaysOffset
  let pinned: Bool

  func body(content: Content) -> some View {
    let x = offset.x
    if pinned {
      content
        .overlay(alignment: .trailing) {
          if x > 0 {
            Rectangle().fill(colors.separator).frame(width: 1)
          }
        }
        .offset(x: max(-x, 0))
    } else {
      content.offset(x: -x)
    }
  }
}

/// What a group's days are drawn with beyond what they show: the テーマ's
/// colors, the marks' look, and the calendar's settings, read by the
/// screen. A row or week compares them with the rest (Equatable), so one
/// the same as before is still made again when the screen is drawn in
/// other colors (light turned dark, another テーマ) or another look.
struct DayDrawing: Equatable {
  let colors: ThemeColors
  let look: Look
  let english: Bool
  let week: DeviceSettings.Week
}

/// A day of 一覧, a row across everyone (/design's DayRow): its date and
/// weekday, today barred in the accent, then each member's mark, named
/// while few. A day off is on its tile; a day everyone is off one band
/// along the row, date and all, and the picked day framed the same way.
/// The whole row picks the day.
struct GroupDayRow: View, @MainActor Equatable {
  let day: Day
  let members: [GroupMember]
  let picked: Bool
  let onPick: Handler<Day>
  /// Scrolling sideways, the date and the first member's column (the
  /// viewer's own) stay at the left, over the others.
  var sideways = Sideways.fits
  /// Today as the row is made, so a row left as it was still moves today's
  /// mark once a new day has come and the list is made again.
  var today = Day.today
  let drawing: DayDrawing

  /// What the row shows, and how: a day the same as before is not made
  /// again as the list around it changes, the members' days read anew
  /// each time. `onPick` is the page's own, the same throughout.
  static func == (a: GroupDayRow, b: GroupDayRow) -> Bool {
    a.day == b.day && a.members == b.members && a.picked == b.picked && a.onPick === b.onPick
      && a.sideways == b.sideways && a.today == b.today && a.drawing == b.drawing
  }

  private var colors: ThemeColors { drawing.colors }
  private var english: Bool { drawing.english }

  var body: some View {
    let density = DayRowsDensity(members: members.count)
    let entries = members.map { $0.calendar.shown(from: day, through: day)[day] }
    let patterns = zip(members, entries).map { member, entry in
      entry.flatMap { member.calendar.patternsByID[$0.shift] }
    }
    let offs: [Bool?] = patterns.map { $0?.countsAsOff }
    let together = members.count > 1 && Together.allOff(offs)
    let isToday = day == today
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
        if case .scrolls(let edged) = sideways {
          // The date and the viewer's own column, kept at the left on the
          // page's ground as the others pass under them, with their part of
          // the day's band and frame and today's bar.
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
          // The frame open at its end, where the others' part goes on.
          .overlay {
            if picked {
              RoundedRectangle(cornerRadius: Radius.sm)
                .strokeBorder(colors.accentDefault, lineWidth: 1.5)
                .padding(rowInset)
                .padding(.trailing, -Radius.sm - rowInset.trailing)
            }
          }
          .clipped()
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
            if edged {
              Rectangle().fill(colors.separator).frame(width: 1)
            }
          }
          .pinnedSideways()
          .zIndex(1)
          // The others' part of the band and frame starts under the pinned
          // columns, so the two meet whole.
          HStack(spacing: 0) {
            ForEach(1..<max(members.count, 1), id: \.self) { index in
              column(index)
            }
          }
          .background {
            if together {
              UnevenRoundedRectangle(
                bottomTrailingRadius: Radius.sm, topTrailingRadius: Radius.sm, style: .continuous
              )
              .fill(colors.accentContainer)
              .padding(.vertical, rowInset.top)
              .padding(.trailing, rowInset.trailing)
              .padding(.leading, -Radius.sm)
            }
          }
          .overlay {
            if picked {
              RoundedRectangle(cornerRadius: Radius.sm)
                .strokeBorder(colors.accentDefault, lineWidth: 1.5)
                .padding(rowInset)
                .padding(.leading, -Radius.sm - rowInset.leading)
            }
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
        if together, sideways == .fits {
          RoundedRectangle(cornerRadius: Radius.sm)
            .fill(colors.accentContainer)
            .padding(rowInset)
        }
      }
      .overlay {
        if picked, sideways == .fits {
          RoundedRectangle(cornerRadius: Radius.sm)
            .strokeBorder(colors.accentDefault, lineWidth: 1.5)
            .padding(rowInset)
        }
      }
      // Today: a bar down the row's start, its whole height, as /design's
      // border; the band and frame start inside it. Pinned, the pinned
      // columns draw it.
      .overlay(alignment: .leading) {
        if isToday, sideways == .fits {
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
    let week = drawing.week
    let holiday = week.holiday && day.holidayName != nil
    let tone: Color =
      switch day.weekday {
      case _ where day == today: colors.accentDefault
      case 0 where week.sunday: colors.calendarHoliday
      case 6 where week.saturday: colors.calendarSaturday
      default: holiday ? colors.calendarHoliday : colors.textPrimary
      }
    return HStack(alignment: .firstTextBaseline, spacing: 3) {
      Text("\(day.day)")
        .font(.system(size: 12, weight: day == today ? .heavy : .semibold))
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
