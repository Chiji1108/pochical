"""instrument.py <dir>: logs what the POC-117 checks count (never committed):
cells configured, ended and reused, and the frames each layout settles."""
import sys

p = sys.argv[1] + '/ChatStage.swift'
s = open(p).read()


def rep(a, b):
    global s
    assert s.count(a) == 1, a
    s = s.replace(a, b)


rep('''    let registration = UICollectionView.CellRegistration<LineCell, String> { cell, _, id in
      let content = model.row(id)''', '''    let registration = UICollectionView.CellRegistration<LineCell, String> { cell, _, id in
      NSLog("POC117DBG configure %@", id)
      let content = model.row(id)''')
rep('''  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if width.value != view.bounds.width { width.value = view.bounds.width }
    fitRoom()
    place()
  }''', '''  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    if width.value != view.bounds.width { width.value = view.bounds.width }
    fitRoom()
    place()
    NSLog(
      "POC117DBG layout guide=%@ composer=%@ inset=%.1f offset=%.1f content=%.1f window=%d",
      NSCoder.string(for: view.keyboardLayoutGuide.layoutFrame),
      NSCoder.string(for: composer.view.frame), lines.contentInset.bottom,
      lines.contentOffset.y, layout.collectionViewContentSize.height, view.window == nil ? 0 : 1)
  }

  private var sampler: CADisplayLink?
  private var sampled = ""

  override func viewDidAppear(_ animated: Bool) {
    super.viewDidAppear(animated)
    guard sampler == nil else { return }
    let link = CADisplayLink(target: self, selector: #selector(sample))
    link.add(to: .main, forMode: .common)
    sampler = link
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    sampler?.invalidate()
    sampler = nil
  }

  /// Where the composer's top and the lowest line's foot are drawn now, on
  /// the screen, logged as they move.
  @objc private func sample() {
    func screenY(_ layer: CALayer) -> CGFloat {
      var y: CGFloat = 0
      var current: CALayer? = layer
      while let one = current {
        let shown = one.presentation() ?? one
        y += shown.position.y - shown.bounds.height * shown.anchorPoint.y
        if let superlayer = one.superlayer {
          y -= (superlayer.presentation() ?? superlayer).bounds.origin.y
        }
        current = one.superlayer
      }
      return y
    }
    let composerTop = screenY(composer.view.layer)
    let lowest = lines.visibleCells.max { $0.frame.maxY < $1.frame.maxY }
    let foot = lowest.map { screenY($0.layer) + ($0.layer.presentation() ?? $0.layer).bounds.height } ?? -1
    let line = String(format: "composerTop=%.1f lastBottom=%.1f gap=%.1f", composerTop, foot, composerTop - foot)
    guard line != sampled else { return }
    sampled = line
    NSLog("POC117DBG frame %@", line)
  }

  func collectionView(
    _ collectionView: UICollectionView, didEndDisplaying cell: UICollectionViewCell,
    forItemAt indexPath: IndexPath
  ) {
    if indexPath.item < ids.count { NSLog("POC117DBG ended %@", ids[indexPath.item]) }
  }''')
rep('''  override func prepareForReuse() {
    super.prepareForReuse()
    space.letGo()''', '''  override func prepareForReuse() {
    super.prepareForReuse()
    NSLog("POC117DBG prepareForReuse")
    space.letGo()''')
rep('''  override func viewDidLoad() {
''', '''  override func viewDidLoad() {
    for (name, said) in [
      (UIApplication.didEnterBackgroundNotification, "background"),
      (UIApplication.willEnterForegroundNotification, "foreground"),
    ] {
      NotificationCenter.default.addObserver(forName: name, object: nil, queue: .main) {
        [weak self] _ in
        MainActor.assumeIsolated {
          NSLog("POC117DBG app %@", said)
          self?.view.setNeedsLayout()
          self?.view.layoutIfNeeded()
        }
      }
    }
''')
open(p, 'w').write(s)

p = sys.argv[1] + '/RootView.swift'
s = open(p).read()
rep('''    .task { meID = await groupCalls.userID() }
''', '''    .task { meID = await groupCalls.userID() }
    .task(id: navigator.pages) {
      guard CommandLine.arguments.contains("-poc117tabflip"), !navigator.pages.isEmpty else { return }
      try? await Task.sleep(for: .seconds(4))
      guard !Task.isCancelled else { return }
      NSLog("POC117DBG tab flip under the chat, from %@", "\\(tab)")
      tab = tab == .groups ? .calendar : .groups
    }
    .task {
      let args = CommandLine.arguments
      guard let at = args.firstIndex(of: "-poc117open"), at + 2 < args.count else { return }
      try? await Task.sleep(for: .seconds(8))
      NSLog("POC117DBG notification tap for %@", args[at + 1])
      Notifications.shared.opening = OpenedChat(groupID: args[at + 1], threadID: args[at + 2])
      try? await Task.sleep(for: .seconds(6))
      NSLog("POC117DBG support notification tap")
      Notifications.shared.openingSupport = true
      try? await Task.sleep(for: .seconds(6))
      NSLog("POC117DBG notification tap for %@ again", args[at + 1])
      Notifications.shared.opening = OpenedChat(groupID: args[at + 1], threadID: args[at + 2])
    }
''')
open(p, 'w').write(s)
print('instrumented')
