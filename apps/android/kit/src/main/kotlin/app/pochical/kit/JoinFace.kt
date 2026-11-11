package app.pochical.kit

/**
 * The face of the person joining a group or making one, as picked on that screen: their usual one,
 * one picked there (held on the device under the id it is sent as, [GroupCalls.holdPhoto]), or none.
 */
sealed interface JoinFace {
  data object Usual : JoinFace

  data class Held(val photoId: String) : JoinFace

  data object None : JoinFace
}

/**
 * How someone joining a group or making one is asked for their name and photo
 * (spec/sync-protocol.md, Profile; spec/vectors/profile.json): [asUsual] with no usual name yet, the
 * name and face asked becoming the usual ones, and a [drawing] put in place with no usual photo
 * either.
 */
data class ProfileAsking(val asUsual: Boolean, val drawing: Boolean)

/**
 * How the person is asked, once the device knows the account's usual name and photo: null until
 * the user's socket has caught up ([userSocket]), as a device just signed in to an account in use
 * holds no [profile] until then, which says nothing of the account's.
 */
fun profileAsking(userSocket: SocketState, profile: ProfileRow?): ProfileAsking? {
  if (userSocket != SocketState.Current) return null
  val asUsual = profile?.name.isNullOrEmpty()
  return ProfileAsking(asUsual, drawing = asUsual && profile?.photoId.isNullOrEmpty())
}
