import ChatLayout
import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

// A chat's lines as a collection view laid out by ChatLayout, going on
// under the composer and the keyboard, which SwiftUI keeps at the chat's
// foot (spec/chat.md, Unread lines and typing). ChatLayout keeps the
// lines seen where they are as lines come in or grow above them, in the
// same layout pass, before the frame is drawn; each line is still the
// chat's own SwiftUI view.

/// Moves a chat's lines at the moments the chat does, as a scroll view's
/// proxy would.
@MainActor final class ChatLinesProxy {
  fileprivate weak var controller: ChatLinesController?

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

/// A line's cell: where what it draws is measured, and how that is put on
/// the screen, which the line's own SwiftUI cannot tell as the lines
/// scroll under it. A held line's menu follows its bubble by it.
@MainActor final class LineSpace {
  static let name = "chat-line"
  fileprivate weak var view: UIView?
  /// The open menus' spots, with their bubble's frame in the cell.
  private var followed: [(spot: LineSpot, frame: CGRect)] = []

  func onScreen(_ rect: CGRect) -> CGRect {
    view?.convert(rect, to: nil) ?? rect
  }

  func onScreen(_ point: CGPoint) -> CGPoint {
    view?.convert(point, to: nil) ?? point
  }

  /// Keeps `spot` on the bubble at `frame` in the cell, wherever the cell
  /// goes.
  func follow(_ spot: LineSpot, at frame: CGRect) {
    followed.removeAll { $0.spot === spot }
    followed.append((spot, frame))
    spot.frame = onScreen(frame)
  }

  func unfollow(_ spot: LineSpot) {
    followed.removeAll { $0.spot === spot }
  }

  /// The cell has moved on the screen.
  fileprivate func moved() {
    for (spot, frame) in followed {
      let now = onScreen(frame)
      if now != spot.frame { spot.frame = now }
    }
  }
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

  /// Every item is drawn and measured again, the chat's environment having
  /// changed how they are drawn.
  func forgetHeights() {
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

/// The chat's lines, kept clear of the composer and the keyboard under them.
struct ChatLinesView: UIViewControllerRepresentable {
  /// Every item, oldest first, by its ChatItemID.
  let rows: [LinesRow]
  let row: (String) -> AnyView
  /// The ↓ to the latest, over the composer's right.
  let latest: AnyView
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
  /// The items within Chat.photoPrefetchScreens of those in sight, told
  /// as they change while the lines scroll, for their photos to be fetched
  /// ahead. UICollectionView's own prefetching stays off (ChatLayout's).
  var onNear: ([String]) -> Void = { _ in }

  func makeUIViewController(context: Context) -> ChatLinesController {
    let controller = ChatLinesController(scroll: scroll)
    proxy.controller = controller
    return controller
  }

  func updateUIViewController(_ controller: ChatLinesController, context: Context) {
    proxy.controller = controller
    controller.update(self, environment: context.environment)
    // The composer and the keyboard under the lines: as it changes, the
    // lines and the ↓ make room by the change's own animation.
    controller.topRoom(scroll.topRoom)
    controller.bottomRoom(scroll.bottomRoom) { context.animate(changes: $0) }
  }

  /// The chat has gone: whatever waits to be told the lines are in place
  /// is told now, rather than never.
  static func dismantleUIViewController(_ controller: ChatLinesController, coordinator: ()) {
    controller.letGo()
  }
}

final class ChatLinesController: UIViewController, UICollectionViewDelegate,
  UIGestureRecognizerDelegate, ChatLayoutDelegate, UIScrollViewAccessibilityDelegate
{
  private let scroll: ChatScroll
  private let layout = CollectionViewChatLayout()
  private lazy var lines = UICollectionView(frame: .zero, collectionViewLayout: layout)
  private var source: ChatLayoutDiffableDataSource<Int, String>?
  private let model = ChatLinesModel()
  private let latest = UIHostingController(rootView: AnyView(EmptyView()))
  /// The ↓ on the lines' room, over the composer: moved with the lines'
  /// inset.
  private lazy var latestFoot = latest.view.bottomAnchor.constraint(equalTo: lines.bottomAnchor)
  private(set) var settings: ChatLinesView?
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
  /// The cell moved, put back as the line is let go or drawn in another.
  private weak var swipedCell: UICollectionViewCell?
  /// Beside the line dragged, showing as it goes.
  private let replyArrow = UIImageView(
    image: UIImage(
      systemName: "arrowshape.turn.up.left.circle.fill",
      withConfiguration: UIImage.SymbolConfiguration(pointSize: 28)))
  private let replyFeel = UIImpactFeedbackGenerator(style: .light)

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
    layout.settings.additionalInsets = UIEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)
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
      let content = model.row(id)
      let environment = model.environment
      let space = cell.space
      let drawing = model.drawing(of: id)
      cell.measure = { width in model.height(of: id, width: width) }
      cell.contentConfiguration = UIHostingConfiguration {
        LineCellContent(
          id: id, content: content, environment: environment, space: space, drawing: drawing)
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
    replyArrow.alpha = 0
    lines.addSubview(replyArrow)
    view.addSubview(lines)

    addChild(latest)
    latest.sizingOptions = .intrinsicContentSize
    latest.safeAreaRegions = .container
    latest.view.backgroundColor = .clear
    latest.view.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(latest.view)
    latest.didMove(toParent: self)
    NSLayoutConstraint.activate([
      lines.topAnchor.constraint(equalTo: view.topAnchor),
      // Going on under the composer and the keyboard to the screen's foot,
      // kept clear of them by the lines' inset (fitRoom), as ChatLayout's
      // Example keeps them over its input bar: their height stays as the
      // keyboard comes and goes (keepingLinesStill).
      lines.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      lines.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      lines.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      latest.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      latestFoot,
    ])
  }

  /// The lines seen as the room they are seen in last was, and its height.
  private var room: (height: CGFloat, kept: ChatLayoutPositionSnapshot?)?

  /// The lines' room: over the composer, and the keyboard under it.
  private var roomHeight: CGFloat { lines.bounds.height - lines.contentInset.bottom }

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    keepRoom()
  }

  /// The lines seen, taken before the room changes (the lines' own size,
  /// the composer and the keyboard under them).
  private func keepRoom() {
    let kept = following ? footSnapshot() : layout.getContentOffsetSnapshot(from: .bottom)
    room = (roomHeight, kept)
  }

  /// The lines are the screen's scroll view for its header, as a list's
  /// are: the header's edge effect sets the lines going under it off, as
  /// iOS 26 does for every screen whose content goes under its bars.
  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    var screen = parent
    while let next = screen?.parent, !(next is UINavigationController) { screen = next }
    screen?.setContentScrollView(lines, for: .top)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    fitRoom()
    place()
  }

  func update(_ settings: ChatLinesView, environment: EnvironmentValues) {
    self.settings = settings
    model.environment = environment
    model.row = settings.row
    latest.rootView = AnyView(settings.latest.environment(\.self, environment))
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
    // they are; lines coming at the foot come in moving, or with motion
    // reduced fade in where they go, the lines put there at once.
    let earlier = cameAbove(old, in: new)
    let animated = new != old && !earlier && !rows.reduceMotion && !userScrolling
    let fading = new != old && !earlier && rows.reduceMotion ? cameBelow(old, in: new) : []
    updating = Updating(risingIn: animated ? cameBelow(old, in: new) : [])
    source.apply(snapshot, animatingDifferences: animated, commitAlongsideUpdates: {}) {
      [weak self] in
      guard let self else { return }
      let next = updating?.next
      updating = nil
      if case .on(let anchor) = hold, redrawn.contains(anchor.id), !userScrolling {
        put(anchor)
      }
      // The lines waiting go in next; changing none, these have landed.
      if let next, setLines(next) { return }
      landed()
      // Once at the foot, where they are seen.
      fadeIn(fading)
    }
    return true
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
  /// sent comes in in the messaging apps; others fade in, ChatLayout's
  /// own. The same as it is first asked and as its height is measured.
  func initialLayoutAttributesForInsertedItem(
    _ chatLayout: CollectionViewChatLayout, at indexPath: IndexPath,
    modifying originalAttributes: ChatLayoutAttributes, on state: InitialAttributesRequestType
  ) {
    originalAttributes.alpha = 0
    if indexPath.item < ids.count, updating?.risingIn.contains(ids[indexPath.item]) == true {
      originalAttributes.center.y += originalAttributes.frame.height
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

  /// What is under the lines at the chat's foot: the composer, and the
  /// keyboard or the home indicator.
  private var under: CGFloat = 0
  /// What is over the lines at the chat's top: the header, and the pins.
  private var over: CGFloat = 0

  /// What is over the lines is `height` now (the pins come or go, or
  /// open): the lines stay where they are on the screen, going on under
  /// them and the header.
  func topRoom(_ height: CGFloat) {
    guard height != over else { return }
    over = height
    guard view.window != nil else { return }
    fitRoom()
  }

  /// What is under the lines is `height` now (the keyboard, a bar over
  /// the composer's field), changed by `animate` (the change's own
  /// animation): the lines and the ↓ make room by the same animation, as in
  /// Messages, with motion reduced too, never standing apart from what
  /// moves under them (spec/chat.md, Reduced motion).
  func bottomRoom(_ height: CGFloat, animate: (() -> Void) -> Void) {
    guard height != under else { return }
    guard view.window != nil else {
      under = height
      return
    }
    keepRoom()
    under = height
    let makeRoom = {
      self.fitRoom()
      self.view.layoutIfNeeded()
    }
    // The first change after the keyboard sets off is the keyboard's,
    // coming up or going down however it was asked to: the lines go by
    // its own animation, as UIKit's keyboard guides do, rather than by
    // whichever SwiftUI hands over (none, as it goes on a tap off them).
    // A drag pulling it down moves the room under the finger, frame by
    // frame, before its release sets it off.
    let now = CACurrentMediaTime()
    if let move = KeyboardTop.shared.move, move != keyboardMoveTaken, now < move.ends {
      keyboardMoveTaken = move
      UIView.animate(
        withDuration: move.ends - now, delay: 0, options: [move.curve, .beginFromCurrentState],
        animations: makeRoom)
    } else {
      animate(makeRoom)
    }
  }

  /// The keyboard's move the lines last went along with.
  private var keyboardMoveTaken: KeyboardMove?

  /// The lines seen kept at the foot of the room they are seen in as it
  /// changes (the keyboard, the composer growing), as ChatLayout's Example
  /// keeps them; not under the finger pulling the keyboard down. While the
  /// chat opens, before the lines show, the item they are on is kept
  /// instead, as the room settles.
  private func fitRoom() {
    let top = over
    if lines.contentInset.top != top {
      lines.contentInset.top = top
      lines.verticalScrollIndicatorInsets.top = top
    }
    let bottom = under
    if lines.contentInset.bottom != bottom {
      keepingLinesStill {
        lines.contentInset.bottom = bottom
        lines.verticalScrollIndicatorInsets.bottom = bottom
      }
      latestFoot.constant = -bottom
    }
    guard let room, room.height != roomHeight else { return }
    if !userScrolling {
      if case .on(let anchor) = hold, settings?.shown == false {
        put(anchor)
      } else if let kept = room.kept {
        layout.restoreContentOffset(with: kept)
      }
    }
    seePlace()
  }

  /// Changes the lines' room with every line left where it is on the
  /// screen, outside any animation: they then move to their new place by
  /// the scroll alone, in the animation of the change (the keyboard's).
  /// Changed in it, the room would be laid out anew in it, and UIKit draw
  /// every line again, fading in at its new place over the one fading out
  /// at the old, as lines too few to fill the room stand at its foot.
  /// Not while the person scrolls them, as when their drag pulls the
  /// keyboard down: the scroll is theirs, and their drag would set it
  /// back each frame from where it began, the lines going to and fro and
  /// their cells made anew, faces and all (ChatLayout's Example leaves it
  /// to them too).
  private func keepingLinesStill(_ change: () -> Void) {
    UIView.performWithoutAnimation {
      let seen = layout.getContentOffsetSnapshot(from: .top)
      change()
      if let seen, !userScrolling { layout.restoreContentOffset(with: seen) }
    }
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
    let top = lines.contentOffset.y + inset.top
    let first = lines.indexPathsForVisibleItems.sorted().first {
      (layout.layoutAttributesForItem(at: $0)?.frame.maxY ?? 0) > top
    }
    let day = first.flatMap { $0.item < ids.count ? settings?.dayOver(ids[$0.item]) : nil }
    if day != scroll.topDay { scroll.topDay = day }
    // From the layout's own frames, as the visible items may not have
    // caught up with the scroll yet (Signal's).
    let foot = lines.contentOffset.y + lines.bounds.height - inset.bottom + 1
    let seen = (layout.layoutAttributesForElements(in: lines.bounds) ?? [])
      .filter { $0.representedElementCategory == .cell && $0.frame.maxY <= foot }
      .compactMap { $0.indexPath.item < ids.count ? ids[$0.indexPath.item] : nil }
      .filter(ChatItemID.isLine)
    if seen != scroll.seen { scroll.seen = seen }
    for case let cell as LineCell in lines.visibleCells {
      cell.space.moved()
    }
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
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
    -> Bool
  {
    guard gestureRecognizer === swipe else { return true }
    swipeStart = touch.location(in: view)
    // On a line dragged rightward to reply, going back by a drag
    // anywhere on the screen would take the drag first, whatever it
    // is told to wait for: it waits out this touch, as in Messages.
    // From the screen's edge going back is still the system's.
    let at = touch.location(in: lines)
    if swipeStart.x > Self.backEdge, let path = lines.indexPathForItem(at: at),
      path.item < ids.count, settings?.replySwipe(ids[path.item]) == .rightward
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
    guard let path = lines.indexPathForItem(at: at), path.item < ids.count,
      let way = settings.replySwipe(ids[path.item])
    else { return false }
    switch way {
    case .rightward:
      // Not from the screen's edge, which is the system's.
      guard moved.x > 0, swipeStart.x > Self.backEdge else { return false }
    case .leftward:
      guard moved.x < 0 else { return false }
    }
    swiping = (ids[path.item], way, false)
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

  /// Draws the line `id` dragged `along` toward the middle, past
  /// chatRules.replySwipe less and less, the arrow beside it.
  private func drag(_ id: String, way: ReplySwipe, by along: CGFloat) {
    guard let index = ids.firstIndex(of: id),
      let cell = lines.cellForItem(at: IndexPath(item: index, section: 0))
    else {
      letGoOfSwipe()
      return
    }
    // The line drawn in another cell as the lines change meanwhile.
    if swipedCell !== cell {
      swipedCell?.transform = .identity
      swipedCell = cell
    }
    let full = CGFloat(Chat.replySwipe)
    let shift = along <= full ? along : full + (along - full) * CGFloat(Chat.replySwipeRubber)
    let sign: CGFloat = way == .rightward ? 1 : -1
    // The cell itself: its hosted content keeps a transform of its own.
    cell.transform = CGAffineTransform(translationX: sign * shift, y: 0)
    // Where the cell stands, unmoved.
    let size = replyArrow.intrinsicContentSize
    let frame = CGRect(
      x: cell.center.x - cell.bounds.width / 2, y: cell.center.y - cell.bounds.height / 2,
      width: cell.bounds.width, height: cell.bounds.height)
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
    let cell = swipedCell
    swipedCell = nil
    let back = {
      cell?.transform = .identity
      self.replyArrow.alpha = 0
    }
    if reduceMotion {
      back()
    } else {
      UIView.animate(springDuration: 0.3, bounce: 0.2, options: .allowUserInteraction, animations: back)
    }
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
  /// The items coming in at the foot, which rise into place from under
  /// the lines' foot as the lines slide up.
  let risingIn: Set<String>
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

/// A cell of the lines, knowing where it is on the screen for the line it
/// draws.
private final class LineCell: UICollectionViewCell {
  let space = LineSpace()
  /// The height of the item it draws, at a width.
  var measure: ((CGFloat) -> CGFloat)?

  override init(frame: CGRect) {
    super.init(frame: frame)
    // The cell itself: a content configuration puts in a content view of
    // its own, filling the cell.
    space.view = self
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

  var body: some View {
    content
      .id(id)
      .frame(maxWidth: .infinity)
      .coordinateSpace(.named(LineSpace.name))
      .environment(\.lineSpace, space)
      .environment(\.keptDrawing, drawing)
      .environment(\.measuringLine, measuring)
      .environment(\.self, environment)
  }
}
