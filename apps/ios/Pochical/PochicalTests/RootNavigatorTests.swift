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
    #expect(navigator.pages == [.root(photos("a")), .root(photos("b"))])
  }

  @Test func aFlowsPageLeftTakesNobodyAnywhere() {
    let navigator = RootNavigator()
    navigator.show([photos("a")], over: .groups)
    #expect(!navigator.replace(.group(.newGroup), with: photos("b")))
    #expect(navigator.pages == [.root(photos("a"))])
    #expect(navigator.tab == .groups)
  }

  @Test func aGroupLeftTakesAwayItsPagesAndWhatTheyOpened() {
    let navigator = RootNavigator()
    navigator.show([photos("b"), photos("a"), .support])
    navigator.close("a")
    #expect(navigator.pages == [.root(photos("b"))])
  }

  @Test func aGroupLeftWhosePagesHaveGoneLeavesTheOthersOpen() {
    let navigator = RootNavigator()
    navigator.show([photos("b")])
    navigator.close("a")
    #expect(navigator.pages == [.root(photos("b"))])
  }
}
