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
  /// The words in the chat line's cell.
  var frame = CGRect.zero

  /// The link under `point`, in the chat line's cell.
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
