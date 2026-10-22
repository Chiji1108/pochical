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
  /// A page a link in another opened (PageLink), drawn by that link.
  case linked(LinkedPage)

  /// The chat the page is, for a chat opened again to be gone back to.
  var chat: OpenedChat? {
    switch self {
    case .group(.chat(let group, let thread, _, _)):
      OpenedChat(groupID: group.id, threadID: thread)
    case .support: OpenedChat(groupID: ChatPlace.supportID, threadID: groupThread)
    case .group, .photos, .linked: nil
    }
  }

  /// The place the page is of, whose socket is held while it shows; none
  /// for a linked page, which is of the place of the page it was opened
  /// from.
  var placeID: String? {
    switch self {
    case .group(let route): route.group?.id
    case .support: ChatPlace.supportID
    case .photos(let photos): photos.placeID
    case .linked: nil
    }
  }

  /// The group whose photos the page's faces are (MemberAvatar): none in
  /// the chat with Pochical's people.
  var photoShelf: PhotoShelf? {
    guard let placeID, placeID != ChatPlace.supportID else { return nil }
    return .group(placeID)
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
/// has them (a back swipe included), and the way to open more: every page
/// over the tabs is pushed through it, so it can take any away again.
@MainActor @Observable final class RootNavigator {
  private(set) var tab = RootTab.calendar
  private(set) var pages: [RootPage] = []
  @ObservationIgnored fileprivate weak var controller: RootNavigationController?

  /// Opens `page` over those open. A chat already open below, as when its
  /// day is shared from みんなのシフト opened from it, is gone back to and
  /// opened again with what it brings, rather than opened twice.
  func open(_ page: RootPage) {
    var kept = pages
    if let chat = page.chat, let below = kept.firstIndex(where: { $0.chat == chat }) {
      kept.removeSubrange(below...)
    }
    show(kept + [page])
  }

  /// Goes to `tab`, as a tap on it does: the pages, none while the tab
  /// bar shows, stay as they are. The TabView sets it back as it follows a
  /// tab gone to from here, which changes nothing.
  func select(_ tab: RootTab) {
    guard tab != self.tab else { return }
    self.tab = tab
    controller?.show(pages, over: tab, animated: false)
  }

  /// Puts `next` in place of `page` and what was opened over it, the
  /// way a page turns into the next of its flow (グループを作る into
  /// メンバーを招待); nothing once `page` has gone, so a request that ends
  /// after the person left takes them nowhere. Whether it was there.
  func replace(_ page: RootPage, with next: RootPage) -> Bool {
    guard let index = pages.lastIndex(of: page) else { return false }
    show(Array(pages[..<index]) + [next])
    return true
  }

  /// Takes away the pages of a place gone, as a group left, and what they
  /// opened; the rest stay as they are.
  func close(_ placeID: String) {
    guard let index = pages.firstIndex(where: { $0.placeID == placeID }) else { return }
    show(Array(pages[..<index]))
  }

  /// Shows `pages` over `tab`, and nothing else: a notification's chat
  /// over its tab, or a tab alone once a link opens it. Another tab is gone
  /// to at once, as a tap on it does, rather than with a push.
  func show(_ pages: [RootPage], over tab: RootTab? = nil) {
    let jump = tab.map { $0 != self.tab } ?? false
    if let tab { self.tab = tab }
    self.pages = pages
    controller?.show(pages, over: self.tab, animated: !jump)
  }

  /// The place of the top page that is of one, whose socket is held while
  /// it shows: a linked page is of the place of the page it was opened
  /// from, and グループを作る of the tab's.
  var placeID: String? {
    pages.lazy.compactMap(\.placeID).last
  }

  /// The group whose photos `page`'s faces are: a linked page's are
  /// those of the page it was opened from.
  func photoShelf(of page: RootPage) -> PhotoShelf? {
    guard case .linked = page else { return page.photoShelf }
    return pages.prefix { $0 != page }.last { $0.placeID != nil }?.photoShelf
  }

  /// The pages as the navigation has them now, after a back.
  fileprivate func shown(_ pages: [RootPage]) {
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
  var onShown: ([RootPage]) -> Void = { _ in }

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

  /// The hosts of the pages over the tabs.
  private var hosts: [PageHost] { viewControllers.compactMap { $0 as? PageHost } }

  func update(tabs: AnyView, page: @escaping (RootPage) -> AnyView) {
    self.page = page
    self.tabs.rootView = tabs
    for host in hosts { host.rootView = page(host.page) }
  }

  /// Puts `pages` over the tabs, keeping those already there in the same
  /// place, so a page under the one opened stays as it was. The calendar,
  /// which its month heads, has no bar: hidden only while it shows alone,
  /// so never as a page comes or goes.
  func show(_ pages: [RootPage], over tab: RootTab, animated: Bool) {
    let open = hosts
    var kept = 0
    while kept < min(open.count, pages.count), open[kept].page == pages[kept] { kept += 1 }
    if kept < open.count || kept < pages.count {
      let made = pages[kept...].map { PageHost(page: $0, view: page($0)) }
      let controllers: [UIViewController] = [tabs] + Array(open[..<kept]) + made
      setViewControllers(controllers, animated: animated && view.window != nil)
    }
    setNavigationBarHidden(tab == .calendar && pages.isEmpty, animated: false)
  }

  func navigationController(
    _ navigationController: UINavigationController, didShow viewController: UIViewController,
    animated: Bool
  ) {
    onShown(hosts.map(\.page))
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
