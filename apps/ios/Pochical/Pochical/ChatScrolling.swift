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
  /// How far the lines are scrolled from their top, set at every frame
  /// and read only to move them, so remaking nothing.
  var offset: CGFloat = 0
  /// Where the lines are scrolled to by code by an offset.
  var position = ScrollPosition()
  /// The line first as earlier pages were asked for, held where it is on
  /// the screen as they come in above it, until the chat follows its
  /// latest again. Not once a line is opened at 続きを読む, which goes on
  /// down from where it is.
  var edge: String?
  /// How far the lines seen have been pushed down and not yet moved back.
  var moveBack: CGFloat = 0
  /// The move back last asked for: where to, and by how much.
  var moving: (to: CGFloat, by: CGFloat)?

  /// The lines seen pushed down by lines coming in or growing above them,
  /// moved back after this layout: asked for during it, the scroll view
  /// drops it. Pushed again before then (a link's page drawn above), they
  /// go back by both at once.
  func pushedDown(by grew: CGFloat) {
    let asked = moveBack != 0
    moveBack += grew
    if !asked { Task { @MainActor in moveLinesBack() } }
  }

  /// Moves the lines back. At once while still, not through the page that
  /// came in; while the lines scroll (bouncing at the top), the scroll view
  /// takes it only so.
  func moveLinesBack() {
    guard moveBack != 0 else { return }
    moving = (offset + moveBack, moveBack)
    var transaction = Transaction()
    transaction.disablesAnimations = !scrolling
    withTransaction(transaction) { position.scrollTo(y: offset + moveBack) }
  }

  /// The lines scrolled to an offset: once moved back there, what was
  /// pushed since is moved back next; else asked again, as the scroll view
  /// drops it at times (a touch as it goes).
  func scrolled(to offset: CGFloat) {
    self.offset = offset
    guard let moving else { return }
    if abs(offset - moving.to) < abs(moving.by) / 2 {
      moveBack -= moving.by
      self.moving = nil
    }
    if moveBack != 0 { Task { @MainActor in moveLinesBack() } }
  }

  /// The line held as earlier pages come in let go, and any move back
  /// still to come with it.
  func letGo() {
    edge = nil
    moveBack = 0
    moving = nil
  }
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

/// The lines' scroll position, read here, not in the screen, so the
/// person's scrolling setting it remakes only this.
struct ScrollsBy: ViewModifier {
  @Bindable var scroll: ChatScroll

  func body(content: Content) -> some View {
    content.scrollPosition($scroll.position)
  }
}

/// An earlier page coming in above the lines, they stay where they were on
/// the screen, as the messaging apps keep them. The bottom anchor holds
/// them only at times (not at the top edge, nor for a page coming in just
/// after the one before was put back, as two do in a fast fling). So the
/// line that was first is watched: whatever comes in or grows above
/// it and pushes it down the screen, the lines are moved back by as much.
struct KeepsSeenLines: View {
  let id: String
  let scroll: ChatScroll

  var body: some View {
    if scroll.edge == id {
      Color.clear.onGeometryChange(for: EdgeSpot.self) { geometry in
        // Its foot: its own top changes as lines come in over it, its
        // writer's name going when the run now starts above it.
        EdgeSpot(
          inLines: geometry.frame(in: .named(ChatScreen.lines)).maxY,
          onScreen: geometry.frame(in: .scrollView).maxY)
      } action: { before, now in
        // Scrolling moves it on the screen only; lines above it change
        // where it is among them.
        let grew = now.inLines - before.inLines
        guard abs(grew) > 0.5 else { return }
        // Held by the bottom anchor, it moved on the screen by no more than
        // the person's own scrolling in the frame. Else it goes back by as
        // much as grew above it, not by how far it moved, which a fling
        // in that frame is part of and would be undone.
        let moved = now.onScreen - before.onScreen
        guard abs(moved) > abs(grew) / 2 else { return }
        scroll.pushedDown(by: grew)
      }
    }
  }
}

nonisolated private struct EdgeSpot: Equatable {
  let inLines: CGFloat
  let onScreen: CGFloat
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
