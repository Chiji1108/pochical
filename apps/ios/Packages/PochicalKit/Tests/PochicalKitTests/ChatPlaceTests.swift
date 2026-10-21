import Foundation
import PochicalDesign
import Testing

@testable import PochicalKit

/// Where a chat is kept, and what its chats can do (spec/chat.md, Where a
/// chat is kept).
@Suite struct ChatPlaceTests {
  @Test func aGroupKeepsItsChatsByItsIDAndDoesEverything() {
    let place = ChatPlace.group(GroupRow(id: "g1", name: "いとこ会", emoji: "🍉", joinedAtMs: 0))
    #expect(place.id == "g1")
    #expect(place.name == "いとこ会")
    #expect(place.rules == .group)
    #expect(place.group?.id == "g1")
  }

  @Test func theSupportChatIsAPlaceOfItsOwnWithoutAGroupsTools() {
    let place = ChatPlace.support
    #expect(place.id == ChatPlace.supportID)
    #expect(place.group == nil)
    #expect(!place.rules.pins && !place.rules.edit && !place.rules.days && !place.rules.polls)
    #expect(!place.rules.mentions && !place.rules.reports && !place.rules.directChats)
    #expect(place.rules.sendsDevice)
  }

  @Test func eachPlaceKeepsItsPhotosOnItsOwnShelf() {
    let group = ChatPlace.group(GroupRow(id: "g1", name: "いとこ会", emoji: "🍉", joinedAtMs: 0))
    #expect(group.shelf == .group("g1"))
    #expect(ChatPlace.support.shelf == .support)
    #expect(PhotoShelf(place: "g1") == .group("g1"))
    #expect(PhotoShelf(place: ChatPlace.supportID) == .support)
  }

  @Test func aShelfIsAFolderAndAPathOfItsOwn() {
    let server = URL(string: "https://pochical.test")!
    let shelves: [(PhotoShelf, key: String, path: String)] = [
      (.group("g1"), "g1", "/v1/groups/g1/photos/p"),
      (.support, ChatPlace.supportID, "/v1/support/photos/p"),
      (.mine, "me", "/v1/me/photos/p"),
      (.invitation(code: "abc"), "invites/abc", "/v1/invites/abc/photos/p"),
    ]
    for (shelf, key, path) in shelves {
      #expect(shelf.key == key)
      #expect(shelf.url(of: "p", server: server).path() == path)
    }
  }
}
