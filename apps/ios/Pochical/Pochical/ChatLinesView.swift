import ChatLayout
import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

// A chat's lines as a collection view laid out by ChatLayout, with the
// composer under them on the keyboard's guide (spec/chat.md, Unread lines
// and typing). ChatLayout keeps the lines seen where they are as lines
// come in or grow above them, in the same layout pass, before the frame
// is drawn; each line is still the chat's own SwiftUI view.

/// Moves a chat's lines at the moments the chat does, as a scroll view's
/// proxy would.
@MainActor final class ChatLinesProxy {
  fileprivate weak var controller: ChatLinesController?

  /// To the latest line's foot, instead of an item asked for before.
  func toLatest(animated: Bool = false) {
    controller?.dropWaiting()
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
  private var heights: [String: (look: AnyHashable, width: CGFloat, height: CGFloat)] = [:]
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

  /// The item `id`'s height at `width`, measured once for its look.
  func height(of id: String, width: CGFloat) -> CGFloat {
    let look = looks[id] ?? AnyHashable(id)
    if let known = heights[id], known.look == look, known.width == width {
      return known.height
    }
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

/// The chat's lines, and the composer under them, rising with the keyboard.
struct ChatLinesView: UIViewControllerRepresentable {
  /// The top item while earlier lines are to come, which asks for them.
  static let earlier = "earlier"

  /// Every item, oldest first; a line's id starts with `line-`, which
  /// the lines read and seen are counted by.
  let rows: [LinesRow]
  let row: (String) -> AnyView
  let composer: AnyView
  /// What is over the composer's field: as it changes, the lines and the ↓
  /// make room by the change's own animation.
  var composerBars = ComposerBars()
  /// The ↓ to the latest, over the composer's right.
  let latest: AnyView
  /// The composer's ground, carried down under the home indicator.
  let ground: Color
  let scroll: ChatScroll
  let proxy: ChatLinesProxy
  @Binding var following: Bool
  /// The lines are shown, once where the chat opens.
  let shown: Bool
  /// A line's menu is open: lines coming in wait until it closes, so the
  /// line held stays under its menu; lines changing are drawn meanwhile.
  let holds: Bool
  /// Earlier lines are to come, and may be asked for: not before the chat
  /// has opened on its place, which they would push away. Never for a
  /// chat that has all its lines at once.
  var canAskEarlier = false
  /// The lines are scrolled near their top, Chat.prefetchScreens away:
  /// the next earlier page is to be laid out. Told the first line laid out,
  /// as the chat's own lines may be ahead of those in place.
  var onNearTop: (String?) -> Void = { _ in }
  /// The day of the lines from the item `id` at the top.
  let dayOver: (String) -> Day?
  /// How the item `id` is dragged to reply to it; none for an item the
  /// menu has no 返信 on.
  let replySwipe: (String) -> ReplySwipe?
  /// The item `id` was dragged far enough to reply to it.
  let onReply: (String) -> Void
  /// Lines too few to fill the screen stand at its top, under a head that
  /// starts the chat, rather than at its foot by the composer.
  var fewAtTop = false
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
    let barsChanged = controller.settings.map { $0.composerBars != composerBars } ?? false
    controller.update(self, environment: context.environment)
    if barsChanged {
      controller.composerChanged { context.animate(changes: $0) }
    }
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
  private let composer = UIHostingController(rootView: AnyView(EmptyView()))
  private let latest = UIHostingController(rootView: AnyView(EmptyView()))
  /// Under the composer to the screen's foot.
  private let ground = UIView()
  /// The ↓ on the lines' room, over the composer: moved with the lines'
  /// inset rather than tied to the composer, which takes its height at once.
  private lazy var latestFoot = latest.view.bottomAnchor.constraint(equalTo: lines.bottomAnchor)
  private(set) var settings: ChatLinesView?
  private var ids: [String] = []
  private var linesLook: LinesLook?
  /// Motion is reduced: the lines are put where they go, never glided.
  private var reduceMotion = false
  /// The lines have been put where the chat opens, or moved since.
  private var placed = false
  /// Gliding to the latest, put back on its foot once there.
  private var goingDown = false
  /// Gliding to an item, put back on it exactly once there.
  private var going: Going?
  /// An item to show once it is laid out, not yet when asked.
  private var waitingToShow: Going?
  /// The item the lines were last put on, kept there as the room they
  /// are seen in settles while the chat opens, before the lines show; once
  /// shown, the room changing (the keyboard) keeps their foot instead.
  private var shownOn: (id: String, place: LinePlace)?
  /// The items coming in at the foot in the update being put in, which
  /// rise into place from under the lines' foot as the lines slide up.
  private var risingIn: Set<String> = []
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
      cell.measure = { [weak model] width in model?.height(of: id, width: width) ?? 0 }
      cell.contentConfiguration = UIHostingConfiguration {
        LineCellContent(
          id: id, content: content, environment: environment, space: space, drawing: drawing)
      }
      .margins(.all, 0)
    }
    source = ChatLayoutDiffableDataSource(collectionView: lines) { lines, path, id in
      lines.dequeueConfiguredReusableCell(using: registration, for: path, item: id)
    }
    // A tap off the lines puts the keyboard away, as LINE does; a tap on a
    // line stays the line's own.
    let tap = UITapGestureRecognizer(target: self, action: #selector(tappedOff))
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

    ground.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(ground)
    for host in [composer, latest] {
      addChild(host)
      host.sizingOptions = .intrinsicContentSize
      // Put on the keyboard by the constraints below, never lifted off it
      // by SwiftUI's own keyboard avoidance: as the keyboard went away,
      // that took the keyboard over the composer's old place into its
      // height, and the composer stood up hundreds of points tall.
      host.safeAreaRegions = .container
      host.view.backgroundColor = .clear
      host.view.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(host.view)
      host.didMove(toParent: self)
    }
    // The keyboard's guide without the safe area, which the chat's hosting
    // changes as the app goes to the background and back: the guide taking
    // it was left with no frame on coming back from another app, the
    // composer at the top. Over the home indicator by its own constraint.
    view.keyboardLayoutGuide.usesBottomSafeArea = false
    let foot = composer.view.bottomAnchor.constraint(equalTo: view.bottomAnchor)
    foot.priority = .defaultLow
    NSLayoutConstraint.activate([
      lines.topAnchor.constraint(equalTo: view.topAnchor),
      // Going on under the composer and the keyboard, kept clear of them
      // by the lines' inset (fitRoom), as ChatLayout's Example keeps them
      // over its input bar: their height stays as the keyboard comes and
      // goes (keepingLinesStill). Ending over the home indicator's safe
      // area, which would push a line in.
      lines.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),
      lines.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      lines.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      // The composer on the keyboard, following it as it is pulled down.
      composer.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      composer.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      composer.view.bottomAnchor.constraint(lessThanOrEqualTo: view.keyboardLayoutGuide.topAnchor),
      composer.view.bottomAnchor.constraint(
        lessThanOrEqualTo: view.safeAreaLayoutGuide.bottomAnchor),
      foot,
      ground.topAnchor.constraint(equalTo: composer.view.bottomAnchor),
      ground.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      ground.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      ground.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      latest.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      latestFoot,
    ])
  }

  /// The lines seen as the room they are seen in last was, and its height.
  private var room: (height: CGFloat, kept: ChatLayoutPositionSnapshot?)?
  /// The composer is taking its new height, the room for the lines made
  /// after it (composerChanged).
  private var composerResizing = false

  /// The lines' room: over the composer, and the keyboard under it.
  private var roomHeight: CGFloat { lines.bounds.height - lines.contentInset.bottom }

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    // Taken before the room changes (the keyboard, the composer growing).
    let kept = following ? footSnapshot() : layout.getContentOffsetSnapshot(from: .bottom)
    room = (roomHeight, kept)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    fitRoom()
    if !placed, !ids.isEmpty, lines.bounds.height > 0 {
      toLatest()
      showWaiting()
    }
  }

  func update(_ settings: ChatLinesView, environment: EnvironmentValues) {
    self.settings = settings
    model.environment = environment
    model.row = settings.row
    // As tall as it needs, standing on its foot whatever height its view
    // has for a moment, so the field stays on the keyboard as a bar over it
    // grows in or shrinks away.
    composer.rootView = AnyView(
      settings.composer.environment(\.self, environment)
        .fixedSize(horizontal: false, vertical: true)
        .frame(minHeight: 0, maxHeight: .infinity, alignment: .bottom))
    latest.rootView = AnyView(settings.latest.environment(\.self, environment))
    ground.backgroundColor = UIColor(settings.ground)
    layout.keepContentAtBottomOfVisibleArea = !settings.fewAtTop
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
    let changed = setLines(
      settings.holds ? keeping(settings.rows) : settings.rows, restyled: restyled,
      reduceMotion: environment.accessibilityReduceMotion)
    // A page come from the server, changing no line laid out, is laid out
    // at once if the top is near still; asked after this update, not in it.
    // Lines changed are asked after once in place (`landed`).
    if !changed {
      Task { @MainActor [weak self] in self?.askEarlierIfNear() }
    }
  }

  /// Asks for the next earlier page once the top is Chat.prefetchScreens
  /// away, so the reader scrolling back finds it laid out already.
  private func askEarlierIfNear() {
    guard let settings, settings.canAskEarlier, placed, !applying, lines.bounds.height > 0 else {
      return
    }
    let fromTop = lines.contentOffset.y - lowest
    if fromTop < seenHeight * CGFloat(Chat.prefetchScreens) {
      settings.onNearTop(ids.first { $0.hasPrefix("line-") })
    }
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

  /// Lines being put in, whose place is not yet where it will be.
  private var applying = false
  /// The latest lines come while others were being put in, put in once
  /// those are in place, as ChatLayout's Example holds an update back.
  private var waiting: (rows: [LinesRow], restyled: Bool, reduceMotion: Bool)?

  /// Puts in `rows`, saying whether any changed.
  @discardableResult
  private func setLines(_ rows: [LinesRow], restyled: Bool, reduceMotion: Bool) -> Bool {
    guard let source else { return false }
    if applying {
      waiting = (rows, restyled || (waiting?.restyled ?? false), reduceMotion)
      return true
    }
    let new = rows.map(\.id)
    // Lines there before whose look has changed are drawn and measured
    // again, in the same update.
    let redrawn = rows.filter { row in
      model.looks[row.id].map { restyled || $0 != row.look } ?? false
    }.map(\.id)
    guard new != ids || !redrawn.isEmpty else { return false }
    var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
    snapshot.appendSections([0])
    snapshot.appendItems(new, toSection: 0)
    snapshot.reconfigureItems(redrawn)
    let old = ids
    ids = new
    model.looks = Dictionary(rows.map { ($0.id, $0.look) }) { first, _ in first }
    if restyled { model.forgetHeights() } else { model.keepHeights(of: new) }
    guard !old.isEmpty, source.snapshot != nil else {
      UIView.performWithoutAnimation {
        source.applySnapshotUsingReloadData(snapshot, commitAlongsideUpdates: {})
        lines.layoutIfNeeded()
      }
      if lines.bounds.height > 0 {
        toLatest()
        showWaiting()
      }
      return true
    }
    // A page coming in above goes in at once, the lines seen held where
    // they are; lines coming at the foot come in moving, or with motion
    // reduced fade in where they go, the lines put there at once.
    let earlier = cameAbove(old, in: new)
    let animated = new != old && !earlier && !reduceMotion && !userScrolling
    let fading = new != old && !earlier && reduceMotion ? cameBelow(old, in: new) : []
    let held = heldTop.flatMap { redrawn.contains($0.id) ? $0 : nil }
    if held != nil { heldTop = nil }
    risingIn = animated ? cameBelow(old, in: new) : []
    applying = true
    source.apply(snapshot, animatingDifferences: animated, commitAlongsideUpdates: {}) {
      [weak self] in
      guard let self else { return }
      applying = false
      risingIn = []
      if let held, let index = ids.firstIndex(of: held.id) {
        layout.restoreContentOffset(
          with: ChatLayoutPositionSnapshot(
            indexPath: IndexPath(item: index, section: 0), edge: .top, offset: held.offset))
      }
      // The lines waiting go in next; changing none, these have landed.
      if let waiting {
        self.waiting = nil
        if setLines(waiting.rows, restyled: waiting.restyled, reduceMotion: waiting.reduceMotion) {
          return
        }
      }
      landed()
      // Once at the foot, where they are seen.
      fadeIn(fading)
    }
    return true
  }

  /// Lines new to `new` stand above the first line it keeps from `old`,
  /// the spinner over the earlier lines aside.
  private func cameAbove(_ old: [String], in new: [String]) -> Bool {
    let lines = old.filter { $0 != ChatLinesView.earlier }
    guard let kept = lines.first(where: new.contains), let at = new.firstIndex(of: kept) else {
      return false
    }
    return new[..<at].contains { $0 != ChatLinesView.earlier && !old.contains($0) }
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
      } else if id.hasPrefix("line-") {
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
    if indexPath.item < ids.count, risingIn.contains(ids[indexPath.item]) {
      originalAttributes.center.y += originalAttributes.frame.height
    }
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
    askEarlierIfNear()
    if following, !scroll.place.atLatest, !userScrolling, !goingDown {
      toLatest(animated: true)
    }
  }

  /// The bars over the composer's field changed, by `animate` (the
  /// change's own animation): the composer takes its height at once, its
  /// field staying put as the bar grows in or shrinks away in it, and the
  /// lines and the ↓ make room by the same animation, as in Messages.
  func composerChanged(animate: (() -> Void) -> Void) {
    guard view.window != nil else { return }
    composer.view.invalidateIntrinsicContentSize()
    composerResizing = true
    UIView.performWithoutAnimation { view.layoutIfNeeded() }
    composerResizing = false
    let makeRoom = {
      self.fitRoom()
      self.view.layoutIfNeeded()
    }
    if reduceMotion {
      makeRoom()
    } else {
      animate(makeRoom)
    }
  }

  /// The lines seen kept at the foot of the room they are seen in as it
  /// changes (the keyboard, the composer growing), as ChatLayout's Example
  /// keeps them; not under the finger pulling the keyboard down.
  private func fitRoom() {
    let top = view.safeAreaInsets.top
    if lines.contentInset.top != top {
      lines.contentInset.top = top
      lines.verticalScrollIndicatorInsets.top = top
    }
    guard !composerResizing else { return }
    let bottom = max(0, lines.frame.maxY - composer.view.frame.minY)
    if lines.contentInset.bottom != bottom {
      keepingLinesStill {
        lines.contentInset.bottom = bottom
        lines.verticalScrollIndicatorInsets.bottom = bottom
      }
      latestFoot.constant = -bottom
    }
    guard let room, room.height != roomHeight else { return }
    if let shownOn, settings?.shown == false, !userScrolling {
      put(on: shownOn.id, at: shownOn.place)
    } else if let kept = room.kept, !userScrolling {
      layout.restoreContentOffset(with: kept)
    }
    seePlace()
  }

  /// Changes the lines' room with every line left where it is on the
  /// screen, outside any animation: they then move to their new place by
  /// the scroll alone, in the animation of the change (the keyboard's).
  /// Changed in it, the room would be laid out anew in it, and UIKit draw
  /// every line again, fading in at its new place over the one fading out
  /// at the old, as lines too few to fill the room stand at its foot.
  private func keepingLinesStill(_ change: () -> Void) {
    UIView.performWithoutAnimation {
      let first = lines.indexPathsForVisibleItems.min()
      let top = first.flatMap { layout.layoutAttributesForItem(at: $0)?.frame.minY }
      let seen = top.map { $0 - lines.contentOffset.y }
      change()
      lines.layoutIfNeeded()
      if let first, let seen, let top = layout.layoutAttributesForItem(at: first)?.frame.minY {
        lines.contentOffset.y = top - seen
        lines.layoutIfNeeded()
      }
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

  func toLatest(animated: Bool = false) {
    guard let foot = footSnapshot(), lines.bounds.height > 0 else { return }
    placed = true
    shownOn = nil
    stopGoing()
    lines.layoutIfNeeded()
    let target = highest
    guard animated, !reduceMotion, abs(target - lines.contentOffset.y) > 1 else {
      goingDown = false
      layout.restoreContentOffset(with: foot)
      seePlace()
      return
    }
    // From far up, glides the last screen only.
    if target - lines.contentOffset.y > seenHeight {
      lines.contentOffset.y = target - seenHeight
    }
    goingDown = true
    lines.setContentOffset(CGPoint(x: lines.contentOffset.x, y: target), animated: true)
  }

  func show(_ id: String, at place: LinePlace, animated: Bool, then: (() -> Void)?) {
    stopGoing()
    let asked = Going(id: id, place: place, animated: animated, then: then)
    // Not yet laid out, or lines still going in: once they are in place.
    guard let index = ids.firstIndex(of: id), lines.bounds.height > 0, !applying else {
      waitingToShow?.then?()
      waitingToShow = asked
      return
    }
    // Instead of an item asked for before, not yet laid out.
    dropWaiting()
    placed = true
    goingDown = false
    lines.layoutIfNeeded()
    let path = IndexPath(item: index, section: 0)
    guard let frame = layout.layoutAttributesForItem(at: path)?.frame else {
      then?()
      return
    }
    let target = min(highest, max(lowest, frame.minY - spot(of: frame, at: place)
      - lines.adjustedContentInset.top - layout.settings.additionalInsets.top))
    guard animated, !reduceMotion, abs(target - lines.contentOffset.y) > 1 else {
      settle(on: id, at: place)
      then?()
      return
    }
    // From far off, glides the last screen only, as to the latest, rather
    // than through all between.
    let away = target - lines.contentOffset.y
    if abs(away) > seenHeight {
      lines.contentOffset.y = target - (away > 0 ? seenHeight : -seenHeight)
    }
    going = asked
    lines.setContentOffset(CGPoint(x: lines.contentOffset.x, y: target), animated: true)
  }

  /// The item asked to be shown before it was laid out, now that it is.
  private func showWaiting() {
    guard let waiting = waitingToShow, ids.contains(waiting.id), lines.bounds.height > 0,
      !applying
    else { return }
    waitingToShow = nil
    show(waiting.id, at: waiting.place, animated: waiting.animated, then: waiting.then)
  }

  /// Nothing more to go to, the lines gone: told so.
  func letGo() {
    stopGoing()
    dropWaiting()
  }

  /// No longer waiting to show an item: told so.
  func dropWaiting() {
    let dropped = waitingToShow
    waitingToShow = nil
    dropped?.then?()
  }

  /// No longer gliding to an item: told so, wherever the lines are.
  private func stopGoing() {
    let stopped = going
    going = nil
    stopped?.then?()
  }

  /// Where an item's top goes below the top of the lines seen.
  private func spot(of frame: CGRect, at place: LinePlace) -> CGFloat {
    switch place {
    case .top: 0
    case .center: max(0, (seenHeight - frame.height) / 2) - layout.settings.additionalInsets.top
    }
  }

  /// Puts the item `id` at its place exactly: once at the heights known,
  /// again once the lines come to it are measured.
  private func settle(on id: String, at place: LinePlace) {
    put(on: id, at: place)
    shownOn = (id, place)
    seePlace()
    // VoiceOver reads on from the item gone to.
    if UIAccessibility.isVoiceOverRunning, let index = ids.firstIndex(of: id) {
      lines.layoutIfNeeded()
      UIAccessibility.post(
        notification: .layoutChanged,
        argument: lines.cellForItem(at: IndexPath(item: index, section: 0)))
    }
  }

  /// The lines moved to put the item `id` at its place.
  private func put(on id: String, at place: LinePlace) {
    for _ in 0..<2 {
      guard let index = ids.firstIndex(of: id) else { return }
      let path = IndexPath(item: index, section: 0)
      guard let frame = layout.layoutAttributesForItem(at: path)?.frame else { return }
      layout.restoreContentOffset(
        with: ChatLayoutPositionSnapshot(
          indexPath: path, edge: .top, offset: spot(of: frame, at: place)))
    }
  }

  /// The item whose top is put back where it was, below the top of the
  /// lines seen, once it is drawn again.
  private var heldTop: (id: String, offset: CGFloat)?

  func growDown(_ id: String) {
    guard let index = ids.firstIndex(of: id),
      let frame = layout.layoutAttributesForItem(at: IndexPath(item: index, section: 0))?.frame
    else { return }
    heldTop = (
      id,
      frame.minY - lines.contentOffset.y - lines.adjustedContentInset.top
        - layout.settings.additionalInsets.top
    )
  }

  /// Where the lines are scrolled, told to what shows it.
  /// The items last told near those in sight.
  private var near: [String] = []

  /// Tells the items within Chat.photoPrefetchScreens above and below the
  /// lines in sight, as they change.
  private func seeNear() {
    guard let settings, placed, lines.bounds.height > 0 else { return }
    let reach = lines.bounds.height * CGFloat(Chat.photoPrefetchScreens)
    let around = lines.bounds.insetBy(dx: 0, dy: -reach)
    let ids = (layout.layoutAttributesForElements(in: around) ?? [])
      .filter { $0.representedElementCategory == .cell }
      .compactMap { $0.indexPath.item < ids.count ? ids[$0.indexPath.item] : nil }
    guard ids != near else { return }
    near = ids
    settings.onNear(ids)
  }

  private func seePlace() {
    seeNear()
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
      .filter { $0.hasPrefix("line-") }
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

  @objc private func tappedOff() {
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
    -> Bool
  {
    if gestureRecognizer === swipe {
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
    return touch.view === lines
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
    askEarlierIfNear()
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    // Following is the person's to change: off as they scroll, and on
    // again where their scroll comes to rest at the foot.
    following = false
    goingDown = false
    shownOn = nil
    stopGoing()
    dropWaiting()
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
    if goingDown {
      goingDown = false
      if let foot = footSnapshot() { layout.restoreContentOffset(with: foot) }
    } else if let going {
      settle(on: going.id, at: going.place)
      stopGoing()
    }
    seePlace()
  }

  private func cameToRest() {
    scroll.scrolling = false
    if !following { following = scroll.place.atLatest }
  }
}

/// An item being gone to, and what is told once there.
private struct Going {
  let id: String
  let place: LinePlace
  let animated: Bool
  let then: (() -> Void)?
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
      // A tap off a line's own parts puts the keyboard away, as LINE does.
      .background {
        Color.clear.contentShape(.rect).onTapGesture {
          UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        }
        .accessibilityHidden(true)
      }
      .coordinateSpace(.named(LineSpace.name))
      .environment(\.lineSpace, space)
      .environment(\.keptDrawing, drawing)
      .environment(\.measuringLine, measuring)
      .environment(\.self, environment)
  }
}
