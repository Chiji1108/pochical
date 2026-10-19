import ChatLayout
import SwiftUI
import UIKit
import UserNotifications

final class ProbeController: UIViewController, ChatLayoutDelegate, UICollectionViewDelegate {
  var ended: [Int: CFTimeInterval] = [:]
  var redequeues = 0
  let model: ComposerModel
  let layout = CollectionViewChatLayout()
  lazy var lines = UICollectionView(frame: .zero, collectionViewLayout: layout)
  var source: ChatLayoutDiffableDataSource<Int, Int>?
  var heights: [Int: CGFloat] = [:]
  var ids: [Int] = Array(0..<(Args.has("-few") ? 3 : 40))
  let composer: UIHostingController<ComposerView>
  var composerHeight: NSLayoutConstraint?
  var hostHeight: NSLayoutConstraint?
  let box = UIView()
  var frameView: UIView { Args.has("-box") ? box : composer.view }
  var kept: ChatLayoutPositionSnapshot?
  var link: CADisplayLink?
  var sampleUntil: CFTimeInterval = 0
  var prepares = 0

  init(model: ComposerModel) {
    self.model = model
    composer = UIHostingController(rootView: ComposerView(model: model))
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .white
    layout.settings.interItemSpacing = 8
    layout.settings.additionalInsets = UIEdgeInsets(top: 12, left: 16, bottom: 12, right: 16)
    layout.keepContentOffsetAtBottomOnBatchUpdates = true
    layout.keepContentAtBottomOfVisibleArea = true
    layout.processOnlyVisibleItemsOnAnimatedBatchUpdates = false
    layout.delegate = self
    lines.translatesAutoresizingMaskIntoConstraints = false
    lines.backgroundColor = .white
    lines.contentInsetAdjustmentBehavior = .never
    lines.keyboardDismissMode = .interactive
    lines.alwaysBounceVertical = true
    lines.selfSizingInvalidation = .disabled
    lines.isPrefetchingEnabled = false
    lines.delegate = self
    for id in ids { heights[id] = 60 }
    let registration = UICollectionView.CellRegistration<ProbeCell, Int> { [weak self] cell, _, id in
      guard let self else { return }
      self.prepares += 1
      if let at = self.ended[id], CACurrentMediaTime() - at < 0.1 { self.redequeues += 1 }
      cell.measure = { [weak self] in self?.heights[id] ?? 60 }
      _ = cell
    }
    source = ChatLayoutDiffableDataSource(collectionView: lines) { lines, path, id in
      lines.dequeueConfiguredReusableCell(using: registration, for: path, item: id)
    }
    view.addSubview(lines)

    addChild(composer)
    composer.sizingOptions = Args.mode == "A" ? .intrinsicContentSize : .preferredContentSize
    composer.safeAreaRegions = .container
    composer.view.backgroundColor = UIColor(red: 0, green: 1, blue: 0, alpha: 1)
    composer.view.translatesAutoresizingMaskIntoConstraints = false
    box.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(box)
    if Args.has("-box") {
      box.addSubview(composer.view)
      let hostHeight = composer.view.heightAnchor.constraint(equalToConstant: 48)
      self.hostHeight = hostHeight
      NSLayoutConstraint.activate([
        composer.view.topAnchor.constraint(equalTo: box.topAnchor),
        composer.view.leadingAnchor.constraint(equalTo: box.leadingAnchor),
        composer.view.trailingAnchor.constraint(equalTo: box.trailingAnchor),
        hostHeight,
      ])
      composer.view.backgroundColor = .clear
      box.backgroundColor = UIColor(red: 0, green: 1, blue: 0, alpha: 1)
    } else {
      view.addSubview(composer.view)
    }
    composer.didMove(toParent: self)
    for (x, top) in [(0.0, true), (40.0, false)] {
      let mark = UIView()
      mark.backgroundColor = .yellow
      mark.translatesAutoresizingMaskIntoConstraints = false
      mark.layer.zPosition = 10
      frameView.addSubview(mark)
      NSLayoutConstraint.activate([
        mark.leadingAnchor.constraint(equalTo: frameView.leadingAnchor, constant: x),
        mark.widthAnchor.constraint(equalToConstant: 20),
        mark.heightAnchor.constraint(equalToConstant: 4),
        top ? mark.topAnchor.constraint(equalTo: frameView.topAnchor)
          : mark.bottomAnchor.constraint(equalTo: frameView.bottomAnchor),
      ])
    }
    var constraints = [
      lines.topAnchor.constraint(equalTo: view.topAnchor),
      lines.bottomAnchor.constraint(equalTo: view.bottomAnchor),
      lines.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      lines.trailingAnchor.constraint(equalTo: view.trailingAnchor),
      frameView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      frameView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ]
    if !Args.has("-lateGuide"), !Args.has("-windowGuide") {
      constraints.append(frameView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor))
    }
    if Args.mode == "B" {
      let height = frameView.heightAnchor.constraint(equalToConstant: 48)
      composerHeight = height
      constraints.append(height)
    }
    NSLayoutConstraint.activate(constraints)
    var snapshot = NSDiffableDataSourceSnapshot<Int, Int>()
    snapshot.appendSections([0])
    snapshot.appendItems(ids)
    source?.applySnapshotUsingReloadData(snapshot, commitAlongsideUpdates: {})
    NotificationCenter.default.addObserver(
      forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main
    ) { [weak self] note in
      let end = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
      let duration = note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double
      MainActor.assumeIsolated {
        log("KEYBOARD willChange end=\(end.map { "\($0)" } ?? "nil") duration=\(duration ?? -1)")
        self?.sample(for: 1.0, why: "keyboard")
      }
    }
  }

  var lateGuideDone = false
  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    if Args.has("-windowGuide"), !lateGuideDone, let window = view.window {
      lateGuideDone = true
      frameView.bottomAnchor.constraint(equalTo: window.keyboardLayoutGuide.topAnchor).isActive = true
    }
    if Args.has("-lateGuide"), !lateGuideDone {
      lateGuideDone = true
      frameView.bottomAnchor.constraint(equalTo: view.keyboardLayoutGuide.topAnchor).isActive = true
    }
    log("APPEAR safeArea=\(view.safeAreaInsets) window=\(view.window?.safeAreaInsets ?? .zero) bounds=\(view.bounds)")
    UIView.performWithoutAnimation {
      layout.restoreContentOffset(with: ChatLayoutPositionSnapshot(indexPath: IndexPath(item: ids.count - 1, section: 0), edge: .bottom))
    }
    log("ATBOTTOM \(counts())")
    if let script = Args.value("-script") { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.run(script) } }
  }

  override func viewSafeAreaInsetsDidChange() {
    super.viewSafeAreaInsetsDidChange()
    log("SAFEAREA \(view.safeAreaInsets)")
  }

  override func preferredContentSizeDidChange(forChildContentContainer container: any UIContentContainer) {
    super.preferredContentSizeDidChange(forChildContentContainer: container)
    guard container === composer, let composerHeight else { return }
    let height = container.preferredContentSize.height
    let fits = composer.sizeThatFits(in: CGSize(width: view.bounds.width, height: .greatestFiniteMagnitude))
    log("FITS \(fits) preferredSize=\(container.preferredContentSize)")
    log("PREFERRED \(height) (was \(composerHeight.constant)) inTransaction=\(UIView.inheritedAnimationDuration)")
    guard height != composerHeight.constant else { return }
    if Args.has("-unwrapped") {
      composerHeight.constant = height
      view.layoutIfNeeded()
    } else {
      if let hostHeight {
        UIView.performWithoutAnimation {
          hostHeight.constant = height
          box.layoutIfNeeded()
        }
      }
      if Args.has("-uikitSpring") {
        UIView.animate(springDuration: 0.5, bounce: 0) {
          composerHeight.constant = height
          self.view.layoutIfNeeded()
        }
      } else {
        UIView.animate(Args.motion) {
          composerHeight.constant = height
          self.view.layoutIfNeeded()
        }
      }
    }
    sample(for: 1.6, why: "composer")
  }

  override func viewWillLayoutSubviews() {
    super.viewWillLayoutSubviews()
    kept = layout.getContentOffsetSnapshot(from: .bottom)
  }

  var userScrolling: Bool { lines.isDragging || lines.isDecelerating }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if model.width != view.bounds.width { model.width = view.bounds.width }
    let top = view.safeAreaInsets.top
    if lines.contentInset.top != top { lines.contentInset.top = top }
    let bottom = view.bounds.maxY - frameView.frame.minY
    let guide = view.keyboardLayoutGuide.layoutFrame
    log("LAYOUT composerMinY=\(frameView.frame.minY) h=\(frameView.frame.height) guide=\(guide) safe=\(view.safeAreaInsets) inheritedDur=\(UIView.inheritedAnimationDuration)")
    guard lines.contentInset.bottom != bottom else { return }
    if Args.value("-inset") == "delta" {
      let delta = bottom - lines.contentInset.bottom
      let was = lines.contentOffset.y
      if !userScrolling {
        let lowest = -lines.adjustedContentInset.top
        let highest = max(lowest, layout.collectionViewContentSize.height - lines.bounds.height + bottom)
        lines.contentOffset.y = min(highest, max(lowest, was + delta))
      }
      UIView.performWithoutAnimation {
        lines.contentInset.bottom = bottom
        lines.verticalScrollIndicatorInsets.bottom = bottom
      }
      if Args.has("-relayout") {
        layout.invalidateLayout(with: layout.invalidationContext(forBoundsChange: lines.bounds))
        lines.layoutIfNeeded()
      }
      log("DELTA \(delta) offset \(was) -> \(lines.contentOffset.y) \(counts())")
      return
    }
    UIView.performWithoutAnimation {
      let seen = layout.getContentOffsetSnapshot(from: .top)
      lines.contentInset.bottom = bottom
      lines.verticalScrollIndicatorInsets.bottom = bottom
      if let seen, !userScrolling { layout.restoreContentOffset(with: seen) }
    }
    let before = counts()
    if let kept, !userScrolling { layout.restoreContentOffset(with: kept) }
    log("RESTORE \(before) -> \(counts())")
  }

  func sizeForItem(_ chatLayout: CollectionViewChatLayout, at indexPath: IndexPath) -> ItemSize {
    .estimated(CGSize(width: chatLayout.layoutFrame.width, height: heights[ids[indexPath.item]] ?? 60))
  }

  // MARK: Script

  func run(_ script: String) {
    var steps: [(Double, () -> Void)] = []
    switch script {
    case "q2":
      steps = [
        (1.0, { log("STEP quote on"); self.model.quote = true }),
        (3.0, { log("STEP quote off"); self.model.quote = false }),
        (5.0, { log("STEP three lines"); self.model.text = "a\nb\nc" }),
        (6.0, { log("STEP long wrapped"); self.model.text = String(repeating: "wrap ", count: 30) }),
        (7.0, { log("STEP one line"); self.model.text = "" }),
        (9.0, { log("STEP focus"); self.model.focus = true }),
        (11.0, { log("STEP quote on (keyboard up)"); self.model.quote = true }),
        (13.0, { log("STEP quote off (keyboard up)"); self.model.quote = false }),
        (15.0, { log("STEP unfocus"); self.model.focus = false }),
      ]
    case "both":
      steps = [
        (1.0, { log("STEP quote on + focus"); self.model.quote = true; self.model.focus = true }),
        (3.0, { log("STEP quote off"); self.model.quote = false }),
        (5.0, { log("STEP unfocus"); self.model.focus = false }),
        (7.0, { log("STEP quote on + focus"); self.model.quote = true; self.model.focus = true }),
        (9.0, { log("STEP quote off + unfocus"); self.model.quote = false; self.model.focus = false }),
      ]
    case "alert":
      steps = [
        (1.0, { log("STEP focus"); self.model.focus = true }),
        (2.5, {
          log("STEP ask for notifications")
          UNUserNotificationCenter.current().requestAuthorization(options: [.alert]) { _, _ in }
        }),
      ]
    case "bg":
      steps = [(1.0, { log("STEP focus"); self.model.focus = true })]
      for second in 2..<14 {
        steps.append((Double(second), {
          self.view.setNeedsLayout()
          self.view.layoutIfNeeded()
          log("TICK guide=\(self.view.keyboardLayoutGuide.layoutFrame) windowGuide=\(self.view.window?.keyboardLayoutGuide.layoutFrame ?? .null) composer=\(self.frameView.frame) state=\(UIApplication.shared.applicationState.rawValue)")
        }))
      }
    case "q1":
      steps = [
        (1.0, { log("STEP focus"); self.model.focus = true }),
        (3.0, { log("STEP unfocus"); self.model.focus = false }),
        (5.0, { log("STEP focus"); self.model.focus = true }),
        (7.0, { log("STEP unfocus"); self.model.focus = false }),
      ]
    case "q3":
      steps = [
        (1.0, { log("STEP grow swiftui"); self.grow("swiftui") }),
        (3.5, { log("STEP shrink swiftui"); self.grow("swiftui") }),
        (6.0, { log("STEP grow classic"); self.grow("classic") }),
        (8.5, { log("STEP shrink classic"); self.grow("classic") }),
        (11.0, { log("STEP grow bare"); self.grow("bare") }),
        (13.5, { log("STEP shrink bare"); self.grow("bare") }),
      ]
    default: break
    }
    let start = CACurrentMediaTime()
    for (at, step) in steps {
      DispatchQueue.main.asyncAfter(deadline: .now() + at) { step() }
    }
    _ = start
  }

  func grow(_ how: String) {
    guard let source, var snapshot = source.snapshot else { return }
    let last = ids[ids.count - 1]
    heights[last] = heights[last] == 60 ? 200 : 60
    snapshot.reconfigureItems([last])
    let apply = {
      source.apply(snapshot, animatingDifferences: true, commitAlongsideUpdates: {})
      self.view.layoutIfNeeded()
    }
    switch how {
    case "swiftui": UIView.animate(Args.motion, changes: apply)
    case "classic": UIView.animate(withDuration: 1.2, delay: 0, options: [.curveLinear], animations: apply)
    default: apply()
    }
    for cell in [lines.cellForItem(at: IndexPath(item: ids.count - 1, section: 0)), lines.cellForItem(at: IndexPath(item: ids.count - 2, section: 0))].compactMap({ $0 }) {
      let keys = cell.layer.animationKeys() ?? []
      let described = keys.compactMap { key in
        cell.layer.animation(forKey: key).map { "\(key):\($0.duration)" }
      }
      log("ANIM cell \(cell.frame) keys=\(described)")
    }
    let boundsKeys = (lines.layer.animationKeys() ?? []).compactMap { key in
      lines.layer.animation(forKey: key).map { "\(key):\($0.duration)" }
    }
    log("ANIM lines keys=\(boundsKeys)")
    sample(for: 2.0, why: how)
  }

  // MARK: Sampling

  func sample(for seconds: Double, why: String) {
    sampleUntil = max(sampleUntil, CACurrentMediaTime() + seconds)
    log("SAMPLE start \(why) \(counts())")
    guard link == nil else { return }
    let link = CADisplayLink(target: self, selector: #selector(tick))
    link.add(to: .main, forMode: .common)
    self.link = link
  }

  func counts() -> String { "reuse=\(ProbeCell.reuses) configs=\(prepares) redequeues=\(redequeues)" }

  func collectionView(_ collectionView: UICollectionView, didEndDisplaying cell: UICollectionViewCell, forItemAt indexPath: IndexPath) {
    if indexPath.item < ids.count { ended[ids[indexPath.item]] = CACurrentMediaTime() }
  }

  @objc func tick() {
    if CACurrentMediaTime() > sampleUntil {
      link?.invalidate()
      link = nil
      log("SAMPLE end \(counts())")
      return
    }
    let composerTop = screenY(frameView.layer)
    let last = lines.cellForItem(at: IndexPath(item: ids.count - 1, section: 0))
    let lastBottom = last.map { screenY($0.layer) + ($0.layer.presentation() ?? $0.layer).bounds.height } ?? -1
    log(String(
      format: "FRAME composerTop=%.1f model=%.1f lastCellBottom=%.1f gap=%.1f offset=%.1f",
      composerTop, frameView.frame.minY, lastBottom, composerTop - lastBottom,
      (lines.layer.presentation() ?? lines.layer).bounds.origin.y))
  }

  /// Where the layer's top is on the screen as drawn now: the presentation
  /// values of it and every layer above it.
  func screenY(_ layer: CALayer) -> CGFloat {
    var y: CGFloat = 0
    var current: CALayer? = layer
    while let one = current {
      let shown = one.presentation() ?? one
      y += shown.position.y - shown.bounds.height * shown.anchorPoint.y
      if let superlayer = one.superlayer {
        let parent = superlayer.presentation() ?? superlayer
        y -= parent.bounds.origin.y
      }
      current = one.superlayer
    }
    return y
  }
}

final class ProbeCell: UICollectionViewCell {
  var measure: (() -> CGFloat)?
  override init(frame: CGRect) {
    super.init(frame: frame)
    contentView.backgroundColor = UIColor(white: 0.87, alpha: 1)
    let stripe = UIView()
    stripe.backgroundColor = .red
    stripe.translatesAutoresizingMaskIntoConstraints = false
    contentView.addSubview(stripe)
    NSLayoutConstraint.activate([
      stripe.leadingAnchor.constraint(equalTo: contentView.leadingAnchor),
      stripe.trailingAnchor.constraint(equalTo: contentView.trailingAnchor),
      stripe.bottomAnchor.constraint(equalTo: contentView.bottomAnchor),
      stripe.heightAnchor.constraint(equalToConstant: 6),
    ])
  }
  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

  nonisolated(unsafe) static var reuses = 0
  override func prepareForReuse() {
    super.prepareForReuse()
    Self.reuses += 1
  }

  override func preferredLayoutAttributesFitting(_ attributes: UICollectionViewLayoutAttributes)
    -> UICollectionViewLayoutAttributes
  {
    guard let measure, let fitted = attributes.copy() as? UICollectionViewLayoutAttributes else {
      return super.preferredLayoutAttributesFitting(attributes)
    }
    fitted.size = CGSize(width: attributes.size.width, height: measure())
    return fitted
  }
}
