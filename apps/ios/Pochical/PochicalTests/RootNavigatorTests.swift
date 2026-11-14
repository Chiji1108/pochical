import SwiftUI
import Testing

@testable import Pochical

/// What a request ending late does to the navigation (POC-157): it
/// acts on the page it came from, never on the stack the person has
/// moved on to.
@MainActor struct RootNavigatorTests {
  /// A page of the group `id`: its photos, which need no group row.
  private func photos(_ id: String) -> RootPage {
    .photos(PhotosOfChat(placeID: id, threadID: "group", names: [:]))
  }

  @Test func aFlowsPageTurnsIntoTheNextInItsPlace() {
    let navigator = RootNavigator()
    navigator.show([photos("a"), .group(.newGroup)])
    #expect(navigator.replace(.group(.newGroup), with: photos("b")))
    #expect(navigator.pages == [photos("a"), photos("b")])
  }

  @Test func aFlowsPageLeftTakesNobodyAnywhere() {
    let navigator = RootNavigator()
    navigator.show([photos("a")], over: .groups)
    #expect(!navigator.replace(.group(.newGroup), with: photos("b")))
    #expect(navigator.pages == [photos("a")])
    #expect(navigator.tab == .groups)
  }

  @Test func aGroupLeftTakesAwayItsPagesAndWhatTheyOpened() {
    let navigator = RootNavigator()
    navigator.show([photos("b"), photos("a"), .support])
    navigator.close("a")
    #expect(navigator.pages == [photos("b")])
  }

  @Test func aGroupLeftWhosePagesHaveGoneLeavesTheOthersOpen() {
    let navigator = RootNavigator()
    navigator.show([photos("b")])
    navigator.close("a")
    #expect(navigator.pages == [photos("b")])
  }

  /// On a wide screen the pages stand beside the tab they were opened
  /// from: another tab comes without them.
  @Test func aTabGoneToLeavesThePagesOfTheTabLeft() {
    let navigator = RootNavigator()
    navigator.show([photos("a")], over: .groups)
    navigator.select(.settings)
    #expect(navigator.pages.isEmpty)
    #expect(navigator.tab == .settings)
  }

  /// A page gone back from by the navigation's own back stays gone when
  /// the screen widens and the pages move beside the tabs.
  @Test func aPageGoneBackFromStaysGoneWhenTheScreenWidens() throws {
    let navigator = RootNavigator()
    let (controller, window) = shown(navigator, width: .compact)
    navigator.show([photos("a"), photos("b")], over: .groups)
    // A back, as UIKit tells the navigation's delegate once it is done.
    let over = try #require(controller.screen(of: .groups)?.navigationController)
    #expect(over.viewControllers.count == 3)
    over.popViewController(animated: false)
    controller.navigationController(
      over, didShow: try #require(over.topViewController), animated: false)
    #expect(navigator.pages == [photos("a")])

    widen(controller, to: .regular)
    #expect(controller.hostedPages == [photos("a")])
    #expect(controller.side(of: .groups)?.viewControllers.count == 1)
    #expect(controller.screen(of: .groups)?.navigationController?.viewControllers.count == 1)
    #expect(controller.selectedTab?.identifier == RootTab.groups.rawValue)
    #expect(navigator.pages == [photos("a")])
    #expect(window.rootViewController === controller)
  }

  /// A tab's screen is the same at every width (#1237): widened and
  /// narrowed again, as a large iPhone turned on its side or an iPad's
  /// window, it stays in the window, so what it holds (where its list is,
  /// the calendar's month, a group's rail) stays as it was.
  @Test(arguments: RootTab.allCases) func aTabsScreenStaysAsTheWidthChanges(tab: RootTab) throws {
    let navigator = RootNavigator()
    let (controller, window) = shown(navigator, width: .compact)
    navigator.select(tab)
    controller.view.layoutIfNeeded()
    let screen = try #require(controller.screen(of: tab))
    #expect(screen.view.window === window)
    for width in [UIUserInterfaceSizeClass.regular, .compact, .regular] {
      widen(controller, to: width)
      #expect(screen.view.window === window, "shown at a \(width) width")
      #expect(controller.selectedTab?.identifier == tab.rawValue)
    }
  }

  /// A page over a tab, a notification's chat at launch among them, takes
  /// the tab bar with the tab on a narrow screen, and on a wide one leaves
  /// the tabs beside グループ's and 設定's column; over the calendar it
  /// comes as on a phone.
  @Test(arguments: RootTab.allCases) func aPageOverATabTakesTheTabBarWithIt(tab: RootTab) {
    let navigator = RootNavigator()
    let (controller, _) = shown(navigator, width: .compact)
    navigator.show([photos("a")], over: tab)
    controller.view.layoutIfNeeded()
    #expect(controller.hostedPages == [photos("a")])
    #expect(controller.tabBar.isHidden)
    widen(controller, to: .regular)
    #expect(controller.hostedPages == [photos("a")])
    #expect(controller.tabBar.isHidden == (tab == .calendar))
    widen(controller, to: .compact)
    #expect(controller.hostedPages == [photos("a")])
    #expect(controller.tabBar.isHidden)
  }

  /// The tabs in a window as wide as a phone, at `width`.
  private func shown(
    _ navigator: RootNavigator, width: UIUserInterfaceSizeClass
  ) -> (RootController, UIWindow) {
    let controller = RootController(
      navigator: navigator, screen: { _ in AnyView(EmptyView()) },
      page: { _ in AnyView(EmptyView()) }, nothingOpen: { _ in AnyView(EmptyView()) })
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.rootViewController = controller
    window.makeKeyAndVisible()
    widen(controller, to: width)
    return (controller, window)
  }

  private func widen(_ controller: RootController, to width: UIUserInterfaceSizeClass) {
    controller.traitOverrides.horizontalSizeClass = width
    controller.view.layoutIfNeeded()
  }
}
