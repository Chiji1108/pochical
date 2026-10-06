import PochicalDesign
import SwiftUI
import UIKit

/// What the chat's composer asks of its field: to take the words written,
/// a word still being converted (marked text) included, as Messages and
/// LINE send it, and to start writing.
@MainActor final class ComposerBox {
  fileprivate weak var view: UITextView?

  /// Confirms a word being converted and gives what is written, as the
  /// binding would not have it yet.
  func commit() -> String {
    guard let view else { return "" }
    view.unmarkText()
    return view.text ?? ""
  }

  func focus() {
    view?.becomeFirstResponder()
  }
}

/// The chat's field, from one line growing to `maxLines` and then
/// scrolling, held to a text limit as spec/text-limits.md has it (typing
/// stops at the limit, a word being converted may run past it until it is
/// confirmed). UIKit's text view, since SwiftUI's field neither says
/// whether a word is being converted nor lets one be confirmed or cleared.
struct ComposerField: UIViewRepresentable {
  let placeholder: String
  @Binding var text: String
  let limit: Int
  @Binding var composing: Bool
  let box: ComposerBox

  static let maxLines = 5

  func makeUIView(context: Context) -> UITextView {
    let view = UITextView()
    view.font = .preferredFont(forTextStyle: .body)
    view.adjustsFontForContentSizeCategory = true
    view.backgroundColor = .clear
    view.textContainerInset = .zero
    view.textContainer.lineFragmentPadding = 0
    view.isScrollEnabled = false
    view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    view.delegate = context.coordinator
    view.accessibilityLabel = placeholder
    box.view = view
    return view
  }

  func updateUIView(_ view: UITextView, context: Context) {
    context.coordinator.parent = self
    box.view = view
    if view.markedTextRange == nil, view.text != text {
      view.text = text
    }
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView view: UITextView, context: Context)
    -> CGSize?
  {
    // Only as wide as offered; asked for its own width, it has none.
    guard let width = proposal.width, width.isFinite else { return nil }
    let fitting = view.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    let most = (view.font?.lineHeight ?? 22) * CGFloat(Self.maxLines)
    let scrolls = fitting.height > most
    if view.isScrollEnabled != scrolls {
      // Changed after this layout pass, not during it.
      DispatchQueue.main.async { view.isScrollEnabled = scrolls }
    }
    return CGSize(width: width, height: min(fitting.height, most))
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  final class Coordinator: NSObject, UITextViewDelegate {
    var parent: ComposerField

    init(parent: ComposerField) {
      self.parent = parent
    }

    /// Typing stops at the limit; while a word is being converted it may
    /// run on, to be cut once confirmed.
    func textView(
      _ view: UITextView, shouldChangeTextIn range: NSRange, replacementText string: String
    ) -> Bool {
      if view.markedTextRange != nil {
        return true
      }
      let now = view.text ?? ""
      guard let swapped = Range(range, in: now) else { return true }
      let next = now.replacingCharacters(in: swapped, with: string)
      if next.count <= parent.limit || string.isEmpty {
        return true
      }
      // Pasted or typed past the limit: what fits goes in.
      let room = parent.limit - (now.count - now[swapped].count)
      guard room > 0 else { return false }
      view.text = now.replacingCharacters(in: swapped, with: String(string.prefix(room)))
      textViewDidChange(view)
      return false
    }

    func textViewDidChange(_ view: UITextView) {
      let composing = view.markedTextRange != nil
      var text = view.text ?? ""
      if !composing, text.count > parent.limit {
        text = String(text.prefix(parent.limit))
        view.text = text
      }
      parent.composing = composing
      parent.text = text
      view.invalidateIntrinsicContentSize()
    }
  }
}
