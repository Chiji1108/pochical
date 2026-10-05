import PochicalDesign
import SwiftUI

/// ☀︎ / ☾ to see a preview in the other of light and dark without changing
/// 外観 (/design's PreviewSchemeSwitch). Drawn small, but each side takes
/// a 44pt height to tap.
struct SchemeSwitch: View {
  @Environment(\.themeColors) private var colors
  @Binding var shown: ColorScheme
  /// For what has only one of them, like a テーマ drawn dark: the switch
  /// stays in its place, showing that one, and cannot be turned.
  var disabled = false

  private static let choices: [(scheme: ColorScheme, symbol: String, name: String)] = [
    (.light, "sun.max", "ライトで見る"),
    (.dark, "moon", "ダークで見る"),
  ]

  var body: some View {
    HStack(spacing: 2) {
      ForEach(Self.choices, id: \.scheme) { choice in
        let isPicked = choice.scheme == shown
        Button {
          shown = choice.scheme
        } label: {
          Image(systemName: choice.symbol)
            .font(.system(size: 11, weight: .semibold))
            .foregroundStyle(ink(isPicked: isPicked))
            .frame(width: 24, height: 18)
            .background(
              isPicked ? colors.fillTertiary : .clear,
              in: RoundedRectangle(cornerRadius: Radius.sm)
            )
            .padding(.vertical, 13)
            .contentShape(Rectangle())
            .padding(.vertical, -13)
        }
        .buttonStyle(.plain)
        .disabled(disabled)
        .accessibilityLabel(choice.name)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
      }
    }
    .padding(2)
    .background(colors.backgroundCard, in: RoundedRectangle(cornerRadius: Radius.md))
    .overlay(RoundedRectangle(cornerRadius: Radius.md).strokeBorder(colors.separator))
    .accessibilityElement(children: .contain)
    .accessibilityLabel("プレビューの明るさ")
  }

  private func ink(isPicked: Bool) -> Color {
    if isPicked {
      return colors.textPrimary
    }
    return disabled ? colors.textDisabled : colors.textQuaternary
  }
}
