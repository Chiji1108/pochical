import PochicalDesign
import SwiftUI

/// Which page of a pager is shown, as /design's PageDots draw it after
/// iOS's page control: a dot a page, the shown one a longer bar, in the
/// テーマ's text colors, so it reads on a light page as on a dark one
/// (iOS's own dots are white, for photos). A dot opens its page.
struct PageDots: View {
  @Environment(\.themeColors) private var colors
  let count: Int
  @Binding var current: Int
  /// What the pages hold, for VoiceOver.
  let label: String

  var body: some View {
    HStack(spacing: 0) {
      ForEach(0..<count, id: \.self) { page in
        let isShown = page == current
        Button {
          withAnimation(Springs.standard) { current = page }
        } label: {
          Capsule()
            .fill(isShown ? colors.textPrimary : colors.textQuaternary)
            .frame(width: isShown ? 20 : 8, height: 8)
            .padding(.horizontal, 4)
            .frame(height: 24)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel("\(page + 1)ページ目")
        .accessibilityAddTraits(isShown ? .isSelected : [])
      }
    }
    .animation(Springs.standard, value: current)
    .accessibilityElement(children: .contain)
    .accessibilityLabel(label)
  }
}
