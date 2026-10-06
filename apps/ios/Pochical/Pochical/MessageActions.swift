import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

/// One item of a line's menu.
struct MessageAction: Identifiable {
  let title: String
  let systemImage: String
  /// In the danger color, as 送信取消 and 通報 are.
  var destructive = false
  /// Set a little apart from the items before it, as a menu's groups are.
  var startsGroup = false
  let run: () -> Void
  var id: String { title }
}

/// What a line's long press opens: the line lifted where it was, the
/// reactions over it and the menu under it.
struct MessageActionsRequest: Identifiable {
  let id = UUID()
  /// The line's op_id, so its bubble in the chat stands empty meanwhile.
  let lineID: String
  /// The bubble's frame on the screen, where it was pressed.
  let frame: CGRect
  let mine: Bool
  /// The bubble itself, drawn again over the dimming.
  let bubble: AnyView
  /// The line's reactions and the reader, for the bar; none for a line
  /// that takes none yet, like one still on its way.
  var reactions: [LineReaction]?
  var meID: String?
  var onReact: (String) -> Void = { _ in }
  var onMoreReactions: () -> Void = {}
  let actions: [MessageAction]
}

/// A line's long press (/design's MessageActions), as Messages and LINE
/// draw one: the rest of the screen dims while the line stays bright, the
/// first reactions in a bar over it with + for any other, and the menu
/// under it, all moved together to stay on the screen. A tap elsewhere
/// closes it; a pick closes it, then acts.
struct MessageActionsOverlay: View {
  @Environment(\.themeColors) private var colors
  let request: MessageActionsRequest
  /// Closes the overlay, then runs the picked action, if any.
  let onClose: ((() -> Void)?) -> Void
  @State private var shown = false

  private static var barHeight: CGFloat { 48 }
  private static var gap: CGFloat { 8 }
  private static var menuWidth: CGFloat { 250 }
  private static var rowHeight: CGFloat { 44 }
  private static var groupGap: CGFloat { 8 }
  private static var margin: CGFloat { 12 }

  var body: some View {
    GeometryReader { proxy in
      let place = placement(in: proxy.size)
      ZStack(alignment: .topLeading) {
        colors.scrim
          .opacity(shown ? 1 : 0)
          .onTapGesture { close(nil) }
          .accessibilityHidden(true)
        if request.reactions != nil {
          reactionBar
            .modifier(Placed(edge: place.edge, x: place.x, y: place.barY, width: proxy.size.width))
            .scaleEffect(shown ? 1 : 0.6, anchor: request.mine ? .bottomTrailing : .bottomLeading)
            .opacity(shown ? 1 : 0)
        }
        request.bubble
          .frame(width: request.frame.width, height: place.bubbleHeight, alignment: .bottom)
          .clipped()
          // Grown about its own middle, before it is put in place.
          .scaleEffect(shown ? 1.02 : 1)
          .offset(x: request.frame.minX, y: place.bubbleY)
          .accessibilityHidden(true)
        menu
          .frame(width: Self.menuWidth)
          .modifier(Placed(edge: place.edge, x: place.x, y: place.menuY, width: proxy.size.width))
          .scaleEffect(shown ? 1 : 0.6, anchor: request.mine ? .topTrailing : .topLeading)
          .opacity(shown ? 1 : 0)
      }
      .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
    }
    .ignoresSafeArea()
    .accessibilityAddTraits(.isModal)
    .accessibilityAction(.escape) { close(nil) }
    .onAppear {
      withAnimation(.spring(duration: 0.28, bounce: 0.2)) { shown = true }
    }
  }

  // MARK: Parts

  private var reactionBar: some View {
    HStack(spacing: 2) {
      ForEach(reactionChoices, id: \.self) { emoji in
        let chosen = (request.reactions ?? []).contains {
          $0.emoji == emoji && $0.userIDs.contains(request.meID ?? "")
        }
        Button {
          close { request.onReact(emoji) }
        } label: {
          Text(emoji)
            .font(.system(size: 26))
            .frame(width: 40, height: 40)
            .background(chosen ? colors.accentContainer : .clear, in: Circle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(chosen ? "\(emoji)のリアクションを外す" : "\(emoji)でリアクション")
      }
      Button {
        close(request.onMoreReactions)
      } label: {
        Image(systemName: "plus")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(colors.textSecondary)
          .frame(width: 40, height: 40)
          .background(colors.fillTertiary, in: Circle())
      }
      .buttonStyle(.plain)
      .accessibilityLabel("ほかの絵文字でリアクション")
    }
    .padding(4)
    .frame(height: Self.barHeight)
    // On the raised ground, as /design's bar: glass would show the lines
    // under it through the dimming.
    .background(colors.backgroundElevated, in: Capsule())
    .overlay(Capsule().strokeBorder(colors.borderDefault, lineWidth: 0.5))
    .shadow(color: colors.shadowMedium, radius: 12, y: 4)
  }

  private var menu: some View {
    VStack(spacing: 0) {
      ForEach(Array(request.actions.enumerated()), id: \.element.id) { index, action in
        if index > 0 {
          Rectangle()
            .fill(colors.separator)
            .frame(height: action.startsGroup ? Self.groupGap : 0.5)
        }
        Button {
          close(action.run)
        } label: {
          HStack {
            Text(action.title)
            Spacer(minLength: 12)
            Image(systemName: action.systemImage)
          }
          .font(.body)
          .foregroundStyle(action.destructive ? colors.dangerDefault : colors.textPrimary)
          .padding(.horizontal, 16)
          .frame(height: Self.rowHeight)
          .contentShape(.rect)
        }
        .buttonStyle(MenuRowStyle())
      }
    }
    .background(colors.backgroundElevated)
    .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(colors.borderDefault, lineWidth: 0.5)
    )
    .shadow(color: colors.shadowMedium, radius: 12, y: 4)
  }

  // MARK: Placing

  /// Where the bar, the bubble and the menu go: as the line was, moved
  /// together to stay between the screen's edges, the bubble cut short at
  /// its top when the three cannot fit.
  private func placement(in size: CGSize) -> Placement {
    let insets = Self.safeInsets
    let top = insets.top + Self.margin
    let bottom = size.height - insets.bottom - Self.margin
    let barSpace = request.reactions == nil ? 0 : Self.barHeight + Self.gap
    let menuSpace = Self.gap + menuHeight
    let bubbleHeight = min(request.frame.height, max(bottom - top - barSpace - menuSpace, 60))
    var bubbleY = request.frame.maxY - bubbleHeight
    if bubbleY - barSpace < top {
      bubbleY = top + barSpace
    }
    if bubbleY + bubbleHeight + menuSpace > bottom {
      bubbleY = bottom - menuSpace - bubbleHeight
    }
    return Placement(
      edge: request.mine ? .trailing : .leading,
      x: request.mine ? request.frame.maxX : request.frame.minX,
      barY: bubbleY - barSpace,
      bubbleY: bubbleY,
      bubbleHeight: bubbleHeight,
      menuY: bubbleY + bubbleHeight + Self.gap)
  }

  private var menuHeight: CGFloat {
    request.actions.enumerated().reduce(0) { height, item in
      let gap = item.offset == 0 ? 0 : (item.element.startsGroup ? Self.groupGap : 0.5)
      return height + gap + Self.rowHeight
    }
  }

  private static var safeInsets: UIEdgeInsets {
    UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.keyWindow }
      .first?.safeAreaInsets ?? .zero
  }

  /// Fades out, then closes and acts.
  private func close(_ action: (() -> Void)?) {
    withAnimation(.easeIn(duration: 0.15)) {
      shown = false
    } completion: {
      onClose(action)
    }
  }
}

private struct Placement {
  let edge: HorizontalEdge
  /// The bubble's edge by its writer's side, the bar and menu lined up
  /// with it.
  let x: CGFloat
  let barY: CGFloat
  let bubbleY: CGFloat
  let bubbleHeight: CGFloat
  let menuY: CGFloat
}

/// A view put at `y`, its leading or trailing edge at `x`, kept inside
/// the screen's sides.
private struct Placed: ViewModifier {
  let edge: HorizontalEdge
  let x: CGFloat
  let y: CGFloat
  let width: CGFloat

  func body(content: Content) -> some View {
    content
      .fixedSize()
      .alignmentGuide(.leading) { size in
        let left = edge == .leading ? x : x - size.width
        return -min(max(left, 12), width - size.width - 12)
      }
      .alignmentGuide(.top) { _ in -y }
  }
}

/// A menu row's press, the fill a system menu gives the row under the
/// finger.
private struct MenuRowStyle: ButtonStyle {
  @Environment(\.themeColors) private var colors

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(configuration.isPressed ? colors.fillSecondary : .clear)
  }
}
