import Testing

@testable import PochicalKit

/// A call whose answer the test gives when it chooses, as a server slow to
/// answer; how many times it was begun.
@MainActor
private final class Held {
  private(set) var begun = 0
  private var waiting: [CheckedContinuation<InGroup, any Error>] = []

  func enter() async throws -> InGroup {
    begun += 1
    return try await withCheckedThrowingContinuation { waiting.append($0) }
  }

  /// Answers once the call has reached the server.
  func answer(_ result: Result<InGroup, any Error>) async {
    while waiting.isEmpty { await Task.yield() }
    waiting.removeFirst().resume(with: result)
  }
}

private struct Offline: Error {}

private let made = InGroup(groupID: "group-1", faceKept: true)

/// Until the call that ended has been forgotten, or kept for its page.
@MainActor
private func settled(_ going: GoingIn<String>, _ call: GoingIn<String>.Call) async {
  _ = await call.answer.result
  for _ in 0..<10 { await Task.yield() }
}

@MainActor @Test func aCallAskedForAgainWhileItIsUnderWayIsTheSameCall() async throws {
  let going = GoingIn<String>()
  let server = Held()
  let first = going.begin("忘年会") { try await server.enter() }
  let again = going.begin("忘年会") { try await server.enter() }
  #expect(first === again)
  #expect(going.underWay === first)

  await server.answer(.success(made))
  #expect(try await first.answer.value == made)
  #expect(server.begun == 1)
}

@MainActor @Test func aCallEndedStaysForThePageThatWaitsUntilItIsTaken() async {
  let going = GoingIn<String>()
  let server = Held()
  let call = going.begin("忘年会") { try await server.enter() }
  await server.answer(.success(made))
  await settled(going, call)
  #expect(going.underWay === call)

  going.took(call)
  #expect(going.underWay == nil)
}

@MainActor @Test func aCallWhosePageWasLeftGoesOnAndIsForgottenAsItEnds() async throws {
  let going = GoingIn<String>()
  let server = Held()
  let call = going.begin("忘年会") { try await server.enter() }
  going.left(call)
  #expect(going.underWay === call, "Still under way, for the page opened again")

  await server.answer(.success(made))
  #expect(try await call.answer.value == made)
  await settled(going, call)
  #expect(going.underWay == nil)
}

@MainActor @Test func aPageOpenedAgainWaitsOnTheCallItLeft() async {
  let going = GoingIn<String>()
  let server = Held()
  let call = going.begin("忘年会") { try await server.enter() }
  going.left(call)
  going.waitOn(call)

  await server.answer(.success(made))
  await settled(going, call)
  #expect(going.underWay === call)
}

@MainActor @Test func aCallThatFailsAfterItsPageWasLeftIsForgottenToo() async {
  let going = GoingIn<String>()
  let server = Held()
  let call = going.begin("忘年会") { try await server.enter() }
  going.left(call)
  await server.answer(.failure(Offline()))
  await settled(going, call)
  #expect(going.underWay == nil)

  // The next is a new call.
  let next = going.begin("忘年会") { try await server.enter() }
  #expect(next !== call)
}

@MainActor @Test func aPageLeftOnceItsCallHasEndedForgetsItAtOnce() async {
  let going = GoingIn<String>()
  let server = Held()
  let call = going.begin("忘年会") { try await server.enter() }
  await server.answer(.success(made))
  await settled(going, call)

  going.left(call)
  #expect(going.underWay == nil)
}

@MainActor @Test func aPageCoveredKeepsItsPlaceAndTheAnswerOfACallThatEndsMeanwhile() async {
  let going = GoingIn<String>()
  let server = Held()
  // On the stack, under a page it pushed: its place is held, nothing waits.
  let place = going.place()
  let call = going.begin("忘年会") { try await server.enter() }
  await server.answer(.success(made))
  await settled(going, call)
  #expect(going.underWay === call, "Kept for the page to take as it shows again")
  withExtendedLifetime(place) {}
}

@MainActor @Test func aPageOffTheStackHasLeftItsCall() async {
  let going = GoingIn<String>()
  let server = Held()
  var place: GoingIn<String>.Place? = going.place()
  let call = going.begin("忘年会") { try await server.enter() }
  #expect(place != nil)
  place = nil
  #expect(going.underWay === call, "Still under way, for the page opened again")

  await server.answer(.success(made))
  await settled(going, call)
  #expect(going.underWay == nil)
}

@MainActor @Test func aPlaceLetGoOfLeavesAnotherPagesCallAlone() async {
  let going = GoingIn<String>()
  let server = Held()
  var other: GoingIn<String>.Place? = going.place(mine: { $0 == "別の招待" })
  let call = going.begin("忘年会") { try await server.enter() }
  #expect(other != nil)
  other = nil

  await server.answer(.success(made))
  await settled(going, call)
  #expect(going.underWay === call)
}
