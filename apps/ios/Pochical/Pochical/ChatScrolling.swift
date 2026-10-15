import PochicalDesign
import PochicalKit
import SwiftUI

// Where a chat's lines are scrolled, and what shows it: the ↓ to the
// latest, the day floating over the lines, the spinner asking for earlier
// ones (ChatScreen).

/// What scrolling changes in a chat, read by the pieces that show it
/// (the ↓, the floating day) rather than by the screen, whose every line
/// would be made again at each change.
@Observable
final class ChatScroll {
  var place = ScrollPlace()
  /// The day of the lines at the top, once its title has gone up out of
  /// sight (LINE's), shown while the chat scrolls.
  var topDay: Day?
  var dayShown = false
  var scrolling = false
  /// Where ここから新着 is among the lines, and their height: the new
  /// lines under it fit on the screen at the latest when they are few,
  /// and opening has nowhere to go for it then.
  var unreadTop: CGFloat?
  var linesHeight: CGFloat = 0
  /// The height the lines are seen in, between the pins and the composer.
  var seen: CGFloat = 0
}

/// The ↓ to the latest, once away from it or with others' unread lines
/// below, counted on it as a chat's unread are; reading happens at the
/// latest, so none while there.
struct LatestButton: View {
  @Environment(\.themeColors) private var colors
  let scroll: ChatScroll
  let unread: Int
  let action: () -> Void

  var body: some View {
    let unseen = scroll.place.atLatest ? 0 : unread
    // In a group that rises with the keyboard as the lines' room does:
    // shown as the keyboard rises, it would be drawn where the room ends.
    ZStack {
      if scroll.place.away || unseen > 0 {
        // The system's glass button, which takes the tap as a button: glass
        // made to respond to a finger on a plain button's label took it on a
        // device, over the scrolling lines, and the button did nothing.
        Button(action: action) {
          Image(systemName: "chevron.down")
            .font(.body.weight(.semibold))
            .foregroundStyle(colors.textPrimary)
            .frame(width: Metrics.touch - 12, height: Metrics.touch - 12)
        }
        .buttonStyle(.glass)
        .buttonBorderShape(.circle)
        .overlay(alignment: .topTrailing) {
          if unseen > 0 {
            UnreadCount(count: unseen).offset(x: 4, y: -4).allowsHitTesting(false)
          }
        }
        .accessibilityLabel(
          unseen > 0 ? "最新のメッセージへ、まだ見ていない新着\(unseen)件" : "最新のメッセージへ"
        )
        .padding(12)
        .transition(.opacity)
      }
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .bottomTrailing)
    .geometryGroup()
  }
}

/// The day of the lines at the top, floating over them while the chat
/// scrolls and a moment after (chatRules.floatingDayMs); not over a notice.
struct FloatingDay: View {
  @Environment(\.themeColors) private var colors
  let scroll: ChatScroll
  let covered: Bool

  var body: some View {
    Group {
      if let day = scroll.topDay, scroll.dayShown, !covered {
        Text(ChatTime.day(day))
          .font(.caption2)
          .foregroundStyle(colors.textSecondary)
          .padding(.horizontal, 12)
          .padding(.vertical, 2)
          .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Radius.sm))
          .padding(.top, 8)
          .allowsHitTesting(false)
          .accessibilityHidden(true)
          .transition(.opacity)
      }
    }
    .task(id: scroll.dayShown) {
      guard scroll.dayShown else { return }
      while !Task.isCancelled {
        try? await Task.sleep(for: .milliseconds(Chat.floatingDayMs))
        if !Task.isCancelled, !scroll.scrolling {
          withAnimation(.easeOut(duration: 0.2)) { scroll.dayShown = false }
          return
        }
      }
    }
  }
}

/// The top of the lines while earlier ones are to come, which asks for
/// them once scrolled near (from the scroll's own place: whether a view is
/// in sight is read once, as the lines are first laid out at the top), and
/// again after each page while it stays there. Not before the chat has
/// come in on its place, which would add lines above the latest it opens on.
struct EarlierLines: View {
  let scroll: ChatScroll
  let first: Int64?
  let ready: Bool
  let show: () async -> Void

  var body: some View {
    let near = scroll.place.nearTop && ready
    ProgressView()
      .frame(maxWidth: .infinity, minHeight: Metrics.touch)
      .task(id: PageAsk(first: first, inSight: near)) {
        if near { await show() }
      }
  }
}

/// Where the lines are scrolled: at the latest, and more than half a
/// screen up from it.
struct ScrollPlace: Hashable {
  var atLatest = true
  var away = false
  /// The lines are shorter than the screen, held at its foot, with
  /// nowhere to scroll.
  var fits = true
  /// At the top edge, where an earlier page coming in would leave it.
  var atTop = false
  /// Near enough the top that its spinner is on the screen.
  var nearTop = false
}

/// When earlier lines are asked for: the top in sight, again after each
/// page.
private struct PageAsk: Equatable {
  let first: Int64?
  let inSight: Bool
}

/// What moves a following chat to its foot: a line coming in and someone
/// writing.
struct FollowKey: Equatable {
  let latest: Int64?
  let writers: Int
}

/// The height the lines are seen in, and how far their foot is below it.
struct Room: Equatable {
  let seen: CGFloat
  let below: CGFloat
}

/// The lines, shorter than the room they are seen in, fill it at its foot.
/// Read here, not in the screen, so the room changing remakes only this.
struct FillsSeen: ViewModifier {
  let scroll: ChatScroll

  func body(content: Content) -> some View {
    content.frame(minHeight: scroll.seen, alignment: .bottom)
  }
}

struct ReadKey: Hashable {
  let opened: Bool
  let active: Bool
  let latest: Int64
  let reached: Int
}
