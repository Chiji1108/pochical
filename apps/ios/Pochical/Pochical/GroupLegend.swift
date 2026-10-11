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
      // The chips over the list on its own ground, as a section's header,
      // so the sheet reads as one page.
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
        } header: {
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
              }
            }
            // From the card's edge, as the list's rows start.
            .padding(.horizontal, 2)
          }
          .scrollIndicators(.hidden)
          .padding(.horizontal, -20)
          .textCase(nil)
          .padding(.bottom, 8)
        }
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

/// 画像で保存 for a group (as the calendar's MonthPicturePage): the month
/// as it goes out, in the テーマ's light or dark, shared or saved to
/// Photos. The group's tables always show names and days off, so it has
/// no look of its own to pick.
struct GroupPicturePage: View {
  @Environment(Settings.self) private var settings
  @Environment(\.themeColors) private var colors
  @Environment(\.colorScheme) private var colorScheme
  @Environment(\.english) private var english
  @Environment(\.dismiss) private var dismiss
  let group: GroupRow
  let month: Day
  let members: [GroupMember]
  @State private var notice: String?
  @State private var image: UIImage?

  var body: some View {
    @Bindable var settings = settings
    let theme = settings.device.theme
    let dark = theme.isAlwaysDark || (settings.device.picture.dark ?? (colorScheme == .dark))
    NavigationStack {
      List {
        Section {
          framed(dark: dark)
            .clipShape(RoundedRectangle(cornerRadius: Radius.xxl))
            .overlay(RoundedRectangle(cornerRadius: Radius.xxl).strokeBorder(colors.separator))
            .shadow(Shadow.md)
            .accessibilityElement(children: .ignore)
            .accessibilityLabel("\(group.name)の\(month.yearMonthText)のシフトの画像")
            .overlay(alignment: .topLeading) {
              SchemeSwitch(
                shown: Binding { dark ? .dark : .light } set: {
                  settings.device.picture.dark = $0 == .dark
                },
                disabled: theme.isAlwaysDark
              )
              .offset(x: 12, y: -10)
            }
            .padding(.top, 10)
            .settingsOnPage()
        }
      }
      .settingsList()
      .navigationTitle("画像で保存")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
      .safeAreaInset(edge: .bottom) {
        PictureActions(image: image, title: "\(group.name) \(month.yearMonthText)のシフト") {
          Task { await save() }
        }
      }
      .task(id: dark) {
        let renderer = ImageRenderer(content: framed(dark: dark).frame(width: 390))
        renderer.scale = 3
        image = renderer.uiImage
      }
      .overlay(alignment: .top) {
        if let notice {
          NoticeCapsule(words: notice)
            .transition(.opacity.combined(with: .move(edge: .top)))
        }
      }
    }
  }

  private func framed(dark: Bool) -> some View {
    let scheme: ColorScheme = dark ? .dark : .light
    return GroupMonthPicture(group: group, month: month, members: members)
      .environment(settings)
      .environment(\.themeColors, settings.device.theme.colors(scheme))
      .environment(\.colorScheme, scheme)
      .environment(\.look, settings.device.look)
      .environment(\.english, english)
  }

  private func save() async {
    guard let data = image?.pngData() else { return }
    do {
      // Photos runs the change on its own queue, not the main actor's.
      try await PHPhotoLibrary.shared().performChanges { @Sendable in
        PHAssetCreationRequest.forAsset().addResource(with: .photo, data: data, options: nil)
      }
      say("写真に保存しました")
    } catch {
      ReviewPrompt.troubled = true
      say("保存できませんでした")
    }
  }

  private func say(_ words: String) {
    withAnimation { notice = words }
    Task { @MainActor in
      try? await Task.sleep(for: .seconds(2.5))
      if notice == words {
        withAnimation { notice = nil }
      }
    }
  }
}
