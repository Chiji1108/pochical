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
/// reactions over it and the menu under it or over them. Where the line
/// is, the chat's lines know (ChatController).
struct MessageActionsRequest: Identifiable {
  let id = UUID()
  /// The line's op_id, so its bubble in the chat stands empty meanwhile.
  let lineID: String
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

extension Chat {
  /// How a line's menu opens and closes: UIKit's springs, as the
  /// composer's (composerSpring), so they add up with whatever moves the
  /// line meanwhile (the keyboard, the composer, the line growing).
  static let menuOpenSpring = (duration: 0.28, bounce: 0.2)
  static let menuCloseSpring = (duration: 0.25, bounce: 0.0)
}

/// One of a line's menu's choices.
enum MenuTarget: Hashable {
  case reaction(String)
  case moreReactions
  case action(String)

  /// In the reactions' bar, else in the menu.
  var inBar: Bool {
    if case .action = self { false } else { true }
  }
}

/// What the menu's SwiftUI and its layer share: the choice under the held
/// finger, and where each choice is in its own part, for the layer to
/// find what the finger is over.
@MainActor @Observable final class MenuState {
  nonisolated static let space = "line-menu"
  var underFinger: MenuTarget?
  @ObservationIgnored var targets: [MenuTarget: CGRect] = [:]
}

/// The menu's sizes, as the reader's text size makes them, within the
/// screen's width: worked out once here, for the layer to place the parts
/// and for their SwiftUI to draw at.
struct MenuMetrics {
  /// A reaction's round: as large as the text says, but the bar, the
  /// first reactions and +, within the screen's width.
  let cell: CGFloat
  let bar: CGSize
  let rowHeight: CGFloat
  let menuWidth: CGFloat
  /// The sizes of iOS 26's own menus (the bar's ⋯), as measured on the
  /// simulator: a row 42 points at the default text size, growing with
  /// it, and groups apart by 21 with a 1-point rule in their middle.
  static let systemRow: CGFloat = 42
  static let groupGap: CGFloat = 21
  static let rule: CGFloat = 1
  static let menuInset: CGFloat = 6
  /// The menu's corners, and how far in from them its rows are lit.
  static let menuCorner = Radius.xxl

  init(type: DynamicTypeSize, width: CGFloat) {
    let traits = UITraitCollection(preferredContentSizeCategory: UIContentSizeCategory(type))
    let body = UIFontMetrics(forTextStyle: .body)
    func scaled(_ value: CGFloat) -> CGFloat { body.scaledValue(for: value, compatibleWith: traits) }
    let margin = MenuPlacement.margin
    let count = CGFloat(reactionChoices.count + 1)
    cell = min(scaled(40), (width - 2 * margin - 8 - 2 * (count - 1)) / count)
    bar = CGSize(width: count * cell + 2 * (count - 1) + 8, height: cell + 8)
    rowHeight = scaled(Self.systemRow)
    menuWidth = min(scaled(250), width - 2 * margin)
  }

  /// The menu with all its items.
  func menuHeight(_ actions: [MessageAction]) -> CGFloat {
    actions.enumerated().reduce(2 * Self.menuInset) { height, item in
      let gap = item.offset > 0 && item.element.startsGroup ? Self.groupGap : 0
      return height + gap + rowHeight
    }
  }
}

/// A line's long press (/design's MessageActions), as Messages and LINE
/// draw one: the rest of the screen dims while the line stays bright, the
/// first reactions in a bar over it with + for any other, and the menu
/// under it or, with no room there, over the bar (MenuPlacement), all
/// over the keyboard when it is up and they fit there, as LINE keeps it.
/// Over everything in the chat's window, bars included, as Signal's
/// context menu is: its parts are views of the window's own, placed by the
/// chat's layout (ChatController) in the same pass and the same animation
/// that moves the line under them, so they never stand apart from it. A
/// tap elsewhere closes it; a pick, by a tap or by the finger that opened
/// it sliding onto one and lifting there, acts as it closes, as the
/// system's menu does: what it opens comes in as the menu goes.
@MainActor final class MenuLayer: UIView {
  private enum Phase {
    /// Put where it opens from, not yet shown.
    case rising
    case open
    /// Going: the bubble back to its line, the bar and the menu going along
    /// with it from where they stood.
    case closing(fade: Bool, from: CGRect, bar: CGPoint?, menu: CGPoint)
  }

  let request: MessageActionsRequest
  /// Its pick made, or its line gone: told once it has gone, for the line
  /// to draw its bubble again.
  var onClosed: () -> Void = {}
  /// Where it puts the bubble, the bar and the menu, as last laid out.
  private(set) var placement: MenuPlacement?
  /// Motion reduced, it fades in and out where it is, nothing growing or
  /// lifting (spec/chat.md, Reduced motion).
  private let reduceMotion: Bool
  private let metrics: MenuMetrics
  private let state = MenuState()
  private let scrim = UIView()
  /// The bubble, cut at its foot to the room, lifted about its middle.
  private let lift = UIView()
  /// The bubble drawn smaller when too tall, about its top corner.
  private let scaled = UIView()
  /// The parts as UIKit moves and grows them, each holding its SwiftUI
  /// at its own size: a hosting view transformed itself lays its SwiftUI
  /// out at the transformed size, its words breaking anew.
  private let barPart = UIView()
  private let menuPart = UIView()
  private let bubble: UIHostingController<AnyView>
  private let bar: UIHostingController<AnyView>?
  private let menu: UIHostingController<AnyView>
  private var phase = Phase.rising
  /// Where the line's bubble is.
  private var anchor = CGRect.zero
  /// The finger that opened it, while it is still down: where it went
  /// down, and whether it has slid since, past which it picks what it is
  /// over as it lifts.
  private var finger: (start: CGPoint, slid: Bool)?
  /// How far a finger slides before it picks what it is over, as far as
  /// UIKit's long press lets a finger wander: the menu can come to it
  /// rather than it to the menu.
  private static let slop: CGFloat = 10

  /// The menu `request` asks for, its bubble `size` as the chat draws it,
  /// on a screen `width` wide.
  init(
    request: MessageActionsRequest, size: CGSize, environment: EnvironmentValues, width: CGFloat
  ) {
    self.request = request
    reduceMotion = environment.accessibilityReduceMotion
    metrics = MenuMetrics(type: environment.dynamicTypeSize, width: width)
    // At its size in the chat, so its words break where they do there.
    bubble = Self.host(
      request.bubble.frame(width: size.width, height: size.height), environment: environment)
    bar = request.reactions == nil ? nil : Self.host(EmptyView(), environment: environment)
    menu = Self.host(EmptyView(), environment: environment)
    super.init(frame: .zero)
    // The parts' SwiftUI picks through the layer, which closes first.
    let pick: (MenuTarget) -> Void = { [weak self] in self?.pick($0) }
    bar?.rootView = Self.content(
      ReactionBar(request: request, metrics: metrics, state: state, pick: pick), environment)
    menu.rootView = Self.content(
      MenuItems(request: request, metrics: metrics, state: state, pick: pick), environment)

    scrim.backgroundColor = UIColor(environment.themeColors.scrim)
    scrim.alpha = 0
    scrim.addGestureRecognizer(UITapGestureRecognizer(target: self, action: #selector(tappedOff)))
    addSubview(scrim)
    if let bar {
      hold(bar, in: barPart)
      addSubview(barPart)
    }
    lift.clipsToBounds = true
    // A tap on the lifted bubble is a tap off the menu.
    lift.isUserInteractionEnabled = false
    bubble.view.frame = CGRect(origin: .zero, size: size)
    scaled.addSubview(bubble.view)
    lift.addSubview(scaled)
    addSubview(lift)
    hold(menu, in: menuPart)
    addSubview(menuPart)
    barPart.alpha = 0
    menuPart.alpha = 0
    // VoiceOver goes into it, over the chat, and out of it by its escape.
    accessibilityViewIsModal = true
    accessibilityElements = bar == nil ? [menuPart] : [barPart, menuPart]
    lift.accessibilityElementsHidden = true
    // The keyboard stays up over it: typing there goes back to the chat.
    NotificationCenter.default.addObserver(
      self, selector: #selector(typed), name: UITextView.textDidChangeNotification, object: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  private static func host(_ view: some View, environment: EnvironmentValues)
    -> UIHostingController<AnyView>
  {
    let host = UIHostingController(rootView: content(view, environment))
    host.sizingOptions = []
    // Placed by the layer, its SwiftUI laid out in its bounds alone.
    host.safeAreaRegions = []
    host.view.backgroundColor = .clear
    return host
  }

  private func hold(_ host: UIHostingController<AnyView>, in part: UIView) {
    host.view.frame = part.bounds
    host.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    part.addSubview(host.view)
  }

  private static func content(_ view: some View, _ environment: EnvironmentValues) -> AnyView {
    AnyView(
      view
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .coordinateSpace(.named(MenuState.space))
        .environment(\.self, environment))
  }

  var isOpen: Bool {
    if case .open = phase { true } else { false }
  }

  // MARK: Placing

  /// Puts the parts round the line's bubble at `bubble` (where it was last
  /// when none, its line gone), within the screen's safe `top` and
  /// `bottom` and over the keyboard's top while it is up, in whatever
  /// animation the chat's layout is in.
  func place(bubble: CGRect?, top: CGFloat, bottom: CGFloat, keyboardTop: CGFloat?) {
    if let bubble { anchor = bubble }
    placement = MenuPlacement(
      bubble: anchor, top: top, bottom: bottom, keyboardTop: keyboardTop, width: bounds.width,
      bar: bar == nil ? nil : metrics.bar,
      menu: CGSize(width: metrics.menuWidth, height: metrics.menuHeight(request.actions)),
      leastMenu: metrics.rowHeight, mine: request.mine)
    apply()
  }

  /// Every part where the phase has it.
  private func apply() {
    guard let placement else { return }
    scrim.frame = bounds
    switch phase {
    case .rising:
      scrim.alpha = 0
      // With motion reduced, a bubble the menu moves or draws smaller is put
      // there at once, not slid.
      if reduceMotion {
        put(placement.bubble, scale: placement.scale)
      } else {
        put(anchor, scale: 1)
      }
      lift.transform = .identity
      putParts(bar: placement.bar.map(middle), menu: middle(placement.menu), shown: false)
    case .open:
      scrim.alpha = 1
      put(placement.bubble, scale: placement.scale)
      // Grown about its own middle, as it rises from where it was.
      lift.transform = reduceMotion ? .identity : CGAffineTransform(scaleX: 1.02, y: 1.02)
      putParts(bar: placement.bar.map(middle), menu: middle(placement.menu), shown: true)
    case .closing(let fade, let from, let barCenter, let menuCenter):
      scrim.alpha = 0
      put(anchor, scale: 1)
      lift.transform = .identity
      lift.alpha = fade ? 0 : 1
      let dx = anchor.minX - from.minX
      let dy = anchor.minY - from.minY
      putParts(
        bar: barCenter.map { CGPoint(x: $0.x + dx, y: $0.y + dy) },
        menu: CGPoint(x: menuCenter.x + dx, y: menuCenter.y + dy), shown: false)
    }
  }

  private func middle(_ frame: CGRect) -> CGPoint {
    CGPoint(x: frame.midX, y: frame.midY)
  }

  /// The bubble drawn as `frame` shows it: `scale` times its size, about
  /// its top corner by the writer, cut at its foot to the frame's height.
  /// Cut at its foot only, so a run's first bubble keeps its tail.
  private func put(_ frame: CGRect, scale: CGFloat) {
    let reach = BubbleShape.tailReach
    lift.bounds = CGRect(x: 0, y: 0, width: frame.width + 2 * reach, height: frame.height)
    lift.center = CGPoint(x: frame.midX, y: frame.midY)
    let size = anchor.size
    scaled.bounds = CGRect(origin: .zero, size: size)
    scaled.transform = CGAffineTransform(scaleX: scale, y: scale)
    let half = size.width * scale / 2
    scaled.center = CGPoint(
      x: request.mine ? lift.bounds.width - reach - half : reach + half,
      y: size.height * scale / 2)
  }

  /// The bar and the menu centered at `bar` and `menu`, at their size, or
  /// as they come and go: smaller from their corner by the bubble, faded.
  private func putParts(bar barCenter: CGPoint?, menu menuCenter: CGPoint, shown: Bool) {
    guard let placement else { return }
    if bar != nil, let barCenter, let frame = placement.bar {
      barPart.bounds = CGRect(origin: .zero, size: frame.size)
      barPart.center = barCenter
      barPart.transform = grown(barPart, from: CGPoint(x: request.mine ? 1 : 0, y: 1), shown)
      barPart.alpha = shown ? 1 : 0
    }
    menuPart.bounds = CGRect(origin: .zero, size: placement.menu.size)
    menuPart.center = menuCenter
    let corner = CGPoint(x: request.mine ? 1 : 0, y: placement.menuUnder ? 0 : 1)
    menuPart.transform = grown(menuPart, from: corner, shown)
    menuPart.alpha = shown ? 1 : 0
  }

  /// At its size when `shown` or with motion reduced, else smaller about
  /// `corner` (in its own unit square).
  private func grown(_ view: UIView, from corner: CGPoint, _ shown: Bool) -> CGAffineTransform {
    guard !shown, !reduceMotion else { return .identity }
    let dx = (corner.x - 0.5) * view.bounds.width
    let dy = (corner.y - 0.5) * view.bounds.height
    return CGAffineTransform(translationX: dx, y: dy).scaledBy(x: 0.85, y: 0.85)
      .translatedBy(x: -dx, y: -dy)
  }

  // MARK: Coming and going

  /// Shows it, from where it was placed rising.
  func open() {
    guard case .rising = phase else { return }
    phase = .open
    animate(Chat.menuOpenSpring) { self.apply() }
    UIAccessibility.post(notification: .screenChanged, argument: nil)
  }

  /// Goes, quick at first and settling, then tells `onClosed`; does
  /// `action` meanwhile, as the system's menu does, and `gone` once it has
  /// gone. `fade` takes the bubble away too, its line gone from the chat.
  func close(
    fade: Bool = false, then action: (() -> Void)? = nil, once gone: (() -> Void)? = nil
  ) {
    if case .closing = phase { return }
    phase = .closing(
      fade: fade, from: anchor, bar: bar == nil ? nil : barPart.center, menu: menuPart.center)
    finger = nil
    state.underFinger = nil
    animate(Chat.menuCloseSpring, animations: apply) { [weak self] in
      self?.onClosed()
      gone?()
    }
    action?()
  }

  private func animate(
    _ spring: (duration: Double, bounce: Double), animations: @escaping () -> Void,
    completion: (() -> Void)? = nil
  ) {
    if reduceMotion {
      UIView.animate(
        withDuration: 0.2, delay: 0, options: [.curveEaseOut, .allowUserInteraction],
        animations: animations
      ) { _ in completion?() }
    } else {
      UIView.animate(
        springDuration: spring.duration, bounce: spring.bounce, options: .allowUserInteraction,
        animations: animations
      ) { _ in completion?() }
    }
  }

  @objc private func tappedOff() { close() }

  @objc private func typed() { close() }

  override func accessibilityPerformEscape() -> Bool {
    close()
    return true
  }

  // MARK: The held finger

  /// The finger that opened it is still down, at `point` on the window.
  func hold(at point: CGPoint) {
    finger = (point, false)
  }

  func fingerMoved(to point: CGPoint) {
    guard var finger, isOpen else { return }
    if hypot(point.x - finger.start.x, point.y - finger.start.y) >= Self.slop { finger.slid = true }
    self.finger = finger
    let under = finger.slid ? target(at: point) : nil
    if state.underFinger != under { state.underFinger = under }
  }

  /// Lifted at `point`, or cancelled with none: what it slid onto is
  /// picked; lifted over nothing, or held still where the menu came to it,
  /// it stays open for a tap, as a system menu does.
  func fingerLifted(at point: CGPoint?) {
    let slid = finger?.slid == true
    finger = nil
    guard isOpen, slid, let point, let target = target(at: point) else {
      state.underFinger = nil
      return
    }
    pick(target)
  }

  /// The choice under `point` on the window, where its part is now.
  private func target(at point: CGPoint) -> MenuTarget? {
    state.targets.first { target, frame in
      guard let part = target.inBar ? bar?.view : menu.view else { return false }
      return frame.contains(part.convert(point, from: nil))
    }?.key
  }

  /// Closes, then does what `target` stands for.
  private func pick(_ target: MenuTarget) {
    switch target {
    case .reaction(let emoji):
      // On the line once its bubble is back in the chat, as iMessage's
      // tapback lands: its pop and spray play over the chat, never under
      // the bubble lifted over it on its way back.
      close(once: { [request] in request.onReact(emoji) })
    case .moreReactions:
      close(then: request.onMoreReactions)
    case .action(let id):
      close(then: request.actions.first { $0.id == id }?.run)
    }
  }
}

/// The first reactions over a held line, and + for any other.
private struct ReactionBar: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.accessibilityReduceMotion) private var reduceMotion
  let request: MessageActionsRequest
  let metrics: MenuMetrics
  let state: MenuState
  let pick: (MenuTarget) -> Void

  var body: some View {
    let cell = metrics.cell
    HStack(spacing: 2) {
      ForEach(reactionChoices, id: \.self) { emoji in
        let chosen = (request.reactions ?? []).contains {
          $0.emoji == emoji && $0.userIDs.contains(request.meID ?? "")
        }
        let held = state.underFinger == .reaction(emoji)
        Button {
          pick(.reaction(emoji))
        } label: {
          Text(emoji)
            .font(.system(size: cell * 0.65))
            .frame(width: cell, height: cell)
            .background(
              chosen ? colors.accentContainer : held && reduceMotion ? colors.fillSecondary : .clear,
              in: Circle())
            .scaleEffect(held && !reduceMotion ? 1.3 : 1)
            .animation(.spring(duration: 0.2), value: held)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(chosen ? "\(emoji)のリアクションを外す" : "\(emoji)でリアクション")
        .modifier(Tracked(target: .reaction(emoji), state: state))
      }
      let held = state.underFinger == .moreReactions
      Button {
        pick(.moreReactions)
      } label: {
        Image(systemName: "plus")
          .font(.system(size: cell * 0.45, weight: .semibold))
          .foregroundStyle(colors.textSecondary)
          .frame(width: cell, height: cell)
          .background(colors.fillTertiary, in: Circle())
          .scaleEffect(held && !reduceMotion ? 1.3 : 1)
          .animation(.spring(duration: 0.2), value: held)
      }
      .buttonStyle(.plain)
      .accessibilityLabel("ほかの絵文字でリアクション")
      .modifier(Tracked(target: .moreReactions, state: state))
    }
    .padding(4)
    .frame(width: metrics.bar.width, height: metrics.bar.height)
    // Glass over the dimming, as Messages' tapbacks are.
    .glassEffect(.regular, in: .capsule)
  }
}

/// A held line's menu, as tall as its layer gives it: scrolled through
/// when its items, grown with a large text size, are taller than the room.
private struct MenuItems: View {
  @Environment(\.themeColors) private var colors
  @Environment(\.dynamicTypeSize) private var typeSize
  @ScaledMetric(relativeTo: .body) private var iconWidth = 24.0
  let request: MessageActionsRequest
  let metrics: MenuMetrics
  let state: MenuState
  let pick: (MenuTarget) -> Void

  var body: some View {
    let corner = RoundedRectangle(cornerRadius: MenuMetrics.menuCorner)
    ScrollView {
      VStack(spacing: 0) {
        ForEach(Array(request.actions.enumerated()), id: \.element.id) { index, action in
          // Its groups apart by a rule, its items by nothing, as iOS 26's
          // menus are.
          if index > 0, action.startsGroup {
            Rectangle()
              .fill(Color(uiColor: .tertiarySystemFill))
              .frame(height: MenuMetrics.rule)
              .padding(.horizontal, 16)
              .frame(height: MenuMetrics.groupGap)
          }
          Button {
            pick(.action(action.id))
          } label: {
            // The symbol before the words, in a column of its own so the
            // words line up, as iOS 26's menus draw their items; the
            // words alone at the accessibility sizes, as theirs are.
            HStack(spacing: 12) {
              if !typeSize.isAccessibilitySize {
                Image(systemName: action.systemImage)
                  .frame(width: iconWidth)
              }
              Text(action.title)
                // One line in its row, however large the text.
                .lineLimit(1)
                .minimumScaleFactor(0.6)
              Spacer(minLength: 0)
            }
            .font(.body)
            .foregroundStyle(
              action.destructive ? AnyShapeStyle(colors.dangerDefault) : AnyShapeStyle(.primary))
            .padding(.horizontal, 12)
            .frame(height: metrics.rowHeight)
            .contentShape(.rect)
          }
          .buttonStyle(MenuRowStyle(held: state.underFinger == .action(action.id)))
          .accessibilityLabel(action.title)
          .modifier(Tracked(target: .action(action.id), state: state))
        }
      }
      .padding(MenuMetrics.menuInset)
    }
    .scrollBounceBehavior(.basedOnSize)
    .clipShape(corner)
    // The system's menu glass, as iOS 26 draws a context menu.
    .glassEffect(.regular, in: corner)
    .sensoryFeedback(.selection, trigger: state.underFinger) { _, now in now != nil }
  }
}

/// Keeps where a choice is in its part, for the held finger.
private struct Tracked: ViewModifier {
  let target: MenuTarget
  let state: MenuState

  func body(content: Content) -> some View {
    content.onGeometryChange(for: CGRect.self) { $0.frame(in: .named(MenuState.space)) } action: {
      state.targets[target] = $0
    }
  }
}

/// A menu row's press, the fill a system menu gives the row under the
/// finger, a tap's or the held one's, rounded inside the menu's corners.
private struct MenuRowStyle: ButtonStyle {
  @Environment(\.themeColors) private var colors
  let held: Bool

  func makeBody(configuration: Configuration) -> some View {
    configuration.label
      .background(
        configuration.isPressed || held ? colors.fillSecondary : .clear,
        in: RoundedRectangle(cornerRadius: Radius.lg))
  }
}

/// A bubble held for its reactions and menu, by the chat's lines' long
/// press (ChatController): it tells its cell where it is, for the press
/// to find what it is on and the menu where to lift it from, and gives a
/// little while a finger is down on it, as Messages' bubble does.
private struct HeldBubble: ViewModifier {
  /// The line it is, by its op_id.
  let lineID: String
  /// Its bubble is lifted over the chat, its place standing empty.
  let lifted: Bool
  /// A tap on it, not on a part with its own.
  let onTap: () -> Void
  /// Where its words' links are drawn.
  @State private var links = LinkSpots()
  /// The chat line's cell it is in.
  @Environment(\.lineSpace) private var space

  func body(content: Content) -> some View {
    let pressed = space?.pressed == lineID
    content
      .environment(\.linkSpots, links)
      // Its own size and where its middle is: the press's give shrinks
      // its frame in the cell, not its size.
      .onGeometryChange(for: CGRect.self) { proxy in
        let seen = proxy.frame(in: .named(LineSpace.name))
        return CGRect(
          x: seen.midX - proxy.size.width / 2, y: seen.midY - proxy.size.height / 2,
          width: proxy.size.width, height: proxy.size.height)
      } action: { [links] in
        space?.note(lineID, at: $0, links: links)
      }
      .scaleEffect(pressed ? 0.96 : 1)
      .opacity(lifted ? 0 : 1)
      .animation(.easeOut(duration: 0.2), value: pressed)
      // A tap is the bubble's own (a photo opens large); a press held past
      // it is the menu's, and the tap then never is.
      .onTapGesture(perform: onTap)
      .onDisappear { space?.forget(lineID, links: links) }
  }
}

extension View {
  /// The bubble of the line `lineID`, held for its reactions and menu
  /// (HeldBubble); a tap on it does `onTap`.
  func heldForActions(lineID: String, lifted: Bool, onTap: @escaping () -> Void = {})
    -> some View
  {
    modifier(HeldBubble(lineID: lineID, lifted: lifted, onTap: onTap))
  }
}
