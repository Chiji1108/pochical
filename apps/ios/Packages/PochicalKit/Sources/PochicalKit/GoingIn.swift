import Foundation
import Observation

/// The group the person made or joined, and whether the face they picked
/// on the way was kept in it.
public struct InGroup: Hashable, Sendable {
  public let groupID: String
  public let faceKept: Bool

  public init(groupID: String, faceKept: Bool) {
    self.groupID = groupID
    self.faceKept = faceKept
  }
}

/// An invitation's code, and the name the person joins its group as.
public struct JoinAsk: Hashable, Sendable {
  public let code: String
  public let displayName: String

  public init(code: String, displayName: String) {
    self.code = code
    self.displayName = displayName
  }
}

/// The person on their way into a group, made (グループを作る) or joined
/// (参加の画面): one call at a time, which is the app's from the moment it
/// is asked for, whatever becomes of the page that asked
/// (spec/sync-protocol.md, Groups). Asked for again while one is under
/// way, a second tap before the page is drawn busy, it is that one. A page
/// left (`left`) stops nothing: the person is in the group once the server
/// has it, the group in their list, and the call is forgotten as it ends,
/// nothing opening for a page that is gone; the page opened again meanwhile
/// finds it `underWay` and waits on, so the same group is not asked for
/// twice by mistake.
@MainActor @Observable
public final class GoingIn<Asked: Sendable> {
  /// A call: what was asked for, and its answer, which fails as the call
  /// does.
  public final class Call {
    public let asked: Asked
    public let answer: Task<InGroup, any Error>
    fileprivate var waitedOn = true
    fileprivate var ended = false

    fileprivate init(asked: Asked, answer: Task<InGroup, any Error>) {
      self.asked = asked
      self.answer = answer
    }
  }

  /// The call under way, or ended and not yet taken by the page that waits
  /// on it.
  public private(set) var underWay: Call?

  public nonisolated init() {}

  /// Begins going in as `asked` by `enter`, or gives the call already
  /// under way.
  @discardableResult
  public func begin(_ asked: Asked, enter: @escaping @MainActor () async throws -> InGroup) -> Call
  {
    if let underWay { return underWay }
    let call = Call(asked: asked, answer: Task { try await enter() })
    underWay = call
    Task {
      _ = await call.answer.result
      call.ended = true
      if !call.waitedOn { forget(call) }
    }
    return call
  }

  /// A page waits on `call` (again), and will take its answer.
  public func waitOn(_ call: Call) {
    call.waitedOn = true
  }

  /// The page waiting on `call` has its answer: nothing is under way any
  /// more.
  public func took(_ call: Call) {
    forget(call)
  }

  /// The page that waited on `call` is gone: the call goes on, and is
  /// forgotten as it ends.
  public func left(_ call: Call) {
    call.waitedOn = false
    if call.ended { forget(call) }
  }

  private func forget(_ call: Call) {
    if underWay === call { underWay = nil }
  }
}
