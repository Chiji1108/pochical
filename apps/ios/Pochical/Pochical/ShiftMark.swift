import PochicalDesign
import PochicalKit
import SwiftUI

/// How a pattern's mark is drawn: its icon, its emoji or its letter on a
/// tile, as the person picks for their calendar.
enum MarkStyle {
  case icon
  case emoji
  case badge
}

/// A pattern's mark, with 早出 and 残業 as small triangles in its top
/// corners: the start of the day at the left, the end at the right. They
/// belong to the shift, so they are drawn on the mark wherever it is.
struct ShiftMark: View {
  @Environment(\.themeColors) private var colors
  let pattern: Pattern
  let style: MarkStyle
  let size: CGFloat
  var change: TimeChange?

  var body: some View {
    glyph
      .overlay(alignment: .topLeading) {
        if change?.early == true {
          corner(Path { path in
            path.addLines([.zero, CGPoint(x: 1, y: 0), CGPoint(x: 0, y: 1)])
          })
          .offset(x: -2, y: -2)
        }
      }
      .overlay(alignment: .topTrailing) {
        if change?.late == true {
          corner(Path { path in
            path.addLines([.zero, CGPoint(x: 1, y: 0), CGPoint(x: 1, y: 1)])
          })
          .offset(x: 2, y: -2)
        }
      }
  }

  @ViewBuilder private var glyph: some View {
    let color = colors.mark(pattern.color)
    switch style {
    case .emoji:
      Text(pattern.emoji).font(.system(size: size))
    case .badge:
      Text(pattern.symbol)
        .font(.system(size: (size * 0.56).rounded(), weight: .bold))
        .foregroundStyle(color.color)
        .frame(minWidth: size, minHeight: size)
        .background(color.tint, in: RoundedRectangle(cornerRadius: size * 0.28))
    case .icon:
      if let layers = MarkIcons.layers(pattern.icon, filled: true, size: size) {
        ZStack {
          ForEach(layers.indices, id: \.self) { index in
            layers[index].path.fill(color.color.opacity(layers[index].opacity))
          }
        }
        .frame(width: size, height: size)
      } else {
        letterInRing(color)
      }
    }
  }

  /// The letter in a thin ring: the icon "letter", and any id with no
  /// glyph.
  private func letterInRing(_ color: MarkColor) -> some View {
    Text(pattern.symbol)
      .font(.system(size: (size * 0.5).rounded(), weight: .semibold))
      .foregroundStyle(color.color)
      .frame(width: size, height: size)
      .overlay(Circle().strokeBorder(color.color, lineWidth: 1.7))
  }

  /// A corner triangle, in the mark's color; emoji bring colors of their
  /// own, so theirs is the gray of secondary text.
  private func corner(_ unit: Path) -> some View {
    let side = size * 0.32
    return unit
      .applying(CGAffineTransform(scaleX: side, y: side))
      .fill(style == .emoji ? colors.textSecondary : colors.mark(pattern.color).color)
      .frame(width: side, height: side)
  }
}
