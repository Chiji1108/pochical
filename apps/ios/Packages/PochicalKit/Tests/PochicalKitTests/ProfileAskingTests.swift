import Foundation
import Testing

@testable import PochicalKit

struct ProfileVectors: Decodable, Sendable {
  struct AskingCase: VectorCase {
    struct Asking: Decodable, Sendable {
      let asUsual: Bool
      let drawing: Bool
    }

    let name: String
    let caughtUp: Bool
    let usualName: String
    let usualPhoto: String
    let expected: Asking?
  }

  let asking: [AskingCase]
}

@Test(arguments: try vectors("profile", as: ProfileVectors.self).asking)
func howSomeoneIsAskedForTheirNameAndPhoto(_ vector: ProfileVectors.AskingCase) {
  let asking = profileAsking(
    caughtUp: vector.caughtUp,
    usual: UsualProfile(name: vector.usualName, photoID: vector.usualPhoto))
  #expect(
    asking
      == vector.expected.map { ProfileAsking(asUsual: $0.asUsual, drawing: $0.drawing) })
}
