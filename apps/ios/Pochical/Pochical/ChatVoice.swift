import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

// What VoiceOver says of a chat's lines (spec/chat.md, VoiceOver): each
// line as one element, read as who wrote it, its words, its time and its
// state, with everything its gestures do as its actions; and the lines
// coming in while the chat is open, said once they settle.

/// A photo as VoiceOver says it: its shape, as the eye sees first, since
/// a photo sent carries no words of its own.
func photoWords(_ photo: LinePhoto) -> String {
  guard photo.width > 0, photo.height > 0 else { return "写真" }
  let aspect = Double(photo.width) / Double(photo.height)
  if aspect > 1.8 { return "パノラマの写真" }
  if aspect > 1.1 { return "横長の写真" }
  if aspect < 0.9 { return "縦長の写真" }
  return "正方形の写真"
}

/// A line's reactions as VoiceOver sums them up: each emoji and how many
/// chose it, the reader's own said.
func reactionWords(_ reactions: [LineReaction], meID: String?) -> String {
  let each = reactions.map { reaction in
    let mine = reaction.userIDs.contains(meID ?? "")
    return "\(reaction.emoji) \(reaction.userIDs.count)\(mine ? "（自分も）" : "")"
  }
  return "リアクション \(each.joined(separator: "、"))"
}

/// Who chose each of a line's reactions, read on demand (VoiceOver's
/// その他のコンテンツ) rather than with the line.
func reactionPeople(_ reactions: [LineReaction], nameOf: (String) -> String) -> String {
  reactions.map { reaction in
    "\(reaction.emoji) \(reaction.userIDs.map(nameOf).joined(separator: "、"))"
  }.joined(separator: "。")
}

/// VoiceOver asking a line, or one of its album's photos, to open its
/// reactions and menu, as the long press does from where its bubble is:
/// a value the bubble watches. A closure the bubble left with the line
/// held the bubble, and through it the line, so neither ever went, nor
/// the chat screen its environment held.
struct MenuAsk: Equatable {
  let lineID: String
  /// Each ask its own, so asking again opens it again.
  private let id = UUID()

  init(_ lineID: String) {
    self.lineID = lineID
  }
}

/// What VoiceOver says of a line, and does on it.
struct LineVoice: ViewModifier {
  let label: String
  /// Who chose its reactions, for その他のコンテンツ.
  var people: String?
  let isImage: Bool
  /// A double tap: a photo opens large, else its menu opens, as the long
  /// press does.
  let activate: () -> Void
  let actions: [VoiceAction]

  func body(content: Content) -> some View {
    content
      .accessibilityElement(children: .ignore)
      .accessibilityLabel(label)
      .accessibilityAddTraits(isImage ? .isImage : [])
      .accessibilityCustomContent(AccessibilityCustomContentKey("リアクションした人"), people.map { Text($0) })
      .accessibilityAction(.default, activate)
      .accessibilityActions {
        ForEach(actions) { action in
          Button(action.title, action: action.run)
        }
      }
  }
}

/// One of a line's VoiceOver actions.
struct VoiceAction: Identifiable {
  let title: String
  /// What it acts on, when two of a line's may say the same: two links to
  /// one site stay two actions.
  var target: String?
  let run: () -> Void
  var id: String { target ?? title }
}

/// Says others' lines as they come in while the chat is open, once they
/// have settled for chatRules.announceSettleMs: one by who and what, more
/// by how many and the latest, so a run coming at once is said once
/// rather than each cutting the last off. Nothing while VoiceOver is off.
@MainActor final class LineAnnouncer {
  private var heard: [String] = []
  private var saying: Task<Void, Never>?

  /// `words`, said with the others heard before it settles.
  func heard(_ words: String) {
    guard UIAccessibility.isVoiceOverRunning else { return }
    heard.append(words)
    saying?.cancel()
    saying = Task { [weak self] in
      try? await Task.sleep(for: .milliseconds(Chat.announceSettleMs))
      guard let self, !Task.isCancelled else { return }
      say()
    }
  }

  func stop() {
    saying?.cancel()
    heard = []
  }

  private func say() {
    guard let latest = heard.last else { return }
    let words = heard.count == 1 ? latest : "新しいメッセージ\(heard.count)件。最新は、\(latest)"
    heard = []
    var said = AttributedString(words)
    // Queued after what VoiceOver is saying, not cutting it off.
    said.accessibilitySpeechAnnouncementPriority = .default
    AccessibilityNotification.Announcement(said).post()
  }
}

/// A line's VoiceOver where it is put; nothing elsewhere.
struct OptionalVoice: ViewModifier {
  let voice: LineVoice?

  func body(content: Content) -> some View {
    if let voice {
      content.modifier(voice)
    } else {
      content
    }
  }
}
