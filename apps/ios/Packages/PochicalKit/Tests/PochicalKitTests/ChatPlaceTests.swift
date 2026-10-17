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
}
