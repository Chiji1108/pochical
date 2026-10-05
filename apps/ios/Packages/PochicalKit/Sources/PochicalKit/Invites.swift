import Connect
import Foundation
import PochicalDesign
import PochicalProto

/// The invitation code a link carries when it is one of Pochical's own,
/// https://pochical.app/invite/{code} (spec/chat.md, Pochical's invitation
/// links; spec/vectors/chat-text.json): the host in any case, a trailing
/// `/`, a query and a fragment allowed.
public func inviteCode(of url: URL) -> String? {
  guard url.scheme?.lowercased() == "https", url.host()?.lowercased() == "pochical.app" else {
    return nil
  }
  return codeIn(path: url.path(percentEncoded: false), after: "/invite/")
}

/// The invitation code a link opening the app carries: one of Pochical's
/// links, or the site's アプリで開く, pochical://invite/{code}.
public func openedInviteCode(of url: URL) -> String? {
  if url.scheme?.lowercased() == "pochical", url.host()?.lowercased() == "invite" {
    return codeIn(path: url.path(percentEncoded: false), after: "/")
  }
  return inviteCode(of: url)
}

private func codeIn(path: String, after prefix: String) -> String? {
  guard path.hasPrefix(prefix) else { return nil }
  var code = path.dropFirst(prefix.count)
  if code.hasSuffix("/") {
    code = code.dropLast()
  }
  let alphabet = Set(Invite.codeAlphabet)
  guard code.count == Invite.codeLength, code.allSatisfy(alphabet.contains) else {
    return nil
  }
  return String(code)
}

/// A group's invitation as the join screen shows it before joining.
public struct InviteDetails: Hashable, Sendable {
  public var groupID: String
  public var name: String
  /// The group's mark when it is an emoji; empty for other marks.
  public var emoji: String
  /// Everyone in the group as they appear in it, in the order they joined.
  public var members: [String]
  /// The user is in the group already.
  public var alreadyMember: Bool
  /// The group has its most members: joining would fail.
  public var full: Bool
}

/// Why an invitation cannot be taken up.
public enum InviteError: Error {
  /// No group uses the code: remade since, or the group is gone.
  case unusable
  /// The group has its most members.
  case full
  /// Anything else, as no connection.
  case failed
}

extension GroupCalls {
  /// Who is in the group the code opens, for the join screen.
  public func invite(code: String) async throws(InviteError) -> InviteDetails {
    var request = Pochical_V1_GetInviteRequest()
    request.inviteCode = code
    let answer = await client.getInvite(request: request, headers: (try? await account.headers()) ?? [:])
    switch answer.result {
    case .success(let invite):
      return InviteDetails(
        groupID: invite.groupID, name: invite.groupName, emoji: invite.groupEmoji,
        members: invite.members.map(\.displayName), alreadyMember: invite.alreadyMember,
        full: invite.full)
    case .failure(let error):
      throw InviteError(error)
    }
  }

  /// Joins the group the code opens as `displayName`; joining a group the
  /// user is in changes nothing. The group's id.
  public func join(code: String, displayName: String) async throws(InviteError) -> String {
    var request = Pochical_V1_JoinGroupRequest()
    request.inviteCode = code
    request.displayName = displayName
    let answer = await client.joinGroup(request: request, headers: (try? await account.headers()) ?? [:])
    switch answer.result {
    case .success(let joined): return joined.groupID
    case .failure(let error): throw InviteError(error)
    }
  }
}

extension InviteError {
  init(_ error: ConnectError) {
    switch error.code {
    case .notFound: self = .unusable
    case .resourceExhausted: self = .full
    default: self = .failed
    }
  }
}
