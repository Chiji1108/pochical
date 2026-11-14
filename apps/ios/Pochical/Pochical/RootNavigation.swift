import PochicalKit
import SwiftUI
import UIKit

// The app's navigation, as LINE's and Telegram's on a phone: every page is
// pushed over the tab it was opened from, the tab bar going away with the
// tab's screen as the page comes and coming back as it goes, a back swipe
// included (spec/chat.md, The chat's page). The tabs are the system's tab
// bar controller's, each a UIKit navigation whose root is the tab's screen,
// its bar holding the tab's title and buttons. No bar is hidden or shown
// as a page comes or goes, which would take the edge effect off the page
// coming for as long as it comes (POC-157): the calendar's, which its month
// heads, is hidden only while the calendar shows alone, and is there at
// once as a page is put over it. A chat in a UIKit navigation keeps its
// view's keyboard layout guide, which a view inside SwiftUI's TabView loses
// for good once the app has been in the background (POC-117). SwiftUI's
// NavigationStack, as of the iOS 27.1 SDK, still takes the edge effect off
// a page pushed from the calendar, its bar shown with the push.
//
// On a wide screen, a regular width (an iPad, a large iPhone on its side,
// a folding one opened up), the same tab bar controller has its tabs in its
// sidebar, as iPadOS's own apps have their sections, and the pages of
// グループ and 設定 open beside the tab's screen, on a navigation of their
// own, as Mail and Settings do on an iPad: the first at its root, the rest
// pushed over it. One tab bar controller at every width, and in it each
// tab's screen, the same one, moved between navigations as the pages are,
// so it keeps where it was as the width changes (#1237).

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
  /// Where the calendar is, which the phone's calendar and the wide
  /// screen's both show, one in the place of the other as the width
  /// changes.
  let calendar = CalendarPlace()
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
  /// tab bar shows on a narrow screen, and those of the tab left beside it
  /// on a wide one.
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
  /// How far down a tab's screen its bar's top is, for the tab to head
  /// itself in the bar's band (GroupsScreen): where UIKit puts the bar,
  /// under the status bar, or on an iPad under the tab bar at the top
  /// (ScreenHost).
  @Entry var barTop: CGFloat = 0
  /// Where a tab's screen's bar's band ends: its safe area's top.
  @Entry var barBottom: CGFloat = 0
  /// The bar's buttons stand down the screen's side, as on iPhone Duo's
  /// outer display, rather than in its band (ScreenHost).
  @Entry var barButtonsBeside = false
}

/// The tabs, each with its screen and the pages `navigator` has over it, or
/// on a wide screen beside it. Each page and screen is hosted by UIKit,
/// which gives them an environment of their own: `hosted` puts the app's in
/// it again.
struct RootNavigation: UIViewControllerRepresentable {
  let navigator: RootNavigator
  /// Each tab's screen, with its title and buttons.
  let screen: (RootTab) -> AnyView
  /// The count on each tab.
  let badges: [RootTab: Int]
  let page: (RootPage) -> AnyView
  /// What stands beside グループ or 設定 on a wide screen while no page is
  /// open.
  let nothingOpen: (RootTab) -> AnyView

  func makeUIViewController(context: Context) -> RootController {
    RootController(navigator: navigator, screen: screen, page: page, nothingOpen: nothingOpen)
  }

  func updateUIViewController(_ controller: RootController, context: Context) {
    controller.update(screen: screen, badges: badges, page: page, nothingOpen: nothingOpen)
  }
}

/// The system's tab bar controller, each tab a navigation with its screen
/// at the root. On a narrow screen (a compact width) its tab bar is under
/// the tabs, and the pages are pushed over the tab, the tab bar going with
/// it. On a wide one (a regular width: an iPad, a large iPhone on its side,
/// a folding one opened up) its tabs are in the sidebar as iPadOS's own
/// apps have their sections, or in the tab bar at the top as the person
/// turns it: グループ and 設定 each a split of their screen, as wide as a
/// phone's, and the pages beside it, as Mail and Settings have their lists
/// and what is picked in them; the calendar its screen across the rest,
/// what opens over it pushed over it. The controller only says which
/// navigation holds what, keeps no list of its own, and tells the navigator
/// of a page gone back from.
final class RootController: UITabBarController, UINavigationControllerDelegate,
  UITabBarControllerDelegate
{
  private let navigator: RootNavigator
  private let stacks: [RootTab: TabStack]
  private var page: (RootPage) -> AnyView
  private var badges: [RootTab: Int] = [:]
  /// Whether the tabs are laid out for a wide screen: none before they are
  /// laid out at all.
  private var laidOutWide: Bool?
  /// The pages are being moved or put in place: what the navigations show
  /// meanwhile is not where the person has gone.
  private var arranging = false

  init(
    navigator: RootNavigator, screen: (RootTab) -> AnyView,
    page: @escaping (RootPage) -> AnyView, nothingOpen: (RootTab) -> AnyView
  ) {
    self.navigator = navigator
    self.page = page
    stacks = Dictionary(
      uniqueKeysWithValues: RootTab.allCases.map { tab in
        (tab, TabStack(tab: tab, screen: screen(tab), nothingOpen: nothingOpen(tab)))
      })
    super.init(nibName: nil, bundle: nil)
    for navigation in stacks.values.flatMap(\.navigations) {
      navigation.delegate = self
      // A tab's root may be titled large, as iOS's Settings is, the title
      // going into the bar as its list scrolls up under it; the pages are
      // titled in the bar (PageHost), beside the tabs too, as Settings'
      // are on an iPad.
      navigation.navigationBar.prefersLargeTitles = true
    }
    // The sidebar, or the tab bar at the top, as iPadOS chooses for the
    // window and the person turns it (spec/chat.md); a phone's tab bar on
    // a narrow screen. The tab's screen stands beside the sidebar rather
    // than under it: the calendar's months beside the one shown, and
    // グループ's rail, are not drawn to be seen through it.
    mode = .tabSidebar
    sidebar.preferredLayout = .tile
    delegate = self
    navigator.controller = self
    // A screen widened or narrowed, as an iPad's window is or a phone
    // unfolds, moves the pages beside the tab or over it.
    registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (self: Self, _) in
      // Before the calendar's day moves between its sheet and its pane,
      // so what its detail is in the middle of goes with it.
      self.navigator.calendar.show(wide: self.isWide)
      self.arrange(animated: false)
    }
  }

  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

  override func viewDidLoad() {
    super.viewDidLoad()
    // Before the calendar's day moves between its sheet and its pane.
    navigator.calendar.show(wide: isWide)
    arrange(animated: false)
  }

  private var isWide: Bool {
    traitCollection.horizontalSizeClass == .regular
  }

  /// The hosts of the pages, over the tab or beside it.
  private var hosts: [PageHost] {
    RootTab.allCases.flatMap { stacks[$0]?.navigations ?? [] }
      .flatMap(\.viewControllers).compactMap { $0 as? PageHost }
  }

  /// The pages hosted, over the tab or beside it.
  var hostedPages: [RootPage] { hosts.map(\.page) }

  /// `tab`'s screen, the same at every width.
  func screen(of tab: RootTab) -> UIViewController? {
    stacks[tab]?.screen
  }

  /// What stands beside `tab` on a wide screen.
  func side(of tab: RootTab) -> UINavigationController? {
    stacks[tab]?.side?.navigation
  }

  func update(
    screen: (RootTab) -> AnyView, badges: [RootTab: Int],
    page: @escaping (RootPage) -> AnyView, nothingOpen: (RootTab) -> AnyView
  ) {
    self.page = page
    self.badges = badges
    for tab in RootTab.allCases {
      stacks[tab]?.screen.show(screen(tab))
      stacks[tab]?.side?.nothing.rootView = nothingOpen(tab)
      badge(self.tab(forIdentifier: tab.rawValue))
    }
    for host in hosts { host.rootView = page(host.page) }
  }

  /// The count on `item`'s tab, if any.
  private func badge(_ item: UITab?) {
    guard let item, let tab = RootTab(rawValue: item.identifier) else { return }
    let count = badges[tab] ?? 0
    item.badgeValue = count > 0 ? "\(count)" : nil
  }

  /// Lays the navigator's pages over its tab or beside it, as the width
  /// and the tab have it, keeping those already there in the same place,
  /// so a page under the one opened stays as it was, and each tab's screen
  /// in the navigation the width has it in. The calendar, which its month
  /// heads, has no bar: hidden only while it shows alone, so never as a
  /// page comes or goes.
  func arrange(animated: Bool) {
    // Laid out once the width is known, as the controller comes into its
    // window: the change to it arranges them.
    guard traitCollection.horizontalSizeClass != .unspecified else { return }
    let tab = navigator.tab
    let pages = navigator.pages
    arranging = true
    defer { arranging = false }
    let open = hosts
    var kept = 0
    while kept < min(open.count, pages.count), open[kept].page == pages[kept] { kept += 1 }
    let shown = Array(open[..<kept]) + pages[kept...].map { PageHost(page: $0, view: page($0)) }
    let isWide = isWide
    // Over the tab's screen, the tab bar goes with it, as on a phone, the
    // calendar's at every width; beside it, the tabs stay.
    let beside = isWide && stacks[tab]?.side != nil
    for host in shown { host.hidesBottomBarWhenPushed = !beside }
    var lists: [(UINavigationController, [UIViewController])] = []
    for each in RootTab.allCases {
      guard let stack = stacks[each] else { continue }
      let here = each == tab
      let home = stack.navigation(wide: isWide)
      let besideIt = isWide && stack.side != nil
      for navigation in stack.navigations {
        if navigation === home {
          lists.append((navigation, [stack.screen] + (here && !besideIt ? shown : [])))
        } else if let side = stack.side, navigation === side.navigation {
          lists.append((navigation, besideIt && here && !shown.isEmpty ? shown : [side.nothing]))
        } else {
          lists.append((navigation, []))
        }
      }
    }
    // What moves from one navigation to another comes all at once, the one
    // it leaves letting go of it first: only pages coming over the same
    // root come with a push.
    let moved = lists.contains { navigation, list in
      list.contains { controller in
        controller.navigationController.map { $0 !== navigation } ?? false
      }
    }
    if moved {
      for (navigation, list) in lists {
        navigation.setViewControllers(
          navigation.viewControllers.filter(list.contains), animated: false)
      }
    }
    for (navigation, list) in lists where navigation.viewControllers != list {
      let push = animated && !moved && viewIfLoaded?.window != nil
        && navigation.viewControllers.first === list.first
      navigation.setViewControllers(list, animated: push)
    }
    if let calendar = stacks[.calendar]?.column {
      calendar.setNavigationBarHidden(calendar.viewControllers.count == 1, animated: false)
    }
    if laidOutWide != isWide {
      laidOutWide = isWide
      tabs = RootTab.allCases.compactMap { stacks[$0]?.tab(wide: isWide) }
      tabs.forEach(badge)
    }
    if selectedTab?.identifier != tab.rawValue {
      selectedTab = self.tab(forIdentifier: tab.rawValue)
    }
    stacks[tab]?.screen.placeTabBar()
  }

  /// A tab picked in the tab bar, or in the sidebar.
  func tabBarController(
    _ tabBarController: UITabBarController, didSelectTab selectedTab: UITab,
    previousTab: UITab?
  ) {
    // Not the tabs put in again for another width, which take the one shown.
    guard !arranging, let tab = RootTab(rawValue: selectedTab.identifier) else { return }
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

/// A tab: its screen, the same at every width, and the navigations it may
/// be in. On a narrow screen the tab is the screen's navigation itself: the
/// tab bar goes with the screen as a page is pushed over it only for a
/// navigation that is the tab, not one inside a split. On a wide one
/// グループ and 設定 are the system's split of the screen's column and the
/// pages beside it, the screen moving into the column as a page moves; the
/// calendar is its navigation at every width.
private struct TabStack {
  let screen: ScreenHost
  /// The screen's navigation on a narrow screen, and the calendar's always.
  let column: UINavigationController
  /// The screen's navigation in the split on a wide screen.
  let wideColumn: UINavigationController?
  /// The pages beside the screen, and what stands there while none is open.
  let side: (navigation: UINavigationController, nothing: UIHostingController<AnyView>)?
  /// The tab, as the tab bar controller shows it on a narrow screen and on
  /// a wide one: one for the calendar, a controller being only one tab's.
  let narrowTab: UITab
  let wideTab: UITab

  @MainActor init(tab: RootTab, screen: AnyView, nothingOpen: AnyView) {
    self.screen = ScreenHost()
    self.screen.show(screen)
    // 設定 titled large, as iOS's Settings is, while its list is at its
    // top; グループ heads itself in the bar's band, and the calendar has
    // none.
    self.screen.navigationItem.largeTitleDisplayMode = tab == .settings ? .always : .never
    column = UINavigationController()
    narrowTab = Self.item(tab, showing: column)
    guard tab != .calendar else {
      wideColumn = nil
      side = nil
      wideTab = narrowTab
      return
    }
    let wideColumn = UINavigationController()
    let side = (
      navigation: UINavigationController(), nothing: UIHostingController(rootView: nothingOpen)
    )
    self.wideColumn = wideColumn
    self.side = side
    // The screen, as wide as a phone's, beside the pages, neither hidden
    // by a button or a swipe: which shows is the tab's to say.
    let split = UISplitViewController(style: .doubleColumn)
    split.preferredSplitBehavior = .tile
    split.preferredDisplayMode = .oneBesideSecondary
    split.displayModeButtonVisibility = .never
    split.presentsWithGesture = false
    split.setViewController(wideColumn, for: .primary)
    split.setViewController(side.navigation, for: .secondary)
    wideTab = Self.item(tab, showing: split)
  }

  @MainActor private static func item(_ tab: RootTab, showing content: UIViewController) -> UITab {
    let item = UITab(
      title: tab.title, image: UIImage(systemName: tab.systemImage), identifier: tab.rawValue
    ) { _ in content }
    // Always in the tab bar, as on a phone: there is nothing to edit.
    item.preferredPlacement = .fixed
    return item
  }

  /// The navigation whose root the screen is at the width.
  func navigation(wide: Bool) -> UINavigationController {
    wide ? wideColumn ?? column : column
  }

  /// The tab, as the tab bar controller shows it at the width.
  func tab(wide: Bool) -> UITab {
    wide ? wideTab : narrowTab
  }

  /// The navigations the tab's screen and pages may be in.
  var navigations: [UINavigationController] {
    [column] + [wideColumn, side?.navigation].compactMap(\.self)
  }
}

/// A tab's screen, told where its bar's top is (barTop): UIKit lays the
/// bar out for the window, under the status bar, or on an iPad with the
/// tab bar at the top under that tab bar, the bar's buttons in the row
/// below it. It hides the tab bar as the screen asks (tabBarHidden).
private final class ScreenHost: UIHostingController<AnyView> {
  private let band = BarBand()
  /// The screen asks for the tab bar's place.
  private var wantsTabBarHidden = false

  init() {
    super.init(rootView: AnyView(EmptyView()))
    registerForTraitChanges([UITraitHorizontalSizeClass.self]) { (self: Self, _) in
      self.placeTabBar()
    }
  }

  @available(*, unavailable) required init?(coder: NSCoder) { fatalError() }

  func show(_ screen: AnyView) {
    let hide = HideTabBarAction { [weak self] hidden in
      self?.wantsTabBarHidden = hidden
      self?.placeTabBar()
    }
    rootView = AnyView(
      screen.modifier(BarBandTop(band: band)).environment(\.hideTabBar, hide))
  }

  /// Hides the tab bar while the screen shows and asks, on a narrow
  /// screen: a wide one keeps the calendar's tray and day in a pane of
  /// their own, clear of the tabs (spec/calendar.md, On a wide screen).
  func placeTabBar() {
    guard let tabs = tabBarController, tabs.selectedViewController === navigationController
    else { return }
    let hidden = wantsTabBarHidden && traitCollection.horizontalSizeClass == .compact
    guard tabs.isTabBarHidden != hidden else { return }
    tabs.setTabBarHidden(hidden, animated: view.window != nil)
  }

  override func viewDidLayoutSubviews() {
    super.viewDidLayoutSubviews()
    guard let bar = navigationController?.navigationBar else { return }
    let top = bar.convert(bar.bounds, to: view).minY
    if band.top != top { band.top = top }
    let bottom = view.safeAreaInsets.top
    if band.bottom != bottom { band.bottom = bottom }
    let beside = barsBeside
    if band.beside != beside { band.beside = beside }
  }

  /// The system stands the bar's buttons down the screen's side, as on
  /// iPhone Duo's outer display (HIG, Designing for iPhone Duo: Vertical
  /// controls), its band over the screen holding the title alone.
  private var barsBeside: Bool {
    guard #available(iOS 27.1, *) else { return false }
    return traitCollection.verticalBarEdge != .unspecified
  }
}

/// Where a tab's bar's band is, as its host last laid it out, and whether
/// its buttons stand beside the screen rather than in it.
@MainActor @Observable private final class BarBand {
  var top: CGFloat = 0
  var bottom: CGFloat = 0
  var beside = false
}

private struct BarBandTop: ViewModifier {
  let band: BarBand

  func body(content: Content) -> some View {
    content
      .environment(\.barTop, band.top)
      .environment(\.barBottom, band.bottom)
      .environment(\.barButtonsBeside, band.beside)
  }
}

/// Hides the tab bar of the tab a screen is, or shows it again.
struct HideTabBarAction {
  let hide: @MainActor (Bool) -> Void

  @MainActor func callAsFunction(_ hidden: Bool) {
    hide(hidden)
  }
}

extension EnvironmentValues {
  @Entry var hideTabBar = HideTabBarAction { _ in }
}

extension View {
  /// Gives the tab bar's place to what the tab's screen shows there while
  /// `hidden`, as the calendar's tray and day do (spec/calendar.md): the
  /// tab bar is the system's tab bar controller's, which SwiftUI's
  /// `toolbarVisibility(_:for: .tabBar)` reaches only in its own TabView.
  func tabBarHidden(_ hidden: Bool) -> some View {
    modifier(TabBarHiding(hidden: hidden))
  }
}

private struct TabBarHiding: ViewModifier {
  @Environment(\.hideTabBar) private var hideTabBar
  let hidden: Bool

  func body(content: Content) -> some View {
    content.onChange(of: hidden, initial: true) { _, hidden in hideTabBar(hidden) }
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

extension UIViewController {
  /// The page this controller is in, right under its navigation: the one
  /// whose content scroll view the bar follows.
  var pageInNavigation: UIViewController? {
    var page: UIViewController? = self
    while let next = page?.parent, !(next is UINavigationController) { page = next }
    return page
  }
}
