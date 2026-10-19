import GRDB
import Nuke
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import UIKit

// A photo opened large (spec/chat.md, Photos; /design's PhotoViewer), as
// Photos, Signal and Telegram open one: whole on black, pinched or tapped
// twice to zoom, swiped to the chat's photos before and after it, opened
// from its place in the chat and closed back to it, following the finger
// pulling it down. The system's own pieces do it: a zoom transition, a page
// view controller, a scroll view's zooming.

/// The photos opened large: the chat's, in the order of its lines, and
/// the one tapped among them, or a photo alone.
struct PhotoViewing: Identifiable {
  let run: PhotoRun
  /// Where the rest of the chat's photos come from; none for a photo alone.
  let pager: PhotoPager?
  let id: String
  /// Who wrote each photo's line, by id, for VoiceOver to say whose it is.
  var names: [String: String] = [:]

  /// `photo` alone, as someone's face.
  init(_ photo: LinePhoto) {
    run = PhotoRun(
      held: [ChatPhotoItem(seq: 0, photo: photo, authorID: "", sentAt: .now)], tapped: 0)
    pager = nil
    id = photo.id
  }

  /// `tapped` among the chat's photos, those `held` of its lines laid out
  /// first and the rest from `pager`; alone when it is not one of them
  /// (a blocked member's shown for once, or one of the reader's on its way).
  init(_ tapped: ChatPhotoItem, among held: [ChatPhotoItem], pager: PhotoPager?) {
    let among = held.contains { $0.seq == tapped.seq }
    run = PhotoRun(held: among ? held : [tapped], tapped: tapped.seq)
    self.pager = among ? pager : nil
    id = tapped.id
  }

  /// `tapped` among the photos the list of them holds, with where they are
  /// among all the chat's known already, paging on from `pager`.
  init(_ tapped: ChatPhotoItem, listed: PhotoRun, pager: PhotoPager) {
    var run = listed
    run.show(tapped.seq)
    self.run = run
    self.pager = pager
    id = tapped.id
  }
}

/// A chat's photos beyond the lines laid out (spec/sync-protocol.md,
/// Chat): asked of its place a page at a time on the place's socket, held
/// open while they show, as the chat under them lets go of it; and followed
/// as the chat's lines on the device change.
struct PhotoPager {
  let placeID: String
  let threadID: String
  let sockets: GroupSockets
  let account: Account
  let database: any DatabaseWriter
  /// Whom the reader has blocked, whose photos fold away in its own chat.
  let blocked: Set<String>

  /// Holds the place's socket while the chat's photos show, and follows
  /// them until cancelled, then lets go of it: `opened` once held, with its
  /// client to ask for pages on (as their answers are listened to by
  /// then), and each change to them as `change`: a page come, the socket
  /// open again after a drop, the chat's lines on the device changed.
  @MainActor func follow(
    opened: @escaping @MainActor (SyncClient) -> Void,
    change: @escaping @MainActor (_ edit: (inout PhotoRun) -> Void) -> Void
  ) async {
    let (client, hold) = await sockets.open(placeID, account: account, database: database)
    if !Task.isCancelled {
      let pages = await client.photoPages()
      opened(client)
      let threadID = threadID
      let blocked = blocked
      let database = database
      let following = [
        Task {
          for await page in pages where page.threadID == threadID {
            change { $0.take(page) }
          }
        },
        Task {
          // Open again after a drop: what was asked is asked again.
          for await _ in await client.statuses().reopenings() {
            change { $0.reconnected() }
          }
        },
        Task {
          let lines = ValueObservation.tracking { db in
            try Chats.photoLines(of: placeID, thread: threadID, blocked: blocked, in: db)
          }
          .removeDuplicates()
          do {
            for try await now in lines.values(in: database) {
              change { $0.follow(now) }
            }
          } catch {}
        },
      ]
      await withTaskCancellationHandler {
        for task in following { await task.value }
      } onCancel: {
        for task in following { task.cancel() }
      }
    }
    await sockets.close(hold, of: placeID)
  }
}

extension View {
  /// Opens `viewing` large over everything while it is set, back to nil
  /// once closed. `onSave` saves a photo, true once saved; none for
  /// someone's face, which is theirs to keep, nor shared.
  func photoViewer(
    _ viewing: Binding<PhotoViewing?>, groupID: String,
    onSave: ((LinePhoto) async -> Bool)? = nil
  ) -> some View {
    background(PhotoViewerPresenter(viewing: viewing, groupID: groupID, onSave: onSave))
  }
}

/// Where the chat's photos are, by id, each opened from and closed back to
/// there; and the one open large from its place, left empty meanwhile.
@MainActor final class PhotoSpots {
  static let shared = PhotoSpots()
  /// Said as `open` changes, to the photo lines in the chat's cells,
  /// which observation reaches only as the cell is configured again.
  static let opened = Notification.Name("PhotoSpots.opened")
  var open: String? {
    didSet {
      if open != oldValue { NotificationCenter.default.post(name: Self.opened, object: nil) }
    }
  }
  private let views = NSMapTable<NSString, UIView>.strongToWeakObjects()

  fileprivate func put(_ view: UIView, for id: String) {
    views.setObject(view, forKey: id as NSString)
  }

  /// The place of the photo `id` while it is in a window, partly off the
  /// screen too; none once its line is gone from the chat's cells.
  func view(of id: String) -> UIView? {
    guard let view = views.object(forKey: id as NSString), view.window != nil else { return nil }
    return view
  }
}

/// A photo's place in the chat: a plain view the size of the photo, for
/// the zoom to open from and close to.
struct PhotoSpot: UIViewRepresentable {
  let id: String

  func makeUIView(context: Context) -> UIView {
    let view = UIView()
    view.isUserInteractionEnabled = false
    return view
  }

  func updateUIView(_ view: UIView, context: Context) {
    PhotoSpots.shared.put(view, for: id)
  }
}

extension View {
  /// The photo `id`'s place, where it opens large from and closes back to,
  /// left empty while it is open, as Photos leaves a photo's place.
  func photoSpot(_ id: String) -> some View {
    modifier(PhotoSpotted(id: id))
  }
}

private struct PhotoSpotted: ViewModifier {
  let id: String
  /// It is open large from here.
  @State private var open = false

  func body(content: Content) -> some View {
    content
      .opacity(open ? 0 : 1)
      .background(PhotoSpot(id: id))
      .onAppear { open = PhotoSpots.shared.open == id }
      .onReceive(NotificationCenter.default.publisher(for: PhotoSpots.opened)) { _ in
        open = PhotoSpots.shared.open == id
      }
  }
}

private struct PhotoViewerPresenter: UIViewControllerRepresentable {
  @Binding var viewing: PhotoViewing?
  let groupID: String
  let onSave: ((LinePhoto) async -> Bool)?

  final class Coordinator {
    weak var viewer: PhotoViewerController?
  }

  func makeCoordinator() -> Coordinator { Coordinator() }

  func makeUIViewController(context: Context) -> UIViewController {
    let host = UIViewController()
    host.view.isUserInteractionEnabled = false
    host.view.isHidden = true
    return host
  }

  func updateUIViewController(_ host: UIViewController, context: Context) {
    let coordinator = context.coordinator
    guard let viewing else {
      if let viewer = coordinator.viewer, !viewer.isBeingDismissed {
        viewer.dismiss(animated: true)
      }
      return
    }
    guard coordinator.viewer == nil, host.presentedViewController == nil else { return }
    let environment = context.environment
    let binding = $viewing
    let viewer = PhotoViewerController(
      viewing, groupID: groupID, calls: environment.groupCalls, colors: environment.themeColors,
      zooms: !environment.accessibilityReduceMotion, onSave: onSave)
    viewer.onClosed = { [weak coordinator] in
      coordinator?.viewer = nil
      binding.wrappedValue = nil
    }
    coordinator.viewer = viewer
    host.present(viewer, animated: true)
  }
}

/// The photos large, a page each.
final class PhotoViewerController: UIViewController, UIPageViewControllerDataSource,
  UIPageViewControllerDelegate, UIGestureRecognizerDelegate
{
  var onClosed: (() -> Void)?
  private var run: PhotoRun
  private let pager: PhotoPager?
  private let names: [String: String]
  /// Asking for pages and following the chat, while open.
  private var following: [Task<Void, Never>] = []
  /// The place's socket, held open while the photos show; nil until held.
  private var client: SyncClient?
  /// The photos about to be swiped to, fetched ahead.
  private let ahead = PhotoPrefetch()
  private let groupID: String
  private let calls: GroupCalls
  private let onSave: ((LinePhoto) async -> Bool)?
  /// Opened from the photo's place and closed back to it; with motion
  /// reduced, it fades in and out instead.
  private let zooms: Bool
  private let pages = UIPageViewController(
    transitionStyle: .scroll, navigationOrientation: .horizontal,
    options: [.interPageSpacing: 16])
  private let counter = UILabel()
  /// The count's glass, as the buttons', readable over a light photo.
  private let counterGlass = UIVisualEffectView(effect: UIGlassEffect())
  private var chrome: [UIView] = []
  private var chromeHidden = false
  private let notice: UIHostingController<ViewerNotice>
  private let noticeWords = NoticeWords()
  private let saved = UINotificationFeedbackGenerator()

  /// How far a pull down closes it, with motion reduced (the zoom's own
  /// pull judges for itself otherwise), and how fast a flick does.
  private static let closeAt: CGFloat = 120
  private static let closeSpeed: CGFloat = 800

  init(
    _ viewing: PhotoViewing, groupID: String, calls: GroupCalls, colors: ThemeColors, zooms: Bool,
    onSave: ((LinePhoto) async -> Bool)?
  ) {
    run = viewing.run
    pager = viewing.pager
    names = viewing.names
    self.groupID = groupID
    self.calls = calls
    self.zooms = zooms
    self.onSave = onSave
    notice = UIHostingController(rootView: ViewerNotice(words: noticeWords, colors: colors))
    super.init(nibName: nil, bundle: nil)
    if let start = run.photos.first(where: { $0.seq == run.shown }) {
      pages.setViewControllers([page(start)], direction: .forward, animated: false)
    }
    if zooms {
      let options = UIViewController.Transition.ZoomOptions()
      // Pulled down, as Photos closes one: not swiped sideways, which
      // goes to the next photo, nor while zoomed in, which a drag pans.
      options.interactiveDismissShouldBegin = { [weak self] context in
        context.velocity.dy >= abs(context.velocity.dx) && self?.shown?.zoomedIn != true
      }
      // The photo itself goes to its place, not the black around it.
      options.alignmentRectProvider = { [weak self] context in
        guard let self, let shown else { return context.zoomedViewController.view.bounds }
        return shown.photoFrame(in: context.zoomedViewController.view)
      }
      preferredTransition = .zoom(options: options) { [weak self] _ in
        self?.shown.flatMap { PhotoSpots.shared.view(of: $0.photo.id) }
      }
    } else {
      modalPresentationStyle = .overFullScreen
      modalTransitionStyle = .crossDissolve
      modalPresentationCapturesStatusBarAppearance = true
    }
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  private var shown: PhotoPage? { pages.viewControllers?.first as? PhotoPage }

  override var prefersStatusBarHidden: Bool { chromeHidden }
  override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }
  override var preferredStatusBarUpdateAnimation: UIStatusBarAnimation { .fade }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .black
    overrideUserInterfaceStyle = .dark

    addChild(pages)
    pages.view.frame = view.bounds
    pages.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    view.addSubview(pages.view)
    pages.didMove(toParent: self)
    pages.dataSource = pager != nil || run.photos.count > 1 ? self : nil
    pages.delegate = self

    let close = Self.button("閉じる", systemImage: "xmark") { [weak self] in
      self?.dismiss(animated: true)
    }
    var corners = [close]
    var bottom: [UIButton] = []
    if onSave != nil {
      let share = Self.button("共有", systemImage: "square.and.arrow.up") { [weak self] in
        self?.share()
      }
      let save = Self.button("保存", systemImage: "square.and.arrow.down") { [weak self] in
        self?.save()
      }
      bottom = [share, save]
      corners += bottom
    }
    counter.font = .preferredFont(forTextStyle: .headline)
    counter.adjustsFontForContentSizeCategory = true
    counter.textColor = .white
    counter.translatesAutoresizingMaskIntoConstraints = false
    counterGlass.isHidden = true
    counterGlass.cornerConfiguration = .capsule()
    counterGlass.translatesAutoresizingMaskIntoConstraints = false
    counterGlass.contentView.addSubview(counter)
    view.addSubview(counterGlass)
    for button in corners {
      button.translatesAutoresizingMaskIntoConstraints = false
      view.addSubview(button)
    }
    let guide = view.safeAreaLayoutGuide
    var constraints = [
      close.topAnchor.constraint(equalTo: guide.topAnchor, constant: 16),
      close.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
      counterGlass.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      counterGlass.centerYAnchor.constraint(equalTo: close.centerYAnchor),
      counter.leadingAnchor.constraint(equalTo: counterGlass.contentView.leadingAnchor, constant: 12),
      counter.trailingAnchor.constraint(
        equalTo: counterGlass.contentView.trailingAnchor, constant: -12),
      counter.topAnchor.constraint(equalTo: counterGlass.contentView.topAnchor, constant: 8),
      counter.bottomAnchor.constraint(equalTo: counterGlass.contentView.bottomAnchor, constant: -8),
    ]
    if let share = bottom.first, let save = bottom.last {
      constraints += [
        share.leadingAnchor.constraint(equalTo: guide.leadingAnchor, constant: 16),
        share.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -16),
        save.trailingAnchor.constraint(equalTo: guide.trailingAnchor, constant: -16),
        save.bottomAnchor.constraint(equalTo: guide.bottomAnchor, constant: -16),
      ]
    }
    NSLayoutConstraint.activate(constraints)
    chrome = corners + [counterGlass]

    notice.view.backgroundColor = .clear
    notice.view.isUserInteractionEnabled = false
    notice.sizingOptions = .intrinsicContentSize
    notice.view.translatesAutoresizingMaskIntoConstraints = false
    addChild(notice)
    view.addSubview(notice.view)
    notice.didMove(toParent: self)
    NSLayoutConstraint.activate([
      notice.view.topAnchor.constraint(equalTo: close.bottomAnchor, constant: 8),
      notice.view.leadingAnchor.constraint(equalTo: view.leadingAnchor),
      notice.view.trailingAnchor.constraint(equalTo: view.trailingAnchor),
    ])

    if !zooms {
      // The zoom's pull is the system's; faded in, it is this one.
      let pull = UIPanGestureRecognizer(target: self, action: #selector(pulled(_:)))
      pull.delegate = self
      view.addGestureRecognizer(pull)
    }
    showing()
    follow()
  }

  deinit {
    for task in following { task.cancel() }
  }

  // Zooming, the buttons come once it is open and go as it closes, so
  // the photo alone goes back to its place.

  override func viewWillAppear(_ animated: Bool) {
    super.viewWillAppear(animated)
    guard zooms, let coordinator = transitionCoordinator else { return }
    showChrome(false)
    coordinator.animate { _ in self.showChrome(true) }
  }

  override func viewWillDisappear(_ animated: Bool) {
    super.viewWillDisappear(animated)
    if isBeingDismissed { leaving() }
    guard zooms, let coordinator = transitionCoordinator else { return }
    UIView.animate(withDuration: 0.15) { self.showChrome(false) }
    coordinator.animate(alongsideTransition: nil) { context in
      // The pull let go of: open again.
      if context.isCancelled { UIView.animate(withDuration: 0.15) { self.showChrome(true) } }
    }
  }

  /// Its place shown again as soon as it is sure to close, not once it is
  /// gone: the zoom fades into the photo there as it lands, then settles
  /// for a second more before it is gone, the place left empty all that
  /// while. Pulled down, only once let go of to close, not while it
  /// follows the finger away from its place.
  private func leaving() {
    guard let coordinator = transitionCoordinator, coordinator.isInteractive else {
      PhotoSpots.shared.open = nil
      return
    }
    coordinator.notifyWhenInteractionChanges { context in
      if !context.isCancelled { PhotoSpots.shared.open = nil }
    }
  }

  private func showChrome(_ shown: Bool) {
    for view in chrome { view.alpha = shown && !chromeHidden ? 1 : 0 }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    guard isBeingDismissed else { return }
    // Following no more lets go of the socket.
    for task in following { task.cancel() }
    ahead.stop()
    PhotoSpots.shared.open = nil
    onClosed?()
  }

  /// The system's glass button, round, with only its symbol shown.
  private static func button(
    _ title: String, systemImage: String, action: @escaping () -> Void
  ) -> UIButton {
    var configuration = UIButton.Configuration.glass()
    configuration.image = UIImage(
      systemName: systemImage,
      withConfiguration: UIImage.SymbolConfiguration(textStyle: .title3, scale: .default)
        .applying(UIImage.SymbolConfiguration(weight: .semibold)))
    configuration.baseForegroundColor = .white
    configuration.cornerStyle = .capsule
    let button = UIButton(configuration: configuration, primaryAction: UIAction { _ in action() })
    button.accessibilityLabel = title
    NSLayoutConstraint.activate([
      button.widthAnchor.constraint(equalToConstant: 48),
      button.heightAnchor.constraint(equalToConstant: 48),
    ])
    return button
  }

  private func page(_ item: ChatPhotoItem) -> PhotoPage {
    let page = PhotoPage(item, writer: names[item.authorID], groupID: groupID, calls: calls)
    page.onTap = { [weak self] in self?.toggleChrome() }
    return page
  }

  /// The page shown has changed, or where it is among the chat's photos:
  /// its count, its place left empty, the next pages asked for and the
  /// photos about to be swiped to fetched ahead.
  private func showing() {
    guard let shown else { return }
    if let place = run.place, place.of > 1 {
      counter.text = "\(place.number) / \(place.of)"
      counter.accessibilityLabel = "\(place.of)枚中\(place.number)枚目"
      counterGlass.isHidden = false
      shown.place = counter.accessibilityLabel
    } else {
      counterGlass.isHidden = true
      shown.place = nil
    }
    // Faded in too, so pulled down it leaves no second of it behind.
    PhotoSpots.shared.open = shown.photo.id
    guard let index = run.index else { return }
    let near = run.photos[max(index - 2, 0)...min(index + 2, run.photos.count - 1)]
    ahead.whole(near.map(\.photo), in: groupID, calls: calls)
    guard let pager, let client else { return }
    for ask in run.asks() {
      Task {
        let asked = await client.requestPhotos(
          of: pager.threadID, seq: ask.seq, after: ask.after)
        if !asked { run.unasked(ask) }
      }
    }
  }

  /// The chat's photos as pages of them come and its lines change, until
  /// closed. Covering the chat, they hold its place's socket themselves.
  private func follow() {
    guard let pager else { return }
    following.append(
      Task { [weak self] in
        await pager.follow(
          opened: { client in
            self?.client = client
            self?.showing()
          },
          change: { edit in self?.changed(edit) })
      })
  }

  /// The photos after `change`: the one shown again should it have gone,
  /// closed once none is left, and the pages next to it asked for again
  /// once there are more of them.
  private func changed(_ change: (inout PhotoRun) -> Void) {
    let ends = (run.photos.first?.seq, run.photos.last?.seq)
    change(&run)
    guard let seq = run.shown, let item = run.photos.first(where: { $0.seq == seq }) else {
      if !isBeingDismissed { dismiss(animated: true) }
      return
    }
    if shown?.item.seq != seq {
      pages.setViewControllers([page(item)], direction: .forward, animated: false)
    } else if ends != (run.photos.first?.seq, run.photos.last?.seq) {
      // The page view asks again for the pages beside the one shown,
      // which it remembers as none at an end.
      pages.dataSource = nil
      pages.dataSource = self
    }
    showing()
  }

  /// VoiceOver's scrub, two fingers in a Z, closes it, as its × does.
  override func accessibilityPerformEscape() -> Bool {
    dismiss(animated: true)
    return true
  }

  /// A tap shows or hides the buttons, as Photos does; not with VoiceOver,
  /// whose double tap on the photo would take its buttons out of reach.
  private func toggleChrome() {
    guard !UIAccessibility.isVoiceOverRunning else { return }
    chromeHidden.toggle()
    UIView.animate(withDuration: 0.2) {
      for view in self.chrome { view.alpha = self.chromeHidden ? 0 : 1 }
      self.setNeedsStatusBarAppearanceUpdate()
    }
  }

  // MARK: Pages

  func pageViewController(
    _ pageViewController: UIPageViewController,
    viewControllerBefore viewController: UIViewController
  ) -> UIViewController? {
    guard let at = viewController as? PhotoPage,
      let index = run.photos.firstIndex(where: { $0.seq == at.item.seq }), index > 0
    else { return nil }
    return page(run.photos[index - 1])
  }

  func pageViewController(
    _ pageViewController: UIPageViewController,
    viewControllerAfter viewController: UIViewController
  ) -> UIViewController? {
    guard let at = viewController as? PhotoPage,
      let index = run.photos.firstIndex(where: { $0.seq == at.item.seq }),
      index < run.photos.count - 1
    else { return nil }
    return page(run.photos[index + 1])
  }

  func pageViewController(
    _ pageViewController: UIPageViewController, didFinishAnimating finished: Bool,
    previousViewControllers: [UIViewController], transitionCompleted completed: Bool
  ) {
    guard completed, let shown else { return }
    run.show(shown.item.seq)
    showing()
    // VoiceOver reads the photo swiped to, and where it is among them.
    UIAccessibility.post(
      notification: .pageScrolled,
      argument: [shown.voiceLabel, shown.place].compactMap(\.self).joined(separator: "、"))
  }

  // MARK: Save and share

  private func save() {
    guard let onSave, let photo = shown?.photo else { return }
    Task {
      if await onSave(photo) {
        saved.notificationOccurred(.success)
        say("写真を保存しました")
      } else {
        say("保存できませんでした")
      }
    }
  }

  /// The system's share sheet, with the photo itself.
  private func share() {
    guard let shown else { return }
    Task {
      guard let image = await shown.wholeImage() else {
        say("共有できませんでした")
        return
      }
      let sheet = UIActivityViewController(activityItems: [image], applicationActivities: nil)
      present(sheet, animated: true)
    }
  }

  private func say(_ words: String) {
    withAnimation { noticeWords.words = words }
    Task {
      try? await Task.sleep(for: .seconds(2.5))
      if noticeWords.words == words {
        withAnimation { noticeWords.words = nil }
      }
    }
  }

  // MARK: Pulled down, with motion reduced

  func gestureRecognizerShouldBegin(_ gesture: UIGestureRecognizer) -> Bool {
    guard let pan = gesture as? UIPanGestureRecognizer, shown?.zoomedIn != true else {
      return false
    }
    let speed = pan.velocity(in: view)
    return speed.y > abs(speed.x)
  }

  @objc private func pulled(_ pan: UIPanGestureRecognizer) {
    guard let page = shown?.view else { return }
    let moved = pan.translation(in: view)
    switch pan.state {
    case .changed:
      page.transform = CGAffineTransform(translationX: moved.x, y: moved.y)
      view.backgroundColor = .black.withAlphaComponent(1 - min(max(moved.y, 0) / 400, 0.6))
    case .ended where moved.y > Self.closeAt || pan.velocity(in: view).y > Self.closeSpeed:
      dismiss(animated: true)
    default:
      UIView.animate(withDuration: 0.3, delay: 0, usingSpringWithDamping: 1, initialSpringVelocity: 0)
      {
        page.transform = .identity
        self.view.backgroundColor = .black
      }
    }
  }
}

/// One photo large, zoomed by the system's scroll view.
private final class PhotoPage: UIViewController, UIScrollViewDelegate {
  let item: ChatPhotoItem
  var photo: LinePhoto { item.photo }
  var onTap: (() -> Void)?
  /// Who sent it, said by VoiceOver.
  private let writer: String?
  /// Where it is among the photos, said by VoiceOver after it.
  var place: String? {
    didSet { picture.accessibilityValue = place }
  }
  private let groupID: String
  private let calls: GroupCalls
  private let scroll = UIScrollView()
  private let picture = UIImageView()
  private let spinner = UIActivityIndicatorView(style: .large)
  /// ↻, fetching it again, once it could not be fetched, as in the chat.
  private let retry = UIButton(type: .system)
  /// The photo itself, once it has come.
  private var image: UIImage?
  /// Fetching it, let go of as the page is.
  private var loading: Task<Void, Never>?
  private var laidOutFor: CGSize = .zero

  /// How far it zooms in: as far as Signal's, and a double tap half way.
  private static let deepest: CGFloat = 4
  private static let tapped: CGFloat = 2

  init(_ item: ChatPhotoItem, writer: String?, groupID: String, calls: GroupCalls) {
    self.item = item
    self.writer = writer
    self.groupID = groupID
    self.calls = calls
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

  deinit { loading?.cancel() }

  var zoomedIn: Bool { scroll.zoomScale > scroll.minimumZoomScale + 0.01 }

  override func viewDidLoad() {
    super.viewDidLoad()
    view.backgroundColor = .clear
    scroll.frame = view.bounds
    scroll.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    scroll.delegate = self
    scroll.minimumZoomScale = 1
    scroll.maximumZoomScale = Self.deepest
    scroll.showsHorizontalScrollIndicator = false
    scroll.showsVerticalScrollIndicator = false
    scroll.contentInsetAdjustmentBehavior = .never
    scroll.decelerationRate = .fast
    view.addSubview(scroll)

    picture.contentMode = .scaleAspectFit
    // What the chat holds of it shows at once, sharp or blurred.
    picture.image = ChatPhotoLoading.held(
      photo, in: groupID, scale: traitCollection.displayScale, calls: calls)
    picture.isAccessibilityElement = true
    picture.accessibilityLabel = voiceLabel
    picture.accessibilityTraits = .image
    // The pinch and the double tap's zoom, for VoiceOver, which pans the
    // zoomed photo by three fingers as the scroll view's own.
    picture.accessibilityCustomActions = [
      UIAccessibilityCustomAction(name: "拡大") { [weak self] _ in self?.zoom(in: true) ?? false },
      UIAccessibilityCustomAction(name: "元の大きさに戻す") { [weak self] _ in
        self?.zoom(in: false) ?? false
      },
    ]
    scroll.addSubview(picture)

    spinner.color = .white
    spinner.hidesWhenStopped = true
    spinner.translatesAutoresizingMaskIntoConstraints = false
    view.addSubview(spinner)
    NSLayoutConstraint.activate([
      spinner.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      spinner.centerYAnchor.constraint(equalTo: view.centerYAnchor),
    ])
    if picture.image == nil { spinner.startAnimating() }

    var look = UIButton.Configuration.filled()
    look.image = UIImage(
      systemName: "arrow.clockwise", withConfiguration: UIImage.SymbolConfiguration(weight: .semibold))
    look.cornerStyle = .capsule
    look.baseBackgroundColor = UIColor.black.withAlphaComponent(0.5)
    look.baseForegroundColor = .white
    retry.configuration = look
    retry.accessibilityLabel = "写真をもう一度読み込む"
    retry.isHidden = true
    retry.translatesAutoresizingMaskIntoConstraints = false
    retry.addAction(UIAction { [weak self] _ in self?.startLoading() }, for: .primaryActionTriggered)
    view.addSubview(retry)
    NSLayoutConstraint.activate([
      retry.centerXAnchor.constraint(equalTo: view.centerXAnchor),
      retry.centerYAnchor.constraint(equalTo: view.centerYAnchor),
      retry.widthAnchor.constraint(equalToConstant: 48),
      retry.heightAnchor.constraint(equalToConstant: 48),
    ])

    let twice = UITapGestureRecognizer(target: self, action: #selector(tappedTwice(_:)))
    twice.numberOfTapsRequired = 2
    scroll.addGestureRecognizer(twice)
    let once = UITapGestureRecognizer(target: self, action: #selector(tappedOnce))
    once.require(toFail: twice)
    scroll.addGestureRecognizer(once)

    startLoading()
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard scroll.bounds.size != laidOutFor else { return }
    laidOutFor = scroll.bounds.size
    fit()
  }

  /// The photo's shape: its own once it has come, else as it was sent.
  private var shape: CGSize {
    if let image { return image.size }
    if photo.width > 1, photo.height > 1 { return CGSize(width: photo.width, height: photo.height) }
    return picture.image?.size ?? CGSize(width: 1, height: 1)
  }

  /// Whole in the screen, zoomed out.
  private func fit() {
    let room = scroll.bounds.size
    guard room.width > 0, room.height > 0 else { return }
    scroll.zoomScale = 1
    let scale = min(room.width / shape.width, room.height / shape.height)
    let size = CGSize(width: shape.width * scale, height: shape.height * scale)
    picture.frame = CGRect(origin: .zero, size: size)
    scroll.contentSize = size
    center()
  }

  /// Kept in the middle while smaller than the screen.
  private func center() {
    let room = scroll.bounds.size
    let size = scroll.contentSize
    let x = max((room.width - size.width) / 2, 0)
    let y = max((room.height - size.height) / 2, 0)
    scroll.contentInset = UIEdgeInsets(top: y, left: x, bottom: y, right: x)
  }

  /// Where the photo is drawn, in `space`.
  func photoFrame(in space: UIView) -> CGRect {
    picture.convert(picture.bounds, to: space)
  }

  func viewForZooming(in scrollView: UIScrollView) -> UIView? { picture }

  func scrollViewDidZoom(_ scrollView: UIScrollView) { center() }

  @objc private func tappedOnce() { onTap?() }

  /// Whose photo, of what shape, and when, as VoiceOver says it.
  var voiceLabel: String {
    let day = Day(item.sentAt, in: .current)
    let ms = Int64(item.sentAt.timeIntervalSince1970 * 1000)
    let when = "\(ChatTime.day(day)) \(ChatTime.clock(ms))"
    return [writer.map { "\($0)の\(photoWords(photo))" } ?? photoWords(photo), when]
      .joined(separator: "、")
  }

  /// In on its middle a step at a time, as far as it goes, or back out,
  /// for VoiceOver; false when it is as far as it goes.
  private func zoom(in closer: Bool) -> Bool {
    let scale =
      closer
      ? min(scroll.zoomScale * Self.tapped, scroll.maximumZoomScale) : scroll.minimumZoomScale
    guard abs(scale - scroll.zoomScale) > 0.01 else { return false }
    scroll.setZoomScale(scale, animated: !UIAccessibility.isReduceMotionEnabled)
    UIAccessibility.post(
      notification: .announcement, argument: closer ? "\(Int(scale * 100))%" : "元の大きさ")
    return true
  }

  /// In on the point tapped, or back out.
  @objc private func tappedTwice(_ tap: UITapGestureRecognizer) {
    if zoomedIn {
      scroll.setZoomScale(scroll.minimumZoomScale, animated: true)
      return
    }
    let point = tap.location(in: picture)
    let size = CGSize(
      width: scroll.bounds.width / Self.tapped, height: scroll.bounds.height / Self.tapped)
    scroll.zoom(
      to: CGRect(
        x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width,
        height: size.height), animated: true)
  }

  private func startLoading() {
    retry.isHidden = true
    if picture.image == nil { spinner.startAnimating() }
    loading?.cancel()
    loading = Task { await load() }
  }

  /// The photo itself, over what showed while it came, fading in over its
  /// blur as it does in the chat; ↻ in its place could it not come.
  private func load() async {
    let request = ChatPhotoLoading.request(
      photo, in: groupID, pixels: nil, calls: calls, priority: .high,
      held: ChatPhotos.heldFile(photo.id, in: groupID) != nil)
    guard let came = try? await ChatPhotoLoading.pipeline.image(for: request) else {
      spinner.stopAnimating()
      retry.isHidden = Task.isCancelled
      return
    }
    let reshaped =
      abs(came.size.width / came.size.height - shape.width / shape.height) > 0.01
    let over = picture.image != nil
    image = came
    spinner.stopAnimating()
    if reshaped { fit() }
    guard over, photo.thumbHash != nil else {
      picture.image = came
      return
    }
    UIView.transition(
      with: picture, duration: Double(Chat.photoFadeMs) / 1000, options: .transitionCrossDissolve
    ) {
      self.picture.image = came
    }
  }

  /// The photo itself, for sharing: once it has come, else fetched now.
  func wholeImage() async -> UIImage? {
    if let image { return image }
    return await ChatPhotoLoading.whole(photo, in: groupID, calls: calls).flatMap { UIImage(data: $0) }
  }
}

@MainActor @Observable private final class NoticeWords {
  var words: String?
}

/// What a save or a share did, said over the photo as the screen under it
/// is covered.
private struct ViewerNotice: View {
  let words: NoticeWords
  let colors: ThemeColors

  var body: some View {
    // As wide as the screen, the words in its middle.
    ZStack {
      if let words = words.words {
        NoticeCapsule(words: words)
          .comesAsNotice()
      }
    }
    .frame(maxWidth: .infinity)
    .environment(\.themeColors, colors)
  }
}
