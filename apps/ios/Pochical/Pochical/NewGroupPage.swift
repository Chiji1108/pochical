import PochicalDesign
import PochicalKit
import SwiftUI

/// グループを作る (/design's NewGroupPage): its name, its mark and how the
/// person is called in it. The mark follows the name until one is picked.
/// Marks are emoji for now; /design's icons, letters and photos come when
/// the server keeps them.
struct NewGroupPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.groupCalls) private var groupCalls
  /// Called with the new group's id once it is made.
  let onMade: (String) -> Void
  @State private var name = ""
  @State private var myName = ""
  @State private var emoji = guessedEmoji(for: "")
  /// Once picked, the mark stays when the name changes afterwards.
  @State private var picked = false
  /// Made once for the group being made and sent with every try, so a
  /// retry after a lost answer makes no second group.
  @State private var requestID = UUID().uuidString.lowercased()
  @State private var making = false
  @State private var failed = false

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
          EmojiPage(emoji: emoji) { pick in
            emoji = pick
            picked = true
          }
        } label: {
          LabeledContent("アイコン") {
            Text(emoji)
              .font(.system(size: 16))
              .frame(width: 28, height: 28)
              .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.sm))
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
    .onChange(of: name) { _, name in
      if !picked {
        emoji = guessedEmoji(for: name)
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
  }

  private func make() {
    making = true
    Task {
      defer { making = false }
      do {
        let made = try await groupCalls.create(
          name: trimmed(name), emoji: emoji, displayName: trimmed(myName), requestID: requestID)
        onMade(made)
      } catch {
        failed = true
      }
    }
  }
}

private func trimmed(_ text: String) -> String {
  text.trimmingCharacters(in: .whitespacesAndNewlines)
}

/// Words in a name that suggest an emoji (/design's groupHints).
private let groupHints: [(emoji: String, words: [String])] = [
  ("🏠", ["家族", "家", "夫婦"]),
  ("🎓", ["学校", "同期", "クラス", "ゼミ"]),
  ("💼", ["職場", "会社", "仕事", "病棟"]),
  ("✈️", ["旅行", "旅"]),
  ("🍙", ["ごはん", "飲み", "ランチ"]),
  ("👭", ["友達", "友だち", "仲間"]),
]

/// The emoji the picker offers (/design's groupEmojis).
let groupEmojis = ["🏠", "👭", "🎓", "💼", "🌷", "🍙", "☕️", "✈️", "🎵", "⚽️", "🐾", "⭐️"]

/// From the name alone: a fitting emoji, else the last of the picker's,
/// where /design takes the name's first letter, a mark the server does not
/// keep yet.
private func guessedEmoji(for name: String) -> String {
  groupHints.first { hint in hint.words.contains { name.contains($0) } }?.emoji
    ?? groupEmojis[groupEmojis.count - 1]
}

/// The group's mark, picked from /design's emoji.
private struct EmojiPage: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dismiss) private var dismiss
  let emoji: String
  let onPick: (String) -> Void

  var body: some View {
    ScrollView {
      LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 4), spacing: 12)
      {
        ForEach(groupEmojis, id: \.self) { choice in
          let isPicked = choice == emoji
          Button {
            onPick(choice)
            dismiss()
          } label: {
            Text(choice)
              .font(.system(size: 28))
              .frame(maxWidth: .infinity, minHeight: 64)
              .background(colors.fillQuaternary, in: RoundedRectangle(cornerRadius: Radius.lg))
              .overlay {
                if isPicked {
                  RoundedRectangle(cornerRadius: Radius.lg)
                    .strokeBorder(colors.accentDefault, lineWidth: 2)
                }
              }
          }
          .buttonStyle(.plain)
          .accessibilityAddTraits(isPicked ? .isSelected : [])
        }
      }
      .padding(16)
    }
    .background(colors.backgroundBase)
    .navigationTitle("アイコン")
    .navigationBarTitleDisplayMode(.inline)
  }
}
