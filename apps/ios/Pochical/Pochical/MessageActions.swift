import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

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
  /// How far it slides before it picks what it is over, as far as UIKit's
  /// long press lets a finger wander: the menu can come to it rather than
  /// it to the menu, as the lines move under a still finger.
  static let slop: CGFloat = 10

  /// Where it was as the menu opened.
  private let start: CGPoint
  /// Where it is on the screen, once it has moved.
  var point: CGPoint? {
    didSet {
      if let point, hypot(point.x - start.x, point.y - start.y) >= Self.slop { slid = true }
    }
  }
  /// Slid since the menu opened, and so picks what it is over.
  private(set) var slid = false
  /// Lifted from the screen.
  var lifted = false

  init(at start: CGPoint) {
    self.start = start
  }
}

/// Where the keyboard's top is on the screen while it is up, for a line's
/// menu to stay over it: the keyboard stays as the menu opens, as LINE
/// keeps it, and its window stands over the menu's. Watched from the
/// app's start, as the keyboard may be up before any menu opens.
@MainActor @Observable final class KeyboardTop {
  static let shared = KeyboardTop()
  private(set) var y: CGFloat?
  private var watching = false

  func watch() {
    guard !watching else { return }
    watching = true
    let center = NotificationCenter.default
    center.addObserver(
      forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main
    ) { note in
      let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
      MainActor.assumeIsolated { self.take(end) }
    }
    center.addObserver(
      forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main
    ) { _ in
      MainActor.assumeIsolated { self.y = nil }
    }
  }

  private func take(_ end: CGRect?) {
    guard let end, end.height > 0 else {
      y = nil
      return
    }
    y = end.minY
  }
}

/// Where a held line's bubble is on the screen, kept while its menu is
/// open: the chat can move under the overlay, as when the keyboard goes
/// down for a menu that has no room over it, or lines come in, and the
/// bubble and menu go along.
@MainActor @Observable final class LineSpot {
  var frame: CGRect

  init(frame: CGRect) {
    self.frame = frame
  }
}

/// The long press that opens a line's menu, UIKit's: it counts from the
/// finger going down and says where it is, which SwiftUI's long press in
/// the chat's scroll view, beside the bubble's taps, does neither of (it
/// was seen to open past 0.6s for 0.15). It goes on past the opening:
/// where the finger moves, and where it lifts. It sees the press alongside
/// the bubble's taps, but never alongside the chat's scrolling, which
/// would carry the lines away under the open menu.
struct HeldPress: UIGestureRecognizerRepresentable {
  /// How long a line is held before its menu opens (chatRules.longPressMs).
  static let duration = Double(Chat.longPressMs) / 1000
  /// Says where the finger is in its chat line's cell rather than on the
  /// screen, which a line's SwiftUI in a cell cannot tell.
  var inLine = false
  /// The finger is down and not yet held, for the press's give.
  let onPressing: (Bool) -> Void
  /// Where the finger is as the press is held.
  let onHold: (CGPoint) -> Void
  let onMove: (CGPoint) -> Void
  let onLift: (CGPoint) -> Void

  func makeCoordinator(converter: CoordinateSpaceConverter) -> Coordinator { Coordinator() }

  func makeUIGestureRecognizer(context: Context) -> TouchedPress {
    let press = TouchedPress()
    press.minimumPressDuration = Self.duration
    press.delegate = context.coordinator
    let coordinator = context.coordinator
    coordinator.onPressing = onPressing
    press.onTouched = { coordinator.onPressing($0) }
    return press
  }

  func updateUIGestureRecognizer(_ recognizer: TouchedPress, context: Context) {
    context.coordinator.onPressing = onPressing
  }

  func handleUIGestureRecognizerAction(_ recognizer: TouchedPress, context: Context) {
    let point =
      inLine
      ? context.converter.location(in: .named(LineSpace.name))
      : context.converter.location(in: .global)
    switch recognizer.state {
    case .began: onHold(point)
    case .changed: onMove(point)
    case .ended, .cancelled: onLift(point)
    default: break
    }
  }

  final class Coordinator: NSObject, UIGestureRecognizerDelegate {
    var onPressing: (Bool) -> Void = { _ in }

    func gestureRecognizer(
      _ gestureRecognizer: UIGestureRecognizer,
      shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool { !(other is UIPanGestureRecognizer) }
  }
}

/// A long press that also tells when a finger goes down on it and when
/// the press is over, held or not: what UIKit's long press keeps to
/// itself until it is held.
final class TouchedPress: UILongPressGestureRecognizer {
  var onTouched: (Bool) -> Void = { _ in }

  override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
    super.touchesBegan(touches, with: event)
    if state == .possible { onTouched(true) }
  }

  override func reset() {
    super.reset()
    onTouched(false)
  }
}

/// What a line's long press opens: the line lifted where it was, the
/// reactions over it and the menu under it or over them.
struct MessageActionsRequest: Identifiable {
  let id = UUID()
  /// The line's op_id, so its bubble in the chat stands empty meanwhile.
  let lineID: String
  /// Where the bubble is on the screen.
  let spot: LineSpot
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

  var frame: CGRect { spot.frame }
}

/// A line's long press (/design's MessageActions), as Messages and LINE
/// draw one: the rest of the screen dims while the line stays bright, the
/// first reactions in a bar over it with + for any other, and the menu
/// under it or, with no room there, over the bar (placement(in:)), all
/// over the keyboard when it is up and they fit there, as LINE keeps it.
/// A tap elsewhere closes it; a pick, by a tap or by the finger that
/// opened it sliding onto one and lifting there, acts as it closes, as
/// the system's menu does: what it opens comes in as the menu goes.
struct MessageActionsOverlay: View {
  @Environment(\.themeColors) private var colors
  /// Motion reduced, it fades in and out where it is, nothing growing or
  /// lifting (spec/chat.md, Opening a message's menu).
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let request: MessageActionsRequest
  /// Takes the overlay away, once it has gone.
  let onClose: () -> Void
  @State private var shown = false
  /// Where each choice is on the screen, for the held finger.
  @State private var targets: [Target: CGRect] = [:]

  private static var gap: CGFloat { 8 }
  /// A reaction's round, its rows and its width grow with the reader's
  /// text size, as the words in them do; within the screen's width.
  @ScaledMetric(relativeTo: .body) private var reactionSize: CGFloat = 40
  @ScaledMetric(relativeTo: .body) private var rowHeight: CGFloat = Metrics.touch
  @ScaledMetric(relativeTo: .body) private var menuSize: CGFloat = 250
  private var menuWidth: CGFloat { min(menuSize, Self.screenWidth - 2 * Self.margin) }
  /// A reaction's round: as large as the text says, but the bar, the
  /// first reactions and +, within the screen's width.
  private var cell: CGFloat {
    let count = CGFloat(reactionChoices.count + 1)
    return min(reactionSize, (Self.screenWidth - 2 * Self.margin - 8 - 2 * (count - 1)) / count)
  }
  private var barHeight: CGFloat { cell + 8 }
  private static var groupGap: CGFloat { 8 }
  private static var margin: CGFloat { 12 }
  /// How small a tall bubble is drawn at least; past that its end is cut
  /// off.
  private static var leastScale: CGFloat { 0.5 }

  var body: some View {
    GeometryReader { proxy in
      let place = placement(in: proxy.size)
      let (top, bottom) = room(in: proxy.size)
      ZStack(alignment: .topLeading) {
        colors.scrim
          .opacity(shown ? 1 : 0)
          .onTapGesture { close(nil) }
          .accessibilityHidden(true)
        if request.reactions != nil {
          reactionBar
            .modifier(Placed(edge: place.edge, x: place.x, y: place.barY, width: proxy.size.width))
            .scaleEffect(grown ? 1 : 0.85, anchor: request.mine ? .bottomTrailing : .bottomLeading)
            .opacity(shown ? 1 : 0)
        }
        request.bubble
          .frame(width: request.frame.width, height: request.frame.height)
          // Drawn smaller about its top corner by the writer when too tall,
          // then cut to the room.
          .scaleEffect(placed ? place.scale : 1, anchor: request.mine ? .topTrailing : .topLeading)
          .frame(
            width: request.frame.width, height: placed ? place.bubbleHeight : request.frame.height,
            alignment: .top
          )
          // Cut at its foot only, so a run's first bubble keeps its tail.
          .clipShape(CutsHeight())
          // Grown about its own middle, before it is put in place; it
          // rises from where it was and goes back there.
          .scaleEffect(shown && !reduceMotion ? 1.02 : 1)
          .offset(x: request.frame.minX, y: placed ? place.bubbleY : request.frame.minY)
          .accessibilityHidden(true)
        menu(height: menuShown(top, bottom))
          .frame(width: menuWidth)
          .modifier(Placed(edge: place.edge, x: place.x, y: place.menuY, width: proxy.size.width))
          .scaleEffect(grown ? 1 : 0.85, anchor: menuAnchor(under: place.menuUnder))
          .opacity(shown ? 1 : 0)
      }
      .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
      // A keyboard up stays, as LINE keeps it, when all three fit over it
      // where the bubble is; else it goes for the room it took, and they
      // go along with the chat as it comes down (a small screen, a tall
      // line). Asked again as the keyboard changes (another keyboard
      // picked, taller) while the menu is open.
      .onAppear { makeRoom(in: proxy.size) }
      .onChange(of: KeyboardTop.shared.y) { makeRoom(in: proxy.size) }
      // Going along with the chat as it moves under it.
      .animation(.smooth(duration: 0.3), value: request.frame)
    }
    .ignoresSafeArea()
    .accessibilityAddTraits(.isModal)
    .accessibilityAction(.escape) { close(nil) }
    .sensoryFeedback(.selection, trigger: underFinger) { _, now in now != nil }
    // The keyboard stays up over it: typing there goes back to the chat.
    .onReceive(NotificationCenter.default.publisher(for: UITextView.textDidChangeNotification)) {
      _ in close(nil)
    }
    .onChange(of: request.finger?.lifted) { _, lifted in
      // Lifted over nothing, or held still where the menu came to it, it
      // stays open for a tap, as a system menu does.
      if lifted == true, let target = underFinger {
        pick(target)
      }
    }
    .onAppear {
      withAnimation(reduceMotion ? .easeOut(duration: 0.2) : .spring(duration: 0.28, bounce: 0.2)) {
        shown = true
      }
      // VoiceOver goes into it, over the chat.
      AccessibilityNotification.ScreenChanged().post()
    }
  }

  /// The bar and the menu at their size: grown from their corner by the
  /// bubble as they come, unless motion is reduced.
  private var grown: Bool { shown || reduceMotion }
  /// The bubble where the menu puts it, drawn smaller when too tall: from
  /// the start with motion reduced, rather than moving there.
  private var placed: Bool { shown || reduceMotion }

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
            .font(.system(size: cell * 0.65))
            .frame(width: cell, height: cell)
            .background(
              chosen ? colors.accentContainer
                : underFinger == .reaction(emoji) && reduceMotion ? colors.fillSecondary : .clear,
              in: Circle())
            .scaleEffect(underFinger == .reaction(emoji) && !reduceMotion ? 1.3 : 1)
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
          .font(.system(size: cell * 0.45, weight: .semibold))
          .foregroundStyle(colors.textSecondary)
          .frame(width: cell, height: cell)
          .background(colors.fillTertiary, in: Circle())
          .scaleEffect(underFinger == .moreReactions && !reduceMotion ? 1.3 : 1)
          .animation(.spring(duration: 0.2), value: underFinger)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("ほかの絵文字でリアクション")
      .modifier(Tracked(target: .moreReactions, targets: $targets))
    }
    .padding(4)
    .frame(height: barHeight)
    // On the raised ground, as /design's bar: glass would show the lines
    // under it through the dimming.
    .background(colors.backgroundElevated, in: Capsule())
    .overlay(Capsule().strokeBorder(colors.borderDefault, lineWidth: 0.5))
    // Picked up off the line, as the reactions are (design/src/metrics.ts).
    .shadow(.md)
  }

  /// The menu, `height` tall: scrolled through when its items, grown with
  /// a large text size, are taller than the room.
  private func menu(height: CGFloat) -> some View {
    ScrollView {
      menuItems
    }
    .scrollBounceBehavior(.basedOnSize)
    .frame(height: height)
    .background(colors.backgroundElevated)
    .clipShape(RoundedRectangle(cornerRadius: Radius.xl))
    .overlay(
      RoundedRectangle(cornerRadius: Radius.xl).strokeBorder(colors.borderDefault, lineWidth: 0.5)
    )
    // A card floating free, as a menu is.
    .shadow(.lg)
  }

  private var menuItems: some View {
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
              // One line in its row, however large the text.
              .lineLimit(1)
              .minimumScaleFactor(0.6)
            Spacer(minLength: 12)
            Image(systemName: action.systemImage)
          }
          .font(.body)
          .foregroundStyle(action.destructive ? colors.dangerDefault : colors.textPrimary)
          .padding(.horizontal, 16)
          .frame(height: rowHeight)
          .contentShape(.rect)
        }
        .buttonStyle(MenuRowStyle(held: underFinger == .action(action.id)))
        .accessibilityLabel(action.title)
        .modifier(Tracked(target: .action(action.id), targets: $targets))
      }
    }
  }

  // MARK: Placing

  /// Where the bar, the bubble and the menu go: the bubble where it was,
  /// the bar over it and the menu under it, or over the bar when there is
  /// no room under it, as LINE turns it. Only when neither fits are the
  /// three moved together to stay between the screen's edges, the bubble
  /// drawn smaller when they cannot fit, and cut short at its end past
  /// that.
  private func placement(in size: CGSize) -> Placement {
    let (top, bottom) = room(in: size)
    let frame = request.frame
    if fitsInPlace(top: top, bottom: bottom) {
      let under = frame.maxY + menuSpace(top, bottom) <= bottom
      return Placement(
        edge: request.mine ? .trailing : .leading,
        x: request.mine ? frame.maxX : frame.minX,
        barY: frame.minY - barSpace,
        bubbleY: frame.minY,
        bubbleHeight: frame.height,
        scale: 1,
        menuY: under ? frame.maxY + Self.gap : frame.minY - barSpace - menuSpace(top, bottom),
        menuUnder: under)
    }
    let space = max(bottom - top - barSpace - menuSpace(top, bottom), Self.leastBubble)
    let scale = min(1, max(space / frame.height, Self.leastScale))
    let bubbleHeight = min(frame.height * scale, space)
    var bubbleY = frame.minY
    if bubbleY - barSpace < top {
      bubbleY = top + barSpace
    }
    if bubbleY + bubbleHeight + menuSpace(top, bottom) > bottom {
      bubbleY = bottom - menuSpace(top, bottom) - bubbleHeight
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

  /// What the three may take of the screen: within its safe edges, and
  /// over the keyboard while it is up.
  private func room(in size: CGSize) -> (top: CGFloat, bottom: CGFloat) {
    let insets = Self.safeInsets
    let bottom = min(size.height - insets.bottom, KeyboardTop.shared.y ?? .infinity)
    return (insets.top + Self.margin, bottom - Self.margin)
  }

  /// Puts the keyboard down when the three do not fit over it in place.
  private func makeRoom(in size: CGSize) {
    let (top, bottom) = room(in: size)
    if KeyboardTop.shared.y != nil, !fitsInPlace(top: top, bottom: bottom) {
      UIApplication.shared.sendAction(
        #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
    }
  }

  /// The bubble stays where it is, with the bar over it and the menu under
  /// it or over the bar, between `top` and `bottom`.
  private func fitsInPlace(top: CGFloat, bottom: CGFloat) -> Bool {
    let frame = request.frame
    let stays = frame.minY - barSpace >= top && frame.maxY <= bottom
    let menu = menuSpace(top, bottom)
    return stays && (frame.maxY + menu <= bottom || frame.minY - barSpace - menu >= top)
  }

  private var barSpace: CGFloat { request.reactions == nil ? 0 : barHeight + Self.gap }
  private func menuSpace(_ top: CGFloat, _ bottom: CGFloat) -> CGFloat {
    Self.gap + menuShown(top, bottom)
  }

  /// How tall the menu is drawn between `top` and `bottom`: all its items,
  /// or with a large text size as much as leaves the bar and the bubble at
  /// its least their room, the rest scrolled to.
  private func menuShown(_ top: CGFloat, _ bottom: CGFloat) -> CGFloat {
    let room = bottom - top - barSpace - Self.leastBubble - 2 * Self.gap
    return min(menuHeight, max(rowHeight, room))
  }

  /// The least height a bubble is drawn at beside its menu.
  private static var leastBubble: CGFloat { 60 }

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
      return height + gap + rowHeight
    }
  }

  private static var screenWidth: CGFloat {
    UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.keyWindow }
      .first?.bounds.width ?? 390
  }

  private static var safeInsets: UIEdgeInsets {
    UIApplication.shared.connectedScenes
      .compactMap { ($0 as? UIWindowScene)?.keyWindow }
      .first?.safeAreaInsets ?? .zero
  }

  /// The choice under the held finger, if any.
  private var underFinger: Target? {
    guard let finger = request.finger, finger.slid, let point = finger.point else { return nil }
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

  /// Goes, quick at first and settling, and acts meanwhile.
  private func close(_ action: (() -> Void)?) {
    guard shown else { return }
    withAnimation(.smooth(duration: 0.25)) {
      shown = false
    } completion: {
      onClose()
    }
    action?()
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

/// A window never made the key one, though tapped: the chat's window
/// keeps the keyboard's field, so the keyboard stays up under a tap on
/// the menu, and a pick that opens it (返信) brings it up as the menu
/// goes rather than once its window is away.
private final class KeylessWindow: UIWindow {
  override var canBecomeKey: Bool { false }
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
    let window = KeylessWindow(windowScene: scene)
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

/// A bubble held for its reactions and menu: it gives a little under the
/// finger, as Messages' bubble does, and opens them once held; the finger
/// then picks one by lifting over it, as a system menu's does.
private struct HeldBubble: ViewModifier {
  /// Its bubble is lifted over the chat, its place standing empty.
  let lifted: Bool
  /// Told how to open them without the press, for VoiceOver's action.
  let opener: MenuOpener?
  /// Opens the reactions and menu, from where the bubble is, with the
  /// finger that opened them while it stays down, and the link held, for
  /// its own menu instead.
  let onActions: (LineSpot, HeldFinger?, URL?) -> Void
  /// A tap on it, not on a part with its own.
  let onTap: () -> Void
  /// Where the bubble is on the screen, for its menu.
  @State private var frame = CGRect.zero
  /// Where it is told to its open menu, kept while it is open.
  @State private var spot: LineSpot?
  /// Where its words' links are drawn.
  @State private var links = LinkSpots()
  @State private var pressing = false
  /// The finger that opened the menu, followed until it lifts.
  @State private var held: HeldFinger?
  /// The chat line's cell it is in, from which its place on the screen
  /// is told; none elsewhere.
  @Environment(\.lineSpace) private var lineSpace

  func body(content: Content) -> some View {
    let inLine = lineSpace != nil
    content
      .environment(\.linkSpots, links)
      // Its own size and where its middle is: the press's give shrinks
      // its frame on the screen, not its size.
      .onGeometryChange(for: CGRect.self) { proxy in
        let seen = inLine ? proxy.frame(in: .named(LineSpace.name)) : proxy.frame(in: .global)
        return CGRect(
          x: seen.midX - proxy.size.width / 2, y: seen.midY - proxy.size.height / 2,
          width: proxy.size.width, height: proxy.size.height)
      } action: {
        frame = $0
        if let spot { place(spot) }
      }
      .scaleEffect(pressing ? 0.96 : 1)
      .opacity(lifted ? 0 : 1)
      .animation(.easeOut(duration: 0.2), value: pressing)
      // A tap is the bubble's own (a photo opens large), but for the
      // finger lifting from the press that opened its menu.
      .onTapGesture { if !links.held { onTap() } }
      .gesture(
        HeldPress(inLine: inLine) { pressing = $0 } onHold: {
          pressing = false
          // A link held opens its own menu instead.
          open(link: links.link(at: $0), at: onScreen($0))
        } onMove: {
          held?.point = onScreen($0)
        } onLift: {
          held?.point = onScreen($0)
          held?.lifted = true
          held = nil
          // Past the tap a link takes as the finger lifts.
          Task {
            try? await Task.sleep(for: .milliseconds(300))
            links.held = false
          }
        })
      .onAppear { opener?.open = { onActions(newSpot(), nil, nil) } }
      .onChange(of: lifted) { _, lifted in
        if !lifted, let spot {
          lineSpace?.unfollow(spot)
          self.spot = nil
        }
      }
  }

  /// Where the bubble is now, kept from here on for the menu opening.
  private func newSpot() -> LineSpot {
    let spot = LineSpot(frame: frame)
    self.spot = spot
    place(spot)
    return spot
  }

  /// Puts `spot` where the bubble is on the screen, kept there as its
  /// chat line's cell moves.
  private func place(_ spot: LineSpot) {
    if let lineSpace {
      lineSpace.follow(spot, at: frame)
    } else {
      spot.frame = frame
    }
  }

  private func onScreen(_ point: CGPoint) -> CGPoint {
    lineSpace?.onScreen(point) ?? point
  }

  /// Opens the menu, the link's when one is held, with the finger that
  /// opened it, at `point`.
  private func open(link: URL?, at point: CGPoint) {
    // Only once a menu opens: a tap lifted before it, on a link or a
    // reply's quote, is still that tap's.
    links.held = true
    UIImpactFeedbackGenerator(style: .light).impactOccurred()
    let finger = HeldFinger(at: point)
    held = finger
    onActions(newSpot(), finger, link)
  }
}

extension View {
  /// Held, opens the bubble's reactions and menu (HeldBubble); a tap on
  /// it does `onTap`.
  func heldForActions(
    lifted: Bool, opener: MenuOpener? = nil, onTap: @escaping () -> Void = {},
    onActions: @escaping (LineSpot, HeldFinger?, URL?) -> Void
  ) -> some View {
    modifier(HeldBubble(lifted: lifted, opener: opener, onActions: onActions, onTap: onTap))
  }
}

/// Its frame cut at the top and the foot only, the sides left open as far
/// as a bubble's tail reaches.
private struct CutsHeight: Shape {
  nonisolated func path(in rect: CGRect) -> Path {
    Path(rect.insetBy(dx: -BubbleShape.tailReach, dy: 0))
  }
}
