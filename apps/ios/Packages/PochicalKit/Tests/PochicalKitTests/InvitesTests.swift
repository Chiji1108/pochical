import Foundation
import Testing

@testable import PochicalKit

struct ChatTextVectors: Decodable, Sendable {
  struct InviteCode: VectorCase {
    let url: String
    let expected: String?
    var name: String { url }
  }

  let inviteCode: [InviteCode]
}

@Test(arguments: try vectors("chat-text", as: ChatTextVectors.self).inviteCode)
func inviteCodeOfALink(_ vector: ChatTextVectors.InviteCode) throws {
  let url = try #require(URL(string: vector.url))
  #expect(inviteCode(of: url) == vector.expected)
}
