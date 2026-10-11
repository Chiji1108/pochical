import PochicalDesign
import PochicalKit
import SwiftUI

// みんなのシフト's シフトパターン (/design's LegendSheet): what each member's
// marks mean.

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
  /// The chip scrolled to as the sheet opens.
  @State private var chipInSight: String?

  var body: some View {
    let member = members.first { $0.userID == picked } ?? members.first
    NavigationStack {
      List {
        Section {
          if let member {
            ForEach(legendPatterns(of: member)) { pattern in
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
          }
        }
      }
      // The chips stay in reach over the list, on the bar's own ground,
      // however long one person's patterns run.
      .safeAreaBar(edge: .top) {
        ScrollView(.horizontal) {
          HStack(spacing: 8) {
            ForEach(members) { candidate in
              ChoiceChip(name: candidate.name, picked: candidate.userID == member?.userID) {
                picked = candidate.userID
              } leading: {
                MemberAvatar(
                  name: candidate.name, photoID: candidate.photoID, groupID: groupID,
                  size: 24, userID: candidate.userID)
              }
              .id(candidate.userID)
            }
          }
          // From the list's card's edge.
          .padding(.horizontal, 20)
          .scrollTargetLayout()
        }
        .scrollIndicators(.hidden)
        // Opened on someone far along the row, it starts with them in
        // sight.
        .defaultScrollAnchor(.leading)
        .scrollPosition(id: $chipInSight, anchor: .center)
        .onAppear { chipInSight = picked }
        .padding(.bottom, 8)
      }
      .overlay {
        if member?.calendar.patternsByID.isEmpty == true {
          ContentUnavailableView("シフトパターンはまだありません", systemImage: "square.dashed")
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
