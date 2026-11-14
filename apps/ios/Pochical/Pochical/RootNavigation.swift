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
// (POC-117). SwiftUI's NavigationStack over a TabView, as of the iOS 27.1
// SDK, still takes the edge effect off a page pushed from the calendar, its
// bar shown with the push.
//
// On a wide screen, a regular width (an iPad, a large iPhone on its side,
// a folding one opened up), the tabs are the system's tab bar controller's,
// in its sidebar as iPadOS's own apps have their sections (RootController),
// and the pages of グループ and 設定 open beside the tab's screen, on a
// navigation of their own, as Mail and Settings do on an iPad: the first
// at its root, the rest pushed over it. Narrowed again, the pages go back
// over the tabs as they were.

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
  @ObservationIgnored fileprivate weak var controller: RootController?

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

  /// Goes to `tab`, as a tap on it does, without the pages: none while the
  /// tab bar shows over the tabs, and those of the tab left beside them on
  /// a wide screen. The TabView sets it back as it follows a tab gone to
  /// from here, which changes nothing.
  func select(_ tab: RootTab) {
    guard tab != self.tab else { return }
    self.tab = tab
    pages = []
    controller?.arrange(animated: false)
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
    controller?.arrange(animated: !jump)
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

/// The tabs, under the pages `navigator` has over them, or on a wide screen
/// in the system's sidebar, with the pages beside the tab. Each page, tab
/// and screen is hosted by UIKit, which gives them an environment of their
/// own: `hosted` puts the app's in it again.
struct RootNavigation: UIViewControllerRepresentable {
  let navigator: RootNavigator
  /// The tabs on a narrow screen, the tab bar under them.
  let tabs: AnyView
  /// Each tab's screen on a wide screen, with its title and buttons.
  let screen: (RootTab) -> AnyView
  /// The count on each tab, as the narrow screen's tab bar has it.
  let badges: [RootTab: Int]
  let page: (RootPage) -> AnyView
  /// What stands beside グループ or 設定 on a wide screen while no page is
  /// open.
  let nothingOpen: (RootTab) -> AnyView

  func makeUIViewController(context: Context) -> RootController {
    RootController(
      navigator: navigator, tabs: tabs, screen: screen, page: page, nothingOpen: nothingOpen)
  }

  func updateUIViewController(_ controller: RootController, context: Context) {
    controller.update(
      tabs: tabs, screen: screen, badges: badges, page: page, nothingOpen: nothingOpen)
  }
}

/// The tabs and the pages `navigator` has over them. On a narrow screen (a
/// compact width) the tabs, the tab bar under them, at the root of one
/// navigation, and the pages pushed over them. On a wide one (a regular
/// width: an iPad, a large iPhone on its side, a folding one opened up) the
/// system's tab bar controller, its tabs in the sidebar as iPadOS's own
/// apps have their sections, or in the tab bar at the top as the person
/// turns it: グループ and 設定 each a split of their screen, as wide as a
/// phone's, and the pages beside it, as Mail and Settings have their lists
/// and what is picked in them; the calendar its screen across the rest,
/// what opens over it pushed over it. The controller only says which
/// navigation holds what, keeps no list of its own, and tells the navigator
/// of a page gone back from.
final class RootController: UIViewController, UINavigationControllerDelegate,
  UITabBarControllerDelegate
{
  private let navigator: RootNavigator
  private let tabs: UIHostingController<AnyView>
  /// On a narrow screen: the tabs at its root, the pages over them.
  let narrow = UINavigationController()
  /// On a wide screen: the tabs, each with its screen and pages.
  let wide = UITabBarController()
  private let wideTabs: [RootTab: WideTab]
  private var page: (RootPage) -> AnyView
  /// The pages are being moved or put in place: what the navigations show
  /// meanwhile is not where the person has gone.
  private var arranging = false

  init(
    navigator: RootNavigator, tabs: AnyView, screen: (RootTab) -> AnyView,
    page: @escaping (RootPage) -> AnyView, nothingOpen: (RootTab) -> AnyView
  ) {
    self.navigator = navigator
    self.tabs = UIHostingController(rootView: tabs)
    self.page = page
    wideTabs = Dictionary(
      uniqueKeysWithValues: RootTab.allCases.map { tab in
        (tab, WideTab(tab: tab, screen: screen(tab), nothingOpen: nothingOpen(tab)))
      })
    super.init(nibName: nil, bundle: nil)
    for navigation in [narrow] + wideTabs.values.flatMap(\.navigations) {
      navigation.delegate = self
      // A tab's root may be titled large, as iOS's Settings is, the title
      // going into the bar as its list scrolls up under it (arrange); the
      // pages are titled in the bar (PageHost), beside the tabs too, as
      // Settings' are on an iPad.
      navigation.navigationBar.prefersLargeTitles = true
    }
    // The sidebar, or the tab bar at the top, as iPadOS chooses for the
    // window and the person turns it (spec/chat.md). The tab's screen
    // stands beside the sidebar rather than under it: the calendar's
    // months beside the one shown, and グループ's rail, are not drawn to
    // be seen through it.
    wide.mode = .tabSidebar
    wide.sidebar.preferredLayout = .tile
    wide.delegate = self
    wide.tabs = RootTab.allCases.compactMap { tab in
      guard let content = wideTabs[tab]?.content else { return nil }
      let item = UITab(
        title: tab.title, image: UIImage(systemName: tab.systemImage), identifier: tab.rawValue
      ) { _ in content }
      // Always in the tab bar, as on a phone: there is nothing to edit.
      item.preferredPlacement = .fixed
      return item
    }
    navigator.controller = self
    registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (self: Self, _) in
      self.layOut()
    }
  }

  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    layOut()
  }

  /// A screen widened or narrowed, as an iPad's window is or a phone
  /// unfolds, moves the pages beside the tab or over the tabs.
  private func layOut() {
    let shown = isWide ? wide : narrow
    if shown.parent !== self {
      for child in children {
        child.willMove(toParent: nil)
        child.view.removeFromSuperview()
        child.removeFromParent()
      }
      addChild(shown)
      shown.view.frame = view.bounds
      shown.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
      view.addSubview(shown.view)
      shown.didMove(toParent: self)
    }
    arrange(animated: false)
  }

  private var isWide: Bool {
    traitCollection.horizontalSizeClass == .regular
  }

  /// The hosts of the pages, over the tabs or beside them.
  private var hosts: [PageHost] {
    ([narrow] + RootTab.allCases.flatMap { wideTabs[$0]?.navigations ?? [] })
      .flatMap(\.viewControllers).compactMap { $0 as? PageHost }
  }

  /// The pages hosted, over the tabs or beside them.
  var hostedPages: [RootPage] { hosts.map(\.page) }

  /// What stands beside `tab` on a wide screen.
  func side(of tab: RootTab) -> UINavigationController? {
    wideTabs[tab]?.side?.navigation
  }

  func update(
    tabs: AnyView, screen: (RootTab) -> AnyView, badges: [RootTab: Int],
    page: @escaping (RootPage) -> AnyView, nothingOpen: (RootTab) -> AnyView
  ) {
    self.page = page
    self.tabs.rootView = tabs
    for tab in RootTab.allCases {
      wideTabs[tab]?.screen.rootView = screen(tab)
      wideTabs[tab]?.side?.nothing.rootView = nothingOpen(tab)
      let count = badges[tab] ?? 0
      wide.tab(forIdentifier: tab.rawValue)?.badgeValue = count > 0 ? "\(count)" : nil
    }
    for host in hosts { host.rootView = page(host.page) }
  }

  /// Lays the navigator's pages over its tab or beside it, as the width
  /// and the tab have it, keeping those already there in the same place,
  /// so a page under the one opened stays as it was. The calendar, which
  /// its month heads, has no bar: hidden only while it shows alone, so
  /// never as a page comes or goes.
  func arrange(animated: Bool) {
    let tab = navigator.tab
    let pages = navigator.pages
    arranging = true
    defer { arranging = false }
    let open = hosts
    var kept = 0
    while kept < min(open.count, pages.count), open[kept].page == pages[kept] { kept += 1 }
    let shown = Array(open[..<kept]) + pages[kept...].map { PageHost(page: $0, view: page($0)) }
    let isWide = isWide
    var stacks: [(UINavigationController, [UIViewController])] = [
      (narrow, isWide ? [tabs] : [tabs] + shown)
    ]
    for each in RootTab.allCases {
      guard let wideTab = wideTabs[each] else { continue }
      let here = isWide && each == tab
      let screen: [UIViewController] = [wideTab.screen]
      stacks.append((wideTab.column, here && wideTab.side == nil ? screen + shown : screen))
      if let side = wideTab.side {
        stacks.append((side.navigation, here && !shown.isEmpty ? shown : [side.nothing]))
      }
    }
    // What moves from one navigation to another comes all at once, the one
    // it leaves letting go of it first: only pages coming over the same
    // root come with a push.
    let moved = stacks.contains { navigation, stack in
      stack.contains { controller in
        controller.navigationController.map { $0 !== navigation } ?? false
      }
    }
    if moved {
      for (navigation, stack) in stacks {
        navigation.setViewControllers(
          navigation.viewControllers.filter(stack.contains), animated: false)
      }
    }
    for (navigation, stack) in stacks where navigation.viewControllers != stack {
      let push = animated && !moved && viewIfLoaded?.window != nil
        && navigation.viewControllers.first === stack.first
      navigation.setViewControllers(stack, animated: push)
    }
    narrow.setNavigationBarHidden(
      tab == .calendar && narrow.viewControllers.count == 1, animated: false)
    if let calendar = wideTabs[.calendar]?.column {
      calendar.setNavigationBarHidden(calendar.viewControllers.count == 1, animated: false)
    }
    if wide.selectedTab?.identifier != tab.rawValue {
      wide.selectedTab = wide.tab(forIdentifier: tab.rawValue)
    }
    // 設定 titled large, as iOS's Settings is, while its list is at its top
    // (TabScrollViewForBar); グループ heads itself in the bar's band, and
    // the calendar has none.
    tabs.navigationItem.largeTitleDisplayMode = tab == .settings ? .always : .never
  }

  /// A tab picked in the sidebar, or in the tab bar at the top.
  func tabBarController(
    _ tabBarController: UITabBarController, didSelectTab selectedTab: UITab,
    previousTab: UITab?
  ) {
    guard let tab = RootTab(rawValue: selectedTab.identifier) else { return }
    navigator.select(tab)
  }

  /// A page gone back from, by a back swipe or the back button.
  func navigationController(
    _ navigationController: UINavigationController, didShow viewController: UIViewController,
    animated: Bool
  ) {
    guard !arranging else { return }
    navigator.shown(hosts.map(\.page))
  }
}

/// A tab on a wide screen: its screen at the root of a navigation of its
/// own, and for グループ and 設定 the pages beside it in another, the two
/// the system's split.
private struct WideTab {
  let screen: UIHostingController<AnyView>
  let column: UINavigationController
  /// The pages beside the screen, and what stands there while none is open.
  let side: (navigation: UINavigationController, nothing: UIHostingController<AnyView>)?
  /// What the tab bar controller shows for the tab.
  let content: UIViewController

  @MainActor init(tab: RootTab, screen: AnyView, nothingOpen: AnyView) {
    self.screen = UIHostingController(rootView: screen)
    // 設定 titled large, as iOS's Settings is, while its list is at its
    // top; グループ heads itself in the bar's band, and the calendar has
    // none.
    self.screen.navigationItem.largeTitleDisplayMode = tab == .settings ? .always : .never
    column = UINavigationController(rootViewController: self.screen)
    guard tab != .calendar else {
      side = nil
      content = column
      return
    }
    let side = (
      navigation: UINavigationController(), nothing: UIHostingController(rootView: nothingOpen)
    )
    self.side = side
    // The screen, as wide as a phone's, beside the pages, neither hidden
    // by a button or a swipe: which shows is the tab's to say.
    let split = UISplitViewController(style: .doubleColumn)
    split.preferredSplitBehavior = .tile
    split.preferredDisplayMode = .oneBesideSecondary
    split.displayModeButtonVisibility = .never
    split.presentsWithGesture = false
    split.setViewController(column, for: .primary)
    split.setViewController(side.navigation, for: .secondary)
    content = split
  }

  /// The navigations the tab's pages may be in.
  var navigations: [UINavigationController] {
    [column] + (side.map { [$0.navigation] } ?? [])
  }
}

/// A page over the tabs, or beside them.
private final class PageHost: UIHostingController<AnyView> {
  let page: RootPage

  init(page: RootPage, view: AnyView) {
    self.page = page
    super.init(rootView: view)
    // Titled in the bar, as the pages under iOS's Settings are, whatever
    // the tab's root under it is titled.
    navigationItem.largeTitleDisplayMode = .never
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
    /// The tab's own controller, right under the tab bar controller under
    /// the navigation: none on a wide screen, where the tab's screen is
    /// the root of a navigation of its own, which finds its list itself.
    private var shownTab: UIViewController? {
      var tab = parent
      while let next = tab?.parent, !(next is UITabBarController) {
        if next is UINavigationController { return nil }
        tab = next
      }
      return tab
    }

    /// The tabs' titles are one navigation item, so the bar keeps the
    /// height it had for the tab before, and would take a list at its top
    /// as scrolled by the difference. A list at its top, or not there yet,
    /// has the bar take the tab's title first, as for a page pushed with
    /// its list at its top, and is laid out under it; one scrolled is
    /// followed at once, its title staying in the bar.
    override func viewWillAppear(_ animated: Bool) {
      super.viewWillAppear(animated)
      guard let page = shownTab?.parent?.pageInNavigation else { return }
      let list = shownTab?.contentScrollView(for: .top)
      if let list, list.contentOffset.y > -list.adjustedContentInset.top {
        page.setContentScrollView(list, for: .top)
      } else {
        page.setContentScrollView(nil, for: .top)
        page.navigationController?.navigationBar.sizeToFit()
      }
    }

    override func viewDidAppear(_ animated: Bool) {
      super.viewDidAppear(animated)
      shownTab?.parent?.pageInNavigation?.setContentScrollView(
        shownTab?.contentScrollView(for: .top), for: .top)
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
