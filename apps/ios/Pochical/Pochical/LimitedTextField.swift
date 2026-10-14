import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

/// A one-line field held to a text limit as spec/text-limits.md has it:
/// typing stops at the limit and pasted text is cut to it, but a word
/// still being converted (marked text) may run past it until it is
/// confirmed, and is cut then, never broken off halfway. Its count
/// `{used}/{limit}` shows after it all the while for a short limit, and
/// only near the end for a long one, in the danger color while a
/// conversion runs past. UIKit's field, since SwiftUI's says nothing of
/// marked text.
struct LimitedTextField: View {
  @Environment(\.themeColors) private var colors
  let placeholder: String
  @Binding var text: String
  let limit: Int
  /// Off where what the field makes shows what fits already, as a mark's
  /// letters do (spec/text-limits.md).
  var showsCount = true
  /// A mark's letter: typing or converting into it once full replaces it
  /// (`markLetter`) rather than being refused.
  var replacesWhenFull = false
  /// Told the text once it is no longer being converted.
  var onConfirm: (String) -> Void = { _ in }
  /// Told as the field is left.
  var onEndEditing: () -> Void = {}
  @State private var composing = false

  var body: some View {
    let used = text.count
    HStack(spacing: 8) {
      Field(
        placeholder: placeholder, text: $text, limit: limit, composing: $composing,
        replacesWhenFull: replacesWhenFull, onConfirm: onConfirm, onEndEditing: onEndEditing)
      if showsCount,
        limit <= TextFields.countAlwaysUpTo || limit - used <= TextFields.countWhenLeft
      {
        Text("\(used)/\(limit)")
          .font(.footnote.monospacedDigit())
          .foregroundStyle(composing && used > limit ? colors.dangerDefault : colors.textTertiary)
          .accessibilityLabel("\(limit)文字中\(used)文字")
      }
    }
  }
}

private struct Field: UIViewRepresentable {
  let placeholder: String
  @Binding var text: String
  let limit: Int
  @Binding var composing: Bool
  let replacesWhenFull: Bool
  let onConfirm: (String) -> Void
  let onEndEditing: () -> Void

  func makeUIView(context: Context) -> UITextField {
    let field = UITextField()
    field.placeholder = placeholder
    field.textAlignment = .right
    field.returnKeyType = .done
    field.font = .preferredFont(forTextStyle: .body)
    field.adjustsFontForContentSizeCategory = true
    field.setContentHuggingPriority(.defaultLow, for: .horizontal)
    field.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
    field.delegate = context.coordinator
    field.addTarget(context.coordinator, action: #selector(Coordinator.changed), for: .editingChanged)
    return field
  }

  func updateUIView(_ field: UITextField, context: Context) {
    context.coordinator.parent = self
    if field.markedTextRange == nil, field.text != text {
      field.text = text
    }
  }

  func makeCoordinator() -> Coordinator {
    Coordinator(parent: self)
  }

  final class Coordinator: NSObject, UITextFieldDelegate {
    var parent: Field
    /// The text as an edit past the limit started, which a full mark's
    /// letter gives up for what the edit puts in.
    var before: String?

    init(parent: Field) {
      self.parent = parent
    }

    /// Typing stops at the limit; while a word is being converted it may
    /// run on, to be cut once confirmed.
    func textField(
      _ field: UITextField, shouldChangeCharactersIn range: NSRange, replacementString string: String
    ) -> Bool {
      if field.markedTextRange != nil {
        return true
      }
      let now = field.text ?? ""
      guard let swapped = Range(range, in: now) else { return true }
      let next = now.replacingCharacters(in: swapped, with: string)
      if next.count <= parent.limit || string.isEmpty {
        return true
      }
      // A full mark's letter lets the key in, even the first of a
      // conversion before it is marked text, and keeps what it puts in.
      if parent.replacesWhenFull {
        before = before ?? now
        return true
      }
      // Pasted or typed past the limit: what fits goes in.
      let room = parent.limit - (now.count - now[swapped].count)
      guard room > 0 else { return false }
      field.text = now.replacingCharacters(in: swapped, with: String(string.prefix(room)))
      changed(field)
      return false
    }

    func textFieldShouldReturn(_ field: UITextField) -> Bool {
      field.resignFirstResponder()
    }

    func textFieldDidEndEditing(_ field: UITextField) {
      parent.onEndEditing()
    }

    @objc func changed(_ field: UITextField) {
      let composing = field.markedTextRange != nil
      var text = field.text ?? ""
      if !composing, text.count > parent.limit {
        if let before {
          text = markLetter(before: before, after: text, limit: parent.limit)
        } else {
          text = String(text.prefix(parent.limit))
        }
        field.text = text
      }
      if !composing {
        before = nil
      }
      parent.composing = composing
      parent.text = text
      if !composing {
        parent.onConfirm(text)
      }
    }
  }
}

/// A mark's letter, a shift's or a group's (spec/text-limits.md): up to
/// `limit` characters with no count, since the mark beside it shows what
/// fits. Typing or converting into it once full replaces it, and the mark
/// changes only once a conversion is confirmed. It may be empty while
/// written, and left empty it shows the letter it had.
struct MarkLetterField: View {
  let letter: String
  let limit: Int
  let onLetter: (String) -> Void
  @State private var draft: String?

  var body: some View {
    LimitedTextField(
      placeholder: letter, text: Binding { draft ?? letter } set: { draft = $0 }, limit: limit,
      showsCount: false, replacesWhenFull: true,
      onConfirm: { text in
        let letters = text.trimmingCharacters(in: .whitespacesAndNewlines)
        if !letters.isEmpty {
          onLetter(letters)
        }
      }
    ) {
      draft = nil
    }
  }
}
