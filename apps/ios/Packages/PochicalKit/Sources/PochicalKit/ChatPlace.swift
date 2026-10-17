import PochicalDesign

/// Where a chat is kept (spec/chat.md, Where a chat is kept): a group, whose
/// chats are 全体チャット and its one-to-one chats, or the user's chat with
/// Pochical's people. Every place keeps its chats alike, on the device by
/// its `id` as on the server; what its chats can do is its `rules`.
public enum ChatPlace: Hashable, Sendable {
  case group(GroupRow)
  case support

  /// The support chat's place on the device, in the tables a group's
  /// chats are kept in by the group's id: group ids are random, so none is
  /// named so.
  public static let supportID = "support"

  /// The place's id, as the device keeps its chats by.
  public var id: String {
    switch self {
    case .group(let group): group.id
    case .support: Self.supportID
    }
  }

  /// What the place's chats can do (design/src/chat.ts, chatPlaces).
  public var rules: ChatPlaceRules {
    switch self {
    case .group: .group
    case .support: .support
    }
  }

  /// The group, for what only a group has: its settings, its members'
  /// shifts.
  public var group: GroupRow? {
    if case .group(let group) = self { group } else { nil }
  }

  /// The place's name, as a chat's title says it: the group's, or the
  /// app's for Pochical's people.
  public var name: String {
    group?.name ?? "ポチカル"
  }
}
