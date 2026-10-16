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

  /// To the latest line's foot.
  func toLatest(animated: Bool = false) {
    controller?.toLatest(animated: animated)
  }

  /// To the item `id`, at the top of the screen or in its middle.
  func show(_ id: String, at place: LinePlace, animated: Bool = false) {
    controller?.show(id, at: place, animated: animated)
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
      LineCellContent(id: id, content: row(id), environment: environment, space: LineSpace()))
    let height = ceil(
      sizer.sizeThatFits(in: CGSize(width: width, height: .greatestFiniteMagnitude)).height)
    heights[id] = (look, width, height)
    return height
  }

  /// Every item is measured again, the chat's environment having changed
  /// how they are drawn.
  func forgetHeights() {
    heights.removeAll()
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

  /// Every item, oldest first.
  let rows: [LinesRow]
  let row: (String) -> AnyView
  let composer: AnyView
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
  /// The day of the lines from the item `id` at the top.
  let dayOver: (String) -> Day?
  /// The person's scrolling has come to the latest.
  let onReachLatest: () -> Void

  func makeUIViewController(context: Context) -> ChatLinesController {
    let controller = ChatLinesController(scroll: scroll)
    proxy.controller = controller
    return controller
  }

  func updateUIViewController(_ controller: ChatLinesController, context: Context) {
    proxy.controller = controller
    controller.update(self, environment: context.environment)
  }
}

final class ChatLinesController: UIViewController, UICollectionViewDelegate,
  UIGestureRecognizerDelegate
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
  private var settings: ChatLinesView?
  private var ids: [String] = []
  private var linesLook: LinesLook?
  /// The lines have been put where the chat opens, or moved since.
  private var placed = false
  /// Gliding to the latest, put back on its foot once there.
  private var goingDown = false
  /// Gliding to an item, put back on it exactly once there.
  private var going: (id: String, place: LinePlace)?

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
      cell.measure = { [weak model] width in model?.height(of: id, width: width) ?? 0 }
      cell.contentConfiguration = UIHostingConfiguration {
        LineCellContent(id: id, content: content, environment: environment, space: space)
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
    view.addSubview(lines)

    ground.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(ground)
    for host in [composer, latest] {
      addChild(host)
      host.sizingOptions = .intrinsicContentSize
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
      // Ending over the composer, which is opaque: the lines are never
      // under the home indicator's safe area, which would push a line in.
      lines.bottomAnchor.constraint(equalTo: composer.view.topAnchor),
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
      latest.view.bottomAnchor.constraint(equalTo: composer.view.topAnchor),
    ])
  }

  /// The lines seen as the room they are seen in last was, and its height.
  private var room: (height: CGFloat, kept: ChatLayoutPositionSnapshot?)?

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    // Taken before the room changes (the keyboard, the composer growing).
    let kept = following ? footSnapshot() : layout.getContentOffsetSnapshot(from: .bottom)
    room = (lines.bounds.height, kept)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    fitRoom()
    if !placed, !ids.isEmpty, lines.bounds.height > 0 {
      toLatest()
    }
  }

  func update(_ settings: ChatLinesView, environment: EnvironmentValues) {
    self.settings = settings
    model.environment = environment
    model.row = settings.row
    composer.rootView = AnyView(settings.composer.environment(\.self, environment))
    latest.rootView = AnyView(settings.latest.environment(\.self, environment))
    ground.backgroundColor = UIColor(settings.ground)
    let alpha: CGFloat = settings.shown ? 1 : 0
    if lines.alpha != alpha {
      UIView.animate(withDuration: alpha == 1 ? 0.15 : 0, delay: 0, options: .curveEaseOut) {
        self.lines.alpha = alpha
      }
    }
    let look = LinesLook(environment)
    let restyled = linesLook.map { $0 != look } ?? false
    linesLook = look
    setLines(
      settings.holds ? keeping(settings.rows) : settings.rows, restyled: restyled,
      reduceMotion: environment.accessibilityReduceMotion)
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

  private func setLines(_ rows: [LinesRow], restyled: Bool, reduceMotion: Bool) {
    guard let source else { return }
    let new = rows.map(\.id)
    // Lines there before whose look has changed are drawn and measured
    // again, in the same update.
    let redrawn = rows.filter { row in
      model.looks[row.id].map { restyled || $0 != row.look } ?? false
    }.map(\.id)
    guard new != ids || !redrawn.isEmpty else { return }
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
      if lines.bounds.height > 0 { toLatest() }
      return
    }
    // A page coming in above goes in at once, the lines seen held where
    // they are; lines coming at the foot come in moving, unless motion is
    // reduced.
    let earlier = cameAbove(old, in: new)
    let animated = new != old && !earlier && !reduceMotion && !userScrolling
    let held = heldTop.flatMap { redrawn.contains($0.id) ? $0 : nil }
    if held != nil { heldTop = nil }
    source.apply(snapshot, animatingDifferences: animated, commitAlongsideUpdates: {}) {
      [weak self] in
      guard let self else { return }
      if let held, let index = ids.firstIndex(of: held.id) {
        layout.restoreContentOffset(
          with: ChatLayoutPositionSnapshot(
            indexPath: IndexPath(item: index, section: 0), edge: .top, offset: held.offset))
      }
      landed()
    }
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

  /// Lines have come in: still following, the foot is kept.
  private func landed() {
    seePlace()
    if following, !scroll.place.atLatest, !userScrolling, !goingDown {
      toLatest(animated: true)
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
    guard let room, room.height != lines.bounds.height else { return }
    if let kept = room.kept, !userScrolling {
      layout.restoreContentOffset(with: kept)
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

  func toLatest(animated: Bool = false) {
    guard let foot = footSnapshot(), lines.bounds.height > 0 else { return }
    placed = true
    going = nil
    lines.layoutIfNeeded()
    let target = highest
    guard animated, abs(target - lines.contentOffset.y) > 1 else {
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

  func show(_ id: String, at place: LinePlace, animated: Bool) {
    guard let index = ids.firstIndex(of: id), lines.bounds.height > 0 else { return }
    placed = true
    goingDown = false
    lines.layoutIfNeeded()
    let path = IndexPath(item: index, section: 0)
    guard let frame = layout.layoutAttributesForItem(at: path)?.frame else { return }
    let target = min(highest, max(lowest, frame.minY - spot(of: frame, at: place)
      - lines.adjustedContentInset.top - layout.settings.additionalInsets.top))
    // Far off, it goes at once rather than through all between.
    guard animated, abs(target - lines.contentOffset.y) > 1,
      abs(target - lines.contentOffset.y) < seenHeight * 2
    else {
      settle(on: id, at: place)
      return
    }
    going = (id, place)
    lines.setContentOffset(CGPoint(x: lines.contentOffset.x, y: target), animated: true)
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
    going = nil
    for _ in 0..<2 {
      guard let index = ids.firstIndex(of: id) else { return }
      let path = IndexPath(item: index, section: 0)
      guard let frame = layout.layoutAttributesForItem(at: path)?.frame else { return }
      layout.restoreContentOffset(
        with: ChatLayoutPositionSnapshot(
          indexPath: path, edge: .top, offset: spot(of: frame, at: place)))
    }
    seePlace()
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
  private func seePlace() {
    guard lines.bounds.height > 0 else { return }
    let inset = lines.adjustedContentInset
    let content = layout.collectionViewContentSize.height
    let below = content + inset.bottom - (lines.contentOffset.y + lines.bounds.height)
    let place = ScrollPlace(
      atLatest: below < 24, away: below > seenHeight / 2, fits: content <= seenHeight + 1,
      nearTop: lines.contentOffset.y <= lowest + Metrics.touch)
    let before = scroll.place
    if place != before {
      scroll.place = place
      if place.atLatest, !before.atLatest { settings?.onReachLatest() }
    }
    let top = lines.contentOffset.y + inset.top
    let first = lines.indexPathsForVisibleItems.sorted().first {
      (layout.layoutAttributesForItem(at: $0)?.frame.maxY ?? 0) > top
    }
    let day = first.flatMap { $0.item < ids.count ? settings?.dayOver(ids[$0.item]) : nil }
    if day != scroll.topDay { scroll.topDay = day }
    for case let cell as LineCell in lines.visibleCells {
      cell.space.moved()
    }
  }

  @objc private func tappedOff() {
    UIApplication.shared.sendAction(
      #selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
  }

  func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch)
    -> Bool
  {
    touch.view === lines
  }

  // MARK: Scrolling

  func scrollViewDidScroll(_ scrollView: UIScrollView) {
    seePlace()
  }

  func scrollViewWillBeginDragging(_ scrollView: UIScrollView) {
    // Following is the person's to change: off as they scroll, and on
    // again where their scroll comes to rest at the foot.
    following = false
    goingDown = false
    going = nil
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
    }
    seePlace()
  }

  private func cameToRest() {
    scroll.scrolling = false
    if !following { following = scroll.place.atLatest }
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

  var body: some View {
    content
      .id(id)
      .frame(maxWidth: .infinity)
      .coordinateSpace(.named(LineSpace.name))
      .environment(\.lineSpace, space)
      .environment(\.self, environment)
  }
}
