import Testing
import UIKit

@testable import Pochical

/// A sticker from the keyboard (spec/chat.md, Photos): the field takes no
/// adaptive image glyphs, which UIKit would turn on for it as its paste
/// takes images, so the keyboard pastes the sticker as an image rather
/// than putting in a glyph its words read as U+FFFC alone.
@MainActor struct ComposerStickerTests {
  /// `view` focused in a key window of its own.
  private func focused(_ view: UITextView) throws -> UIWindow {
    let scene = try #require(
      UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
    let window = UIWindow(windowScene: scene)
    window.addSubview(view)
    window.makeKeyAndVisible()
    #expect(view.becomeFirstResponder())
    return window
  }

  @Test func takesNoAdaptiveImageGlyphsWhileItsPasteTakesImages() throws {
    let field = ComposerTextView()
    field.onPasteImages = { _ in }
    let window = try focused(field)
    defer { window.isHidden = true }
    #expect(!field.supportsAdaptiveImageGlyph)
  }

  /// UIKit's own default, which the field turns off: why it does. Should
  /// an iOS no longer turn them on, this says so, and the field's setting
  /// can go.
  @Test func aTextViewWhosePasteTakesImagesWouldTakeThem() throws {
    let view = PastesImages()
    let window = try focused(view)
    defer { window.isHidden = true }
    #expect(view.supportsAdaptiveImageGlyph)
  }
}

private final class PastesImages: UITextView {
  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    action == #selector(paste(_:)) || super.canPerformAction(action, withSender: sender)
  }
}
