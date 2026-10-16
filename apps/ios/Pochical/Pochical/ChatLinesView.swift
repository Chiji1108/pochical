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

  /// The lines seen grow down from where they are for a moment, as a long
  /// line opened at 続きを読む does, rather than up from the foot.
  func growDown() {
    controller?.growDown()
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

/// What the cells draw, made again with the chat screen.
@MainActor @Observable private final class ChatLinesModel {
  var row: (String) -> AnyView = { _ in AnyView(EmptyView()) }
  /// The chat screen's, which the cells, hosted apart, do not inherit.
  var environment = EnvironmentValues()
}

/// The chat's lines, and the composer under them, rising with the keyboard.
struct ChatLinesView: UIViewControllerRepresentable {
  /// The top item while earlier lines are to come, which asks for them.
  static let earlier = "earlier"

  /// Every item's id, oldest first.
  let ids: [String]
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
  /// line held stays under its menu.
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
    // The lines' SwiftUI grows by itself (a photo or a link's page drawn,
    // a line's reactions), which the layout hears of only so.
    layout.supportSelfSizingInvalidation = true

    lines.translatesAutoresizingMaskIntoConstraints = false
    lines.backgroundColor = .clear
    lines.contentInsetAdjustmentBehavior = .never
    lines.keyboardDismissMode = .interactive
    lines.alwaysBounceVertical = true
    lines.showsHorizontalScrollIndicator = false
    lines.selfSizingInvalidation = .enabled
    // ChatLayout's: prefetched cells are laid out at sizes not yet theirs.
    lines.isPrefetchingEnabled = false
    lines.delegate = self
    let model = model
    let registration = UICollectionView.CellRegistration<LineCell, String> { cell, _, id in
      let space = cell.space
      cell.contentConfiguration = UIHostingConfiguration {
        LineCellContent(id: id, model: model, space: space)
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
    NSLayoutConstraint.activate([
      lines.topAnchor.constraint(equalTo: view.topAnchor),
      lines.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      lines.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      lines.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      // The composer on the keyboard, following it as it is pulled down.
      composer.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      composer.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      composer.view.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor),
      ground.topAnchor.constraint(equalTo: composer.view.bottomAnchor),
      ground.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      ground.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      ground.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      latest.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      latest.view.bottomAnchor.constraint(equalTo: composer.view.topAnchor),
    ])
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    fitInsets()
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
    if !settings.holds {
      setLines(settings.ids, reduceMotion: environment.accessibilityReduceMotion)
    }
  }

  // MARK: Lines

  private var following: Bool {
    get { settings?.following ?? true }
    set { if settings?.following != newValue { settings?.following = newValue } }
  }

  private var userScrolling: Bool { lines.isDragging || lines.isDecelerating }

  private func setLines(_ new: [String], reduceMotion: Bool) {
    guard new != ids, let source else { return }
    var snapshot = NSDiffableDataSourceSnapshot<Int, String>()
    snapshot.appendSections([0])
    snapshot.appendItems(new, toSection: 0)
    let old = ids
    ids = new
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
    let animated = !earlier && !reduceMotion && !userScrolling
    source.apply(snapshot, animatingDifferences: animated, commitAlongsideUpdates: {}) {
      [weak self] in
      self?.landed()
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

  /// The composer's room under the lines, and the lines seen kept where
  /// they are as it changes (the keyboard, the composer growing), but
  /// under the finger pulling the keyboard down.
  private func fitInsets() {
    let bottom = max(0, view.bounds.maxY - composer.view.frame.minY)
    let top = view.safeAreaInsets.top
    guard lines.contentInset.bottom != bottom || lines.contentInset.top != top else { return }
    let kept = following ? footSnapshot() : layout.getContentOffsetSnapshot(from: .bottom)
    let insets = UIEdgeInsets(top: top, left: 0, bottom: bottom, right: 0)
    lines.contentInset = insets
    lines.verticalScrollIndicatorInsets = insets
    if let kept, !userScrolling {
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

  func growDown() {
    layout.keepContentOffsetAtBottomOnBatchUpdates = false
    Task { @MainActor [weak self] in
      try? await Task.sleep(for: .milliseconds(600))
      self?.layout.keepContentOffsetAtBottomOnBatchUpdates = true
    }
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

  override init(frame: CGRect) {
    super.init(frame: frame)
    // The cell itself: a content configuration puts in a content view of
    // its own, filling the cell.
    space.view = self
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }
}

/// What a cell draws: the chat's item `id`, with the chat's environment.
private struct LineCellContent: View {
  let id: String
  let model: ChatLinesModel
  let space: LineSpace

  var body: some View {
    model.row(id)
      .frame(maxWidth: .infinity)
      .coordinateSpace(.named(LineSpace.name))
      .environment(\.lineSpace, space)
      .environment(\.self, model.environment)
  }
}
