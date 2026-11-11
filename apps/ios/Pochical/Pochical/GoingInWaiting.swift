import PochicalKit
import SwiftUI

/// 参加する as it was asked: the invitation, and how the person appears in
/// its group, the screen's whole draft.
struct JoiningAsk: Equatable, Sendable {
  let code: String
  let profile: JoinProfile
}

/// The app's own two, which every screen's environment gives: an entry's
/// default is made anew for each environment that asks, so they are kept
/// here, once.
private let appMakingGroup = GoingIn<NewGroupDraft>()
private let appJoiningGroup = GoingIn<JoiningAsk>()

extension EnvironmentValues {
  /// グループを作る's group being made, the app's one call under way
  /// (`GoingIn`), begun with the page's whole draft.
  @Entry var makingGroup = appMakingGroup
  /// 参加の画面's group being joined, the one under way.
  @Entry var joiningGroup = appJoiningGroup
}

extension View {
  /// The page waits on the app's call into a group (`GoingIn`), グループを
  /// 作る's or 参加の画面's, while the call is `mine`: `taken` gets its
  /// answer once, while the page shows. The call is the app's, so the
  /// page opened again after it was left finds it under way and waits on;
  /// a page that is gone takes nothing, and the call is forgotten as it
  /// ends, the group in the person's list and nothing opening by itself
  /// (spec/sync-protocol.md, Groups). Gone is off the navigation stack,
  /// the page's state let go of with it (`GoingIn.Place`): a page covered
  /// by one it pushed (アイコン, 終了日, the name and photo) is still
  /// there, and takes the answer as it shows again.
  func waiting<Asked: Sendable>(
    on going: GoingIn<Asked>, mine: @escaping (Asked) -> Bool = { _ in true },
    taken: @escaping (Result<InGroup, any Error>) -> Void
  ) -> some View {
    modifier(WaitingOnGoingIn(going: going, mine: mine, taken: taken))
  }
}

private struct WaitingOnGoingIn<Asked: Sendable>: ViewModifier {
  let going: GoingIn<Asked>
  let mine: (Asked) -> Bool
  let taken: (Result<InGroup, any Error>) -> Void
  /// Held while the page is on the stack; made as the page first shows.
  @State private var place: GoingIn<Asked>.Place?

  private var call: GoingIn<Asked>.Call? {
    going.underWay.flatMap { mine($0.asked) ? $0 : nil }
  }

  func body(content: Content) -> some View {
    content
      .task(id: call.map(ObjectIdentifier.init)) {
        if place == nil { place = going.place(mine: mine) }
        guard let call else { return }
        going.waitOn(call)
        let result = await call.answer.result
        // Covered or gone meanwhile, it takes nothing now: covered, it
        // takes the answer as it shows again.
        if Task.isCancelled { return }
        going.took(call)
        taken(result)
      }
  }
}
