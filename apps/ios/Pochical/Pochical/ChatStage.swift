import ChatLayout
import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

// A chat's room: its lines as a collection view laid out by ChatLayout,
// and over them the pins at the top, the ↓ and the composer at the foot,
// the composer standing on the keyboard (spec/chat.md, Unread lines and
// typing). All of them are laid out in one view controller's layout, so
// the keyboard, the composer changing shape and the lines making room for
// them move in the same pass, by the same animation, as ChatLayout's
// Example and Signal stand their input bar on the keyboard's layout
// guide. ChatLayout keeps the lines seen where they are as lines come in
// or grow above them, in the same layout pass, before the frame is drawn;
// each line, the composer and the pins are still the chat's own SwiftUI.

/// Moves a chat's lines at the moments the chat does, as a scroll view's
/// proxy would.
@MainActor final class ChatLinesProxy {
  fileprivate weak var controller: ChatController?

  /// To the latest line's foot, instead of an item asked for before.
  func toLatest(animated: Bool = false) {
    controller?.toLatest(animated: animated)
  }

  /// To the item `id`, at the top of the screen or in its middle, once it
  /// is laid out; `then` once there, or once the person's own scrolling
  /// takes over.
  func show(
    _ id: String, at place: LinePlace, animated: Bool = false, then: (() -> Void)? = nil
  ) {
    guard let controller else {
      then?()
      return
    }
    controller.show(id, at: place, animated: animated, then: then)
  }

  /// `show`, coming back once there.
  func show(_ id: String, at place: LinePlace, animated: Bool = false) async {
    await withCheckedContinuation { done in
      show(id, at: place, animated: animated) { done.resume() }
    }
  }

  /// The item `id` keeps its top where it is as it is next drawn again,
  /// growing down, as a long line opened at 続きを読む does, rather than up
  /// from the foot.
  func growDown(_ id: String) {
    controller?.growDown(id)
  }
}

enum LinePlace {
  case top
  case center
}

/// Which way a line is dragged to reply to it: toward the middle from its
/// writer's side, as Signal, Telegram and LINE drag one.
enum ReplySwipe {
  /// Others' lines, from the left.
  case rightward
  /// One's own, from the right.
  case leftward
}

/// What a line's cell knows of the bubbles it draws, for the chat's long
/// press to find which one a finger is on and for the menu to lift it
/// from: told by each bubble as it is laid out, and read as stored values,
/// so the press never reads SwiftUI's geometry as it goes.
@MainActor @Observable final class LineSpace {
  nonisolated static let name = "chat-line"
  /// The bubble a finger is down on, which gives under it.
  var pressed: String?
  /// Each bubble's frame in the cell, by its line's op_id, and its links.
  @ObservationIgnored private(set) var bubbles: [String: HeldSpot] = [:]

  func note(_ lineID: String, at frame: CGRect, links: LinkSpots) {
    bubbles[lineID] = HeldSpot(frame: frame, links: links)
  }

  /// Forgets the bubble of `lineID` that noted these `links`, its own: a
  /// line drawn anew (one's photo once sent, its line waiting no more) has
  /// its new bubble noted before the old one goes.
  func forget(_ lineID: String, links: LinkSpots) {
    if bubbles[lineID]?.links === links { bubbles[lineID] = nil }
  }

  /// The line whose bubble is under `point` in the cell.
  func bubble(at point: CGPoint) -> String? {
    bubbles.first { $0.value.frame.contains(point) }?.key
  }
}

/// A bubble in its cell: its frame, and where its words' links are.
struct HeldSpot {
  let frame: CGRect
  let links: LinkSpots
}

extension EnvironmentValues {
  /// The cell a chat's line is drawn in; none outside the chat's lines.
  @Entry var lineSpace: LineSpace?
  /// The line is drawn only to be measured, apart from the screen: its
  /// photos are not fetched for it.
  @Entry var measuringLine = false
  /// Where the line's drawing is kept while its row looks the same; none
  /// outside the chat's lines.
  @Entry var keptDrawing: KeptDrawing?
}

/// An item of the lines: its id, and all its row draws, compared to tell
/// when it is to be drawn again.
struct LinesRow: Equatable {
  let id: String
  let look: AnyHashable
}

/// What the cells draw. A cell is drawn as it is configured and again only
/// as its row's look changes, when the layout measures it again: drawn
/// anew by itself, a line growing would be known to the layout too late
/// (ChatLayout's own advice).
@MainActor private final class ChatLinesModel {
  var row: (String) -> AnyView = { _ in AnyView(EmptyView()) }
  /// The chat screen's, which the cells, hosted apart, do not inherit.
  var environment = EnvironmentValues()
  /// Each item's look, as last laid out.
  var looks: [String: AnyHashable] = [:]
  /// The items coming in by the update being put in whose parts come in
  /// as they do while the chat is open (itemEntering).
  var entering: Set<String> = []
  /// Each item's height as measured, at its look and the width it had.
  private var heights: [String: (look: AnyHashable, width: CGFloat, height: CGFloat)] = [:] {
    didSet {
      typicalHeight =
        heights.isEmpty ? nil : heights.values.reduce(0) { $0 + $1.height } / CGFloat(heights.count)
    }
  }
  /// The items measured, on average: how tall an item not yet measured is
  /// taken to be, as close as a guess gets before it is drawn.
  private(set) var typicalHeight: CGFloat?
  /// What each item's words take to draw, at its look (LineDrawing), for
  /// the lines most recently drawn or measured.
  private let drawings = {
    let drawings = NSCache<NSString, KeptDrawing>()
    drawings.countLimit = 1000
    return drawings
  }()
  /// Where items are measured, apart from the cells: a cell given another
  /// item draws the one it had for a moment, and measured then says that
  /// one's height.
  private let sizer = UIHostingController(rootView: AnyView(EmptyView()))

  /// The item `id`'s height at `width`, if measured already for its look.
  func knownHeight(of id: String, width: CGFloat) -> CGFloat? {
    let look = looks[id] ?? AnyHashable(id)
    guard let known = heights[id], known.look == look, known.width == width else { return nil }
    return known.height
  }

  /// The item `id`'s height at `width`, measured once for its look.
  func height(of id: String, width: CGFloat) -> CGFloat {
    if let known = knownHeight(of: id, width: width) { return known }
    let look = looks[id] ?? AnyHashable(id)
    sizer.rootView = AnyView(
      LineCellContent(
        id: id, content: row(id), environment: environment, space: LineSpace(),
        drawing: drawing(of: id), measuring: true))
    let height = ceil(
      sizer.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height)
    heights[id] = (look, width, height)
    return height
  }

  /// Where the item `id`'s drawing is kept, for its look: made again as
  /// its look changes.
  func drawing(of id: String) -> KeptDrawing {
    let look = looks[id] ?? AnyHashable(id)
    if let kept = drawings.object(forKey: id as NSString), kept.look == look {
      return kept
    }
    let kept = KeptDrawing(id: id, look: look)
    drawings.setObject(kept, forKey: id as NSString)
    return kept
  }

  /// How tall a day's words are drawn, in its title and floating over the
  /// lines (DayWords), measured once for the chat's environment.
  var dayHeight: CGFloat {
    if let dayHeightKept { return dayHeightKept }
    sizer.rootView = AnyView(DayWords(day: .today).environment(\.self, environment))
    let height = sizer.sizeThatFits(
      in: CGSize(width: CGFloat.greatestFiniteMagnitude, height: .greatestFiniteMagnitude)
    ).height
    dayHeightKept = height
    return height
  }
  private var dayHeightKept: CGFloat?

  /// Every item is drawn and measured again, the chat's environment having
  /// changed how they are drawn.
  func forgetHeights() {
    dayHeightKept = nil
    heights.removeAll()
    drawings.removeAllObjects()
  }

  /// Only the items laid out are kept measured.
  func keepHeights(of ids: [String]) {
    let kept = Set(ids)
    heights = heights.filter { kept.contains($0.key) }
  }
}

/// What of the chat screen's environment changes how every line is drawn.
private struct LinesLook: Equatable {
  let colors: ThemeColors
  let scheme: ColorScheme
  let type: DynamicTypeSize
  let weight: LegibilityWeight?
  let english: Bool
  let look: Look

  init(_ environment: EnvironmentValues) {
    colors = environment.themeColors
    scheme = environment.colorScheme
    type = environment.dynamicTypeSize
    weight = environment.legibilityWeight
    english = environment.english
    look = environment.look
  }
}

/// The chat's room: its lines, the pins over them, and the ↓ and the
/// composer on the keyboard at its foot, the lines kept clear of them.
struct ChatStage: UIViewControllerRepresentable {
  /// Every item, oldest first, by its ChatItemID.
  let rows: [LinesRow]
  let row: (String) -> AnyView
  /// Over the lines' top, under the header: the pins, and hanging under
  /// them the floating day and a notice, which the lines go on under.
  let top: AnyView
  /// The ↓ to the latest, over the composer's right.
  let latest: AnyView
  /// On the keyboard, or the screen's foot: the composer, or what stands
  /// in its place.
  let composer: AnyView
  /// In the middle of the lines' room, between the pins and the composer:
  /// what it says while there are no lines.
  let empty: AnyView
  let scroll: ChatScroll
  let proxy: ChatLinesProxy
  @Binding var following: Bool
  /// The lines are shown, once where the chat opens.
  let shown: Bool
  /// A line's menu is open: lines coming in wait until it closes, so the
  /// line held stays under its menu; lines changing are drawn meanwhile.
  let holds: Bool
  /// The day of the lines from the item `id` at the top.
  let dayOver: (String) -> Day?
  /// How the item `id` is dragged to reply to it; none for an item the
  /// menu has no 返信 on.
  let replySwipe: (String) -> ReplySwipe?
  /// The item `id` was dragged far enough to reply to it.
  let onReply: (String) -> Void
  /// The line whose reactions and menu are open over the chat, which the
  /// stage lifts from where its bubble is; none closes it.
  let menu: MessageActionsRequest?
  /// The bubble of the line with this op_id was held, on the link given,
  /// for its menu.
  let onHold: (String, URL?) -> Void
  /// The menu has gone, its line's bubble to be drawn in the chat again.
  let onMenuClosed: () -> Void
  /// The items within Chat.photoPrefetchScreens of those in sight, told
  /// as they change while the lines scroll, for their photos to be fetched
  /// ahead. UICollectionView's own prefetching stays off (ChatLayout's).
  var onNear: ([String]) -> Void = { _ in }

  func makeUIViewController(context: Context) -> ChatController {
    let controller = ChatController(scroll: scroll)
    proxy.controller = controller
    return controller
  }

  func updateUIViewController(_ controller: ChatController, context: Context) {
    proxy.controller = controller
    controller.update(self, environment: context.environment)
  }

  /// The chat has gone: whatever waits to be told the lines are in place
  /// is told now, rather than never.
  static func dismantleUIViewController(_ controller: ChatController, coordinator: ()) {
    controller.letGo()
  }
}

/// The width the SwiftUI over the lines is laid out at, the controller's.
@MainActor @Observable private final class StageWidth {
  var value: CGFloat?
}

/// SwiftUI over the lines, laid out at the controller's width and from
/// its host's top. Its host's preferred size is then its height at that
/// width: with none given, a hosting controller's preferred size is the
/// content's ideal size at no width, which does not wrap words. From the
/// top, as its host's height changes by a UIKit animation while the
/// content's does by SwiftUI's, the two keep their top together: a host
/// centers content of another height, which would set the content apart
/// from the host by half the change until both settle.
private struct Hosted: View {
  let width: StageWidth
  let content: AnyView

  var body: some View {
    content
      .frame(width: width.value)
      .frame(minHeight: 0, maxHeight: .infinity, alignment: .top)
  }
}

final class ChatController: UIViewController, UICollectionViewDelegate,
  UIGestureRecognizerDelegate, ChatLayoutDelegate, UIScrollViewAccessibilityDelegate
{
  private let scroll: ChatScroll
  private let layout = CollectionViewChatLayout()
  private lazy var lines = UICollectionView(frame: .zero, collectionViewLayout: layout)
  private var source: ChatLayoutDiffableDataSource<Int, String>?
  private let model = ChatLinesModel()
  private let width = StageWidth()
  /// The pins, at the top of the lines under the header.
  private let top = UIHostingController(rootView: AnyView(EmptyView()))
  private let latest = UIHostingController(rootView: AnyView(EmptyView()))
  private let composer = UIHostingController(rootView: AnyView(EmptyView()))
  private let empty = UIHostingController(rootView: AnyView(EmptyView()))
  /// Where the lines are seen: between the pins and the composer.
  private let room = UILayoutGuide()
  /// The pins' height, as they say it.
  private lazy var topHeight = top.view.heightAnchor.constraint(equalToConstant: 0)
  /// The composer's height, as it says it, changed by its own animation.
  private lazy var composerHeight = composer.view.heightAnchor.constraint(equalToConstant: 0)
  private(set) var settings: ChatStage?
  private var ids: [String] = []
  private var linesLook: LinesLook?
  /// Motion is reduced: the lines are put where they go, never glided.
  private var reduceMotion = false
  /// Where the lines are being taken or kept, between the person's own
  /// scrolling: changed only by `hold(_:)`.
  private var hold = Hold.opening(nil)
  /// The update of the lines being put in, while it is.
  private var updating: Updating?
  /// Drags a line sideways to reply to it.
  private lazy var swipe = SwipePan(target: self, action: #selector(swiped))
  /// The line being dragged, which way, and whether it is far enough.
  private var swiping: (id: String, way: ReplySwipe, far: Bool)?
  /// The cells moved, the line's and its reactions', put back as the line
  /// is let go or drawn in others.
  private var swipedCells: [UICollectionViewCell] = []
  /// Beside the line dragged, showing as it goes.
  private let replyArrow = UIImageView(
    image: UIImage(
      systemName: "arrowshape.turn.up.left.circle.fill",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 28)))
  private let replyFeel = UIImpactFeedbackGenerator(style: .light)
  /// Holds a line's bubble for its reactions and menu.
  private lazy var press = TouchedPress(target: self, action: #selector(pressed))
  /// The line whose bubble the press is on, and the cell's space it was
  /// found in, which gives under the finger.
  private var pressing: (lineID: String, space: LineSpace)?
  /// Where the finger was on the window as the press was held, while it
  /// stays down.
  private var heldAt: CGPoint?
  /// The open line's reactions and menu, over the chat's window.
  private var menuLayer: MenuLayer?
  /// Where the open menu's line is: its item, and its bubble's frame in
  /// the item's cell.
  private var menuAnchor: (item: String, inCell: CGRect)?

  init(scroll: ChatScroll) {
    self.scroll = scroll
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear

    layout.settings.interItemSpacing = CGFloat(Chat.lineGap)
    // 16 points to the screen's edges, less the room a bubble's tail
    // reaches into, which each cell keeps inside it (LineCellContent).
    let side = 16 - BubbleShape.tailReach
    layout.settings.additionalInsets = UIEdgeInsets(top: 12, left: side, bottom: 12, right: side)
    layout.keepContentOffsetAtBottomOnBatchUpdates = true
    layout.keepContentAtBottomOfVisibleArea = true
    layout.processOnlyVisibleItemsOnAnimatedBatchUpdates = false
    layout.delegate = self

    lines.translatesAutoresizingMaskIntoConstraints = false
    lines.backgroundColor = .clear
    lines.contentInsetAdjustmentBehavior = .never
    lines.keyboardDismissMode = .interactive
    lines.alwaysBounceVertical = true
    lines.showsHorizontalScrollIndicator = false
    // A cell changes size only as it is configured again, measured then.
    lines.selfSizingInvalidation = .disabled
    // ChatLayout's: prefetched cells are laid out at sizes not yet theirs.
    lines.isPrefetchingEnabled = false
    lines.delegate = self
    let model = model
    let registration = UICollectionView.CellRegistration<LineCell, String> { cell, _, id in
      // A cell given another item knows only that one's bubbles.
      if cell.item != id {
        cell.item = id
        cell.space = LineSpace()
      }
      let content = model.row(id)
      let environment = model.environment
      let space = cell.space
      let drawing = model.drawing(of: id)
      let entering = model.entering.contains(id)
      cell.measure = { width in model.height(of: id, width: width) }
      cell.rises = ChatItemID.isReactions(id)
      cell.contentConfiguration = UIHostingConfiguration {
        LineCellContent(
          id: id, content: content, environment: environment, space: space, drawing: drawing,
          entering: entering)
      }
      .margins(.all, 0)
    }
    source = ChatLayoutDiffableDataSource(collectionView: lines) { lines, path, id in
      lines.dequeueConfiguredReusableCell(using: registration, for: path, item: id)
    }
    // A tap on the lines puts the keyboard away, as LINE does, unless a
    // line's own part takes it (a link, a photo, a bubble): it waits for
    // theirs to fail (gestureRecognizer(_:shouldRequireFailureOf:)).
    let tap = UITapGestureRecognizer(target: self, action: #selector(tapped))
    tap.cancelsTouchesInView = false
    tap.delegate = self
    lines.addGestureRecognizer(tap)
    // A line dragged sideways replies to it: only a drag mostly across
    // (gestureRecognizerShouldBegin), the lines scrolling otherwise.
    swipe.delegate = self
    lines.addGestureRecognizer(swipe)
    lines.panGestureRecognizer.require(toFail: swipe)
    // A bubble held opens its line's reactions and menu, the finger then
    // picking one as it lifts. On the lines themselves, not on the line's
    // SwiftUI, so a line's cell drawn anew meanwhile never cancels it; it
    // takes only touches on a bubble (gestureRecognizer(_:shouldReceive:)),
    // and never alongside the lines' scrolling, a drag to reply, or a
    // bubble's own tap, which it fails as it is held.
    press.minimumPressDuration = Double(Chat.longPressMs) / 1000
    press.delegate = self
    press.onTouched = { [weak self] down in self?.give(down) }
    lines.addGestureRecognizer(press)
    NotificationCenter.default.addObserver(
      self, selector: #selector(leftScreen), name: UIApplication.didEnterBackgroundNotification,
      object: nil)
    replyArrow.alpha = 0
    lines.addSubview(replyArrow)
    view.addSubview(lines)

    host(empty, sizing: .intrinsicContentSize)
    host(top, sizing: .preferredContentSize)
    host(latest, sizing: .intrinsicContentSize)
    host(composer, sizing: .preferredContentSize)
    // The lines go on under the composer as iOS 26's bars have them: its
    // glass sets off the lines under it by the scroll edge's effect.
    let edge = UIScrollEdgeElementContainerInteraction()
    edge.scrollView = lines
    edge.edge = .bottom
    composer.view.addInteraction(edge)
    view.addLayoutGuide(room)
    NSLayoutConstraint.activate([
      lines.topAnchor.constraint(equalTo: view.topAnchor),
      // Going on under the composer and the keyboard to the screen's foot,
      // kept clear of them by the lines' inset (fitRoom), as ChatLayout's
      // Example keeps them over its input bar: their height stays as the
      // keyboard comes and goes, so no cell is made again for it.
      lines.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      lines.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      lines.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      top.view.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
      top.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      top.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      topHeight,
      // On the keyboard, as it comes, goes and follows a finger pulling it
      // down; on the home indicator without it.
      composer.view.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
      composer.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      composer.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      composerHeight,
      latest.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      latest.view.bottomAnchor.constraint(equalTo: composer.view.topAnchor),
      room.topAnchor.constraint(equalTo: top.view.bottomAnchor),
      room.bottomAnchor.constraint(equalTo: composer.view.topAnchor),
      empty.view.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      empty.view.centerYAnchor.constraint(equalTo: room.centerYAnchor),
    ])
  }

  /// Puts `hosted`'s SwiftUI over the lines, its safe area the screen's
  /// edges alone: it stands clear of the keyboard by its place, not by
  /// SwiftUI's avoiding it.
  private func host(_ hosted: UIHostingController<AnyView>, sizing: UIHostingControllerSizingOptions) {
    addChild(hosted)
    hosted.sizingOptions = sizing
    hosted.safeAreaRegions = .container
    hosted.view.backgroundColor = .clear
    hosted.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(hosted.view)
    hosted.didMove(toParent: self)
  }

  /// The pins or the composer have another height: the composer changes
  /// to it by its own spring (Chat.composerSpring), the one SwiftUI changes
  /// it by within (ChatComposer), and the lines and the ↓ make room in the
  /// same layout, by the same spring, never apart from it. The
  /// pins float over the lines, which stay where they are as they open.
  override func preferredContentSizeDidChange(
    forChildContentContainer container: any UIContentContainer
  ) {
    super.preferredContentSizeDidChange(forChildContentContainer: container)
    if container === top {
      topHeight.constant = top.preferredContentSize.height
      return
    }
    guard container === composer else { return }
    let height = composer.preferredContentSize.height
    guard height != composerHeight.constant else { return }
    guard view.window != nil, composerHeight.constant > 0 else {
      composerHeight.constant = height
      return
    }
    UIView.animate(
      springDuration: Chat.composerSpring.duration, bounce: Chat.composerSpring.bounce
    ) {
      self.composerHeight.constant = height
      self.view.layoutIfNeeded()
    }
  }

  /// The lines are the screen's scroll view for its header, as a list's
  /// are: the header's edge effect sets the lines going under it off, as
  /// iOS 26 does for every screen whose content goes under its bars.
  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    parent?.pageInNavigation?.setContentScrollView(lines, for: .top)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if width.value != view.bounds.width { width.value = view.bounds.width }
    fitRoom()
    place()
    layoutMenu()
    makeRoomForMenu()
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    closeMenuNow()
  }

  override func viewWillTransition(
    to size: CGSize, with coordinator: any UIViewControllerTransitionCoordinator
  ) {
    super.viewWillTransition(to: size, with: coordinator)
    closeMenuNow()
  }

  func update(_ settings: ChatStage, environment: EnvironmentValues) {
    self.settings = settings
    model.environment = environment
    model.row = settings.row
    top.rootView = AnyView(
      Hosted(width: width, content: settings.top).environment(\.self, environment))
    latest.rootView = AnyView(settings.latest.environment(\.self, environment))
    empty.rootView = AnyView(settings.empty.environment(\.self, environment))
    composer.rootView = AnyView(
      Hosted(width: width, content: settings.composer).environment(\.self, environment))
    replyArrow.tintColor = UIColor(environment.themeColors.textTertiary)
    let alpha: CGFloat = settings.shown ? 1 : 0
    if lines.alpha != alpha {
      UIView.animate(withDuration: alpha == 1 ? 0.15 : 0, delay: 0, options: .curveEaseOut) {
        self.lines.alpha = alpha
      }
    }
    let look = LinesLook(environment)
    let restyled = linesLook.map { $0 != look } ?? false
    linesLook = look
    reduceMotion = environment.accessibilityReduceMotion
    setLines(
      Rows(
        rows: settings.holds ? keeping(settings.rows) : settings.rows, restyled: restyled,
        reduceMotion: environment.accessibilityReduceMotion))
    showMenu(settings.menu)
  }

  /// `rows` without the lines coming or going, which wait while a line's
  /// menu is open: only those there now, as they are drawn now.
  private func keeping(_ rows: [LinesRow]) -> [LinesRow] {
    let byID = Dictionary(rows.map { ($0.id, $0) }) { first, _ in first }
    return ids.compactMap { id in byID[id] ?? model.looks[id].map { LinesRow(id: id, look: $0) } }
  }

  // MARK: Lines

  private var following: Bool {
    get { settings?.following ?? true }
    set { if settings?.following != newValue { settings?.following = newValue } }
  }

  private var userScrolling: Bool { lines.isDragging || lines.isDecelerating }

  /// Lines are laid out, in a room to show them in.
  private var ready: Bool { !ids.isEmpty && lines.bounds.height > 0 }

  /// Puts in `rows`, saying whether any changed.
  @discardableResult
  private func setLines(_ rows: Rows) -> Bool {
    guard let source else { return false }
    if let busy = updating {
      // The latest come while others are being put in, put in once those
      // are in place, as ChatLayout's Example holds an update back.
      let restyled = rows.restyled || (busy.next?.restyled ?? false)
      updating?.next = Rows(rows: rows.rows, restyled: restyled, reduceMotion: rows.reduceMotion)
      return true
    }
    let new = rows.rows.map(\.id)
    // Lines there before whose look has changed are drawn and measured
    // again, in the same update.
    let redrawn = rows.rows.filter { row in
      model.looks[row.id].map { rows.restyled || $0 != row.look } ?? false
    }.map(\.id)
    guard new != ids || !redrawn.isEmpty else { return false }
    var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
    snapshot.appendSections([0])
    snapshot.appendItems(new, toSection: 0)
    snapshot.reconfigureItems(redrawn)
    // Where the item the lines are on stands, read by the lines laid out
    // now, before the update's own order replaces theirs.
    let held = heldTop(among: redrawn)
    let old = ids
    ids = new
    model.looks = Dictionary(rows.rows.map { ($0.id, $0.look) }) { first, _ in first }
    if rows.restyled { model.forgetHeights() } else { model.keepHeights(of: new) }
    // Lines laid out anew, none kept (the chat's first, the latest after a
    // gap): put in at once, at their foot, as the chat opens on them.
    guard source.snapshot != nil, old.contains(where: { ChatItemID.isLine($0) && new.contains($0) })
    else {
      UIView.performWithoutAnimation {
        source.applySnapshotUsingReloadData(snapshot, commitAlongsideUpdates: {})
        lines.layoutIfNeeded()
      }
      laidOutAnew()
      return true
    }
    // A page coming in above goes in at once, the lines seen held where
    // they are; lines coming at the foot or changing height move, or with
    // motion reduced (lines coming in fading in where they go) are put
    // there at once, and so are all of them drawn anew in another look.
    let earlier = cameAbove(old, in: new)
    let animated = !earlier && !rows.restyled && !rows.reduceMotion && !userScrolling
    // Reactions coming to a line already there come in where they go, by
    // their own SwiftUI, as the line moves up to make room.
    let popping = reactionsCame(old, in: new)
    model.entering = popping
    let below = cameBelow(old, in: new).subtracting(popping)
    let fading = new != old && !earlier && rows.reduceMotion ? below : []
    updating = Updating(before: old, risingIn: animated ? below : [], popping: popping)
    let update = { [weak self] in
      guard let self else { return }
      source.apply(snapshot, animatingDifferences: animated, commitAlongsideUpdates: {}) {
        [weak self] in
        guard let self else { return }
        let next = updating?.next
        updating = nil
        model.entering = []
        // The lines waiting go in next; changing none, these have landed.
        if let next, setLines(next) { return }
        landed()
        // Once at the foot, where they are seen.
        fadeIn(fading)
      }
      keep(held)
      // An open or closing menu's line moved by the update, its bubble
      // with it, in the same animation.
      layoutMenu()
    }
    // In one animation of the lines' own, however they changed: lines
    // coming in, and lines growing or shrinking in place (a reaction, an
    // edit, a link's page, 続きを読む), the lines over them moving with
    // them (keepContentOffsetAtBottomOnBatchUpdates). The batch update takes
    // its timing from an animation by duration around it; around a spring
    // by perceived duration (springDuration:) it keeps UIKit's own.
    if animated {
      UIView.animate(
        withDuration: Double(Chat.lineMoveMs) / 1000, delay: 0, usingSpringWithDamping: 1,
        initialSpringVelocity: 0, options: .allowUserInteraction, animations: update)
    } else {
      update()
    }
    return true
  }

  /// The item the lines are on, where its top stands among the lines seen,
  /// as it is drawn again: unless they follow the latest, whose foot they
  /// keep instead (keepContentOffsetAtBottomOnBatchUpdates).
  private func heldTop(among redrawn: [String]) -> (id: String, top: CGFloat)? {
    guard case .on(let anchor) = hold, !following, !userScrolling, redrawn.contains(anchor.id),
      let index = ids.firstIndex(of: anchor.id),
      let frame = layout.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame
    else { return nil }
    return (anchor.id, frame.minY - lines.contentOffset.y)
  }

  /// Puts the lines where the update leaves them, in its own animation if
  /// it has one: the item they are on back where its top stood, as it grows
  /// or shrinks, by the scroll's difference alone; else no further than
  /// their end. Shrunk at their foot with no animation (motion reduced),
  /// they would stand past it, and the scroll view glide them back.
  private func keep(_ held: (id: String, top: CGFloat)?) {
    guard !userScrolling else { return }
    guard let held, let index = ids.firstIndex(of: held.id),
      let frame = layout.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame
    else {
      if lines.contentOffset.y > highest { lines.contentOffset.y = highest }
      return
    }
    lines.contentOffset.y = min(highest, max(lowest, frame.minY - held.top))
  }

  /// Lines new to `new` stand above the first line it keeps from `old`:
  /// lines alone, as the day over them and the spinner over the earlier
  /// lines stay at the top of both.
  private func cameAbove(_ old: [String], in new: [String]) -> Bool {
    guard let kept = old.first(where: { ChatItemID.isLine($0) && new.contains($0) }),
      let at = new.firstIndex(of: kept)
    else { return false }
    return new[..<at].contains { ChatItemID.isLine($0) && !old.contains($0) }
  }

  /// The reactions new to `new` of lines it keeps from `old`: come while
  /// the chat is open, not with their line.
  private func reactionsCame(_ old: [String], in new: [String]) -> Set<String> {
    let kept = Set(old)
    return Set(
      new.filter {
        ChatItemID.isReactions($0) && !kept.contains($0) && kept.contains(ChatItemID.line(of: $0))
      })
  }

  /// The items new to `new` below the last line it keeps from `old`:
  /// someone writing, kept under them, is passed over, so a line sent
  /// while they write rises too.
  private func cameBelow(_ old: [String], in new: [String]) -> Set<String> {
    let kept = Set(old)
    var below: Set<String> = []
    for id in new.reversed() {
      if !kept.contains(id) {
        below.insert(id)
      } else if ChatItemID.isLine(id) {
        break
      }
    }
    return below
  }

  /// An item coming in at the foot starts a line's height lower, unseen,
  /// rising into place with the lines as they slide up to it, as a line
  /// sent comes in in the messaging apps; reactions coming to a line stand
  /// where they go, coming in by their own SwiftUI; others fade in,
  /// ChatLayout's own. The same as it is first asked and as its height is
  /// measured.
  func initialLayoutAttributesForInsertedItem(
    _ chatLayout: CollectionViewChatLayout, at indexPath: IndexPath,
    modifying originalAttributes: ChatLayoutAttributes, on state: InitialAttributesRequestType
  ) {
    let id = indexPath.item < ids.count ? ids[indexPath.item] : nil
    if let id, updating?.popping.contains(id) == true { return }
    originalAttributes.alpha = 0
    if let id, updating?.risingIn.contains(id) == true {
      originalAttributes.center.y += originalAttributes.frame.height
    }
  }

  /// A line's last reaction taken back shrinks and fades where it stood,
  /// as a pill going from a row does; anything else fades, ChatLayout's
  /// own.
  func finalLayoutAttributesForDeletedItem(
    _ chatLayout: CollectionViewChatLayout, at indexPath: IndexPath,
    modifying originalAttributes: ChatLayoutAttributes
  ) {
    originalAttributes.alpha = 0
    if let before = updating?.before, indexPath.item < before.count,
      ChatItemID.isReactions(before[indexPath.item])
    {
      originalAttributes.transform = CGAffineTransform(scaleX: 0.5, y: 0.5)
    }
  }

  /// An item's height once measured, so the layout puts it where it goes
  /// before its cell is drawn, and the items measured on average before
  /// then: a page coming in above is laid out near its own height, rather
  /// than at ChatLayout's 40pt each, and its lines growing to theirs as
  /// they show move the scroll by a little each, not by a screen. Each
  /// still takes its height from its cell (LineCell), which ChatLayout
  /// asks by index paths that may be the update's before or after.
  func sizeForItem(_ chatLayout: CollectionViewChatLayout, at indexPath: IndexPath) -> ItemSize {
    let width = chatLayout.layoutFrame.width
    let known =
      indexPath.item < ids.count ? model.knownHeight(of: ids[indexPath.item], width: width) : nil
    guard let height = known ?? model.typicalHeight else { return .auto }
    return .estimated(CGSize(width: width, height: height))
  }

  /// The items `ids` just put in fade in where they are, the cells' own
  /// content alone, as lines come in with motion reduced.
  private func fadeIn(_ ids: Set<String>) {
    guard !ids.isEmpty else { return }
    let cells = ids.compactMap { id in
      self.ids.firstIndex(of: id).flatMap { lines.cellForItem(at: IndexPath(item: $0, section: 0)) }
    }
    for cell in cells { cell.contentView.alpha = 0 }
    UIView.animate(withDuration: 0.2, delay: 0, options: .allowUserInteraction) {
      for cell in cells { cell.contentView.alpha = 1 }
    }
  }

  /// Lines have come in: an item waiting to be shown is shown, and still
  /// following, the foot is kept.
  private func landed() {
    seePlace()
    showWaiting()
    if following, !scroll.place.atLatest, !userScrolling, !hold.gliding {
      toLatest(animated: true)
    }
  }

  /// Lines laid out anew: put at their foot, as the chat opens on them,
  /// and on to an item waiting to be shown.
  private func laidOutAnew() {
    guard lines.bounds.height > 0 else { return }
    switch hold {
    case .opening:
      place()
    case .waiting:
      putAtFoot()
      showWaiting()
    case .free, .on, .toLatest, .goingTo:
      putAtFoot()
      hold(.free)
    }
  }

  /// Keeps the lines clear of what is over and under them, as it changes:
  /// the pins at their top, and at their foot the composer and the keyboard
  /// or the home indicator. Called in each layout, so in the animation that
  /// moved them (the keyboard's, the composer's); the lines then move in it
  /// too.
  ///
  /// Under them, the lines seen keep their foot where it is over the
  /// composer, as ChatLayout's Example keeps them, by the scroll alone: the
  /// scroll goes by the change in the animation, and the inset changes
  /// outside it, which no longer moves them. Never by restoring a snapshot
  /// (restoreContentOffset), which lays the lines out with no cells and
  /// takes every cell from the screen and back, the SwiftUI of a line under
  /// a finger made anew and its long press cancelled (the build 467 crash).
  /// The scroll first, then the inset, so the inset growing smaller never
  /// cuts a scroll past its new end at once, unanimated. Not while the
  /// person scrolls them, as when their drag pulls the keyboard down: the
  /// scroll is theirs (ChatLayout's Example leaves it to them too). Over
  /// them, the pins float, and the lines stay where they are.
  private func fitRoom() {
    let over = top.view.frame.maxY
    if lines.contentInset.top != over {
      lines.contentInset.top = over
      lines.verticalScrollIndicatorInsets.top = over
    }
    let under = max(0, view.bounds.maxY - composer.view.frame.minY)
    view.keyboardLayoutGuide.keyboardDismissPadding = composer.view.bounds.height
    let change = under - lines.contentInset.bottom
    guard change != 0 else { return }
    if !userScrolling, !hold.opening {
      let end = max(lowest, layout.collectionViewContentSize.height - lines.bounds.height + under)
      lines.contentOffset.y = min(end, max(lowest, lines.contentOffset.y + change))
    }
    UIView.performWithoutAnimation {
      lines.contentInset.bottom = under
      lines.verticalScrollIndicatorInsets.bottom = under
    }
    // Laid out again for the room the lines are seen in, as a scroll
    // would have it: lines too few to fill it stand at its foot.
    layout.invalidateLayout(with: layout.invalidationContext(forBoundsChange: lines.bounds))
    lines.layoutIfNeeded()
    if !userScrolling, case .on(let anchor) = hold, settings?.shown == false {
      put(anchor)
    }
    seePlace()
  }

  private func footSnapshot() -> ChatLayoutPositionSnapshot? {
    ids.indices.last.map {
      ChatLayoutPositionSnapshot(indexPath: IndexPath(item: $0, section: 0), edge: .bottom)
    }
  }

  private var seenHeight: CGFloat {
    lines.bounds.height - lines.adjustedContentInset.top - lines.adjustedContentInset.bottom
  }

  private var lowest: CGFloat { -lines.adjustedContentInset.top }

  private var highest: CGFloat {
    max(
      lowest,
      layout.collectionViewContentSize.height - lines.bounds.height
        + lines.adjustedContentInset.bottom)
  }

  // MARK: Where the lines are held

  /// Holds the lines as `next` says from now on: an item asked to be shown
  /// that `next` no longer goes to is told it is done with, wherever the
  /// lines are.
  private func hold(_ next: Hold) {
    let left = hold.asked
    hold = next
    if let left, left !== next.asked { left.finish() }
  }

  /// The lines put where the chat opens, once they and their room are
  /// there: the item asked for meanwhile, from their foot, else the foot.
  private func place() {
    guard case .opening(let asked) = hold, ready else { return }
    putAtFoot()
    guard let asked else {
      hold(.free)
      return
    }
    hold(.waiting(asked))
    showWaiting()
  }

  func toLatest(animated: Bool = false) {
    guard ready else {
      hold(hold.opening ? .opening(nil) : .free)
      return
    }
    lines.layoutIfNeeded()
    let target = highest
    guard animated, !reduceMotion, abs(target - lines.contentOffset.y) > 1 else {
      hold(.free)
      putAtFoot()
      return
    }
    hold(.toLatest)
    glide(to: target)
  }

  /// The lines put at their foot, with no change to where they are held.
  private func putAtFoot() {
    guard let foot = footSnapshot() else { return }
    layout.restoreContentOffset(with: foot)
    seePlace()
  }

  func show(_ id: String, at place: LinePlace, animated: Bool, then: (() -> Void)?) {
    let asked = Showing(id: id, place: place, animated: animated, then: then)
    // Held from now on, so it is told once there however it gets there,
    // at once or gliding (hold(_:)); gone to now if laid out, else once
    // it is and lines going in are in place.
    hold(hold.opening ? .opening(asked) : .waiting(asked))
    showWaiting()
  }

  /// To the item asked for, laid out now: gliding, or put there at once.
  private func go(to asked: Showing) {
    lines.layoutIfNeeded()
    guard let index = ids.firstIndex(of: asked.id),
      let frame = layout.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame
    else {
      hold(.free)
      return
    }
    let target = min(highest, max(lowest, frame.minY - offset(of: frame, at: asked.spot)
      - lines.adjustedContentInset.top - layout.settings.additionalInsets.top))
    guard asked.animated, !reduceMotion, abs(target - lines.contentOffset.y) > 1 else {
      settle(on: asked)
      return
    }
    hold(.goingTo(asked))
    glide(to: target)
  }

  /// Glides the lines to `target`, from far off the last screen only rather
  /// than through all between.
  private func glide(to target: CGFloat) {
    let away = target - lines.contentOffset.y
    if abs(away) > seenHeight {
      lines.contentOffset.y = target - (away > 0 ? seenHeight : -seenHeight)
    }
    lines.setContentOffset(CGPoint(x: lines.contentOffset.x, y: target), animated: true)
  }

  /// The item asked to be shown before it was laid out, once it is.
  private func showWaiting() {
    guard case .waiting(let asked) = hold, ready, updating == nil, ids.contains(asked.id) else {
      return
    }
    go(to: asked)
  }

  /// Nothing more to go to, the lines gone: told so.
  func letGo() {
    hold(.free)
  }

  /// Where an item's top goes below the top of the lines seen.
  private func offset(of frame: CGRect, at spot: Spot) -> CGFloat {
    switch spot {
    case .below(let offset): offset
    case .middle: max(0, (seenHeight - frame.height) / 2) - layout.settings.additionalInsets.top
    }
  }

  /// Puts the lines on the item asked for, there from now on: told so
  /// once there.
  private func settle(on asked: Showing) {
    let anchor = Anchor(id: asked.id, spot: asked.spot)
    put(anchor)
    seePlace()
    // VoiceOver reads on from the item gone to.
    if UIAccessibility.isVoiceOverRunning, let index = ids.firstIndex(of: asked.id) {
      lines.layoutIfNeeded()
      UIAccessibility.post(
        notification: .layoutChanged,
        argument: lines.cellForItem(at: IndexPath(item: index, section: 0)))
    }
    hold(.on(anchor))
  }

  /// The lines moved to put the item at its spot: the items it then shows
  /// measured first, so they are put there once, at their own heights.
  private func put(_ anchor: Anchor) {
    guard let index = ids.firstIndex(of: anchor.id) else { return }
    measure(around: index, at: anchor.spot)
    let path = IndexPath(item: index, section: 0)
    guard let frame = layout.layoutAttributesForItem(at: path)?.frame else { return }
    layout.restoreContentOffset(
      with: ChatLayoutPositionSnapshot(
        indexPath: path, edge: .top, offset: offset(of: frame, at: anchor.spot)))
  }

  /// Measures the items the screen shows with the item at `index` at
  /// `spot`, the room over and under the lines seen too, and has the
  /// layout take their heights (sizeForItem). Put there at heights
  /// estimated, the items drawn would take their own as they show, and
  /// the layout, keeping the lines' foot, move the item off its spot.
  private func measure(around index: Int, at spot: Spot) {
    let width = layout.layoutFrame.width
    let gap = layout.settings.interItemSpacing
    var learned = false
    func height(_ item: Int) -> CGFloat {
      if model.knownHeight(of: ids[item], width: width) == nil { learned = true }
      return model.height(of: ids[item], width: width) + gap
    }
    let own = height(index)
    let above =
      switch spot {
      case .below(let offset): offset
      case .middle: max(0, (seenHeight - own) / 2)
      }
    var reach = -(above + lines.adjustedContentInset.top + layout.settings.additionalInsets.top)
    var item = index - 1
    while item >= 0, reach < 0 {
      reach += height(item)
      item -= 1
    }
    reach = own
    item = index + 1
    while item < ids.count, reach < lines.bounds.height {
      reach += height(item)
      item += 1
    }
    if learned { layout.invalidateLayout() }
  }

  func growDown(_ id: String) {
    guard let index = ids.firstIndex(of: id),
      let frame = layout.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame
    else { return }
    hold(
      .on(
        Anchor(
          id: id,
          spot: .below(
            frame.minY - lines.contentOffset.y - lines.adjustedContentInset.top
              - layout.settings.additionalInsets.top))))
  }

  /// The items last told near those in sight.
  private var near: [String] = []

  /// Tells the items within Chat.photoPrefetchScreens above and below the
  /// lines in sight, as they change.
  private func seeNear() {
    guard let settings, !hold.opening, lines.bounds.height > 0 else { return }
    let reach = lines.bounds.height * CGFloat(Chat.photoPrefetchScreens)
    let around = lines.bounds.insetBy(dx: 0, dy: -reach)
    let ids = (layout.layoutAttributesForElements(in: around) ?? [])
      .filter { $0.representedElementCategory == .cell }
      .compactMap { $0.indexPath.item < ids.count ? ids[$0.indexPath.item] : nil }
    guard ids != near else { return }
    near = ids
    settings.onNear(ids)
  }

  /// Tells which end of the lines laid out is Chat.prefetchScreens away
  /// or nearer, measured where the lines are now, so the page beyond it
  /// is laid out before the reader scrolling on reaches it; not while
  /// lines are going in, which move them.
  private func seeEnds() {
    guard !hold.opening, updating == nil, lines.bounds.height > 0 else { return }
    let reach = seenHeight * CGFloat(Chat.prefetchScreens)
    let ends = NearEnds(
      top: lines.contentOffset.y - lowest < reach ? ids.first(where: ChatItemID.isLine) : nil,
      foot: highest - lines.contentOffset.y < reach ? ids.last(where: ChatItemID.isLine) : nil)
    if ends != scroll.near { scroll.near = ends }
  }

  /// Where the lines are scrolled, told to what shows it.
  private func seePlace() {
    seeNear()
    seeEnds()
    guard lines.bounds.height > 0 else { return }
    let inset = lines.adjustedContentInset
    let content = layout.collectionViewContentSize.height
    let below = content + inset.bottom - (lines.contentOffset.y + lines.bounds.height)
    let place = ScrollPlace(
      atLatest: below < 24, away: below > seenHeight / 2,
      unreadBelow: isBelowTop(ChatItem.unread.id))
    let before = scroll.place
    if place != before {
      scroll.place = place
    }
    // From the layout's own frames, as the visible items may not have
    // caught up with the scroll yet (Signal's).
    let laid = (layout.layoutAttributesForElements(in: lines.bounds) ?? [])
      .filter { $0.representedElementCategory == .cell }
      .sorted { $0.indexPath < $1.indexPath }
    let pinned = PinnedDay(
      rows: laid.compactMap { cell in
        let item = cell.indexPath.item
        guard item < ids.count else { return nil }
        return PinnedDay.Row(
          item: item, foot: cell.frame.maxY, title: ChatItemID.isDay(ids[item]))
      },
      line: lines.contentOffset.y + inset.top + FloatingDay.gap, height: model.dayHeight)
    let day = pinned.item.flatMap { $0 < ids.count ? settings?.dayOver(ids[$0]) : nil }
    if day != scroll.topDay { scroll.topDay = day }
    if pinned.push != scroll.dayPush { scroll.dayPush = pinned.push }
    let foot = lines.contentOffset.y + lines.bounds.height - inset.bottom + 1
    let seen = laid
      .filter { $0.frame.maxY <= foot }
      .compactMap { $0.indexPath.item < ids.count ? ids[$0.indexPath.item] : nil }
      .filter(ChatItemID.isLine)
    if seen != scroll.seen { scroll.seen = seen }
    layoutMenu()
  }

  /// The item `id` is laid out, its top below the top of the lines seen.
  private func isBelowTop(_ id: String) -> Bool {
    guard let index = ids.firstIndex(of: id),
      let frame = layout.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame
    else { return false }
    let top = lines.contentOffset.y + lines.adjustedContentInset.top
      + layout.settings.additionalInsets.top
    return frame.minY > top + 1
  }

  @objc private func tapped() {
    putKeyboardAway()
  }

  private func putKeyboardAway() {
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
    -> Bool
  {
    if gestureRecognizer === press { return pressable(touch) }
    guard gestureRecognizer === swipe else { return true }
    swipeStart = touch.location(in: view)
    // On a line dragged rightward to reply, going back by a drag
    // anywhere on the screen would take the drag first, whatever it
    // is told to wait for: it waits out this touch, as in Messages.
    // From the screen's edge going back is still the system's.
    let at = touch.location(in: lines)
    if swipeStart.x > Self.backEdge, let path = lines.indexPathForItem(at: at),
      path.item < ids.count, settings?.replySwipe(ChatItemID.line(of: ids[path.item])) == .rightward
    {
      let back = navigationController?.interactiveContentPopGestureRecognizer
      back?.isEnabled = false
      // Given back by the pan itself, even should the chat go meanwhile.
      swipe.heldBack = back
    }
    return true
  }

  /// The tap putting the keyboard away waits for a line's own parts'.
  func gestureRecognizer(
    _ gestureRecognizer: UIGestureRecognizer,
    shouldRequireFailureOf otherGestureRecognizer: UIGestureRecognizer
  ) -> Bool {
    gestureRecognizer is UITapGestureRecognizer && gestureRecognizer.view === lines
      && otherGestureRecognizer.view?.isDescendant(of: lines) == true
      && otherGestureRecognizer.view !== lines
  }

  // MARK: Swiping to reply

  /// Where the finger dragging a line went down.
  private var swipeStart: CGPoint = .zero
  /// Room kept at the screen's left edge for the system's own drag back.
  private static let backEdge: CGFloat = 24

  func gestureRecognizerShouldBegin(_ gestureRecognizer: UIGestureRecognizer) -> Bool {
    guard gestureRecognizer === swipe else { return true }
    // Which way the finger goes as it starts: the translation is not yet
    // counted. Mostly across, so a scroll a little aslant stays a scroll.
    let moved = swipe.velocity(in: lines)
    guard abs(moved.x) > abs(moved.y) * 2, let settings, !settings.holds else { return false }
    let at = view.convert(swipeStart, to: lines)
    guard let path = lines.indexPathForItem(at: at), path.item < ids.count else { return false }
    // A line's reactions drag with it, as one.
    let id = ChatItemID.line(of: ids[path.item])
    guard let way = settings.replySwipe(id) else { return false }
    switch way {
    case .rightward:
      // Not from the screen's edge, which is the system's.
      guard moved.x > 0, swipeStart.x > Self.backEdge else { return false }
    case .leftward:
      guard moved.x < 0 else { return false }
    }
    swiping = (id, way, false)
    return true
  }

  @objc private func swiped() {
    guard let swiping else { return }
    let moved = swipe.translation(in: lines).x
    let along = swiping.way == .rightward ? max(0, moved) : max(0, -moved)
    let far = along >= CGFloat(Chat.replySwipe)
    switch swipe.state {
    case .began:
      replyFeel.prepare()
      drag(swiping.id, way: swiping.way, by: along)
    case .changed:
      if far, !swiping.far {
        replyFeel.impactOccurred()
        replyFeel.prepare()
      }
      self.swiping?.far = far
      drag(swiping.id, way: swiping.way, by: along)
    case .ended:
      // Where it is let go, as the last move may not have been told.
      letGoOfSwipe()
      if far { settings?.onReply(swiping.id) }
    default:
      letGoOfSwipe()
    }
  }

  /// The cell drawing the item `id`, if it is laid out.
  private func cell(of id: String) -> UICollectionViewCell? {
    ids.firstIndex(of: id).flatMap { lines.cellForItem(at: IndexPath(item: $0, section: 0)) }
  }

  /// Draws the line `id` dragged `along` toward the middle, past
  /// chatRules.replySwipe less and less, the arrow beside it.
  private func drag(_ id: String, way: ReplySwipe, by along: CGFloat) {
    guard let cell = cell(of: id) else {
      letGoOfSwipe()
      return
    }
    // The line and its reactions, drawn in other cells as the lines
    // change meanwhile.
    let dragged = [cell] + [self.cell(of: ChatItemID.reactions(of: id))].compactMap { $0 }
    for old in swipedCells where !dragged.contains(where: { $0 === old }) {
      old.transform = .identity
    }
    swipedCells = dragged
    let full = CGFloat(Chat.replySwipe)
    let shift = along <= full ? along : full + (along - full) * CGFloat(Chat.replySwipeRubber)
    let sign: CGFloat = way == .rightward ? 1 : -1
    // The cells themselves: their hosted content keeps a transform of
    // its own.
    for cell in dragged {
      cell.transform = CGAffineTransform(translationX: sign * shift, y: 0)
    }
    // Where the line stands in its cell, unmoved, inside the room kept
    // for its tail.
    let size = replyArrow.intrinsicContentSize
    let frame = CGRect(
      x: cell.center.x - cell.bounds.width / 2, y: cell.center.y - cell.bounds.height / 2,
      width: cell.bounds.width, height: cell.bounds.height
    ).insetBy(dx: BubbleShape.tailReach, dy: 0)
    let shown = min(1, along / full)
    replyArrow.bounds.size = size
    // In the room the line leaves, at its middle.
    let x = way == .rightward
      ? frame.minX + max(size.width / 2, shift / 2)
      : frame.maxX - max(size.width / 2, shift / 2)
    replyArrow.center = CGPoint(x: x, y: frame.midY)
    replyArrow.alpha = shown
    let scale = 0.5 + 0.5 * shown
    replyArrow.transform = CGAffineTransform(scaleX: scale, y: scale)
  }

  /// The line let go goes back where it was, springing unless motion is
  /// reduced, and the arrow goes.
  private func letGoOfSwipe() {
    swiping = nil
    let cells = swipedCells
    swipedCells = []
    let back = {
      for cell in cells { cell.transform = .identity }
      self.replyArrow.alpha = 0
    }
    if reduceMotion {
      back()
    } else {
      UIView.animate(springDuration: 0.3, bounce: 0.2, options: .allowUserInteraction, animations: back)
    }
  }

  // MARK: Holding a line for its menu

  /// The press takes a touch only on a bubble, as its cell last told
  /// where its bubbles are.
  private func pressable(_ touch: UITouch) -> Bool {
    pressing = nil
    guard let path = lines.indexPathForItem(at: touch.location(in: lines)),
      let cell = lines.cellForItem(at: path) as? LineCell,
      let lineID = cell.space.bubble(at: touch.location(in: cell))
    else { return false }
    pressing = (lineID, cell.space)
    return true
  }

  /// The bubble pressed gives under the finger from the moment it goes
  /// down, until the press is held or over.
  private func give(_ down: Bool) {
    guard let pressing else { return }
    let pressed = down ? pressing.lineID : nil
    if pressing.space.pressed != pressed { pressing.space.pressed = pressed }
  }

  @objc private func pressed() {
    switch press.state {
    case .began:
      guard let lineID = pressing?.lineID else { return }
      give(false)
      heldAt = press.location(in: nil)
      // The menu opens and a light haptic marks it, the two together.
      UIImpactFeedbackGenerator(style: .light).impactOccurred()
      settings?.onHold(lineID, link(held: lineID))
    case .changed:
      menuLayer?.fingerMoved(to: press.location(in: nil))
    case .ended:
      heldAt = nil
      menuLayer?.fingerLifted(at: press.location(in: nil))
    default:
      // Cancelled, it picks nothing, as a system menu's press does.
      heldAt = nil
      menuLayer?.fingerLifted(at: nil)
    }
  }

  /// The link under the press on the bubble of `lineID`, which opens its
  /// own menu instead.
  private func link(held lineID: String) -> URL? {
    guard let (cell, spot) = bubble(of: lineID) else { return nil }
    return spot.links.link(at: press.location(in: cell))
  }

  /// The cell showing the bubble of `lineID`, and where it is in it.
  private func bubble(of lineID: String) -> (LineCell, HeldSpot)? {
    for case let cell as LineCell in lines.visibleCells {
      if let spot = cell.space.bubbles[lineID] { return (cell, spot) }
    }
    return nil
  }

  // MARK: The menu

  /// Opens the menu `request` asks for, lifting its line's bubble from
  /// where it is; closes the one open, its line gone, when none asks.
  private func showMenu(_ request: MessageActionsRequest?) {
    if let menuLayer {
      if request?.id != menuLayer.request.id { menuLayer.close(fade: true) }
      return
    }
    guard let request else { return }
    guard let window = view.window, let (cell, spot) = bubble(of: request.lineID),
      let path = lines.indexPath(for: cell), path.item < ids.count
    else {
      // Its line no longer on the screen: nothing to lift.
      let closed = settings?.onMenuClosed
      DispatchQueue.main.async { closed?() }
      return
    }
    let layer = MenuLayer(
      request: request, size: spot.frame.size, environment: model.environment,
      width: window.bounds.width)
    layer.frame = window.bounds
    layer.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    layer.onClosed = { [weak self, weak layer] in
      if let self, let layer { menuClosed(layer) }
    }
    window.addSubview(layer)
    menuLayer = layer
    menuAnchor = (ids[path.item], spot.frame)
    UIView.performWithoutAnimation { layoutMenu() }
    if let heldAt, press.state == .began || press.state == .changed {
      layer.hold(at: heldAt)
    }
    layer.open()
    makeRoomForMenu()
  }

  /// Puts the open or closing menu round its line's bubble where the lines
  /// are laid out now, in whatever animation laid them out (the keyboard's,
  /// the composer's, the lines' own), so it moves with them; within the
  /// room over the keyboard. From the layout's attributes, which every
  /// item has whether its cell is on the screen or not.
  private func layoutMenu() {
    guard let menuLayer, let menuAnchor, let window = view.window else { return }
    var bubble: CGRect?
    if let index = ids.firstIndex(of: menuAnchor.item),
      let frame = layout.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame
    {
      bubble = lines.convert(
        menuAnchor.inCell.offsetBy(dx: frame.minX, dy: frame.minY), to: window)
    }
    let bottom = window.bounds.maxY - window.safeAreaInsets.bottom
    let keyboard = view.convert(view.keyboardLayoutGuide.layoutFrame, to: window).minY
    menuLayer.place(
      bubble: bubble, top: window.safeAreaInsets.top, bottom: bottom,
      keyboardTop: keyboard < bottom - 1 ? keyboard : nil)
  }

  /// A keyboard up goes down when the bubble, the bar and the menu do not
  /// fit over it where the bubble is (MenuPlacement), and they go down
  /// with the line as it does. Asked again as the keyboard changes while
  /// the menu is open.
  private func makeRoomForMenu() {
    guard let menuLayer, menuLayer.isOpen, menuLayer.placement?.putsKeyboardAway == true
    else { return }
    putKeyboardAway()
  }

  /// The menu has gone: its line draws its bubble again as the layer goes,
  /// both in this pass, so they reach the screen in the same frame and the
  /// bubble is never missing between the two.
  private func menuClosed(_ layer: MenuLayer) {
    guard menuLayer === layer else { return }
    let item = menuAnchor?.item
    menuLayer = nil
    menuAnchor = nil
    settings?.onMenuClosed()
    layer.removeFromSuperview()
    // VoiceOver back on the line.
    if UIAccessibility.isVoiceOverRunning,
      let index = item.flatMap({ ids.firstIndex(of: $0) })
    {
      UIAccessibility.post(
        notification: .screenChanged,
        argument: lines.cellForItem(at: IndexPath(item: index, section: 0)))
    }
  }

  /// Takes the menu away at once, as the chat leaves the screen.
  func closeMenuNow() {
    guard let menuLayer else { return }
    menuLayer.close(fade: true)
    menuClosed(menuLayer)
  }

  @objc private func leftScreen() {
    closeMenuNow()
  }

  // MARK: Scrolling

  /// What VoiceOver says as it scrolls the lines by a page: the day of the
  /// lines at the top, as the floating day shows it to the eye.
  func accessibilityScrollStatus(for scrollView: UIScrollView) -> String? {
    seePlace()
    if scroll.place.atLatest { return "最新のメッセージ" }
    return scroll.topDay.map(ChatTime.day)
  }

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    seePlace()
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    // Following is the person's to change: off as they scroll, and on
    // again where their scroll comes to rest at the foot.
    following = false
    hold(.free)
    scroll.scrolling = true
    if !scroll.dayShown {
      withAnimation(.easeOut(duration: 0.2)) { scroll.dayShown = true }
    }
  }

  func scrollViewDidEndDragging(_ scrollView: UIScrollView, willDecelerate decelerate: Bool) {
    if !decelerate { cameToRest() }
  }

  func scrollViewDidEndDecelerating(_ scrollView: UIScrollView) {
    cameToRest()
  }

  func scrollViewDidEndScrollingAnimation(_ scrollView: UIScrollView) {
    switch hold {
    case .toLatest:
      hold(.free)
      putAtFoot()
    case .goingTo(let asked):
      settle(on: asked)
    case .opening, .free, .waiting, .on:
      break
    }
    seePlace()
  }

  private func cameToRest() {
    scroll.scrolling = false
    if !following { following = scroll.place.atLatest }
  }
}

/// Where a chat's lines are taken or kept, between the person's own
/// scrolling: one at a time, so going anywhere ends going anywhere else.
private enum Hold {
  /// Not yet put where the chat opens, an item maybe asked for meanwhile.
  case opening(Showing?)
  /// Where the person's scrolling, or lines coming and going, leave them.
  case free
  /// An item asked for, gone to once it is laid out and lines going in
  /// are in place.
  case waiting(Showing)
  /// Gliding to the latest, put on its foot exactly once there.
  case toLatest
  /// Gliding to an item asked for, put on it exactly once there.
  case goingTo(Showing)
  /// On an item: put back there as it is drawn again, and as the room the
  /// lines are seen in settles while the chat opens.
  case on(Anchor)

  /// The item asked for, while it is being gone to.
  var asked: Showing? {
    switch self {
    case .opening(let asked): asked
    case .waiting(let asked), .goingTo(let asked): asked
    case .free, .toLatest, .on: nil
    }
  }

  var opening: Bool {
    if case .opening = self { true } else { false }
  }

  var gliding: Bool {
    switch self {
    case .toLatest, .goingTo: true
    case .opening, .free, .waiting, .on: false
    }
  }
}

/// Where an item is put on the screen: its top this far below the top of
/// the lines seen, or in their middle.
private enum Spot {
  case below(CGFloat)
  case middle
}

/// An item the lines are on, and where.
private struct Anchor {
  let id: String
  let spot: Spot
}

/// An item asked to be shown, and what is told once it is, or once the
/// lines are taken elsewhere instead: told once.
@MainActor private final class Showing {
  let id: String
  let spot: Spot
  let animated: Bool
  private var then: (() -> Void)?

  init(id: String, place: LinePlace, animated: Bool, then: (() -> Void)?) {
    self.id = id
    spot =
      switch place {
      case .top: .below(0)
      case .center: .middle
      }
    self.animated = animated
    self.then = then
  }

  func finish() {
    let then = then
    self.then = nil
    then?()
  }
}

/// The lines to put in, and how.
private struct Rows {
  let rows: [LinesRow]
  /// The chat's environment changed how every line is drawn.
  let restyled: Bool
  let reduceMotion: Bool
}

/// An update of the lines being put in.
private struct Updating {
  /// The items as they were before it.
  let before: [String]
  /// The items coming in at the foot, which rise into place from under
  /// the lines' foot as the lines slide up.
  let risingIn: Set<String>
  /// Reactions coming to lines already there, which come in where they go.
  let popping: Set<String>
  /// The latest lines come meanwhile, put in next.
  var next: Rows?
}

/// The pan dragging a line to reply to it, which gives back going back by
/// a drag, held off while its finger was down, once the touch is over.
private final class SwipePan: UIPanGestureRecognizer {
  weak var heldBack: UIGestureRecognizer?

  override func reset() {
    super.reset()
    heldBack?.isEnabled = true
    heldBack = nil
  }
}

/// The long press that holds a line's bubble, telling also when a finger
/// goes down on it and when the press is over, held or not: what UIKit's
/// long press keeps to itself until it is held.
private final class TouchedPress: UILongPressGestureRecognizer {
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

/// A cell of the lines, knowing the bubbles of the item it draws.
private final class LineCell: UICollectionViewCell {
  /// The item it draws, and what its bubbles tell of themselves.
  var item: String?
  var space = LineSpace()
  /// The height of the item it draws, at a width.
  var measure: ((CGFloat) -> CGFloat)?
  /// It draws over the items by it, uncut: a line's reactions, whose pop
  /// and spray of emoji reach past their row, over the line they are under.
  var rises = false {
    didSet {
      clipsToBounds = !rises
      layer.zPosition = rises ? 1 : 0
    }
  }

  override init(frame: CGRect) {
    super.init(frame: frame)
    // Its line drawn again taller is laid out at once at its new height,
    // the cell growing to it in the lines' animation: what the line gains
    // (an edit, a link's page, the words past 続きを読む) shows as the cell
    // grows, never over the line next to it first.
    clipsToBounds = true
  }

  /// Over the items by it, by the layout's own order and its rising.
  override func apply(_ layoutAttributes: UICollectionViewLayoutAttributes) {
    super.apply(layoutAttributes)
    layer.zPosition = CGFloat(layoutAttributes.zIndex) + (rises ? 1 : 0)
  }

  /// Its line laid out whole, at once, at the cell's new size, so the
  /// cell's own frame alone moves it in the lines' animation. A line drawn
  /// again is given to the cell before its new size, and SwiftUI lays it
  /// out centered in the old one; laid out again at the new size inside
  /// the lines' animation, SwiftUI would move each of its parts (the face,
  /// the name, the time, the bubble) from there on its own, half of what
  /// the line grew, apart from the cell carrying them.
  override func layoutSubviews() {
    UIView.performWithoutAnimation {
      super.layoutSubviews()
      contentView.frame = CGRect(origin: .zero, size: bounds.size)
      contentView.layoutIfNeeded()
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  /// None: the lines keep clear of the header and the composer by their
  /// own insets. A cell under either would be in the screen's safe area,
  /// in which its hosted line is laid out apart from how it was measured,
  /// shifted in the cell, over the lines next to it.
  override var safeAreaInsets: UIEdgeInsets { .zero }

  /// Its item's height at the width the layout gives it, measured apart
  /// from the cell (ChatLinesModel.height).
  override func preferredLayoutAttributesFitting(_ attributes: UICollectionViewLayoutAttributes)
    -> UICollectionViewLayoutAttributes
  {
    // A copy keeps the layout's own kind of attributes.
    guard let measure, let fitted = attributes.copy() as? UICollectionViewLayoutAttributes else {
      return super.preferredLayoutAttributesFitting(attributes)
    }
    let width = attributes.size.width
    fitted.size = CGSize(width: width, height: measure(width))
    return fitted
  }
}

/// What a cell draws: the chat's item, with the chat's environment.
private struct LineCellContent: View {
  /// The item's id: a cell given another item draws it anew, rather than
  /// changing the one it had into it, which would move the old one's
  /// parts to the new one's places in animation, out of the cell's height.
  let id: String
  let content: AnyView
  let environment: EnvironmentValues
  let space: LineSpace
  let drawing: KeptDrawing
  var measuring = false
  var entering = false

  var body: some View {
    content
      .id(id)
      .frame(maxWidth: .infinity)
      // A tail reaching past its bubble's frame toward the screen's edge
      // stays in the cell, which clips what it draws.
      .padding(.horizontal, BubbleShape.tailReach)
      .coordinateSpace(.named(LineSpace.name))
      .environment(\.lineSpace, space)
      .environment(\.keptDrawing, drawing)
      .environment(\.measuringLine, measuring)
      .environment(\.itemEntering, entering)
      .environment(\.self, environment)
  }
}
