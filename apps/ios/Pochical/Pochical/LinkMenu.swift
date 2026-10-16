import SwiftUI
import UIKit

// A link long pressed in a message (spec/chat.md, In a message): its own
// menu, リンクを開く and リンクをコピー, in place of the line's, as iOS
// offers on a link in text.

/// A link in a message's words, marked for the renderer to find.
struct LinkMark: TextAttribute {
  let url: URL
}

/// Where a bubble's links are drawn, as its renderer last drew them, for a
/// long press to ask which link, if any, is under the finger.
nonisolated final class LinkSpots: @unchecked Sendable {
  /// Each link's runs, in the words' own space.
  fileprivate var spots: [(rect: CGRect, url: URL)] = []
  /// The words on the screen.
  var frame = CGRect.zero
  /// The bubble is held, or was a moment ago: a link's tap as the finger
  /// lifts opens nothing.
  var held = false

  /// The link under `point`, on the screen.
  func link(at point: CGPoint) -> URL? {
    let inWords = CGPoint(x: point.x - frame.minX, y: point.y - frame.minY)
    // A little round each run, as a finger is wider than the line.
    return spots.first { $0.rect.insetBy(dx: -4, dy: -4).contains(inWords) }?.url
  }
}

/// Draws the words as they are, noting where the marked links fall.
struct LinkFinder: TextRenderer {
  let spots: LinkSpots

  func draw(layout: Text.Layout, in context: inout GraphicsContext) {
    var found: [(rect: CGRect, url: URL)] = []
    for line in layout {
      for run in line {
        if let mark = run[LinkMark.self] {
          found.append((run.typographicBounds.rect, mark.url))
        }
      }
      context.draw(line)
    }
    spots.spots = found
  }
}

/// The words' links opening as the chat opens them, except as the bubble
/// is held for a menu.
struct HeldLinksOpenNothing: ViewModifier {
  @Environment(\.openURL) private var openURL
  let spots: LinkSpots

  func body(content: Content) -> some View {
    content.environment(
      \.openURL,
      OpenURLAction { url in
        if spots.held { return .handled }
        openURL(url)
        return .handled
      })
  }
}

/// A tap on a part of a bubble with its own (a reply's quote, a link's
/// page), but for the finger lifting from the press that opened the
/// bubble's menu, as a link's.
struct TapUnlessHeld: ViewModifier {
  @Environment(\.linkSpots) private var spots
  let action: () -> Void

  func body(content: Content) -> some View {
    content.onTapGesture { if spots?.held != true { action() } }
  }
}

extension View {
  func onTapUnlessHeld(perform action: @escaping () -> Void) -> some View {
    modifier(TapUnlessHeld(action: action))
  }
}

extension EnvironmentValues {
  /// The held bubble's links, which its words note as they are drawn.
  @Entry var linkSpots: LinkSpots?
}

/// A long-pressed link's menu, `copied` told once its link is copied.
func linkActions(_ url: URL, open: @escaping () -> Void, copied: @escaping () -> Void)
  -> [MessageAction]
{
  [
    MessageAction(title: "リンクを開く", systemImage: "safari", run: open),
    MessageAction(title: "リンクをコピー", systemImage: "link") {
      UIPasteboard.general.url = url
      copied()
    },
  ]
}
