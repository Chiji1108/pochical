import PochicalDesign
import PochicalKit
import SwiftUI

// Days put to the vote in a group chat (spec/chat.md, Polls): the card
// everyone votes on, the sheet it is settled with, and how it reads in a
// line of words.

/// A poll in a line of words: the day it was settled on, or that it is
/// open, as /design's pollSummary.
func pollSummary(_ days: [Day], decided: Day?) -> String {
  if let decided {
    return "📅 \(dayName(decided))に決定"
  }
  return "📅 日にちの投票：\(daysSummary(days).replacingOccurrences(of: "📅 ", with: ""))"
}

/// What a poll's card needs beyond its days: its votes, who may settle
/// it, and what voting and settling do.
struct PollLine {
  let votes: [DayVotes]
  let decided: Day?
  let names: [String: String]
  let meID: String?
  let canDecide: Bool
  var onVote: (Day, Bool) -> Void = { _, _ in }
  var onDecide: () -> Void = {}
}

/// Days put to the vote, as LINE's 日程調整 in a card (/design's PollCard):
/// each day with みんな休み when the shifts allow it, who can come, and
/// your 行ける. Its writer settles it with 日にちを決める; the day stays
/// marked, the rest fade, and the poll is pinned over the chat.
struct PollCard: View {
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  let days: [Day]
  let votes: [DayVotes]
  let decided: Day?
  /// Whose shifts say みんな休み.
  let members: [GroupMember]
  /// Everyone's names, those who left too, for the faces.
  let names: [String: String]
  let meID: String?
  /// 日にちを決める at its foot until settled: its writer, or anyone once
  /// they left. (決め直す is in its long-press menu.)
  let canDecide: Bool
  /// Still on its way: nothing to vote on yet.
  let waiting: Bool
  var onVote: (Day, Bool) -> Void = { _, _ in }
  var onDecide: () -> Void = {}

  var body: some View {
    let voters = Set(votes.flatMap(\.userIDs))
    VStack(spacing: 0) {
      HStack(spacing: 8) {
        Image(systemName: "calendar.badge.checkmark")
          .font(.system(size: 18))
          .foregroundStyle(colors.accentDefault)
          .accessibilityHidden(true)
        VStack(alignment: .leading, spacing: 2) {
          Text("日にちの投票").font(.subheadline.weight(.semibold))
          Text(decided.map { "\(dayName($0))に決定" } ?? "\(voters.count)人が投票")
            .font(.caption2)
            .foregroundStyle(colors.textTertiary)
        }
        Spacer(minLength: 0)
      }
      .padding(12)
      .overlay(alignment: .bottom) { Rectangle().fill(colors.separator).frame(height: 1) }
      VStack(spacing: 0) {
        ForEach(days, id: \.self) { day in
          row(day)
        }
      }
      .padding(.vertical, 4)
      if canDecide, decided == nil, !waiting {
        Button("日にちを決める", action: onDecide)
          .font(.subheadline.weight(.semibold))
          .foregroundStyle(colors.accentDefault)
          .frame(maxWidth: .infinity, minHeight: Metrics.touch)
          .overlay(alignment: .top) { Rectangle().fill(colors.separator).frame(height: 1) }
      }
    }
    .foregroundStyle(colors.textPrimary)
    // 264 where the row has room, narrower where it does not, so the time
    // beside it stays in the row.
    .frame(maxWidth: 264)
    .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.lg))
    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(colors.borderDefault, lineWidth: 1))
    .opacity(waiting ? 0.6 : 1)
  }

  private func row(_ day: Day) -> some View {
    let people = votes.voters(on: day)
    let yours = meID.map { people.contains($0) } ?? false
    let isDecided = day == decided
    return HStack(spacing: 8) {
      VStack(alignment: .leading, spacing: 0) {
        HStack(alignment: .firstTextBaseline, spacing: 2) {
          Text("\(day.month)/\(day.day)").font(.system(size: 13, weight: .semibold))
          Text(WeekdayRow.names[day.weekday]).font(.system(size: 10))
        }
        .foregroundStyle(dayTone(day))
        if together(day) {
          Text("みんな休み")
            .font(.system(size: 10, weight: .semibold))
            .foregroundStyle(colors.accentDefault)
        }
      }
      .frame(width: 60, alignment: .leading)
      Voters(day: day, people: people.map { names[$0] ?? "メンバー" })
      if isDecided {
        Label("決定", systemImage: "checkmark")
          .font(.footnote.weight(.semibold))
          .foregroundStyle(colors.accentDefault)
      } else if decided == nil {
        Button {
          onVote(day, !yours)
        } label: {
          HStack(spacing: 4) {
            if yours {
              Image(systemName: "checkmark").font(.caption.weight(.bold))
            }
            Text("行ける")
          }
          .font(.footnote.weight(.semibold))
          .foregroundStyle(yours ? colors.accentOnFill : colors.textSecondary)
          .padding(.horizontal, 12)
          .frame(height: 32)
          .background(yours ? colors.accentFill : colors.backgroundCard, in: Capsule())
          .overlay {
            if !yours {
              Capsule().strokeBorder(colors.borderStrong, lineWidth: 1)
            }
          }
        }
        .buttonStyle(.plain)
        .disabled(waiting)
        .accessibilityLabel("\(dayName(day))に行ける")
        .accessibilityAddTraits(yours ? .isSelected : [])
      }
    }
    .padding(.horizontal, 12)
    .padding(.vertical, 4)
    .frame(minHeight: 48)
    .background(isDecided ? colors.accentContainer : .clear)
    .opacity(decided != nil && !isDecided ? 0.45 : 1)
  }

  /// Everyone is off (spec/shift-patterns.md, みんな休み).
  private func together(_ day: Day) -> Bool {
    !members.isEmpty
      && Together.allOff(
        members.map { member in
          member.calendar.shown(from: day, through: day)[day]
            .flatMap { member.calendar.patternsByID[$0.shift]?.countsAsOff }
        })
  }

  private func dayTone(_ day: Day) -> Color {
    let week = settings.device.week
    let holiday = week.holiday && Holidays.name(on: day.key, in: "JP") != nil
    return switch day.weekday {
    case 0 where week.sunday: colors.calendarHoliday
    case 6 where week.saturday: colors.calendarSaturday
    default: holiday ? colors.calendarHoliday : colors.textPrimary
    }
  }
}

/// Who can come on a day, as faces; a tap lists them all by name, as a
/// reaction's list does, since the faces stop at three.
private struct Voters: View {
  @Environment(\.themeColors) private var colors
  let day: Day
  let people: [String]
  @State private var listing = false

  private static var maxFaces: Int { 3 }

  var body: some View {
    let faces = people.count > Self.maxFaces ? Array(people.prefix(Self.maxFaces - 1)) : people
    Button {
      listing = true
    } label: {
      HStack(spacing: -4) {
        ForEach(Array(faces.enumerated()), id: \.offset) { _, name in
          LetterAvatar(name: name, size: 22)
            .overlay(Circle().stroke(colors.backgroundCard, lineWidth: 1.5))
        }
        if !people.isEmpty {
          Text(people.count > faces.count ? "+\(people.count - faces.count)" : "\(people.count)人")
            .font(.caption)
            .foregroundStyle(colors.textTertiary)
            .padding(.leading, 8)
            .fixedSize()
        }
      }
      .frame(maxWidth: .infinity, alignment: .leading)
      .contentShape(.rect)
    }
    .buttonStyle(.plain)
    .disabled(people.isEmpty)
    .accessibilityLabel("\(dayName(day))に行ける人：\(people.joined(separator: "、"))")
    .popover(isPresented: $listing) {
      VStack(alignment: .leading, spacing: 8) {
        Text(dayName(day)).font(.footnote.weight(.semibold))
        ForEach(Array(people.enumerated()), id: \.offset) { _, name in
          HStack(spacing: 8) {
            LetterAvatar(name: name, size: 24)
            Text(name).font(.subheadline)
          }
        }
      }
      .padding(16)
      .presentationCompactAdaptation(.popover)
    }
  }
}

/// The day a poll settles on, picked with how many can come (/design's
/// DecidePollSheet); opened again on a settled poll, on its day.
struct DecidePollSheet: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let days: [Day]
  let votes: [DayVotes]
  let decided: Day?
  let onDecide: (Day) -> Void
  @State private var picked: Day?

  var body: some View {
    NavigationStack {
      List(days, id: \.self) { day in
        Button {
          picked = day
        } label: {
          HStack {
            Text(dayName(day)).foregroundStyle(colors.textPrimary)
            Spacer()
            Text("\(votes.voters(on: day).count)人")
              .foregroundStyle(colors.textTertiary)
            Image(systemName: "checkmark")
              .foregroundStyle(colors.accentDefault)
              .opacity(picked == day ? 1 : 0)
          }
          .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(picked == day ? .isSelected : [])
      }
      .navigationTitle(decided == nil ? "日にちを決める" : "日にちを決め直す")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
        ToolbarItem(placement: .confirmationAction) {
          Button("決める", systemImage: "checkmark", role: .confirm) {
            if let picked {
              onDecide(picked)
            }
            dismiss()
          }
          .disabled(picked == nil || picked == decided)
        }
      }
    }
    .onAppear { picked = decided }
    .presentationDetents([.medium, .large])
  }
}
