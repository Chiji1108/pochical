import Testing
import UIKit

@testable import Pochical

/// A sticker from the keyboard (spec/chat.md, Photos): the field takes no
/// adaptive image glyphs, which UIKit would turn on for it as its paste
/// takes images, so the keyboard pastes the sticker as an image rather
/// than putting in a glyph its words read as U+FFFC alone.
@MainActor struct ComposerStickerTests {
  private func window() throws -> UIWindow {
    let windows = UIApplication.shared.connectedScenes.compactMap {
      ($0 as? UIWindowScene)?.keyWindow
    }
    return try #require(windows.first)
  }

  @Test func takesNoAdaptiveImageGlyphsWhileItsPasteTakesImages() throws {
    let field = ComposerTextView()
    field.onPasteImages = { _ in }
    try window().addSubview(field)
    defer { field.removeFromSuperview() }
    #expect(field.becomeFirstResponder())
    #expect(!field.supportsAdaptiveImageGlyph)
  }

  /// UIKit's own default, which the field turns off: why it does.
  @Test func aTextViewWhosePasteTakesImagesWouldTakeThem() throws {
    let view = PastesImages()
    try window().addSubview(view)
    defer { view.removeFromSuperview() }
    #expect(view.becomeFirstResponder())
    #expect(view.supportsAdaptiveImageGlyph)
  }
}

private final class PastesImages: UITextView {
  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    action == #selector(paste(_:)) || super.canPerformAction(action, withSender: sender)
  }
}
