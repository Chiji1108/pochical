import SwiftUI
import Testing

@testable import Pochical

/// What a request ending late does to the one navigation (POC-157): it
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
  @Test func aPageGoneBackFromStaysGoneWhenTheScreenWidens() {
    let navigator = RootNavigator()
    let controller = RootController(
      navigator: navigator, tabs: AnyView(EmptyView()), page: { _ in AnyView(EmptyView()) },
      nothingOpen: { _ in AnyView(EmptyView()) })
    let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
    window.rootViewController = controller
    window.makeKeyAndVisible()
    controller.traitOverrides.horizontalSizeClass = .compact
    controller.view.layoutIfNeeded()
    navigator.show([photos("a"), photos("b")], over: .groups)
    // A back, as UIKit tells the navigation's delegate once it is done.
    controller.main.popViewController(animated: false)
    controller.navigationController(
      controller.main, didShow: controller.main.topViewController!, animated: false)
    #expect(navigator.pages == [photos("a")])

    controller.traitOverrides.horizontalSizeClass = .regular
    controller.view.layoutIfNeeded()
    #expect(controller.hostedPages == [photos("a")])
    #expect(controller.main.viewControllers.count == 1)
    #expect(navigator.pages == [photos("a")])
  }
}
