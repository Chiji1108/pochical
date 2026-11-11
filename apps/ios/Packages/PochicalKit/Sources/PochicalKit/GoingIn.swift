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

/// The person on their way into a group, made (グループを作る) or joined
/// (参加の画面): one call at a time, which is the app's from the moment it
/// is asked for, whatever becomes of the page that asked
/// (spec/sync-protocol.md, Groups). Asked for again while one is under
/// way, a second tap before the page is drawn busy, it is that one. A page
/// left (`left`) stops nothing: the person is in the group once the server
/// has it, the group in their list, and the call is forgotten as it ends,
/// nothing opening for a page that is gone; the page opened again meanwhile
/// finds it `underWay` and waits on, so the same group is not asked for
/// twice by mistake: what was asked is the page's whole draft, the group
/// and how the person appears in it, so the page opened again shows, and a
/// retry sends, exactly that. Whether a page is gone is its `Place` being let go
/// of, never its leaving the screen.
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

  /// A page's place on the way in, held by the page for as long as it is
  /// on the navigation stack and let go of with it: gone, the page has
  /// left the call under way that is `mine`. A page only covered, by one
  /// it pushed or a sheet, still holds it, so a call that ends meanwhile
  /// keeps its answer for the page to take as it shows again.
  @MainActor public final class Place {
    private let going: GoingIn
    private let mine: (Asked) -> Bool

    fileprivate init(going: GoingIn, mine: @escaping (Asked) -> Bool) {
      self.going = going
      self.mine = mine
    }

    isolated deinit {
      if let call = going.underWay, mine(call.asked) { going.left(call) }
    }
  }

  /// A place for a page that waits on the calls that are `mine`.
  public func place(mine: @escaping (Asked) -> Bool = { _ in true }) -> Place {
    Place(going: self, mine: mine)
  }

  private func forget(_ call: Call) {
    if underWay === call { underWay = nil }
  }
}
