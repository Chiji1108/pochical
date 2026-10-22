import PochicalDesign
import PochicalKit
import SwiftUI

// Where a chat's lines are scrolled, and what shows it: the ↓ to the
// latest, the day floating over the lines, the spinner while earlier ones
// come from the server (ChatScreen).

/// What scrolling changes in a chat, read by the pieces that show it
/// (the ↓, the floating day) rather than by the screen, whose every line
/// would be made again at each change.
@Observable
final class ChatScroll {
  var place = ScrollPlace()
  /// The day of the lines at the top, pinned over them while the chat
  /// scrolls as a list pins its section's header (PinnedDay).
  var topDay: Day?
  /// How far the next day's title coming up pushes the floating day up.
  var dayPush: CGFloat = 0
  var dayShown = false
  var scrolling = false
  /// The lines whose foot is on the screen, by item id: read on to the
  /// latest of them.
  var seen: [String] = []
  /// The first and last lines laid out, each while the lines are scrolled
  /// within Chat.prefetchScreens of it: the next page beyond it is to be
  /// laid out or asked for. By item id, as the chat's own lines may be
  /// ahead of those in place.
  var near = NearEnds()
}

/// The ↓ to the latest, once away from it or with others' unread lines
/// below, counted on it as a chat's unread are: lines are read as they
/// come on screen, so none while at the latest (at the foot of lines that
/// stop short of it, those after them still count). While ここから新着 is below
/// the top of the screen with lines under it still unread, it goes there
/// first.
struct LatestButton: View {
  @Environment(\.themeColors) private var colors
  /// Growing with the reader's text size, as its chevron does, as far as
  /// chatRules.controlsMostScale, so it never covers the lines it is over.
  @ScaledMetric(relativeTo: .body) private var scaled = Metrics.touch - 12
  private var size: CGFloat { min(scaled, (Metrics.touch - 12) * CGFloat(Chat.controlsMostScale)) }
  let scroll: ChatScroll
  let unread: Int
  /// The lines laid out reach the latest (ChatState.atEnd).
  var atEnd = true
  let action: () -> Void

  var body: some View {
    let unseen = scroll.place.atLatest && atEnd ? 0 : unread
    // Over the composer's right, rising with it on the keyboard.
    ZStack {
      // Shown too short of the latest, read or not: the only way on to it.
      if scroll.place.away || !atEnd || unseen > 0 {
        // The system's glass button, which takes the tap as a button: glass
        // made to respond to a finger on a plain button's label took it on a
        // device, over the scrolling lines, and the button did nothing.
        Button(action: action) {
          Image(systemName: "chevron.down")
            .font(.body.weight(.semibold))
            .dynamicTypeSize(...DynamicTypeSize.accessibility1)
            .foregroundStyle(colors.textPrimary)
            .frame(width: size, height: size)
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
    let to = scroll.place.unreadBelow && unseen > 0 ? "ここから新着へ" : "最新のメッセージへ"
    return unseen > 0 ? "\(to)、まだ見ていない新着\(unseen)件" : to
  }
}

/// What a pin or a copy did, said over a chat's lines for a moment.
/// Observed where it shows, in the host of the chat's pins (ChatStage):
/// the chat's own state reaches that host only as a new root, which
/// takes no animation with it.
@MainActor @Observable final class ChatNotice {
  var words: String?
}

/// Hanging under a chat's pins: the day of the lines at the top, and a
/// notice in its place while one is said.
struct UnderPins: View {
  let scroll: ChatScroll
  let notice: ChatNotice

  var body: some View {
    ZStack(alignment: .top) {
      FloatingDay(scroll: scroll, covered: notice.words != nil)
      if let words = notice.words {
        NoticeCapsule(words: words)
          .comesAsNotice()
      }
    }
    .animation(.default, value: notice.words)
  }
}

/// The day of the lines at the top, floating over them while the chat
/// scrolls and a moment after (chatRules.floatingDayMs); not over a notice.
/// The next day's title pushes it up and out, under where it rests, as it
/// comes up to take its place.
struct FloatingDay: View {
  /// Between the top of the lines seen and where the day rests.
  static let gap: CGFloat = 8
  @Environment(\.themeColors) private var colors
  let scroll: ChatScroll
  let covered: Bool

  var body: some View {
    Group {
      if let day = scroll.topDay, scroll.dayShown, !covered {
        DayWords(day: day)
          .foregroundStyle(colors.textSecondary)
          .glassEffect(.regular, in: RoundedRectangle(cornerRadius: Radius.sm))
          .offset(y: -scroll.dayPush)
          .clipped()
          .padding(.top, Self.gap)
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
/// (ChatStage asks Chat.prefetchScreens ahead).
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
  /// ここから新着 is below the top of the screen, where ↓ goes first.
  var unreadBelow = false
}

/// The lines laid out whose end is near (ChatScroll.near).
struct NearEnds: Hashable {
  var top: String?
  var foot: String?
}

struct ReadKey: Hashable {
  let shown: Bool
  let seen: Int64
}
