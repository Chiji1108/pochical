import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

/// グループを作る (/design's NewGroupPage): its name, its mark and how the
/// person is called in it. The mark follows the name until one is picked:
/// a fitting emoji, else its first letter in a color the user's other
/// groups do not use yet.
struct NewGroupPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @FetchAll private var groups: [GroupRow]
  /// Called with the new group's id once it is made.
  let onMade: (String) -> Void
  @State private var name = ""
  @State private var myName = ""
  /// The usual name, which the field starts with (設定 › プロフィール).
  @Fetch(ProfileNameRequest()) private var usualName = ""
  @State private var mark = guessedMark(for: "", color: 0)
  /// Once picked, the mark stays when the name changes afterwards.
  @State private var picked = false
  /// Made once for the group being made and sent with every try, so a
  /// retry after a lost answer makes no second group.
  @State private var requestID = UUID().uuidString.lowercased()
  @State private var making = false
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
        NavigationLink {
          GroupMarkPage(name: name, mark: mark) { pick in
            mark = pick
            picked = true
          }
        } label: {
          LabeledContent("アイコン") {
            GroupMarkBadge(mark: mark)
          }
        }
        LabeledContent("このグループでの名前") {
          LimitedTextField(placeholder: "例：さくら", text: $myName, limit: TextLimits.personName)
        }
      } footer: {
        Text("アイコンはグループ名から自動で入ります。")
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("グループを作る")
    .navigationBarTitleDisplayMode(.inline)
    .toolbarVisibility(.visible, for: .navigationBar)
    .onChange(of: usualName, initial: true) { _, usual in
      if myName.isEmpty { myName = usual }
    }
    .onChange(of: name, initial: true) { _, name in
      if !picked {
        mark = guessedMark(for: name, color: nextColor)
      }
    }
    .toolbar {
      ToolbarItem(placement: .confirmationAction) {
        if making {
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

  /// The first color the user's groups do not use yet, as /design picks a
  /// new group's.
  private var nextColor: Int {
    let used = Set(groups.map(\.color))
    return colors.marks.indices.first { !used.contains($0) } ?? groups.count % colors.marks.count
  }

  private func make() {
    making = true
    Task {
      defer { making = false }
      do {
        // A picked photo goes up first, for the group to take.
        if !mark.photoID.isEmpty {
          try await groupCalls.sendMarkPhoto(mark.photoID)
        }
        let made = try await groupCalls.create(
          name: trimmed(name), mark: mark, displayName: trimmed(myName), requestID: requestID)
        onMade(made)
      } catch is MarkPhotoGone {
        // Back to following the name, as before a photo was picked.
        picked = false
        mark = guessedMark(for: name, color: nextColor)
        photoGone = true
      } catch {
        ReviewPrompt.troubled = true
        failed = true
      }
    }
  }
}

private func trimmed(_ text: String) -> String {
  text.trimmingCharacters(in: .whitespacesAndNewlines)
}
