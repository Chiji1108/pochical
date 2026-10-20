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

/// Pages swiped sideways a page at a time, as tall as the tallest of them,
/// so what stands under them sits under their content wherever the text
/// size puts it. All the pages are laid out, for that height: a pager holds
/// a few.
struct SwipePages<Page: View>: View {
  let count: Int
  @Binding var current: Int
  @ViewBuilder let page: (Int) -> Page

  var body: some View {
    ScrollView(.horizontal) {
      HStack(alignment: .top, spacing: 0) {
        ForEach(0..<count, id: \.self) { index in
          page(index).containerRelativeFrame(.horizontal)
        }
      }
      .scrollTargetLayout()
    }
    .scrollTargetBehavior(.paging)
    // Opens on `current`: the page's share of the way along the pages.
    .defaultScrollAnchor(
      UnitPoint(x: count > 1 ? CGFloat(current) / CGFloat(count - 1) : 0, y: 0),
      for: .initialOffset)
    .scrollPosition(id: Binding { current } set: { if let shown = $0 { current = shown } })
    .scrollIndicators(.hidden)
  }
}
