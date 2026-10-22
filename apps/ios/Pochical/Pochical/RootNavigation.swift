import PochicalKit
import SwiftUI
import UIKit

// The app's one navigation, as LINE's and Telegram's: every page is pushed
// over the tabs rather than inside one, so the tab bar goes away with the
// screen under it as the page comes, and comes back as it goes, a back
// swipe included (spec/chat.md, The chat's page). A UINavigationController
// whose root hosts the tabs, which keep no stacks of their own: its one bar
// is the tabs' bar too, holding the tab's title and buttons, and is never
// hidden or shown as a page comes or goes, which would take the edge
// effect off the page coming for as long as it comes (POC-157). A chat
// outside the TabView keeps its view's keyboard layout guide too, which a
// view inside it loses for good once the app has been in the background
// (POC-117).

/// A page over the tabs.
enum RootPage: Hashable {
  /// One of a group's pages: its chats, and what a chat opens
  /// (みんなのシフト, the group's settings and what they open).
  case group(GroupRoute)
  /// The chat with Pochical's people.
  case support
  /// A chat's photos alone, from its ⋯.
  case photos(PhotosOfChat)

  /// The chat the page is, for a chat opened again to be gone back to.
  var chat: OpenedChat? {
    switch self {
    case .group(.chat(let group, let thread, _, _)):
      OpenedChat(groupID: group.id, threadID: thread)
    case .support: OpenedChat(groupID: ChatPlace.supportID, threadID: groupThread)
    case .group, .photos: nil
    }
  }

  /// The place the page is of, whose socket is held while it shows.
  var placeID: String? {
    switch self {
    case .group(let route): route.group?.id
    case .support: ChatPlace.supportID
    case .photos(let photos): photos.placeID
    }
  }

  /// The group whose photos the page's faces are (MemberAvatar): none in
  /// the chat with Pochical's people.
  var photoShelf: PhotoShelf? {
    guard let placeID, placeID != ChatPlace.supportID else { return nil }
    return .group(placeID)
  }
}

/// A page on the stack over the tabs: one opened by the navigator, or one
/// a NavigationLink in another opened, which SwiftUI pushes on the same
/// stack, known by the controller it shows it in.
enum StackPage: Hashable {
  case root(RootPage)
  case linked(ObjectIdentifier)

  fileprivate var root: RootPage? {
    if case .root(let page) = self { page } else { nil }
  }
}

/// A chat whose photos are listed alone (ChatPhotosScreen).
struct PhotosOfChat: Hashable {
  let placeID: String
  let threadID: String
  /// Who wrote each photo's line, by id, for VoiceOver to say whose it is.
  let names: [String: String]
}

/// The tab shown and the pages over it, bottom first, as the navigation
/// has them (a link's and a back swipe included), and the way to open
/// more.
@MainActor @Observable final class RootNavigator {
  private(set) var tab = RootTab.calendar
  private(set) var pages: [StackPage] = []
  @ObservationIgnored fileprivate weak var controller: RootNavigationController?

  /// Opens `page` over those open. A chat already open below, as when its
  /// day is shared from みんなのシフト opened from it, is gone back to and
  /// opened again with what it brings, rather than opened twice.
  func open(_ page: RootPage) {
    var kept = pages
    if let chat = page.chat, let below = kept.firstIndex(where: { $0.root?.chat == chat }) {
      kept.removeSubrange(below...)
    }
    show(stack: kept + [.root(page)], over: nil)
  }

  /// Shows `pages` over `tab`, and nothing else: a notification's chat
  /// over its tab, or a tab alone once a link opens it. Another tab is gone
  /// to at once, as a tap on it does, rather than with a push.
  func show(_ pages: [RootPage], over tab: RootTab? = nil) {
    show(stack: pages.map(StackPage.root), over: tab)
  }

  private func show(stack pages: [StackPage], over tab: RootTab?) {
    let jump = tab.map { $0 != self.tab } ?? false
    if let tab { self.tab = tab }
    self.pages = pages
    controller?.show(pages, over: self.tab, animated: !jump)
  }

  /// The top page of a place, whose socket is held while it shows: a
  /// linked page is of the place of the page it was opened from.
  var placePage: RootPage? {
    pages.last { $0.root != nil }?.root
  }

  /// The pages as the navigation has them now, after a link or a back.
  fileprivate func shown(_ pages: [StackPage]) {
    if self.pages != pages { self.pages = pages }
  }
}

extension EnvironmentValues {
  /// The navigation over the tabs, for a page to open another over them.
  @Entry var rootNavigator: RootNavigator?
  /// How far down the screen the bar's top is, for a tab to head itself in
  /// the bar's band (GroupsScreen).
  @Entry var barTop: CGFloat = 0
}

/// The tabs, under the pages `navigator` has over them. Each page and the
/// tabs are hosted by UIKit, which gives them an environment of their own:
/// `hosted` puts the app's in it again.
struct RootNavigation: UIViewControllerRepresentable {
  let navigator: RootNavigator
  let tabs: AnyView
  let page: (RootPage) -> AnyView

  func makeUIViewController(context: Context) -> RootNavigationController {
    let controller = RootNavigationController(tabs: tabs, page: page)
    navigator.controller = controller
    controller.onShown = { [weak navigator] in navigator?.shown($0) }
    controller.show(navigator.pages, over: navigator.tab, animated: false)
    return controller
  }

  func updateUIViewController(_ controller: RootNavigationController, context: Context) {
    navigator.controller = controller
    controller.update(tabs: tabs, page: page)
  }
}

final class RootNavigationController: UINavigationController, UINavigationControllerDelegate {
  private let tabs: UIHostingController<AnyView>
  private var page: (RootPage) -> AnyView
  var onShown: ([StackPage]) -> Void = { _ in }

  init(tabs: AnyView, page: @escaping (RootPage) -> AnyView) {
    self.tabs = UIHostingController(rootView: tabs)
    self.page = page
    super.init(rootViewController: self.tabs)
  }

  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    delegate = self
  }

  /// The pages over the tabs, as each controller over them shows one.
  private var shown: [StackPage] {
    viewControllers.dropFirst().map {
      ($0 as? PageHost).map { .root($0.page) } ?? .linked(ObjectIdentifier($0))
    }
  }

  func update(tabs: AnyView, page: @escaping (RootPage) -> AnyView) {
    self.page = page
    self.tabs.rootView = tabs
    for case let host as PageHost in viewControllers { host.rootView = page(host.page) }
  }

  /// Puts `pages` over the tabs, keeping those already there in the same
  /// place, so a page under the one opened stays as it was. The calendar,
  /// which its month heads, has no bar: hidden only while it shows alone,
  /// so never as a page comes or goes.
  func show(_ pages: [StackPage], over tab: RootTab, animated: Bool) {
    let open = Array(viewControllers.dropFirst())
    let openPages = shown
    var kept = 0
    while kept < min(open.count, pages.count), openPages[kept] == pages[kept] { kept += 1 }
    if kept < open.count || kept < pages.count {
      // A link's page above those kept went with the page it was opened
      // from, and is not made again.
      let made = pages[kept...].compactMap(\.root).map { PageHost(page: $0, view: page($0)) }
      setViewControllers([tabs] + open[..<kept] + made, animated: animated && view.window != nil)
    }
    setNavigationBarHidden(tab == .calendar && pages.isEmpty, animated: false)
  }

  func navigationController(
    _ navigationController: UINavigationController, didShow viewController: UIViewController,
    animated: Bool
  ) {
    onShown(shown)
  }
}

/// A page over the tabs.
private final class PageHost: UIHostingController<AnyView> {
  let page: RootPage

  init(page: RootPage, view: AnyView) {
    self.page = page
    super.init(rootView: view)
  }

  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }
}

extension View {
  /// A tab's root, whose scroll view the one bar follows while it shows.
  func tabRoot() -> some View {
    background(TabScrollViewForBar())
  }
}

/// The scroll view of the tab shown, given to the screen under the
/// navigation (the tabs) for its bar to follow, as the tab appears: the
/// TabView keeps each tab under a tab bar controller of its own, below the
/// tabs' host, which UIKit's search for the bar's scroll view does not
/// reach. A chat's lines say theirs the same way (ChatController).
private struct TabScrollViewForBar: UIViewControllerRepresentable {
  func makeUIViewController(context: Context) -> Controller { Controller() }
  func updateUIViewController(_ controller: Controller, context: Context) {}

  final class Controller: UIViewController {
    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      var tab = parent
      while let next = tab?.parent, !(next is UITabBarController) { tab = next }
      tab?.parent?.pageInNavigation?.setContentScrollView(
        tab?.contentScrollView(for: .top), for: .top)
    }
  }
}

extension UIViewController {
  /// The page this controller is in, right under its navigation: the one
  /// whose content scroll view the bar follows.
  var pageInNavigation: UIViewController? {
    var page: UIViewController? = self
    while let next = page?.parent, !(next is UINavigationController) { page = next }
    return page
  }
}
