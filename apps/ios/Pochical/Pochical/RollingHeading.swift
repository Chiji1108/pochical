import PochicalDesign
import PochicalKit
import SwiftUI

/// Where the calendar's pages are, in pages from the first: 3.4 is four
/// tenths of the way from the fourth page to the fifth. Kept apart from
/// the screen's state so that only what follows the pages is drawn again
/// as they move.
@Observable final class PagerPosition {
  var pages: CGFloat

  init(pages: Int) {
    self.pages = CGFloat(pages)
  }
}

/// The year over the month, as /design's MonthName: while the pages move,
/// by a finger or on their own, each rolls within its own line toward the
/// month coming in, the next coming up from below and the one before down
/// from above, and the year rolls only when it changes. With reduced
/// motion they just change.
struct MonthName: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let position: PagerPosition
  /// The month the page at an index shows.
  let monthAt: (Int) -> Day

  var body: some View {
    let at = position.pages
    let page = Int(at.rounded())
    // From the nearest page, so a month comes in whole as its page lands.
    let share = reduceMotion ? 0 : at - CGFloat(page)
    let month = monthAt(page)
    let coming = share > 0 ? monthAt(page + 1) : share < 0 ? monthAt(page - 1) : month
    VStack(alignment: .leading, spacing: 4) {
      RollingText(text: String(month.year), coming: String(coming.year), share: share)
        .font(.system(size: 11))
        .foregroundStyle(colors.textTertiary)
      HStack(alignment: .firstTextBaseline, spacing: 4) {
        RollingText(text: String(month.month), coming: String(coming.month), share: share)
          .font(.system(size: 36, weight: .semibold))
        Text("月")
          .font(.system(size: 14, weight: .medium))
      }
      .foregroundStyle(colors.textPrimary)
    }
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(month.yearMonthText)
    .accessibilityAddTraits(.isHeader)
  }
}

/// A month and its year on one line, 2026年9月, rolling as MonthName does
/// while the pages move (/design's MonthRow under 1人ずつ).
struct RollingMonthTitle: View {
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let position: PagerPosition
  let monthAt: (Int) -> Day

  var body: some View {
    let at = position.pages
    let page = Int(at.rounded())
    let share = reduceMotion ? 0 : at - CGFloat(page)
    let month = monthAt(page)
    let coming = share > 0 ? monthAt(page + 1) : share < 0 ? monthAt(page - 1) : month
    HStack(alignment: .firstTextBaseline, spacing: 0) {
      RollingText(text: String(month.year), coming: String(coming.year), share: share)
      Text("年")
      RollingText(text: String(month.month), coming: String(coming.month), share: share)
      Text("月")
    }
    .font(.title3.bold())
    .accessibilityElement(children: .ignore)
    .accessibilityLabel(month.yearMonthText)
    .accessibilityAddTraits(.isHeader)
  }
}

/// A name rolling within its own line toward `coming`, `share` of the way
/// to its page (-0.5 to 0.5; toward the next above 0). Half way, the next
/// page's name takes its place, half rolled in, so the roll runs on
/// without a break. Its width goes along from the one name's to the
/// other's, so what follows it (月) moves over as it rolls.
struct RollingText: View {
  let text: String
  let coming: String
  let share: CGFloat

  var body: some View {
    let moving = coming == text ? 0 : share
    BlendedWidth(share: abs(moving)) {
      Text(text)
        .fixedSize()
        .visualEffect { content, proxy in
          content.offset(y: -moving * proxy.size.height)
        }
        .opacity(1 - abs(moving))
      if moving != 0 {
        Text(coming)
          .fixedSize()
          .visualEffect { content, proxy in
            content.offset(y: ((moving > 0 ? 1 : -1) - moving) * proxy.size.height)
          }
          .opacity(abs(moving))
      }
    }
    // Within its own line, while a wider name can still show whole.
    .mask { Rectangle().padding(.horizontal, -24) }
  }
}

/// Its first view's width going to its second's by `share`, both laid at
/// its leading edge.
private struct BlendedWidth: Layout {
  var share: CGFloat

  func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
    let sizes = subviews.map { $0.sizeThatFits(.unspecified) }
    guard let first = sizes.first else { return .zero }
    let second = sizes.count > 1 ? sizes[1] : first
    return CGSize(
      width: first.width + (second.width - first.width) * share,
      height: max(first.height, second.height))
  }

  func placeSubviews(
    in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()
  ) {
    for subview in subviews {
      subview.place(at: bounds.origin, anchor: .topLeading, proposal: .unspecified)
    }
  }
  /// The first view's baseline, so what stands beside it on its line
  /// stays put as the second rolls in.
  func explicitAlignment(
    of guide: VerticalAlignment, in bounds: CGRect, proposal: ProposedViewSize,
    subviews: Subviews, cache: inout ()
  ) -> CGFloat? {
    subviews.first.map { bounds.minY + $0.dimensions(in: .unspecified)[guide] }
  }
}

/// The way back to this month or week, as /design's TodayCorner: out of
/// sight on its page, it fades in as the pages leave it and out as they
/// are brought back, following them.
struct TodayFade<Content: View>: View {
  let position: PagerPosition
  /// The page of this month, or of this week.
  let todayPage: Int
  @ViewBuilder let content: Content

  var body: some View {
    let away = min(abs(position.pages - CGFloat(todayPage)), 1)
    content
      .opacity(away)
      // Out of sight, it is out of reach too.
      .allowsHitTesting(away > 0)
      .accessibilityHidden(away == 0)
  }
}
