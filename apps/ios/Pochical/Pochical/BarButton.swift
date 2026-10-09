import PochicalDesign
import SwiftUI

/// A button as iOS 26 draws one in a bar, for the heading's corner: the
/// system's glass, 44 points high, words on a capsule and an icon alone on
/// a circle, or tinted glass for one that confirms. The heading keeps them
/// on the month's line, as /design does, rather than in a bar of their own
/// above it.
struct BarButton: ButtonStyle {
  /// Tints the glass, for 完了.
  var tint: Color?

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.body.weight(tint == nil ? .regular : .semibold))
      .padding(.horizontal, 14)
      .frame(minWidth: Metrics.touch, minHeight: Metrics.touch)
      .contentShape(.capsule)
      .glassEffect(.regular.tint(tint).interactive(), in: .capsule)
  }
}
