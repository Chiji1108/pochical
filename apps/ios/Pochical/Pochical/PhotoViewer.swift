import PochicalDesign
import PochicalKit
import SwiftUI
import UIKit

// A photo opened large (spec/chat.md, Photos; /design's PhotoViewer), as
// Photos, Signal and Telegram open one: whole on black, pinched or tapped
// twice to zoom, swiped to the chat's photos before and after it, opened
// from its place in the chat and closed back to it, following the finger
// pulling it down. The system's own pieces do it: a zoom transition, a page
// view controller, a scroll view's zooming.

/// The photos opened large: the chat's, in the order of its lines, and
/// the one tapped among them.
struct PhotoViewing: Identifiable {
  let photos: [LinePhoto]
  let start: Int
  var id: String { photos[start].id }

  /// `photo` among `photos`, or alone when it is not one of them.
  init(_ photo: LinePhoto, among photos: [LinePhoto] = []) {
    if let index = photos.firstIndex(where: { $0.id == photo.id }) {
      self.photos = photos
      start = index
    } else {
      self.photos = [photo]
      start = 0
    }
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
  private let photos: [LinePhoto]
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
    photos = viewing.photos
    self.groupID = groupID
    self.calls = calls
    self.zooms = zooms
    self.onSave = onSave
    notice = UIHostingController(rootView: ViewerNotice(words: noticeWords, colors: colors))
    super.init(nibName: nil, bundle: nil)
    pages.setViewControllers([page(viewing.start)], direction: .forward, animated: false)
    if zooms {
      let options = UIViewController.Transition.ZoomOptions()
      // Not while zoomed in, which a drag pans.
      options.interactiveDismissShouldBegin = { [weak self] _ in
        self?.shown?.zoomedIn != true
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
    pages.dataSource = photos.count > 1 ? self : nil
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
    counterGlass.isHidden = photos.count < 2
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
    guard zooms, let coordinator = transitionCoordinator else { return }
    UIView.animate(withDuration: 0.15) { self.showChrome(false) }
    coordinator.animate(alongsideTransition: nil) { context in
      // The pull let go of: open again.
      if context.isCancelled { UIView.animate(withDuration: 0.15) { self.showChrome(true) } }
    }
  }

  private func showChrome(_ shown: Bool) {
    for view in chrome { view.alpha = shown && !chromeHidden ? 1 : 0 }
  }

  override func viewDidDisappear(_ animated: Bool) {
    super.viewDidDisappear(animated)
    guard isBeingDismissed else { return }
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

  private func page(_ index: Int) -> PhotoPage {
    let page = PhotoPage(photos[index], index: index, groupID: groupID, calls: calls)
    page.onTap = { [weak self] in self?.toggleChrome() }
    return page
  }

  /// The page shown has changed: its count, and its place left empty.
  private func showing() {
    guard let shown else { return }
    counter.text = "\(shown.index + 1) / \(photos.count)"
    counter.accessibilityLabel = "\(photos.count)枚中\(shown.index + 1)枚目"
    // Faded in too, so pulled down it leaves no second of it behind.
    PhotoSpots.shared.open = shown.photo.id
  }

  /// A tap shows or hides the buttons, as Photos does.
  private func toggleChrome() {
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
    guard let at = viewController as? PhotoPage, at.index > 0 else { return nil }
    return page(at.index - 1)
  }

  func pageViewController(
    _ pageViewController: UIPageViewController,
    viewControllerAfter viewController: UIViewController
  ) -> UIViewController? {
    guard let at = viewController as? PhotoPage, at.index < photos.count - 1 else { return nil }
    return page(at.index + 1)
  }

  func pageViewController(
    _ pageViewController: UIPageViewController, didFinishAnimating finished: Bool,
    previousViewControllers: [UIViewController], transitionCompleted completed: Bool
  ) {
    if completed { showing() }
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
  let photo: LinePhoto
  let index: Int
  var onTap: (() -> Void)?
  private let groupID: String
  private let calls: GroupCalls
  private let scroll = UIScrollView()
  private let picture = UIImageView()
  private let spinner = UIActivityIndicatorView(style: .large)
  /// The photo itself, once it has come.
  private var image: UIImage?
  private var laidOutFor: CGSize = .zero

  /// How far it zooms in: as far as Signal's, and a double tap half way.
  private static let deepest: CGFloat = 4
  private static let tapped: CGFloat = 2

  init(_ photo: LinePhoto, index: Int, groupID: String, calls: GroupCalls) {
    self.photo = photo
    self.index = index
    self.groupID = groupID
    self.calls = calls
    super.init(nibName: nil, bundle: nil)
  }

  @available(*, unavailable)
  required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

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
    picture.image = ChatPhotoImage.held(photo, scale: traitCollection.displayScale)
    picture.isAccessibilityElement = true
    picture.accessibilityLabel = "写真"
    picture.accessibilityTraits = .image
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

    let twice = UITapGestureRecognizer(target: self, action: #selector(tappedTwice(_:)))
    twice.numberOfTapsRequired = 2
    scroll.addGestureRecognizer(twice)
    let once = UITapGestureRecognizer(target: self, action: #selector(tappedOnce))
    once.require(toFail: twice)
    scroll.addGestureRecognizer(once)

    Task { await load() }
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

  /// The photo itself, over what showed while it came, fading in over its
  /// blur as it does in the chat.
  private func load() async {
    guard let data = try? await calls.photo(photo.id, in: groupID),
      let came = await UIImage(data: data)?.byPreparingForDisplay()
    else {
      spinner.stopAnimating()
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
    guard let data = try? await calls.photo(photo.id, in: groupID) else { return nil }
    return UIImage(data: data)
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
          .transition(.opacity.combined(with: .move(edge: .top)))
      }
    }
    .frame(maxWidth: .infinity)
    .environment(\.themeColors, colors)
  }
}
