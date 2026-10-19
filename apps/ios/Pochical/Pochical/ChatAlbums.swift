import PochicalDesign
import PochicalKit
import SwiftUI

// Photos sent at once, drawn together as one album (spec/chat.md, Albums),
// each still a line of its own.

/// One photo of an album, its own line in it: what its cell shows, and
/// what VoiceOver says of it.
struct AlbumPhoto: Hashable {
  /// Its line's opID, which its actions name it by.
  let lineID: String
  let photo: LinePhoto
  let time: Int64
  var waiting = false
  var failed = false
  var pinned = false
  /// Its place in the chat, by which it is ringed; none while on its way.
  var seq: Int64?
  /// Its menu's items by name, for VoiceOver.
  var menu: [String] = []
}

/// Where each of an album's photos goes: rows top first
/// (spec/vectors/chat.json, albumRows), as wide as a line with a link's
/// page, the photos 2 points apart; a row of several as tall as a cell is
/// wide, the row of one half the album's width tall.
enum AlbumBox {
  static var width: CGFloat { MessageBubble.linkedWidth }
  static let gap: CGFloat = 2

  /// Each photo's cell, row by row.
  static func rows(_ count: Int) -> [[AlbumCell]] {
    var index = 0
    return albumRows(count).map { across in
      let side = (width - gap * CGFloat(across - 1)) / CGFloat(across)
      let size = CGSize(width: side, height: across == 1 ? width / 2 : side)
      defer { index += across }
      return (index..<index + across).map { AlbumCell(index: $0, size: size) }
    }
  }

  /// The cell of the album's photo at `index`.
  static func size(of index: Int, in count: Int) -> CGSize {
    rows(count).joined().first { $0.index == index }?.size ?? .zero
  }
}

/// One photo's place in an album.
struct AlbumCell: Identifiable {
  let index: Int
  let size: CGSize
  var id: Int { index }
}

/// An album's photos in their rows, with no bubble: rounded at `lg` with
/// a hairline edge, each photo drawn by `cell` in its place.
struct AlbumGrid<Cell: View>: View {
  @Environment(\.themeColors) private var colors
  let count: Int
  @ViewBuilder let cell: (AlbumCell) -> Cell

  var body: some View {
    VStack(spacing: AlbumBox.gap) {
      ForEach(Array(AlbumBox.rows(count).enumerated()), id: \.offset) { _, row in
        HStack(spacing: AlbumBox.gap) {
          ForEach(row) { cell($0) }
        }
      }
    }
    .clipShape(RoundedRectangle(cornerRadius: Radius.lg))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.lg).strokeBorder(colors.borderDefault, lineWidth: 1)
    )
  }
}
