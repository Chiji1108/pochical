import Photos
import PochicalDesign
import PochicalKit
import SwiftUI

// みんなのシフト's secondary pages (/design's ShiftsMenu): what each
// member's marks mean, and the month saved as a picture.

extension EnvironmentValues {
  /// Opens シフトパターン on someone, as a face in the table is pressed.
  @Entry var openLegend: ((String) -> Void)?
}

extension View {
  /// A member's face that opens their シフトパターン where the table offers
  /// it, else the face alone.
  func opensLegend(of member: GroupMember) -> some View {
    modifier(OpensLegend(userID: member.userID, name: member.name))
  }
}

private struct OpensLegend: ViewModifier {
  @Environment(\.openLegend) private var openLegend
  let userID: String
  let name: String

  func body(content: Content) -> some View {
    if let openLegend {
      Button {
        openLegend(userID)
      } label: {
        content
      }
      .buttonStyle(.plain)
      .accessibilityLabel(name)
      .accessibilityHint("シフトパターンを見る")
    } else {
      content
    }
  }
}

/// What each mark means, one person at a time in their own shape, chosen
/// by the chips over the list as 1人ずつ chooses whom to show (/design's
/// LegendSheet). It opens on the face pressed, or from the menu on the
/// first of the others.
struct LegendSheet: View {
  @Environment(\.dismiss) private var dismiss
  @Environment(\.themeColors) private var colors
  let members: [GroupMember]
  let groupID: String
  @State var picked: String

  var body: some View {
    let member = members.first { $0.userID == picked } ?? members.first
    NavigationStack {
      VStack(spacing: 0) {
        // The chips stay in reach; only the marks scroll.
        ScrollView(.horizontal) {
          HStack(spacing: 8) {
            ForEach(members) { candidate in
              ChoiceChip(name: candidate.name, picked: candidate.userID == member?.userID) {
                picked = candidate.userID
              } leading: {
                MemberAvatar(
                  name: candidate.name, photoID: candidate.photoID, groupID: groupID, size: 24,
                  userID: candidate.userID)
              }
            }
          }
          .padding(.horizontal, 16)
          .padding(.vertical, 8)
        }
        .scrollIndicators(.hidden)
        if let member {
          List(legendPatterns(of: member)) { pattern in
            LabeledContent {
              Text(pattern.time.map { hoursText($0.start, $0.end) } ?? "")
            } label: {
              Label {
                Text(pattern.name)
              } icon: {
                ShiftMark(pattern: pattern, size: 20)
              }
            }
          }
          .marks(drawnAs: member.markLook)
          .overlay {
            if member.calendar.patternsByID.isEmpty {
              ContentUnavailableView("シフトパターンはまだありません", systemImage: "square.dashed")
            }
          }
        }
      }
      .navigationTitle("シフトパターン")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark") { dismiss() }
        }
      }
    }
  }
}

/// A member's patterns in a steady order: shifts by when they start, then
/// those without hours, then days off, each by name.
func legendPatterns(of member: GroupMember) -> [Pattern] {
  member.calendar.patternsByID.values.sorted { left, right in
    let rank = { (pattern: Pattern) in pattern.countsAsOff ? 2 : pattern.time == nil ? 1 : 0 }
    if rank(left) != rank(right) { return rank(left) < rank(right) }
    let starts = (left.time?.start ?? "", right.time?.start ?? "")
    if starts.0 != starts.1 { return starts.0 < starts.1 }
    return left.name < right.name
  }
}

/// A month of a group's shifts as it goes out in a picture: the group and
/// the month, then its weeks as 週ごと draws them, and Pochical's name
/// with its icon, as the calendar's picture ends. No day is picked.
struct GroupMonthPicture: View {
  @Environment(\.english) private var english
  @Environment(\.themeColors) private var colors
  @Environment(Settings.self) private var settings
  let group: GroupRow
  let month: Day
  let members: [GroupMember]

  var body: some View {
    let weeks = monthWeeks(month, weekStart: settings.device.week.start)
    VStack(alignment: .leading, spacing: 8) {
      VStack(alignment: .leading, spacing: 2) {
        Text(group.name)
          .font(.system(size: 13))
          .foregroundStyle(colors.textSecondary)
        Text(month.monthWithYear(english: english))
          .font(.system(size: 17, weight: .semibold))
          .foregroundStyle(colors.textPrimary)
      }
      .padding(.horizontal, 4)
      GroupWeekdays()
      ForEach(weeks, id: \.self) { week in
        GroupWeek(days: week, members: members, month: month, marksToday: false)
          .padding(.vertical, 4)
          .padding(.trailing, 4)
          .background(colors.backgroundBase, in: RoundedRectangle(cornerRadius: Radius.xxl))
          .overlay(RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
      }
      HStack(spacing: 4) {
        Spacer()
        AppIconChoice.moss.image(size: 16)
        Text("ポチカル").font(.system(size: 11))
      }
      .foregroundStyle(colors.textQuaternary)
      .padding(.top, 4)
    }
    .padding(EdgeInsets(top: 16, leading: 12, bottom: 12, trailing: 12))
    .background(colors.backgroundBase)
  }
}

/// Saves a group's month to Photos as the picture above, in the light or
/// dark the screen is in; says how it went.
@MainActor func saveGroupMonth(
  _ picture: some View, say: SayAction, month: Day
) async {
  let renderer = ImageRenderer(content: picture.frame(width: 390))
  renderer.scale = 3
  guard let data = renderer.uiImage?.pngData() else { return }
  do {
    // Photos runs the change on its own queue, not the main actor's.
    try await PHPhotoLibrary.shared().performChanges { @Sendable in
      PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
    }
    say("\(month.monthText)のシフト表を写真に保存しました")
  } catch {
    ReviewPrompt.troubled = true
    say("保存できませんでした")
  }
}
