import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// 設定 › プロフィール (/design's ProfilePage; spec/sync-protocol.md,
// Profile): the usual name and photo, kept with the account, which every
// group shows unless it has its own.

/// 設定's プロフィール row: the usual face and name, or 未設定.
struct ProfileRow: View {
  @Fetch(UsualProfileRequest()) private var usual = UsualProfile()

  var body: some View {
    NavigationLink {
      ProfilePage()
    } label: {
      LabeledContent("プロフィール") {
        if usual.name.isEmpty {
          Text("未設定")
        } else {
          HStack(spacing: 6) {
            MemberAvatar(
              name: usual.name, photoID: usual.photoID, groupID: ChatPhotos.mine, size: 22,
              me: true)
            Text(usual.name).lineLimit(1)
          }
        }
      }
    }
  }
}

/// プロフィール: the usual photo, saved as it is picked, and the usual
/// name, saved as the field is left (or the page, or the app), so no name
/// half typed or still being converted reaches the groups.
private struct ProfilePage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Environment(\.scenePhase) private var scenePhase
  @Fetch(UsualProfileRequest()) private var saved = UsualProfile()
  /// What is typed, from the saved name once it has loaded.
  @State private var name: String?
  @State private var failed = false

  var body: some View {
    List {
      Section {
        PhotoEditor(
          name: name ?? saved.name, photoID: saved.photoID, groupID: ChatPhotos.mine
        ) { jpeg in
          await save {
            let photoID = try await groupCalls.sendPhoto(jpeg, to: ChatPhotos.mine)
            try await groupCalls.setProfile(UsualProfile(name: shownName, photoID: photoID))
          }
        } onRemove: {
          await save {
            try await groupCalls.setProfile(UsualProfile(name: shownName))
          }
        }
        .settingsOnPage()
      }

      Section {
        LabeledContent("いつもの名前") {
          LimitedTextField(
            placeholder: "例：さくら",
            text: Binding { name ?? saved.name } set: { name = $0 },
            limit: TextLimits.personName, onEndEditing: saveName)
        }
      } footer: {
        if failed {
          Text("保存できませんでした。通信できるときに、もう一度お試しください。")
            .foregroundStyle(colors.dangerDefault)
        } else {
          Text("グループでは、この名前と写真で表示されます。グループごとに違う名前や写真にしたいときは、各グループの設定で変えられます。")
        }
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("プロフィール")
    .navigationBarTitleDisplayMode(.inline)
    .onDisappear(perform: saveName)
    .onChange(of: scenePhase) { _, phase in
      if phase != .active { saveName() }
    }
  }

  /// Saves what is typed, when it differs from the saved name.
  private func saveName() {
    guard let kept = unsaved else { return }
    let profile = UsualProfile(name: kept, photoID: saved.photoID)
    Task { await save { try await groupCalls.setProfile(profile) } }
  }

  /// The name as it will be kept: what is typed, else the saved one.
  private var shownName: String {
    unsaved ?? saved.name
  }

  /// What is typed, trimmed, when it differs from the saved name and fits.
  private var unsaved: String? {
    guard let name else { return nil }
    let kept = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return kept != saved.name && kept.count <= TextLimits.personName ? kept : nil
  }

  /// Saves, saying so under the name if it could not.
  private func save(_ saving: () async throws -> Void) async {
    do {
      try await saving()
      failed = false
    } catch {
      failed = !Task.isCancelled
    }
  }
}
