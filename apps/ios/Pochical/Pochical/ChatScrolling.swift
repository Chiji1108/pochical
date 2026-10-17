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
}

/// The ↓ to the latest, once away from it or with others' unread lines
/// below, counted on it as a chat's unread are; reading happens at the
/// latest, so none while there. While ここから新着 is below the top of the
/// screen, it goes there first.
struct LatestButton: View {
  @Environment(\.themeColors) private var colors
  let scroll: ChatScroll
  let unread: Int
  let action: () -> Void

  var body: some View {
    let unseen = scroll.place.atLatest ? 0 : unread
    // Over the composer's right, rising with it on the keyboard.
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
        .accessibilityLabel(label(unseen: unseen))
        .padding(12)
        .transition(.opacity)
      }
    }
  }

  private func label(unseen: Int) -> String {
    let to = scroll.place.unreadBelow ? "ここから新着へ" : "最新のメッセージへ"
    return unseen > 0 ? "\(to)、まだ見ていない新着\(unseen)件" : to
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

/// The top of the lines while the next earlier page is on its way from
/// the server: pages the device holds come in before the top is reached
/// (ChatLinesView asks Chat.prefetchScreens ahead).
struct EarlierLines: View {
  var body: some View {
    ProgressView()
      .frame(maxWidth: .infinity, minHeight: Metrics.touch)
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
  /// ここから新着 is below the top of the screen, where ↓ goes first.
  var unreadBelow = false
}

/// What moves a following chat to its foot: a line coming in and someone
/// writing.
struct FollowKey: Equatable {
  let latest: Int64?
  let writers: Int
}

struct ReadKey: Hashable {
  let opened: Bool
  let active: Bool
  let latest: Int64
  let reached: Int
}
