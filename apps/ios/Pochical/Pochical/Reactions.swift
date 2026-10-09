import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

/// The emoji a line's menu offers first (/design's reactionChoices).
let reactionChoices = ["👍", "❤️", "😂", "👀", "🙏", "🎉"]

/// A line's reactions under its bubble, wrapping to more rows as needed.
struct ReactionRow: View {
  let reactions: [LineReaction]
  let meID: String?
  let nameOf: (String) -> String
  /// In a chat of two, who chose it needs no face: the emoji alone, and
  /// how many once both did.
  var counted = false
  let onReact: (String) -> Void

  var body: some View {
    WrappingRow(spacing: 4) {
      ForEach(reactions, id: \.emoji) { reaction in
        ReactionPill(
          reaction: reaction, mine: reaction.userIDs.contains(meID ?? ""), nameOf: nameOf,
          counted: counted
        ) {
          onReact(reaction.emoji)
        }
      }
    }
  }
}

/// A reaction: the emoji and the faces of who chose it, past a handful two
/// and +N (/design's ReactionPill). A tap puts yours on or takes it back;
/// a long press lists everyone who chose it.
private struct ReactionPill: View {
  @Environment(\.themeColors) private var colors
  let reaction: LineReaction
  let mine: Bool
  let nameOf: (String) -> String
  @Environment(\.memberFaces) private var photos
  var counted = false
  let onToggle: () -> Void

  private static var mostFaces: Int { 3 }

  var body: some View {
    let crowded = reaction.userIDs.count > Self.mostFaces
    let faces = crowded ? Array(reaction.userIDs.prefix(Self.mostFaces - 1)) : reaction.userIDs
    let names = reaction.userIDs.map(nameOf)
    Button(action: onToggle) {
      HStack(spacing: 4) {
        Text(reaction.emoji).font(.subheadline)
        if counted {
          if reaction.userIDs.count > 1 {
            Text("\(reaction.userIDs.count)")
              .font(.caption)
              .foregroundStyle(colors.textSecondary)
          }
        } else {
          HStack(spacing: -2) {
            ForEach(faces, id: \.self) { id in
              MemberAvatar(name: nameOf(id), photoID: photos[id] ?? "", size: 18, userID: id)
                .overlay(
                  Circle().strokeBorder(mine ? colors.accentContainer : colors.backgroundCard))
            }
          }
        }
        if crowded && !counted {
          Text("+\(reaction.userIDs.count - faces.count)")
            .font(.caption)
            .foregroundStyle(colors.textTertiary)
            .padding(.trailing, 2)
        }
      }
      .padding(.leading, 8)
      .padding(.trailing, counted ? 8 : 3)
      .frame(height: 24)
      .background(mine ? colors.accentContainer : colors.backgroundCard, in: Capsule())
      .overlay(Capsule().strokeBorder(mine ? colors.accentDefault : colors.borderDefault))
    }
    .buttonStyle(.plain)
    .contextMenu {
      Section("\(reaction.emoji)を付けた人") {
        ForEach(names.indices, id: \.self) { index in
          Text(names[index])
        }
      }
    }
    .accessibilityLabel("\(reaction.emoji) \(names.joined(separator: "、"))")
    .accessibilityAddTraits(mine ? .isSelected : [])
  }
}

/// Views side by side, starting a new row when one would not fit.
struct WrappingRow: Layout {
  let spacing: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let rows = arrange(subviews, width: proposal.width ?? .infinity)
    let width =
      rows.map { row in row.reduce(0) { $0 + $1.width } + spacing * CGFloat(row.count - 1) }
      .max() ?? 0
    let height =
      rows.reduce(0) { $0 + ($1.map(\.height).max() ?? 0) } + spacing
      * CGFloat(max(rows.count - 1, 0))
    return CGSize(width: width, height: height)
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    var y = bounds.minY
    var index = 0
    for row in arrange(subviews, width: bounds.width) {
      var x = bounds.minX
      for size in row {
        subviews[index].place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(size))
        x += size.width + spacing
        index += 1
      }
      y += (row.map(\.height).max() ?? 0) + spacing
    }
  }

  private func arrange(_ subviews: Subviews, width: CGFloat) -> [[CGSize]] {
    var rows: [[CGSize]] = [[]]
    var used: CGFloat = 0
    for subview in subviews {
      let size = subview.sizeThatFits(.unspecified)
      if !rows[rows.count - 1].isEmpty, used + spacing + size.width > width {
        rows.append([])
        used = 0
      }
      used += (rows[rows.count - 1].isEmpty ? 0 : spacing) + size.width
      rows[rows.count - 1].append(size)
    }
    return rows
  }
}

/// ほかの絵文字: the system's emoji keyboard, as Messages' tapback opens
/// it, taking the first emoji typed.
struct EmojiKeyboardSheet: View {
  @Environment(\.dismiss) private var dismiss
  let onPick: (String) -> Void

  var body: some View {
    NavigationStack {
      EmojiField { emoji in
        onPick(emoji)
        dismiss()
      }
      .frame(width: 1, height: 1)
      .opacity(0)
      .frame(maxWidth: .infinity, maxHeight: .infinity)
      .overlay {
        Text("絵文字キーボードから選んでください")
          .font(.footnote)
          .foregroundStyle(.secondary)
      }
      .navigationTitle("ほかの絵文字")
      .navigationBarTitleDisplayMode(.inline)
      .toolbar {
        ToolbarItem(placement: .cancellationAction) {
          Button("閉じる", systemImage: "xmark", role: .close) { dismiss() }
        }
      }
    }
    .presentationDetents([.height(120)])
  }
}

/// A hidden field that opens on the emoji keyboard and gives the first
/// emoji typed.
private struct EmojiField: UIViewRepresentable {
  let onEmoji: (String) -> Void

  func makeUIView(context: Context) -> EmojiTextField {
    let field = EmojiTextField()
    field.addTarget(
      context.coordinator, action: #selector(Coordinator.changed), for: .editingChanged)
    DispatchQueue.main.async { field.becomeFirstResponder() }
    return field
  }

  func updateUIView(_ field: EmojiTextField, context: Context) {
    context.coordinator.onEmoji = onEmoji
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(onEmoji: onEmoji)
  }

  final class Coordinator: NSObject {
    var onEmoji: (String) -> Void

    init(onEmoji: @escaping (String) -> Void) {
      self.onEmoji = onEmoji
    }

    @objc func changed(_ field: UITextField) {
      guard let text = field.text, let first = text.first else { return }
      field.text = ""
      if isEmoji(String(first)) {
        onEmoji(String(first))
      }
    }
  }
}

/// A text field whose keyboard is the emoji one, where the system has it.
final class EmojiTextField: UITextField {
  override var textInputMode: UITextInputMode? {
    UITextInputMode.activeInputModes.first { $0.primaryLanguage == "emoji" } ?? super.textInputMode
  }
}
