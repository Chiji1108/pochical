import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

// 設定 › プロフィール (/design's ProfilePage; spec/sync-protocol.md,
// Profile): the usual name, kept with the account, which every group shows
// unless it has a name of its own. Photos come when the server keeps
// members'.

/// 設定's プロフィール row: the usual name with its letter, or 未設定.
struct ProfileRow: View {
  @Fetch(ProfileNameRequest()) private var name = ""

  var body: some View {
    NavigationLink {
      ProfilePage()
    } label: {
      LabeledContent("プロフィール") {
        if name.isEmpty {
          Text("未設定")
        } else {
          HStack(spacing: 6) {
            LetterAvatar(name: name, size: 22)
            Text(name).lineLimit(1)
          }
        }
      }
    }
  }
}

/// プロフィール: the usual name, saved a moment after typing stops.
private struct ProfilePage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  @Fetch(ProfileNameRequest()) private var saved = ""
  /// What is typed, from the saved name once it has loaded.
  @State private var name: String?
  @State private var failed = false

  var body: some View {
    List {
      Section {
        LabeledContent("いつもの名前") {
          LimitedTextField(
            placeholder: "例：さくら",
            text: Binding { name ?? saved } set: { name = $0 },
            limit: TextLimits.personName)
        }
      } footer: {
        if failed {
          Text("保存できませんでした。通信できるときに、もう一度お試しください。")
            .foregroundStyle(colors.dangerDefault)
        } else {
          Text("グループでは、この名前で表示されます。グループごとに違う名前にしたいときは、各グループの設定で変えられます。")
        }
      }
      .settingsRows()
    }
    .settingsList()
    .navigationTitle("プロフィール")
    .navigationBarTitleDisplayMode(.inline)
    // Saved once typing pauses, as the server keeps it for every device.
    .task(id: name) {
      guard let kept = unsaved else { return }
      try? await Task.sleep(for: .milliseconds(800))
      guard !Task.isCancelled else { return }
      do {
        try await groupCalls.setProfileName(kept)
        failed = false
      } catch {
        failed = !Task.isCancelled
      }
    }
    // Leaving before the pause is over still saves what was typed, past
    // the page.
    .onDisappear {
      guard let kept = unsaved else { return }
      Task { [groupCalls] in try? await groupCalls.setProfileName(kept) }
    }
  }

  /// What is typed, trimmed, when it differs from the saved name and fits.
  private var unsaved: String? {
    guard let name else { return nil }
    let kept = name.trimmingCharacters(in: .whitespacesAndNewlines)
    return kept != saved && kept.count <= TextLimits.personName ? kept : nil
  }
}
