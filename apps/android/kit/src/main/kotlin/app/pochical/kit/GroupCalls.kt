package app.pochical.kit

import app.pochical.v1.GroupServiceClient
import app.pochical.v1.PushPlatform
import app.pochical.v1.UserServiceClient
import app.pochical.v1.createGroupRequest
import app.pochical.v1.getInviteLinkRequest
import app.pochical.v1.getInviteRequest
import app.pochical.v1.joinGroupRequest
import app.pochical.v1.leaveGroupRequest
import app.pochical.v1.registerPushTokenRequest
import app.pochical.v1.remakeInviteLinkRequest
import app.pochical.v1.removeMemberRequest
import app.pochical.v1.renameGroupRequest
import app.pochical.v1.setDisplayNameRequest
import app.pochical.v1.setGroupPhotoRequest
import app.pochical.v1.setProfileRequest
import com.connectrpc.Code
import com.connectrpc.ConnectException
import com.connectrpc.ProtocolClientConfig
import com.connectrpc.ResponseMessage
import com.connectrpc.extensions.GoogleJavaLiteProtobufStrategy
import com.connectrpc.impl.ProtocolClient
import com.connectrpc.okhttp.ConnectOkHttpClient
import java.util.UUID
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Deferred
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.launch
import okhttp3.HttpUrl
import okhttp3.OkHttpClient

/**
 * The server's GroupService (proto/pochical/v1/group.proto), and the user's profile and photos, as
 * the user the device is signed in as ([SyncAccount.asSignedIn]): what the device hears back of a
 * change comes on the sockets, as for every value. Each call throws [NotSignedIn] when the device has
 * no session to go as, and [ConnectException] or [PhotoFailure] when the server cannot be asked or
 * refuses.
 */
class GroupCalls internal constructor(
  private val account: SyncAccount,
  http: OkHttpClient,
  server: HttpUrl,
  private val photos: Photos,
  private val scope: CoroutineScope,
) {
  private val client =
    ProtocolClient(
      ConnectOkHttpClient(http),
      ProtocolClientConfig(host = server.toString().trimEnd('/'), serializationStrategy = GoogleJavaLiteProtobufStrategy()),
    )
  private val groups = GroupServiceClient(client)
  private val users = UserServiceClient(client)

  /** The names and profiles kept, sent one at a time in the order they were kept. */
  private val kept = Channel<Kept>(Channel.UNLIMITED)

  init {
    scope.launch {
      for (kept in kept) {
        try {
          kept.send()
          kept.answer.complete(Unit)
        } catch (e: CancellationException) {
          throw e
        } catch (e: Exception) {
          kept.answer.completeExceptionally(e)
        }
      }
    }
  }

  /**
   * Keeps [name] as how the user appears in the group (as [setDisplayName]), as a field, its page or
   * the app is left (spec/sync-protocol.md, Profile): taken at once, before the page that asked goes,
   * and sent by the kit after those kept before it, whether the page still waits or not. The page
   * may await the answer while it is there.
   */
  fun keepDisplayName(groupId: String, name: String): Deferred<Unit> = keep { setDisplayName(groupId, name) }

  /**
   * Keeps the user's usual name, photo or both (spec/sync-protocol.md, Profile), as [keepDisplayName]
   * keeps a group's name: taken at once and sent in turn by the kit, whether the page still waits or
   * not. What is not given stays as the account has it, another device's change included; a new photo
   * goes up to the user's own photos first.
   */
  fun keepProfile(name: String? = null, photo: UsualPhoto? = null): Deferred<Unit> = keep {
    val photoId =
      when (photo) {
        null -> null
        UsualPhoto.None -> ""
        is UsualPhoto.New -> sendPhoto(photo.jpeg, PhotoShelf.Mine)
      }
    setProfile(name, photoId)
  }

  private fun keep(send: suspend () -> Unit): Deferred<Unit> {
    val call = Kept(send)
    kept.trySend(call)
    return call.answer
  }

  private class Kept(val send: suspend () -> Unit) {
    val answer = CompletableDeferred<Unit>()
  }

  /** Makes the group [request] asks for, with the user in it: the new group's id. */
  suspend fun create(request: NewGroupRequest): String {
    val groupId = call { headers ->
      groups
        .createGroup(
          createGroupRequest {
            name = request.name
            mark = request.mark.proto
            displayName = request.displayName
            requestId = request.id
          },
          headers,
        )
        .answer()
        .groupId
    }
    releaseMark(request.mark)
    return groupId
  }

  /** The group's live invitation code. */
  suspend fun inviteCode(groupId: String): String = call { headers ->
    groups.getInviteLink(getInviteLinkRequest { this.groupId = groupId }, headers).answer().inviteCode
  }

  /** A new invitation code for the group: the old link and QR code stop working at once. */
  suspend fun remakeInviteCode(groupId: String): String = call { headers ->
    groups.remakeInviteLink(remakeInviteLinkRequest { this.groupId = groupId }, headers).answer().inviteCode
  }

  /** Who is in the group [code] opens, for the join screen; [InviteFailure] when it cannot be read. */
  suspend fun invite(code: String): InviteDetails = inviting { headers ->
    val invite = groups.getInvite(getInviteRequest { inviteCode = code }, headers).answer()
    InviteDetails(
      groupId = invite.groupId,
      name = invite.groupName,
      mark = invite.groupMark.value,
      members = invite.membersList.map { InvitedMember(it.displayName, it.photoId) },
      alreadyMember = invite.alreadyMember,
      full = invite.full,
    )
  }

  /**
   * Joins the group [code] opens as [displayName], the group's id; joining a group the user is in
   * changes nothing. [InviteFailure] when it cannot.
   */
  suspend fun join(code: String, displayName: String): String = inviting { headers ->
    groups
      .joinGroup(
        joinGroupRequest {
          inviteCode = code
          this.displayName = displayName
        },
        headers,
      )
      .answer()
      .groupId
  }

  /** Gives the group a new name and mark, which every member sees. */
  suspend fun rename(groupId: String, name: String, mark: GroupMarkValue) = call { headers ->
    groups
      .renameGroup(
        renameGroupRequest {
          this.groupId = groupId
          this.name = name
          this.mark = mark.proto
        },
        headers,
      )
      .answer()
    releaseMark(mark)
  }

  /** How the user appears in the group from now on: empty, or their usual name, follows the usual one. */
  suspend fun setDisplayName(groupId: String, displayName: String) = call { headers ->
    groups
      .setDisplayName(
        setDisplayNameRequest {
          this.groupId = groupId
          this.displayName = displayName
        },
        headers,
      )
      .answer()
    Unit
  }

  /** The user's photo in the group: their usual one, one of the group's they sent ([sendPhoto]), or none (empty). */
  suspend fun setGroupPhoto(groupId: String, usual: Boolean, photoId: String = "") = call { headers ->
    groups
      .setGroupPhoto(
        setGroupPhotoRequest {
          this.groupId = groupId
          this.usual = usual
          this.photoId = photoId
        },
        headers,
      )
      .answer()
    Unit
  }

  /** Takes the user out of the group. */
  suspend fun leave(groupId: String) = call { headers ->
    groups.leaveGroup(leaveGroupRequest { this.groupId = groupId }, headers).answer()
    Unit
  }

  /** Takes another member out of the group, as leaving takes the user; the group remembers who did it. */
  suspend fun remove(groupId: String, userId: String) = call { headers ->
    groups
      .removeMember(
        removeMemberRequest {
          this.groupId = groupId
          this.userId = userId
        },
        headers,
      )
      .answer()
    Unit
  }

  /**
   * Sets the user's usual name and photo (spec/sync-protocol.md, Profile), each empty for none, and
   * either left as the account has it when not given.
   */
  suspend fun setProfile(name: String?, photoId: String?) = call { headers ->
    users
      .setProfile(
        setProfileRequest {
          name?.let { this.name = it }
          photoId?.let { this.photoId = it }
        },
        headers,
      )
      .answer()
    Unit
  }

  /**
   * Keeps this device's FCM registration [token] with the server, under the session the device has
   * now, for the user's notifications to reach it (spec/sync-protocol.md, Push).
   */
  suspend fun registerPushToken(token: String) = call { headers ->
    users
      .registerPushToken(
        registerPushTokenRequest {
          this.token = token
          platform = PushPlatform.PUSH_PLATFORM_FCM
        },
        headers,
      )
      .answer()
    Unit
  }

  /**
   * Keeps a photo picked on a page on the device, under the id it is then sent as, to send only as
   * the page is saved: a group's mark, or a face chosen before joining. The id outlives the activity
   * made anew and the process's death, as the page's saved state does.
   */
  suspend fun holdPhoto(jpeg: ByteArray): String = photos.hold(jpeg)

  /**
   * Sends a held photo ([holdPhoto]) to [shelf] under its id, as the page it was picked on is saved:
   * a group's mark or the usual face to the user's own photos, a face for one group to its photos.
   * [MarkPhotoGone] once the device has let it go.
   */
  suspend fun sendHeldPhoto(photoId: String, shelf: PhotoShelf) = account.asSignedIn { photos.sendHeld(photoId, shelf, it) }

  /** Lets go of a held photo the person no longer means to send, as a join screen closed without joining. */
  suspend fun releasePhoto(photoId: String) = photos.release(photoId)

  /** Sends [jpeg] to [shelf], the user's own photos or a group's: the id to name it by. */
  suspend fun sendPhoto(jpeg: ByteArray, shelf: PhotoShelf): String {
    val photoId = UUID.randomUUID().toString()
    account.asSignedIn { photos.send(jpeg, photoId, shelf, it) }
    return photoId
  }

  /** The photo [photoId] of [shelf], from the device or else the server. */
  suspend fun photo(photoId: String, shelf: PhotoShelf): ByteArray = account.asSignedIn { photos.photo(photoId, shelf, it) }

  /** A photo mark the group has taken a copy of is let go of on the device, which held it until now. */
  private suspend fun releaseMark(mark: GroupMarkValue) {
    if (mark.photoId.isNotEmpty()) photos.release(mark.photoId)
  }

  private suspend fun <T> call(call: suspend (Map<String, List<String>>) -> T): T =
    account.asSignedIn { credentials ->
      try {
        call(mapOf("Authorization" to listOf("Bearer ${credentials.token}")))
      } catch (e: ConnectException) {
        if (e.code == Code.UNAUTHENTICATED) throw SessionRefused()
        throw e
      }
    }

  /** A call on an invitation: what the server says of it as [InviteFailure]. */
  private suspend fun <T> inviting(call: suspend (Map<String, List<String>>) -> T): T =
    try {
      call(call)
    } catch (e: ConnectException) {
      throw InviteFailure(
        when (e.code) {
          Code.NOT_FOUND -> InviteFailure.Reason.Unusable
          Code.RESOURCE_EXHAUSTED -> InviteFailure.Reason.Full
          else -> InviteFailure.Reason.Failed
        },
        e,
      )
    } catch (e: NotSignedIn) {
      throw InviteFailure(InviteFailure.Reason.Failed, e)
    }
}

private fun <T> ResponseMessage<T>.answer(): T =
  when (this) {
    is ResponseMessage.Success -> message
    is ResponseMessage.Failure -> throw cause
  }
