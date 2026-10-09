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

/// A screen's main button (/design's primary Button): a capsule of the
/// accent's fill as high as a control, its words body medium, as wide as
/// it is given. The system's prominent style adds padding of its own, which
/// would make it taller than the rows beside it.
struct PrimaryButton: ButtonStyle {
  @Environment(\.themeColors) private var colors
  @Environment(\.isEnabled) private var isEnabled

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .font(.body.weight(.medium))
      .foregroundStyle(colors.accentOnFill)
      .frame(maxWidth: .infinity, minHeight: Metrics.control)
      .background(colors.accentFill, in: .capsule)
      .contentShape(.capsule)
      .opacity(isEnabled ? (configuration.isPressed ? 0.8 : 1) : 0.4)
      .animation(Springs.quick, value: configuration.isPressed)
  }
}
