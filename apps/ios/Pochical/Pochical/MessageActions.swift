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

/// The finger still on the screen from the long press that opened a
/// line's menu, as a system menu follows it: what it is over is picked
/// when it lifts. It belongs to the chat's window, where the press began,
/// so the line follows it there and tells the overlay.
@MainActor @Observable final class HeldFinger {
  /// Where it is on the screen, once it has moved.
  var point: CGPoint?
  /// Lifted from the screen.
  var lifted = false
}

/// The long press that opens a line's menu, followed past its opening
/// as UIKit's long press is: where the finger moves, and where it lifts.
/// It sees the same press as the line's own, alongside it.
struct HeldPress: UIGestureRecognizerRepresentable {
  static let duration = 0.35
  let onMove: (CGPoint) -> Void
  let onLift: (CGPoint) -> Void

  func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

  func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
    let press = UILongPressGestureRecognizer()
    press.minimumPressDuration = Self.duration
    press.delegate = context.coordinator
    return press
  }

  func handleUIGestureRecognizerAction(
    _ recognizer: UILongPressGestureRecognizer, context: Context
  ) {
    let point = context.converter.location(in: .global)
    switch recognizer.state {
    case .changed: onMove(point)
    case .ended: onLift(point)
    default: break
    }
  }

  final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    func gestureRecognizer(
      _ gestureRecognizer: UIGestureRecognizer,
      shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { true }
  }
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
  /// The finger that opened it, while it is still down; none when opened
  /// otherwise.
  var finger: HeldFinger?
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
/// under it, all moved together to stay on the screen; a bubble too tall
/// for the room is drawn smaller, as a context menu's preview is. A tap
/// elsewhere closes it; a pick, by a tap or by the finger that opened it
/// lifting over one, closes it, then acts.
struct MessageActionsOverlay: View {
  @Environment(\.themeColors) private var colors
  let request: MessageActionsRequest
  /// Closes the overlay, then runs the picked action, if any.
  let onClose: ((() -> Void)?) -> Void
  @State private var shown = false
  /// Where each choice is on the screen, for the held finger.
  @State private var targets: [Target: CGRect] = [:]

  private static var barHeight: CGFloat { 48 }
  private static var gap: CGFloat { 8 }
  private static var menuWidth: CGFloat { 250 }
  private static var rowHeight: CGFloat { 44 }
  private static var groupGap: CGFloat { 8 }
  private static var margin: CGFloat { 12 }
  /// How small a tall bubble is drawn at least; past that its end is cut
  /// off.
  private static var leastScale: CGFloat { 0.5 }

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
            .scaleEffect(shown ? 1 : 0.85, anchor: request.mine ? .bottomTrailing : .bottomLeading)
            .opacity(shown ? 1 : 0)
        }
        request.bubble
          .frame(width: request.frame.width, height: request.frame.height)
          // Drawn smaller about its top corner by the writer when too tall,
          // then cut to the room.
          .scaleEffect(shown ? place.scale : 1, anchor: request.mine ? .topTrailing : .topLeading)
          .frame(
            width: request.frame.width, height: shown ? place.bubbleHeight : request.frame.height,
            alignment: .top
          )
          .clipped()
          // Grown about its own middle, before it is put in place; it
          // rises from where it was and goes back there.
          .scaleEffect(shown ? 1.02 : 1)
          .offset(x: request.frame.minX, y: shown ? place.bubbleY : request.frame.minY)
          .accessibilityHidden(true)
        menu
          .frame(width: Self.menuWidth)
          .modifier(Placed(edge: place.edge, x: place.x, y: place.menuY, width: proxy.size.width))
          .scaleEffect(shown ? 1 : 0.85, anchor: menuAnchor(under: place.menuUnder))
          .opacity(shown ? 1 : 0)
      }
      .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
    }
    .ignoresSafeArea()
    .accessibilityAddTraits(.isModal)
    .accessibilityAction(.escape) { close(nil) }
    .sensoryFeedback(.selection, trigger: underFinger) { _, now in now != nil }
    .onChange(of: request.finger?.lifted) { _, lifted in
      // Lifted over nothing, it stays open for a tap, as a system menu does.
      if lifted == true, let target = underFinger {
        pick(target)
      }
    }
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
          pick(.reaction(emoji))
        } label: {
          Text(emoji)
            .font(.system(size: 26))
            .frame(width: 40, height: 40)
            .background(chosen ? colors.accentContainer : .clear, in: Circle())
            .scaleEffect(underFinger == .reaction(emoji) ? 1.3 : 1)
            .animation(.spring(duration: 0.2), value: underFinger)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(chosen ? "\(emoji)のリアクションを外す" : "\(emoji)でリアクション")
        .modifier(Tracked(target: .reaction(emoji), targets: $targets))
      }
      Button {
        pick(.moreReactions)
      } label: {
        Image(systemName: "plus")
          .font(.system(size: 18, weight: .semibold))
          .foregroundStyle(colors.textSecondary)
          .frame(width: 40, height: 40)
          .background(colors.fillTertiary, in: Circle())
          .scaleEffect(underFinger == .moreReactions ? 1.3 : 1)
          .animation(.spring(duration: 0.2), value: underFinger)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("ほかの絵文字でリアクション")
      .modifier(Tracked(target: .moreReactions, targets: $targets))
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
          pick(.action(action.id))
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
        .buttonStyle(MenuRowStyle(held: underFinger == .action(action.id)))
        .modifier(Tracked(target: .action(action.id), targets: $targets))
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

  /// Where the bar, the bubble and the menu go: the bubble where it was,
  /// the bar over it and the menu under it, or over the bar when there is
  /// no room under it, as LINE turns it. Only when neither fits are the
  /// three moved together to stay between the screen's edges, the bubble
  /// drawn smaller when they cannot fit, and cut short at its end past
  /// that.
  private func placement(in size: CGSize) -> Placement {
    let insets = Self.safeInsets
    let top = insets.top + Self.margin
    let bottom = size.height - insets.bottom - Self.margin
    let barSpace = request.reactions == nil ? 0 : Self.barHeight + Self.gap
    let menuSpace = Self.gap + menuHeight
    let frame = request.frame
    let stays = frame.minY - barSpace >= top && frame.maxY <= bottom
    if stays, frame.maxY + menuSpace <= bottom || frame.minY - barSpace - menuSpace >= top {
      let under = frame.maxY + menuSpace <= bottom
      return Placement(
        edge: request.mine ? .trailing : .leading,
        x: request.mine ? frame.maxX : frame.minX,
        barY: frame.minY - barSpace,
        bubbleY: frame.minY,
        bubbleHeight: frame.height,
        scale: 1,
        menuY: under ? frame.maxY + Self.gap : frame.minY - barSpace - menuSpace,
        menuUnder: under)
    }
    let room = max(bottom - top - barSpace - menuSpace, 60)
    let scale = min(1, max(room / frame.height, Self.leastScale))
    let bubbleHeight = min(frame.height * scale, room)
    var bubbleY = frame.minY
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
      scale: scale,
      menuY: bubbleY + bubbleHeight + Self.gap,
      menuUnder: true)
  }

  /// Where the menu grows from: its corner by the bubble.
  private func menuAnchor(under: Bool) -> UnitPoint {
    switch (under, request.mine) {
    case (true, true): .topTrailing
    case (true, false): .topLeading
    case (false, true): .bottomTrailing
    case (false, false): .bottomLeading
    }
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

  /// The choice under the held finger, if any.
  private var underFinger: Target? {
    guard let point = request.finger?.point else { return nil }
    return targets.first { $0.value.contains(point) }?.key
  }

  /// Closes, then does what `target` stands for.
  private func pick(_ target: Target) {
    switch target {
    case .reaction(let emoji):
      close { request.onReact(emoji) }
    case .moreReactions:
      close(request.onMoreReactions)
    case .action(let id):
      close(request.actions.first { $0.id == id }?.run)
    }
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
  /// How large the bubble is drawn: below 1 when too tall for the room.
  let scale: CGFloat
  let menuY: CGFloat
  /// The menu under the bubble; else over the bar.
  let menuUnder: Bool
}

/// One of the overlay's choices.
private enum Target: Hashable {
  case reaction(String)
  case moreReactions
  case action(String)
}

/// Keeps where a choice is on the screen, for the held finger.
private struct Tracked: ViewModifier {
  let target: Target
  @Binding var targets: [Target: CGRect]

  func body(content: Content) -> some View {
    content.onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: {
      targets[target] = $0
    }
  }
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
/// finger, a tap's or the held one's.
private struct MenuRowStyle: ButtonStyle {
  @Environment(\.themeColors) private var colors
  let held: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(configuration.isPressed || held ? colors.fillSecondary : .clear)
  }
}

/// A window over the app's own, for what must cover everything at once,
/// bars included, with no presentation of its own: a line's reactions
/// and menu draw their coming in themselves, where a full-screen cover
/// would slide in first.
@MainActor final class OverlayWindow {
  static let shared = OverlayWindow()
  private var window: UIWindow?

  func show(_ view: some View) {
    guard
      let scene = UIApplication.shared.connectedScenes
        .compactMap({ $0 as? UIWindowScene })
        .first(where: { $0.activationState == .foregroundActive })
    else { return }
    let host = UIHostingController(rootView: AnyView(view))
    host.view.backgroundColor = .clear
    let window = UIWindow(windowScene: scene)
    window.windowLevel = .alert
    window.backgroundColor = .clear
    window.rootViewController = host
    window.isHidden = false
    self.window = window
  }

  /// Takes the window shown now away after `delay`; one shown meanwhile,
  /// for another line, stays.
  func hide(after delay: Duration = .zero) {
    guard let closing = window else { return }
    window = nil
    Task { @MainActor in
      try? await Task.sleep(for: delay)
      closing.isHidden = true
    }
  }
}
