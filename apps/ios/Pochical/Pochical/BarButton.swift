import PochicalDesign
import SwiftUI

/// A button as iOS 26 draws one in a bar, for the heading's corner: the
/// system's glass, 44 points high, words on a capsule and an icon alone on
/// a circle. The heading keeps them on the month's line, as /design does,
/// rather than in a bar of their own above it.
///
/// As the bar's own buttons, its glyph is in the label color, and only the
/// one that confirms (完了) is prominent, filled with the accent.
struct BarButton: ButtonStyle {
  var prominent = false

  func makeBody(configuration: Configuration) -> some View {
    BarButtonBody(configuration: configuration, prominent: prominent)
  }
}

private struct BarButtonBody: View {
  @Environment(\.themeColors) private var colors
  let configuration: ButtonStyleConfiguration
  let prominent: Bool

  var body: some View {
    // Its words or symbol in the label color it is given, as a bar
    // button's are, the camera's white over its black included.
    configuration.label
      .font(.body.weight(prominent ? .semibold : .regular))
      .foregroundStyle(prominent ? AnyShapeStyle(colors.accentOnFill) : AnyShapeStyle(.foreground))
      .padding(.horizontal, 14)
      .frame(minWidth: Metrics.touch, minHeight: Metrics.touch)
      .contentShape(.capsule)
      .glassEffect(.regular.tint(prominent ? colors.accentFill : nil).interactive(), in: .capsule)
  }
}
