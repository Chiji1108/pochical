import PochicalDesign
import PochicalKit
import SwiftUI

/// Where the calendar's pages are, in pages from the first: 3.4 is four
/// tenths of the way from the fourth page to the fifth. Kept apart from
/// the screen's state so that only what follows the pages is drawn again
/// as they move.
@Observable final class PagerPosition {
  var pages: CGFloat = 0
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
    .accessibilityLabel("\(month.year)年\(month.month)月")
    .accessibilityAddTraits(.isHeader)
  }
}

/// A name rolling within its own line toward `coming`, `share` of the way
/// to its page (-0.5 to 0.5; toward the next above 0). Half way, the next
/// page's name takes its place, half rolled in, so the roll runs on
/// without a break.
private struct RollingText: View {
  let text: String
  let coming: String
  let share: CGFloat

  var body: some View {
    let moving = coming == text ? 0 : share
    ZStack {
      Text(text)
        .visualEffect { content, proxy in
          content.offset(y: -moving * proxy.size.height)
        }
        .opacity(1 - abs(moving))
      if moving != 0 {
        Text(coming)
          .visualEffect { content, proxy in
            content.offset(y: ((moving > 0 ? 1 : -1) - moving) * proxy.size.height)
          }
          .opacity(abs(moving))
      }
    }
    .clipped()
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
