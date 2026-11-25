import ImageIO
import PochicalKit
import Testing
import UIKit
import UniformTypeIdentifiers

@testable import Pochical

/// A sticker from the keyboard (spec/chat.md, Stickers): the field takes
/// no adaptive image glyphs, which UIKit would turn on for it as its paste
/// takes images, so the keyboard pastes the sticker as an image rather
/// than putting in a glyph its words read as U+FFFC alone; pasted, it is
/// told from a photo by the system's marks, and goes as a sticker. One
/// at a time, as the pasteboard is the system's one.
@Suite(.serialized) @MainActor struct ComposerStickerTests {
  /// `view` focused in a key window of its own, once the app's scene has
  /// connected: the tests may start before it does.
  private func focused(_ view: UITextView) async throws -> UIWindow {
    let connecting = NotificationCenter.default.notifications(
      named: UIScene.willConnectNotification)
    var scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
    if scene == nil {
      for await note in connecting {
        scene = note.object as? UIWindowScene
        if scene != nil { break }
      }
    }
    let window = UIWindow(windowScene: try #require(scene))
    window.addSubview(view)
    window.makeKeyAndVisible()
    #expect(view.becomeFirstResponder())
    return window
  }

  @Test func takesNoAdaptiveImageGlyphsWhileItsPasteTakesImages() async throws {
    let field = ComposerTextView()
    field.onPaste = { _ in }
    let window = try await focused(field)
    defer { window.isHidden = true }
    #expect(!field.supportsAdaptiveImageGlyph)
  }

  /// What `field` hands over as `items` are pasted, read from the
  /// pasteboard as long as they are on it.
  private func pasted(_ items: [NSItemProvider], into field: ComposerTextView) -> PastedImages? {
    UIPasteboard.general.setItemProviders(items, localOnly: true, expirationDate: nil)
    var pasted: PastedImages?
    field.onPaste = { pasted = $0 }
    field.paste(nil)
    return pasted
  }

  @Test func aKeyboardsStickerPastedGoesAsASticker() async throws {
    defer { UIPasteboard.general.items = [] }
    let field = ComposerTextView()
    field.text = "書きかけ"
    guard case .sticker(let item) = pasted([keyboardSticker()], into: field) else {
      Issue.record("not pasted as a sticker")
      return
    }
    // The words written stay in the field.
    #expect(field.text == "書きかけ")
    let sticker = try #require(await ChatStickers.read(item))
    let source = try #require(CGImageSourceCreateWithData(sticker.webp as CFData, nil))
    #expect(CGImageSourceGetType(source) as String? == UTType.webP.identifier)
    #expect(CGImageSourceGetCount(source) == 3)
  }

  @Test func anImagePastedWithNoStickersMarksIsAPhoto() {
    defer { UIPasteboard.general.items = [] }
    let field = ComposerTextView()
    let photo = NSItemProvider()
    register(png(), as: UTType.png.identifier, in: photo)
    guard case .photos(let items) = pasted([photo], into: field) else {
      Issue.record("not pasted as photos")
      return
    }
    #expect(items.count == 1)
  }

  /// UIKit's own default, which the field turns off: why it does. Should
  /// an iOS no longer turn them on, this says so, and the field's setting
  /// can go.
  @Test func aTextViewWhosePasteTakesImagesWouldTakeThem() async throws {
    let view = PastesImages()
    let window = try await focused(view)
    defer { window.isHidden = true }
    #expect(view.supportsAdaptiveImageGlyph)
  }
}

private final class PastesImages: UITextView {
  override func canPerformAction(_ action: Selector, withSender sender: Any?) -> Bool {
    action == #selector(paste(_:)) || super.canPerformAction(action, withSender: sender)
  }
}

/// What the keyboard puts on the pasteboard for a moving sticker, as an
/// iPhone gave it: its HEIF sequence, its PNG under the sticker's own type
/// and plainly, and the sticker's mark.
private func keyboardSticker() -> NSItemProvider {
  let item = NSItemProvider()
  let still = png()
  register(heics(), as: "public.heics", in: item)
  register(still, as: "com.apple.png-sticker", in: item)
  register(still, as: UTType.png.identifier, in: item)
  register(Data(), as: "com.apple.sticker", in: item)
  return item
}

private func register(_ data: Data, as type: String, in item: NSItemProvider) {
  item.registerDataRepresentation(forTypeIdentifier: type, visibility: .all) { done in
    done(data, nil)
    return nil
  }
}

/// A see-through square with a dot in it, `count` frames of it as `type`.
private func written(_ type: UTType, frames count: Int) -> Data {
  let format = UIGraphicsImageRendererFormat()
  format.scale = 1
  format.opaque = false
  let out = NSMutableData()
  let destination = CGImageDestinationCreateWithData(
    out, type.identifier as CFString, count, nil)!
  for index in 0..<count {
    let image = UIGraphicsImageRenderer(size: CGSize(width: 64, height: 64), format: format)
      .image { context in
        UIColor.orange.setFill()
        context.cgContext.fillEllipse(in: CGRect(x: 8 + index * 4, y: 8, width: 32, height: 32))
      }
    CGImageDestinationAddImage(
      destination, image.cgImage!,
      [kCGImagePropertyHEICSDictionary: [kCGImagePropertyHEICSDelayTime: 0.1]] as CFDictionary)
  }
  CGImageDestinationFinalize(destination)
  return out as Data
}

private func png() -> Data { written(.png, frames: 1) }

private func heics() -> Data { written(.heics, frames: 3) }
