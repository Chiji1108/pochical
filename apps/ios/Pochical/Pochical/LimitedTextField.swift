import PochicalDesign
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
  /// Told as the field is left.
  var onEndEditing: () -> Void = {}
  @State private var composing = false

  var body: some View {
    let used = text.count
    HStack(spacing: 8) {
      Field(
        placeholder: placeholder, text: $text, limit: limit, composing: $composing,
        onEndEditing: onEndEditing)
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
        text = String(text.prefix(parent.limit))
        field.text = text
      }
      parent.composing = composing
      parent.text = text
    }
  }
}
