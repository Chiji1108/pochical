import PochicalKit
import SwiftUI
import UIKit

// The app's navigation over its tabs, as LINE's and Telegram's: a chat,
// and what a chat opens, are pushed over the tabs rather than inside one,
// so the tab bar goes away with the screen under it as the chat comes, and
// comes back as it goes, a back swipe included (spec/chat.md, The chat's
// page). A UINavigationController whose root hosts the tabs: SwiftUI has
// no stack over a TabView whose tabs keep stacks of their own (a
// NavigationStack in another is not supported, and on iOS 27 a push from
// the outer one stops the app), while UIKit's is a view controller like
// any, the tabs and their stacks kept whole under it. A chat outside the
// TabView keeps its view's keyboard layout guide too, which a view inside
// it loses for good once the app has been in the background (POC-117).

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
  var photoGroupID: String {
    guard let placeID, placeID != ChatPlace.supportID else { return "" }
    return placeID
  }
}

/// A chat whose photos are listed alone (ChatPhotosScreen).
struct PhotosOfChat: Hashable {
  let placeID: String
  let threadID: String
  /// Who wrote each photo's line, by id, for VoiceOver to say whose it is.
  let names: [String: String]
}

/// The pages over the tabs, bottom first, as the navigation has them
/// (a back swipe included), and the way to open more.
@MainActor @Observable final class RootNavigator {
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

  /// Shows `pages` over the tabs, and nothing else: a notification's chat,
  /// or the tabs alone once a link opens one of them.
  func show(_ pages: [RootPage]) {
    self.pages = pages
    controller?.show(pages)
  }

  /// The pages as the navigation has them now, after a back.
  fileprivate func shown(_ pages: [RootPage]) {
    if self.pages != pages { self.pages = pages }
  }
}

extension EnvironmentValues {
  /// The navigation over the tabs, for a page to open another over them.
  @Entry var rootNavigator: RootNavigator?
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
    controller.show(navigator.pages)
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
    // The tabs' own stacks have their bars; this one's is for the pages.
    setNavigationBarHidden(true, animated: false)
  }

  /// The hosts of the pages over the tabs.
  private var hosts: [PageHost] { viewControllers.compactMap { $0 as? PageHost } }

  func update(tabs: AnyView, page: @escaping (RootPage) -> AnyView) {
    self.page = page
    self.tabs.rootView = tabs
    for host in hosts { host.rootView = page(host.page) }
  }

  /// Puts `pages` over the tabs, keeping those already there in the same
  /// place, so a page under the one opened stays as it was.
  func show(_ pages: [RootPage]) {
    let open = hosts
    var kept = 0
    while kept < min(open.count, pages.count), open[kept].page == pages[kept] { kept += 1 }
    guard kept < open.count || kept < pages.count else { return }
    let made = pages[kept...].map { PageHost(page: $0, view: page($0)) }
    let controllers: [UIViewController] = [tabs] + open[..<kept].map { $0 } + made
    setViewControllers(controllers, animated: view.window != nil)
  }

  func navigationController(
    _ navigationController: UINavigationController, willShow viewController: UIViewController,
    animated: Bool
  ) {
    setNavigationBarHidden(viewController === tabs, animated: animated)
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
