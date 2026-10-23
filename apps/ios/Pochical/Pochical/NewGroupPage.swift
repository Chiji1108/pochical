import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// グループを作る (/design's NewGroupPage): its name, its mark and how the
/// person is called in it. The mark follows the name until one is picked:
/// a fitting emoji, else its first letter in a color the user's other
/// groups do not use yet.
struct NewGroupPage: View {
  @Environment(\.dynamicTypeSize) private var typeSize
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @FetchAll private var groups: [GroupRow]
  /// Called with the new group's id once it is made.
  let onMade: (String) -> Void
  @State private var name = ""
  @State private var myName = ""
  /// The usual name, which the field starts with (設定 › プロフィール).
  @Fetch(ProfileNameRequest()) private var usualName = ""
  /// The mark picked by hand, which then stays as the name changes; none
  /// while the mark follows the name.
  @State private var pickedMark: GroupMarkValue?
  /// Made once for the group being made and sent with every try, so a
  /// retry after a lost answer makes no second group.
  @State private var requestID = UUID().uuidString.lowercased()
  /// The mark the group is being made with, kept while it is made: the
  /// group coming in takes its color, which the guess would then skip.
  @State private var making: GroupMarkValue?
  @State private var failed = false
  @State private var photoGone = false

  var body: some View {
    let canMake =
      !trimmed(name).isEmpty && !trimmed(myName).isEmpty && name.count <= TextLimits.groupName
      && myName.count <= TextLimits.personName
    List {
      Section {
        LabeledContent("グループ名") {
          LimitedTextField(placeholder: "例：家族", text: $name, limit: TextLimits.groupName)
        }
        PageLink {
          GroupMarkPage(name: name, mark: mark) { pickedMark = $0 }
        } label: {
          LabeledContent("アイコン") {
            GroupMarkBadge(mark: mark)
          }
        }
        LabeledContent {
          LimitedTextField(placeholder: "例：さくら", text: $myName, limit: TextLimits.personName)
        } label: {
          // Whole on a narrow screen too, the field taking what is left;
          // wrapping instead at the largest text sizes.
          Text("このグループでの名前")
            .fixedSize(horizontal: !typeSize.isAccessibilitySize, vertical: false)
        }
      } footer: {
        Text("アイコンはグループ名から自動で入ります。")
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("グループを作る")
    .navigationBarTitleDisplayMode(.inline)
    .onChange(of: usualName, initial: true) { _, usual in
      if myName.isEmpty { myName = usual }
    }
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if making != nil {
          ProgressView()
        } else {
          Button("作る", role: .confirm) { make() }
            .disabled(!canMake)
        }
      }
    }
    .alert("グループを作れませんでした", isPresented: $failed) {
      Button("OK", role: .cancel) {}
    } message: {
      Text("通信できる場所で、もう一度お試しください。")
    }
    .alert(markPhotoGoneTitle, isPresented: $photoGone) {
      Button("OK", role: .cancel) {}
    } message: {
      Text(markPhotoGoneMessage)
    }
  }

  /// The mark being made with, else the one picked, else the one the name
  /// and the user's groups give: in the first color those groups do not
  /// use yet, as /design picks a new group's.
  private var mark: GroupMarkValue {
    making ?? pickedMark
      ?? guessedMark(
        for: name, color: nextColor(groups.map(\.color), slots: colors.marks.count))
  }

  private func make() {
    let mark = mark
    making = mark
    Task {
      do {
        // A picked photo goes up first, for the group to take.
        if !mark.photoID.isEmpty {
          try await groupCalls.sendMarkPhoto(mark.photoID)
        }
        let made = try await groupCalls.create(
          name: trimmed(name), mark: mark, displayName: trimmed(myName), requestID: requestID)
        // Still making until the group has come and the page has turned
        // into メンバーを招待 (GroupsScreen), so 作る is not there to tap
        // again meanwhile.
        onMade(made)
        return
      } catch is MarkPhotoGone {
        // Back to following the name, as before a photo was picked.
        pickedMark = nil
        photoGone = true
      } catch {
        ReviewPrompt.troubled = true
        failed = true
      }
      making = nil
    }
  }
}

private func trimmed(_ text: String) -> String {
  text.trimmingCharacters(in: .whitespacesAndNewlines)
}
