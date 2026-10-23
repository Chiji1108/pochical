import PochicalDesign
import PochicalKit
import Pow
import SwiftUI
import UIKit

/// The emoji a line's menu offers first (/design's reactionChoices).
let reactionChoices = ["👍", "❤️", "😂", "👀", "🙏", "🎉"]

/// A line's reactions under its bubble, wrapping to more rows as needed.
/// One coming while the line is on the screen pops in, the accent's, and
/// the reader's own choice sprays its emoji, as Telegram's and iMessage's
/// tapbacks land, both over the whole chat (ChatEffects); one going shrinks
/// away. Others' coming only pop, and with motion reduced each fades in and
/// out where it is. Those there as the line is drawn are simply there.
struct ReactionRow: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  /// The line's op_id.
  let lineID: String
  let reactions: [LineReaction]
  let meID: String?
  let nameOf: (String) -> String
  /// In a chat of two, who chose it needs no face: the emoji alone, and
  /// how many once both did.
  var counted = false
  /// What the reader has just chosen, which sprays; none where nothing
  /// does.
  var marks: LineMarks?
  /// The line is on the screen already: a pill coming now pops.
  var shown = false
  let onReact: (String) -> Void

  /// How a pill comes and goes, and the line's first with the row, which
  /// is then as large as the pill: in by the pop's own scale, its ring and
  /// burst played round it over the chat (ChatEffects), where the line's
  /// cell would cut them. Only the outermost of views coming in together
  /// takes its transition.
  static func transition(_ reduceMotion: Bool) -> AnyTransition {
    reduceMotion
      ? .opacity
      : .asymmetric(
        insertion: .movingParts.pop(Color.clear),
        removal: .scale(scale: 0.5).combined(with: .opacity))
  }

  /// The animation pills come and go in.
  static func motion(_ reduceMotion: Bool) -> Animation {
    reduceMotion ? .easeOut(duration: 0.2) : .spring(duration: 0.35)
  }

  var body: some View {
    WrappingRow(spacing: 4) {
      ForEach(reactions, id: \.emoji) { reaction in
        ReactionPill(
          reaction: reaction, mine: reaction.userIDs.contains(meID ?? ""), nameOf: nameOf,
          counted: counted, lineID: lineID, marks: marks, shown: shown
        ) {
          onReact(reaction.emoji)
        }
        .transition(Self.transition(reduceMotion))
      }
    }
    .animation(ReactionRow.motion(reduceMotion), value: reactions)
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
  /// Its line's op_id, and what the reader has just chosen, which it
  /// sprays for.
  let lineID: String
  let marks: LineMarks?
  let onToggle: () -> Void
  /// Its line was on the screen as it came, as it was first made: it pops.
  @State private var cameLater: Bool
  /// This pill's own, apart from one of the same emoji coming as it goes.
  @State private var token = UUID()
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  /// The chat's effects; none where the line is only measured.
  @Environment(\.chatEffects) private var effects
  /// Where it is in its line's cell, once laid out.
  @State private var frame: CGRect?
  /// Its height and faces, growing with the reader's text size as its
  /// emoji and count do.
  @ScaledMetric(relativeTo: .subheadline) private var height: CGFloat = 24
  @ScaledMetric(relativeTo: .subheadline) private var face: CGFloat = 18

  private static var mostFaces: Int { 3 }

  init(
    reaction: LineReaction, mine: Bool, nameOf: @escaping (String) -> String, counted: Bool,
    lineID: String, marks: LineMarks?, shown: Bool, onToggle: @escaping () -> Void
  ) {
    self.reaction = reaction
    self.mine = mine
    self.nameOf = nameOf
    self.counted = counted
    self.lineID = lineID
    self.marks = marks
    self.onToggle = onToggle
    _cameLater = State(initialValue: shown)
  }

  private var part: EffectPart {
    EffectPart(item: ChatItemID.line(lineID), name: token.uuidString)
  }

  var body: some View {
    pill
      // Its own size and where its middle is, as laid out: the pop's scale
      // as it comes in changes neither.
      .onGeometryChange(for: CGRect.self) { proxy in
        let seen = proxy.frame(in: .named(LineSpace.name))
        return CGRect(
          x: seen.midX - proxy.size.width / 2, y: seen.midY - proxy.size.height / 2,
          width: proxy.size.width, height: proxy.size.height)
      } action: { now in
        let first = frame == nil
        frame = now
        if first { comeIn(at: now) } else { effects?.move(part, to: now) }
      }
      .onChange(of: marks?.chosen.contains([lineID, reaction.emoji]) ?? false) { _, now in
        if now, let frame { spray(at: frame) }
      }
      .onDisappear { effects?.end(part) }
  }

  /// Laid out the first time: pops if its line was there before it, and
  /// sprays for the reader's choice of it just made.
  private func comeIn(at frame: CGRect) {
    if cameLater, !reduceMotion { effects?.play(.pop, on: part, at: frame) }
    spray(at: frame)
  }

  /// Sprays for the reader's choice of it just made, once.
  private func spray(at frame: CGRect) {
    guard let effects, marks?.shows(reaction.emoji, on: lineID) == true, !reduceMotion
    else { return }
    effects.play(.spray(reaction.emoji), on: part, at: frame)
  }

  @ViewBuilder private var pill: some View {
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
              MemberAvatar(name: nameOf(id), photoID: photos[id] ?? "", size: face, userID: id)
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
      .frame(minHeight: height)
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
  /// What the emoji is for: リアクション for a line's.
  var title = "ほかの絵文字"
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
      .navigationTitle(title)
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

/// A text field whose keyboard is the emoji one, where the system has it,
/// up as the field comes on screen.
final class EmojiTextField: UITextField {
  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil { becomeFirstResponder() }
  }

  override var textInputMode: UITextInputMode? {
    UITextInputMode.activeInputModes.first { $0.primaryLanguage == "emoji" } ?? super.textInputMode
  }
}
