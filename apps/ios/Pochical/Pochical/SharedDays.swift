import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// Days shared in a chat with everyone's shifts (spec/chat.md, Long
// messages and shared days): the card a line of them is drawn as, how it
// reads in a line of words, and the sheet they are picked in.

/// Shared days in a line of words (a quote, the pin bar, the chat list),
/// as /design's daysSummary: 📅 10月10日(土)ほか.
func daysSummary(_ days: [Day]) -> String {
  guard let first = days.first else { return "" }
  return "📅 \(first.fullText)\(days.count > 1 ? "ほか" : "")"
}

/// A line in a line of words: its days as daysSummary, else its words
/// with its mentions as names.
func lineWords(
  _ text: String, days: [Day], poll: Bool = false, decided: Day? = nil, photo: Bool = false,
  nameOf: (String) -> String
) -> String {
  if photo { return "📷 写真" }
  if poll { return pollSummary(days, decided: decided) }
  return days.isEmpty ? plainText(text, nameOf: nameOf) : daysSummary(days)
}

/// The date's color by the week's: Sundays and holidays in red, Saturdays
/// in blue, as the person has them.
private func dateTone(_ day: Day, week: DeviceSettings.Week, colors: ThemeColors) -> Color {
  let holiday = week.holiday && day.holidayName != nil
  return switch day.weekday {
  case 0 where week.sunday: colors.calendarHoliday
  case 6 where week.saturday: colors.calendarSaturday
  default: holiday ? colors.calendarHoliday : colors.textPrimary
  }
}

/// Shared days with each person's shift (/design's DayCard). One day
/// spreads out, wrapping when the people are many; several become a small
/// table, a row a day, or a row a person when the people do not fit
/// across. Either keeps to a week of days, so a month shared does not fill
/// the chat; the rest are left to シフト表で見る under it.
struct DayCard: View {
  /// The dates' column, room for 12/28 and its weekday.
  private static var dateWidth: CGFloat { 52 }
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  let days: [Day]
  let members: [GroupMember]

  var body: some View {
    let shifts = Shifts(days: days, members: members)
    Group {
      if days.count == 1, let day = days.first {
        oneDay(day, shifts: shifts)
      } else if members.count > Chat.dayCardColumns {
        byPerson(shifts)
      } else {
        byDay(shifts)
      }
    }
    .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.lg))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(colors.borderDefault, lineWidth: 1))
  }

  // MARK: Layouts

  private func oneDay(_ day: Day, shifts: Shifts) -> some View {
    VStack(alignment: .leading, spacing: 8) {
      HStack(spacing: 8) {
        Text(day.fullText)
          .font(.caption.weight(.semibold))
          .foregroundStyle(colors.textPrimary)
        if shifts.together(day) {
          Text("みんな休み")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(colors.accentDefault)
            .padding(.horizontal, 6)
            .padding(.vertical, 2)
            .background(colors.accentContainer, in: Capsule())
        }
      }
      // The people in even columns, many wrapping onto more lines in the
      // same columns rather than widen the card.
      let columns = max(min(members.count, Chat.dayCardColumns), 1)
      VStack(alignment: .leading, spacing: 8) {
        ForEach(Array(stride(from: 0, to: members.count, by: columns)), id: \.self) { start in
          HStack(spacing: 4) {
            ForEach(members[start..<min(start + columns, members.count)]) { member in
              let pattern = shifts.pattern(of: member, on: day)
              VStack(spacing: 4) {
                LetterAvatar(name: member.name, size: 24)
                mark(pattern, size: 16)
                Text(pattern?.name ?? "未入力")
                  .font(.system(size: 9))
                  .foregroundStyle(colors.textTertiary)
                  .lineLimit(1)
              }
              .frame(width: 44)
              .accessibilityElement(children: .ignore)
              .accessibilityLabel("\(member.name)：\(pattern?.name ?? "未入力")")
            }
          }
        }
      }
    }
    .padding(12)
    // As wide with みんな休み as without, and for any date, so shared
    // days stacked in a chat line up.
    .frame(minWidth: 184, alignment: .leading)
  }

  /// A row a day, a column a person.
  private func byDay(_ shifts: Shifts) -> some View {
    let shown = Array(days.prefix(Chat.dayCardRows))
    return VStack(alignment: .trailing, spacing: 0) {
      HStack(spacing: 4) {
        Color.clear.frame(width: Self.dateWidth, height: 1)
        ForEach(members) { member in
          LetterAvatar(name: member.name, size: 22)
            .frame(width: 26)
            .accessibilityLabel(member.name)
        }
      }
      .frame(minHeight: 30)
      ForEach(shown, id: \.self) { day in
        HStack(spacing: 4) {
          HStack(alignment: .firstTextBaseline, spacing: 2) {
            Text(day.slashText).font(.system(size: 11, weight: .semibold))
            Text(day.weekdayName).font(.system(size: 9))
          }
          .foregroundStyle(dateTone(day, week: settings.device.week, colors: colors))
          .lineLimit(1)
          .fixedSize()
          .padding(.leading, 4)
          .frame(width: Self.dateWidth, alignment: .leading)
          ForEach(members) { member in
            cell(shifts.pattern(of: member, on: day))
              .frame(width: 26)
              .accessibilityLabel(
                "\(member.name)：\(shifts.pattern(of: member, on: day)?.name ?? "未入力")")
          }
        }
        .frame(minHeight: 28)
        .background(
          shifts.together(day) ? colors.accentContainer : .clear,
          in: RoundedRectangle(cornerRadius: Radius.sm)
        )
        .accessibilityElement(children: .combine)
      }
      rest(days.count - shown.count)
    }
    .padding(8)
  }

  /// A row a person, a column a day: the people cannot be fewer, but the
  /// days can.
  private func byPerson(_ shifts: Shifts) -> some View {
    let shown = Array(days.prefix(Chat.dayCardColumns))
    return VStack(alignment: .trailing, spacing: 0) {
      HStack(spacing: 4) {
        // As in the shift table, the month once in the corner and the
        // days by number, with a new month's where it turns.
        Text(shown.first?.monthText ?? "")
          .font(.system(size: 9))
          .foregroundStyle(colors.textTertiary)
          .frame(width: 26)
        ForEach(Array(shown.enumerated()), id: \.element) { index, day in
          let turns = index > 0 && day.month != shown[index - 1].month
          VStack(spacing: 0) {
            Text(turns ? day.slashText : "\(day.day)")
              .font(.system(size: 11, weight: .semibold))
            Text(day.weekdayName).font(.system(size: 9))
          }
          .foregroundStyle(dateTone(day, week: settings.device.week, colors: colors))
          .padding(.vertical, 2)
          .frame(width: 28)
          .background(
            shifts.together(day) ? colors.accentContainer : .clear,
            in: RoundedRectangle(cornerRadius: Radius.sm))
        }
      }
      .frame(minHeight: 30)
      ForEach(members) { member in
        HStack(spacing: 4) {
          LetterAvatar(name: member.name, size: 22)
            .frame(width: 26)
            .accessibilityLabel(member.name)
          ForEach(shown, id: \.self) { day in
            cell(shifts.pattern(of: member, on: day))
              .frame(width: 28)
              .accessibilityLabel(
                "\(day.fullText)：\(shifts.pattern(of: member, on: day)?.name ?? "未入力")")
          }
        }
        .frame(minHeight: 28)
        .accessibilityElement(children: .combine)
      }
      rest(days.count - shown.count)
    }
    .padding(8)
  }

  // MARK: Parts

  /// A person's shift on a day in a table, on the tile's color when off.
  private func cell(_ pattern: Pattern?) -> some View {
    mark(pattern, size: 15)
      .frame(maxWidth: .infinity, minHeight: 24)
      .background(
        pattern?.countsAsOff == true ? colors.accentContainer : .clear,
        in: RoundedRectangle(cornerRadius: Radius.sm))
  }

  @ViewBuilder private func mark(_ pattern: Pattern?, size: CGFloat) -> some View {
    if let pattern {
      ShiftMark(pattern: pattern, size: size)
    } else {
      Color.clear.frame(width: size, height: size)
    }
  }

  @ViewBuilder private func rest(_ count: Int) -> some View {
    if count > 0 {
      Text("ほか\(count)日")
        .font(.caption2)
        .foregroundStyle(colors.textTertiary)
        .padding(.top, 4)
        .padding(.horizontal, 4)
    }
  }
}

/// Each person's shifts over the shared days, worked out once for a card.
private struct Shifts {
  private let shown: [String: [Day: DayEntry]]
  private let members: [GroupMember]

  init(days: [Day], members: [GroupMember]) {
    self.members = members
    guard let first = days.first, let last = days.last else {
      shown = [:]
      return
    }
    shown = Dictionary(
      members.map { ($0.userID, $0.calendar.shown(from: first, through: last)) },
      uniquingKeysWith: { first, _ in first })
  }

  func pattern(of member: GroupMember, on day: Day) -> Pattern? {
    shown[member.userID]?[day].flatMap { member.calendar.patternsByID[$0.shift] }
  }

  /// Everyone is off (spec/shift-patterns.md, みんな休み).
  func together(_ day: Day) -> Bool {
    !members.isEmpty && Together.allOff(members.map { pattern(of: $0, on: day)?.countsAsOff })
  }
}

/// The days to share, picked (/design's DaySheet): days everyone is off
/// in the next weeks offered first, then a month to pick any from. ✓ sends
/// them as a line of their own with everyone's shifts.
struct ShareDaysSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  @Environment(\.dismiss) private var dismiss
  @Fetch private var members: [GroupMember] = []
  let groupID: String
  /// Who the card shows: everyone, or the two of a one-to-one chat.
  let people: Set<String>?
  /// 共有 | 投票 at its top: in the group chat, not a one-to-one chat.
  let pollable: Bool
  /// Sends the days, shared, or put to the vote.
  let onSend: ([Day], Bool) -> Void
  /// On 投票: the days are put to the vote instead.
  @State private var poll = false
  @State private var month = Day.today.firstOfMonth
  @State private var picked: [Day] = []
  @State private var notice: String?
  /// How many notices have been said, so only the latest one's time takes
  /// it away.
  @State private var notices = 0

  /// The fewest days a poll puts to the vote.
  private static var pollLeast: Int { 2 }

  /// How far ahead the days everyone is off are offered.
  private static var suggestionDays: Int { 45 }

  var body: some View {
    let today = Day.today
    let shown = members.filter { people?.contains($0.userID) ?? true }
    let offs = shown.map { $0.offDays(from: min(month, today), through: suggestionEnd) }
    let together = Set(
      Together.days(offs, from: min(month, today), through: suggestionEnd).days)
    NavigationStack {
      ScrollView {
        VStack(alignment: .leading, spacing: 16) {
          if pollable {
            Picker("日にちをどうするか", selection: $poll) {
              Text("共有").tag(false)
              Text("投票").tag(true)
            }
            .pickerStyle(.segmented)
          }
          suggestions(together.filter { $0 >= today }.sorted())
          monthGrid(together: together, today: today)
          note
        }
        .padding(16)
      }
      .navigationTitle(poll ? "日にちの投票" : "日にちを共有")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("送る", systemImage: "checkmark", role: .confirm) {
            onSend(picked, poll)
            dismiss()
          }
          .disabled(picked.count < (poll ? Self.pollLeast : 1))
        }
      }
      .overlay(alignment: .top) {
        if let notice {
          NoticeCapsule(words: notice)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
      }
    }
    .task(id: month) {
      _ = try? await $members.load(
        GroupMembersRequest(
          groupID: groupID, from: min(month, today),
          through: max(month.addingMonths(1).adding(days: -1), suggestionEnd)))
    }
  }

  private var suggestionEnd: Day {
    max(Day.today.adding(days: Self.suggestionDays - 1), month.addingMonths(1).adding(days: -1))
  }

  // MARK: Parts

  /// The days everyone is off in the next weeks, one tap each.
  @ViewBuilder private func suggestions(_ days: [Day]) -> some View {
    if !days.isEmpty {
      VStack(alignment: .leading, spacing: 8) {
        Text("みんな休み")
          .font(.caption.weight(.semibold))
          .foregroundStyle(colors.textSecondary)
        ScrollView(.horizontal, showsIndicators: false) {
          HStack(spacing: 8) {
            ForEach(days.filter { $0.days(since: Day.today) < Self.suggestionDays }, id: \.self) {
              day in
              let on = picked.contains(day)
              Button {
                toggle(day)
              } label: {
                HStack(alignment: .firstTextBaseline, spacing: 2) {
                  Text(day.slashText).font(.subheadline.weight(.semibold))
                  Text(day.weekdayName).font(.caption2)
                }
                .foregroundStyle(on ? colors.accentOnFill : colors.accentDefault)
                .padding(.horizontal, 12)
                .frame(minHeight: 36)
                .background(on ? colors.accentFill : colors.accentContainer, in: Capsule())
              }
              .buttonStyle(.plain)
              .accessibilityLabel(day.fullText)
              .accessibilityAddTraits(on ? .isSelected : [])
            }
          }
        }
        .scrollClipDisabled()
      }
    }
  }

  /// A month to pick any day from, ‹ › turning it.
  private func monthGrid(together: Set<Day>, today: Day) -> some View {
    let week = settings.device.week
    let lead = (month.weekday - week.start + 7) % 7
    let first = month.adding(days: -lead)
    return VStack(spacing: 8) {
      HStack {
        Button("前の月", systemImage: "chevron.left") { month = month.addingMonths(-1) }
          .labelStyle(.iconOnly)
          .frame(width: Metrics.touch, height: Metrics.touch)
        Spacer()
        Text(fullMonthName(month)).font(.headline)
        Spacer()
        Button("次の月", systemImage: "chevron.right") { month = month.addingMonths(1) }
          .labelStyle(.iconOnly)
          .frame(width: Metrics.touch, height: Metrics.touch)
      }
      .foregroundStyle(colors.textPrimary)
      WeekdayRow(week: week)
      // Room kept for six weeks, the most a month spans, so what is under
      // it stays put as the months turn.
      VStack(spacing: 4) {
        ForEach(0..<6, id: \.self) { row in
          HStack(spacing: 4) {
            ForEach(0..<7, id: \.self) { column in
              let day = first.adding(days: row * 7 + column)
              if day.month == month.month {
                dayButton(day, together: together.contains(day), today: today)
              } else {
                Color.clear.frame(maxWidth: .infinity, minHeight: 36)
              }
            }
          }
        }
      }
    }
  }

  private func dayButton(_ day: Day, together: Bool, today: Day) -> some View {
    let on = picked.contains(day)
    let tone = dateTone(day, week: settings.device.week, colors: colors)
    return Button {
      toggle(day)
    } label: {
      Text("\(day.day)")
        .font(.subheadline.weight(day == today ? .bold : .regular))
        .foregroundStyle(on ? colors.accentOnFill : (day == today ? colors.accentDefault : tone))
        .frame(maxWidth: .infinity, minHeight: 36)
        .background {
          RoundedRectangle(cornerRadius: Radius.md)
            .fill(on ? colors.accentFill : (together ? colors.accentContainer : .clear))
        }
        .overlay {
          if day == today, !on {
            RoundedRectangle(cornerRadius: Radius.md).strokeBorder(colors.accentBorder, lineWidth: 1)
          }
        }
        .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .accessibilityLabel("\(day.fullText)\(together ? "、みんな休み" : "")")
    .accessibilityAddTraits(on ? .isSelected : [])
  }

  /// What ✓ will do, or what the tinted days are.
  private var note: some View {
    let tinted = "うすく色のついた日は、みんな休みの日です。"
    let words =
      switch (poll, picked.count) {
      case (true, ..<Self.pollLeast): "候補の日を\(Self.pollLeast)日以上選んでください。\(tinted)"
      case (true, let count): "\(count)日の中から、みんなが行ける日を投票で決めます。"
      case (false, 0): tinted
      case (false, let count): "\(count)日分のみんなのシフトを送ります。"
      }
    return Text(words)
    .font(.footnote)
    .foregroundStyle(colors.textSecondary)
    .frame(maxWidth: .infinity, minHeight: 40, alignment: .topLeading)
  }

  /// Picks a day, or puts it back; past SHARED_DAYS_MAX it stays unpicked.
  private func toggle(_ day: Day) {
    if let at = picked.firstIndex(of: day) {
      picked.remove(at: at)
    } else if picked.count >= sharedDaysMax {
      say("一度に送れるのは\(sharedDaysMax)日までです")
    } else {
      picked.append(day)
      picked.sort()
    }
  }

  private func say(_ words: String) {
    notices += 1
    let said = notices
    withAnimation { notice = words }
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2.5))
      if notices == said {
        withAnimation { notice = nil }
      }
    }
  }
}

/// A notice over the screen for a moment, as a toast is.
struct NoticeCapsule: View {
  @Environment(\.themeColors) private var colors
  let words: String

  var body: some View {
    Text(words)
      .font(.footnote)
      .foregroundStyle(colors.inverseText)
      .padding(.horizontal, 16)
      .padding(.vertical, 10)
      .background(colors.inverseBackground, in: Capsule())
      .padding(.top, 8)
      .padding(.horizontal, 16)
      .accessibilityAddTraits(.isStaticText)
  }
}
