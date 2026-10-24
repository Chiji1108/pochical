package app.pochical.kit

import app.pochical.design.Invite
import java.net.URI
import java.net.URISyntaxException

/** The site invitation links name, https://pochical.app/invite/{code} (design/src/invite.ts). */
private const val INVITE_HOST = "pochical.app"

/** The link an invitation code opens. */
fun inviteLink(code: String): String = "https://$INVITE_HOST/invite/$code"

/**
 * The invitation code a link carries when it is one of Pochical's own (spec/vectors/chat-text.json,
 * inviteCode): the host in any case, a trailing `/`, a query and a fragment allowed.
 */
fun inviteCode(url: String): String? {
  val uri = parsed(url) ?: return null
  if (!uri.scheme.equals("https", ignoreCase = true) || !uri.host.equals(INVITE_HOST, ignoreCase = true)) return null
  return codeIn(uri.path, after = "/invite/")
}

/**
 * The invitation code a link opening the app carries (spec/vectors/groups.json, openedInviteCode):
 * the site's アプリで開く, pochical://invite/{code}, or one of Pochical's own links.
 */
fun openedInviteCode(url: String): String? {
  val uri = parsed(url) ?: return null
  if (uri.scheme.equals("pochical", ignoreCase = true)) {
    return if (uri.host.equals("invite", ignoreCase = true)) codeIn(uri.path, after = "/") else null
  }
  return inviteCode(url)
}

private fun parsed(url: String): URI? =
  try {
    URI(url)
  } catch (_: URISyntaxException) {
    null
  }

private fun codeIn(path: String?, after: String): String? {
  if (path == null || !path.startsWith(after)) return null
  val code = path.removePrefix(after).removeSuffix("/")
  return code.takeIf { it.length == Invite.codeLength && it.all { letter -> letter in Invite.codeAlphabet } }
}

/** A group's invitation as the join screen shows it before joining. */
data class InviteDetails(
  val groupId: String,
  val name: String,
  val mark: GroupMarkValue,
  /** Everyone in the group, as they appear in it, in the order they joined. */
  val members: List<InvitedMember>,
  /** The user is in the group already. */
  val alreadyMember: Boolean,
  /** The group has its most members: joining would fail. */
  val full: Boolean,
)

/** Someone in a group as its join screen shows them: their photo read by the code's holder, empty for none. */
data class InvitedMember(val name: String, val photoId: String)

/** Why an invitation cannot be taken up. */
class InviteFailure(val reason: Reason, cause: Throwable? = null) : Exception(reason.name, cause) {
  enum class Reason {
    /** No group uses the code: remade since, or the group is gone. */
    Unusable,

    /** The group has its most members. */
    Full,

    /** Anything else, as no connection. */
    Failed,
  }
}
