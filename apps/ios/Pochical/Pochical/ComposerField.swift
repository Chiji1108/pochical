import PochicalDesign
import SwiftUI
import UIKit
import UniformTypeIdentifiers

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

  /// The field's height for `text`, told from the words, however they came
  /// there (typed, put in for 編集, emptied as they are sent), so the
  /// composer grows and shrinks with them in the update that changed them,
  /// by its one animation. Laid out as the field lays out its own words,
  /// by a text view set up as it is: the field may not hold `text` yet.
  func height(for text: String) -> CGFloat {
    guard let view, view.bounds.width > 0 else { return 0 }
    measuring.font = view.font
    measuring.text = text
    return ComposerField.fitting(measuring, width: view.bounds.width).height
  }

  /// A text view set up as the field, to lay out words it does not hold.
  private let measuring = ComposerField.setUp(UITextView())
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
  /// Images pasted (the edit menu's ペースト, ⌘V), each a provider to read
  /// as the photo picker's are; none where photos cannot go, where an
  /// image pastes nothing, as before.
  var onPasteImages: (([NSItemProvider]) -> Void)?

  static let maxLines = 5

  /// `view` laid out as the field's words are.
  fileprivate static func setUp<View: UITextView>(_ view: View) -> View {
    view.font = .preferredFont(forTextStyle: .body)
    view.adjustsFontForContentSizeCategory = true
    view.backgroundColor = .clear
    view.textContainerInset = .zero
    view.textContainer.lineFragmentPadding = 0
    view.isScrollEnabled = false
    return view
  }

  /// The field's height for the words `view` holds at `width`: theirs up
  /// to `maxLines`, past which it scrolls.
  fileprivate static func fitting(_ view: UITextView, width: CGFloat) -> (
    height: CGFloat, scrolls: Bool
  ) {
    let fitting = view.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
    let most = (view.font?.lineHeight ?? 22) * CGFloat(maxLines)
    return (min(fitting.height, most), fitting.height > most)
  }

  func makeUIView(context: Context) -> UITextView {
    let view = Self.setUp(PastingTextView())
    view.onPasteImages = onPasteImages
    view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    view.delegate = context.coordinator
    view.accessibilityLabel = placeholder
    box.view = view
    return view
  }

  func updateUIView(_ view: UITextView, context: Context) {
    context.coordinator.parent = self
    box.view = view
    (view as? PastingTextView)?.onPasteImages = onPasteImages
    if view.markedTextRange == nil, view.text != text {
      view.text = text
    }
  }

  func sizeThatFits(_ proposal: ProposedViewSize, uiView view: UITextView, context: Context)
    -> CGSize?
  {
    // Only as wide as offered; asked for its own width, it has none.
    guard let width = proposal.width, width.isFinite else { return nil }
    let fitting = Self.fitting(view, width: width)
    if view.isScrollEnabled != fitting.scrolls {
      // Changed after this layout pass, not during it.
      DispatchQueue.main.async { view.isScrollEnabled = fitting.scrolls }
    }
    return CGSize(width: width, height: fitting.height)
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

/// A text view that takes images pasted, as Messages' and Signal's fields
/// do: the system's own paste, so ペースト shows in the edit menu for an
/// image and pasting asks nothing more. Words paste as any text view's.
private final class PastingTextView: UITextView {
  var onPasteImages: (([NSItemProvider]) -> Void)?

  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    if action == #selector(paste(_:)), onPasteImages != nil, UIPasteboard.general.hasImages {
      return true
    }
    return super.canPerformAction(action, withSender: sender)
  }

  override func paste(_ sender: Any?) {
    let board = UIPasteboard.general
    guard let onPasteImages, board.hasImages else {
      super.paste(sender)
      return
    }
    // The items that are images; any words copied with them are left.
    let images = board.itemProviders.filter { $0.hasItemConformingToTypeIdentifier(UTType.image.identifier) }
    guard !images.isEmpty else {
      super.paste(sender)
      return
    }
    onPasteImages(images)
  }
}
