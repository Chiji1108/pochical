import PochicalDesign
import PochicalKit
import SwiftUI

// A group's mark (/design's GroupMark and GroupMarkPage): one emoji, one of
// the mark icons, or letters, the last two in a color of the mark palette.
// Every member sees it as it is, whatever their style for shifts.

/// A group's mark filling `size`: an emoji as it is, an icon or letters in
/// its color on that color's tint (/design's GroupIcon).
struct GroupMarkView: View {
  @Environment(\.themeColors) private var colors
  let mark: GroupMarkValue
  let size: CGFloat

  var body: some View {
    let color = colors.mark(mark.color)
    let shape = RoundedRectangle(cornerRadius: size * 0.28)
    if !mark.icon.isEmpty, let layers = MarkIcons.layers(mark.icon, filled: true, size: size * 0.62) {
      ZStack {
        shape.fill(color.tint)
        ZStack {
          ForEach(layers.indices, id: \.self) { index in
            layers[index].path.fill(color.color.opacity(layers[index].opacity))
          }
        }
        .frame(width: size * 0.62, height: size * 0.62)
      }
      .frame(width: size, height: size)
    } else if !mark.letter.isEmpty {
      Text(mark.letter)
        .font(.system(size: (size * 0.5).rounded(), weight: .bold))
        .minimumScaleFactor(0.5)
        .lineLimit(1)
        .foregroundStyle(color.color)
        .frame(width: size, height: size)
        .background(color.tint, in: shape)
    } else {
      Text(mark.emoji)
        .font(.system(size: (size * 0.6).rounded()))
        .frame(width: size, height: size)
    }
  }
}

/// A group's mark on its small rounded square, as rows show it.
struct GroupMarkBadge: View {
  @Environment(\.themeColors) private var colors
  let mark: GroupMarkValue
  var size: CGFloat = 28

  var body: some View {
    GroupMarkView(mark: mark, size: size)
      .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.sm))
      .clipShape(RoundedRectangle(cornerRadius: Radius.sm))
  }
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

/// From the name alone (/design's guessGroupMark): a fitting emoji, or
/// else its first letter in `color`.
func guessedMark(for name: String, color: Int) -> GroupMarkValue {
  if let hint = groupHints.first(where: { hint in hint.words.contains { name.contains($0) } }) {
    return GroupMarkValue(emoji: hint.emoji)
  }
  let first = name.trimmingCharacters(in: .whitespacesAndNewlines).first.map(String.init) ?? "グ"
  return GroupMarkValue(letter: first, color: color)
}

/// The kinds of mark the tabs pick from; a photo comes later.
private enum MarkKind: Hashable {
  case emoji, icon, letter
}

/// アイコン (/design's GroupMarkPage): a kind, then one of it, from rows of
/// eight by kind or from everything (ほかの…を選ぶ), and for an icon or
/// letters their color.
struct GroupMarkPage: View {
  @Environment(\.themeColors) private var colors
  let name: String
  @State var mark: GroupMarkValue
  let onPick: (GroupMarkValue) -> Void
  @State private var kind: MarkKind?
  @State private var choosingEmoji = false
  @State private var choosingIcon = false

  var body: some View {
    let shown = kind ?? kindOf(mark)
    Form {
      Section {
        VStack(spacing: 16) {
          GroupMarkView(mark: mark, size: 64)
          Picker("アイコンの種類", selection: Binding(get: { shown }, set: { kind = $0 })) {
            Text("絵文字").tag(MarkKind.emoji)
            Text("アイコン").tag(MarkKind.icon)
            Text("文字").tag(MarkKind.letter)
          }
          .pickerStyle(.segmented)
        }
        .padding(.vertical, 8)
      }
      .settingsRows()

      Section {
        switch shown {
        case .emoji:
          grid(withPicked(ReadyPatterns.groupMarkEmojis, mark.emoji), chosen: mark.emoji) { emoji in
            Text(emoji).font(.system(size: 26))
          } pick: { emoji in
            set(GroupMarkValue(emoji: emoji))
          }
          Button("ほかの絵文字を選ぶ", systemImage: "plus") { choosingEmoji = true }
        case .icon:
          grid(withPicked(ReadyPatterns.groupMarkIcons, mark.icon), chosen: mark.icon) { icon in
            GroupMarkView(mark: GroupMarkValue(icon: icon, color: mark.color), size: 32)
              .accessibilityLabel(MarkIconNames.names[icon] ?? icon)
          } pick: { icon in
            set(GroupMarkValue(icon: icon, color: mark.color))
          }
          Button("ほかのアイコンを選ぶ", systemImage: "plus") { choosingIcon = true }
        case .letter:
          LabeledContent("文字") {
            LimitedTextField(
              placeholder: firstLetter, text: letterBinding, limit: TextLimits.groupMark)
          }
        }
      }
      .settingsRows()

      // Emoji bring colors of their own.
      if shown != .emoji {
        Section("色") {
          grid(Array(colors.marks.indices), chosen: mark.color) { slot in
            Circle()
              .fill(colors.marks[slot].color)
              .frame(width: 28, height: 28)
              .accessibilityLabel(colors.marks[slot].name)
          } pick: { slot in
            if shown == .icon {
              set(GroupMarkValue(icon: mark.icon.isEmpty ? ReadyPatterns.groupMarkIcons[0] : mark.icon, color: slot))
            } else {
              set(GroupMarkValue(letter: mark.letter.isEmpty ? firstLetter : mark.letter, color: slot))
            }
          }
        }
        .settingsRows()
      }

      Section {
      } footer: {
        Text("メンバー全員に、このアイコンがそのまま表示されます。シフトの見た目のスタイルには左右されません。")
      }
    }
    .settingsList()
    .navigationTitle("アイコン")
    .navigationBarTitleDisplayMode(.inline)
    .sheet(isPresented: $choosingIcon) {
      IconPickerSheet(picked: mark.icon) { icon in
        GroupMarkView(mark: GroupMarkValue(icon: icon, color: mark.color), size: 30)
      } onPick: { icon in
        set(GroupMarkValue(icon: icon, color: mark.color))
      }
    }
    .sheet(isPresented: $choosingEmoji) {
      EmojiKeyboardSheet { emoji in
        guard isEmoji(emoji) else { return }
        set(GroupMarkValue(emoji: emoji))
      }
    }
  }

  private func set(_ picked: GroupMarkValue) {
    mark = picked
    onPick(picked)
  }

  private func kindOf(_ mark: GroupMarkValue) -> MarkKind {
    if !mark.icon.isEmpty { return .icon }
    if !mark.letter.isEmpty { return .letter }
    return .emoji
  }

  /// The name's first letter, as letters start.
  private var firstLetter: String {
    name.trimmingCharacters(in: .whitespacesAndNewlines).first.map(String.init) ?? "グ"
  }

  /// The letters, kept to groupMark characters; left empty, the name's
  /// first letter.
  private var letterBinding: Binding<String> {
    Binding {
      mark.letter
    } set: { text in
      let letters = text.trimmingCharacters(in: .whitespaces)
      set(GroupMarkValue(letter: letters.isEmpty ? firstLetter : letters, color: mark.color))
    }
  }

  /// A grid of choices, eight across, the chosen one ringed.
  private func grid<Item: Hashable>(
    _ items: [Item], chosen: Item, @ViewBuilder cell: @escaping (Item) -> some View,
    pick: @escaping (Item) -> Void
  ) -> some View {
    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 8), spacing: 6) {
      ForEach(items, id: \.self) { item in
        Button {
          pick(item)
        } label: {
          cell(item)
            .frame(width: 38, height: 38)
            .background {
              if item == chosen {
                RoundedRectangle(cornerRadius: Radius.sm)
                  .strokeBorder(colors.accentDefault, lineWidth: 2)
              }
            }
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(item == chosen ? .isSelected : [])
      }
    }
    .padding(.vertical, 4)
  }

  /// The offered ones, the one picked from all of them first when it is
  /// not among them.
  private func withPicked(_ offered: [String], _ chosen: String) -> [String] {
    offered.contains(chosen) || chosen.isEmpty ? offered : [chosen] + offered
  }
}
