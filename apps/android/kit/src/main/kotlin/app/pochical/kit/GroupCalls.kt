package app.pochical.kit

import app.pochical.v1.ChatServiceClient
import app.pochical.v1.GroupServiceClient
import app.pochical.v1.LinkPreview
import app.pochical.v1.getLinkPreviewRequest
import app.pochical.v1.PushPlatform
import app.pochical.v1.UserServiceClient
import app.pochical.v1.MarkLook
import app.pochical.v1.createGroupRequest
import app.pochical.v1.getInviteLinkRequest
import app.pochical.v1.getInviteRequest
import app.pochical.v1.joinGroupRequest
import app.pochical.v1.leaveGroupRequest
import app.pochical.v1.registerPushTokenRequest
import app.pochical.v1.remakeInviteLinkRequest
import app.pochical.v1.removeMemberRequest
import app.pochical.v1.ReportReason
import app.pochical.v1.renameGroupRequest
import app.pochical.v1.reportRequest
import app.pochical.v1.reportedLine
import app.pochical.v1.setDisplayNameRequest
import app.pochical.v1.setGroupEndRequest
import app.pochical.v1.setGroupPhotoRequest
import app.pochical.v1.setBlockedRequest
import app.pochical.v1.setChatMutedRequest
import app.pochical.v1.setChatNotificationsRequest
import app.pochical.v1.setProfileRequest
import app.pochical.v1.setMarkLookRequest
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
  http: Lazy<OkHttpClient>,
  server: HttpUrl,
  private val photos: Photos,
  private val scope: CoroutineScope,
) {
  /** Made as the first call goes, as the kit's client is. */
  private val client by lazy {
    ProtocolClient(
      ConnectOkHttpClient(http.value),
      ProtocolClientConfig(host = server.toString().trimEnd('/'), serializationStrategy = GoogleJavaLiteProtobufStrategy()),
    )
  }
  private val groups
    get() = GroupServiceClient(client)

  private val users
    get() = UserServiceClient(client)

  private val chats
    get() = ChatServiceClient(client)

  /** The names, profiles and ways into a group kept, sent one at a time in the order they were kept. */
  private val kept = Channel<Kept<*>>(Channel.UNLIMITED)

  init {
    scope.launch {
      for (kept in kept) kept.run()
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

  /**
   * Keeps the face picked while joining or making the group [groupId], now the person is in it
   * (spec/sync-protocol.md, Profile). Someone who had no usual name ([asUsual]), whose name joining
   * or making the group made the usual one, keeps the face as theirs everywhere too, which the
   * group then shows as it shows anyone's usual ones; anyone else's face, or one not kept as usual,
   * is the group's own.
   */
  private suspend fun sendFace(face: JoinFace, asUsual: Boolean, groupId: String) {
    val usual =
      asUsual &&
        try {
          when (face) {
            JoinFace.Usual -> Unit
            is JoinFace.Held -> {
              sendHeldPhoto(face.photoId, PhotoShelf.Mine)
              setProfile(name = null, photoId = face.photoId)
            }
            JoinFace.None -> setProfile(name = null, photoId = "")
          }
          true
        } catch (e: CancellationException) {
          throw e
        } catch (_: Exception) {
          false
        }
    if (!usual) {
      when (face) {
        JoinFace.Usual -> Unit
        is JoinFace.Held -> {
          sendHeldPhoto(face.photoId, PhotoShelf.Group(groupId))
          setGroupPhoto(groupId, usual = false, photoId = face.photoId)
        }
        JoinFace.None -> setGroupPhoto(groupId, usual = false)
      }
    }
  }

  /**
   * How many hold each photo held for a face ([holdPhoto]): the screens that show it as the face
   * picked, and the call into a group begun with it. One not noted here, as after the app was
   * ended, is held once.
   */
  private val holders = HashMap<String, Int>()

  /**
   * One more holds the held photo [photoId]: the call into a group begun with it as the face, for
   * as long as it is under way, and the screen opened again while that call is, which takes the
   * call's face as its own ([GoingIn.Call.face]).
   */
  fun holdPhotoAgain(photoId: String) {
    synchronized(holders) { holders[photoId] = (holders[photoId] ?: 1) + 1 }
  }

  /**
   * One that held the held photo [photoId] lets go of it, in turn after what was kept before it:
   * a screen left for good or its face changed, a call into a group that has ended. The photo goes
   * from the device once none holds it, here alone: so a screen left while its call is under way
   * takes nothing from the call, and a call that fails takes nothing from the screen that will ask
   * again with the same face.
   */
  fun letGoOfPhoto(photoId: String): Deferred<Unit> = keep { letGo(photoId) }

  private suspend fun letGo(photoId: String) {
    val left = synchronized(holders) {
      val left = (holders[photoId] ?: 1) - 1
      if (left > 0) holders[photoId] = left else holders.remove(photoId)
      left
    }
    if (left <= 0) photos.release(photoId)
  }

  private fun <T> keep(send: suspend () -> T): Deferred<T> {
    val call = Kept(send)
    kept.trySend(call)
    return call.answer
  }

  private class Kept<T>(private val send: suspend () -> T) {
    val answer = CompletableDeferred<T>()

    suspend fun run() {
      try {
        answer.complete(send())
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        answer.completeExceptionally(e)
      }
    }
  }

  /**
   * グループを作る's way into the group its draft asks for ([GoingIn]), begun with the draft as 作る
   * sent it ([NewGroupDraft.sent]): a photo picked for its mark sent first for the group to take,
   * the group made ([create]), then the face kept in it. It fails as [create] does, or with
   * [MarkPhotoGone].
   */
  val making =
    GoingIn<NewGroupDraft> { draft, face, asUsual ->
      val request = checkNotNull(draft.sent) { "A group is made from the draft as it was sent" }
      entering(face, asUsual) {
        if (request.mark.photoId.isNotEmpty()) sendHeldPhoto(request.mark.photoId, PhotoShelf.Mine)
        create(request)
      }
    }

  /** 参加の画面's way into the group an invitation opens ([GoingIn]): joined ([join]), then the face kept in it. */
  val joining = GoingIn<JoinAsk> { ask, face, asUsual -> entering(face, asUsual) { join(ask.code, ask.displayName) } }

  /**
   * [enter] puts the person in a group, and the face picked on the way is kept once they are in it
   * ([sendFace]), so one that fails changes nothing; a face not kept leaves them in the group all
   * the same. One of what the kit keeps, in its turn and whole. A photo held for the face is held
   * by the call too from the moment it is begun until it has ended ([holdPhotoAgain],
   * [letGoOfPhoto]), whatever becomes of the screen that asked.
   */
  private fun entering(face: JoinFace, asUsual: Boolean, enter: suspend () -> String): Deferred<InGroup> {
    val held = (face as? JoinFace.Held)?.photoId?.also(::holdPhotoAgain)
    return keep {
      try {
        val groupId = enter()
        val faceKept =
          try {
            sendFace(face, asUsual, groupId)
            true
          } catch (e: CancellationException) {
            throw e
          } catch (_: Exception) {
            false
          }
        InGroup(groupId, faceKept)
      } finally {
        held?.let { letGo(it) }
      }
    }
  }

  /** Makes the group [request] asks for, with the user in it: the new group's id. One the server would refuse is not asked for. */
  suspend fun create(request: NewGroupRequest): String {
    require(request.fits) { "A group the server would refuse" }
    val groupId = call { headers ->
      groups
        .createGroup(
          createGroupRequest {
            name = request.name
            mark = request.mark.proto
            displayName = request.displayName
            requestId = request.id
            endsAtMs = request.endsAtMs
          },
          headers,
        )
        .answer()
        .groupId
    }
    releaseMark(request.mark)
    return groupId
  }

  /**
   * The page of [url], as the server reads it for a message being written (spec/chat.md, Previews);
   * null when it finds none.
   */
  suspend fun linkPreview(url: String): LinkPreview? = call { headers ->
    chats.getLinkPreview(getLinkPreviewRequest { this.url = url }, headers).answer().takeIf { it.hasPreview() }?.preview
  }

  /**
   * 通報 (spec/chat.md, Reporting and blocking): someone else's line of the group [groupId], sent with
   * the few around it as the group holds them, or a member, for [reason]. Nobody in the group is told.
   */
  suspend fun report(groupId: String, reason: ReportReason, what: Reported) = call { headers ->
    chats
      .report(
        reportRequest {
          this.groupId = groupId
          this.reason = reason
          when (what) {
            is Reported.Line -> line = reportedLine {
              threadId = what.threadId
              seq = what.seq
            }
            is Reported.Member -> userId = what.userId
          }
        },
        headers,
      )
      .answer()
  }

  /**
   * ブロック, or ブロックを解除 (spec/chat.md, Reporting and blocking), in every group the user shares with
   * [userId]: the device hears of it on the user's socket as a Block change, as their other devices do.
   */
  suspend fun setBlocked(userId: String, blocked: Boolean) = call { headers ->
    users
      .setBlocked(
        setBlockedRequest {
          this.userId = userId
          this.blocked = blocked
        },
        headers,
      )
      .answer()
  }

  /**
   * Turns the chat [threadId] of [groupId] off ([muted]) or on again (spec/chat.md, Notifications):
   * the device hears of it on the user's socket as a ChatMute change, as their other devices do.
   */
  suspend fun setChatMuted(groupId: String, threadId: String, muted: Boolean) = call { headers ->
    users
      .setChatMuted(
        setChatMutedRequest {
          this.groupId = groupId
          this.threadId = threadId
          this.muted = muted
        },
        headers,
      )
      .answer()
  }

  /** Sets メンションはいつも通知 for the account, heard of as a ChatNotifications change. */
  suspend fun setMentionsWhenMuted(on: Boolean) = call { headers ->
    users.setChatNotifications(setChatNotificationsRequest { mentionsWhenMuted = on }, headers).answer()
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
      endsAtMs = invite.endsAtMs,
    )
  }

  /**
   * Joins the group [code] opens as [displayName], the group's id; joining a group the user is in
   * changes nothing. [InviteFailure] when it cannot. A name the server would refuse is not asked for.
   */
  suspend fun join(code: String, displayName: String): String = inviting { headers ->
    if (!fitsPersonName(displayName)) throw InviteFailure(InviteFailure.Reason.Failed)
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

  /** Gives the group a new name and mark, which every member sees; one the server would refuse is not asked for. */
  suspend fun rename(groupId: String, name: String, mark: GroupMarkValue) = call { headers ->
    require(fitsGroupName(name) && fitsGroupMark(mark)) { "A group the server would refuse" }
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

  /**
   * Gives the group an end, changes it or, with 0, takes it away (spec/sync-protocol.md, A group's
   * end), which every member sees: [endsAtMs] as [groupEndsAt] gives it for the day picked.
   */
  suspend fun setEnd(groupId: String, endsAtMs: Long) = call { headers ->
    groups
      .setGroupEnd(
        setGroupEndRequest {
          this.groupId = groupId
          this.endsAtMs = endsAtMs
        },
        headers,
      )
      .answer()
    Unit
  }

  /**
   * How the user appears in the group from now on: empty, or their usual name, follows the usual one.
   * A name the server would refuse is not asked for.
   */
  suspend fun setDisplayName(groupId: String, displayName: String) = call { headers ->
    require(fitsPersonName(displayName)) { "A name the server would refuse" }
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
    require(name == null || fitsPersonName(name)) { "A name the server would refuse" }
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
   * Sets the shape the user's marks are drawn in, for their groups to draw them so
   * (spec/sync-protocol.md, Profile); the device hears of it from the user's socket.
   */
  suspend fun setMarkLook(look: MarkLook) = call { headers ->
    users.setMarkLook(setMarkLookRequest { this.look = look }, headers).answer()
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
  suspend fun holdPhoto(jpeg: ByteArray): String = photos.hold(jpeg).also { photoId -> synchronized(holders) { holders[photoId] = 1 } }

  /**
   * Sends a held photo ([holdPhoto]) to [shelf] under its id, as the page it was picked on is saved:
   * a group's mark or the usual face to the user's own photos, a face for one group to its photos.
   * [MarkPhotoGone] once the device has let it go.
   */
  suspend fun sendHeldPhoto(photoId: String, shelf: PhotoShelf) = account.asSignedIn { photos.sendHeld(photoId, shelf, it) }


  /** Sends [jpeg] to [shelf], the user's own photos or a group's: the id to name it by. */
  suspend fun sendPhoto(jpeg: ByteArray, shelf: PhotoShelf): String {
    val photoId = UUID.randomUUID().toString()
    account.asSignedIn { photos.send(jpeg, photoId, shelf, it) }
    return photoId
  }

  /** The photo [photoId] of [shelf], from the device or else the server. */
  suspend fun photo(photoId: String, shelf: PhotoShelf): ByteArray = account.asSignedIn { photos.photo(photoId, shelf, it) }

  /**
   * One of a chat's photos from the server, or its small version ([small]), for the app's image
   * cache, which keeps it: as the lines and quotes show it, or opened large and saved.
   */
  suspend fun chatPhoto(photoId: String, shelf: PhotoShelf, small: Boolean): ByteArray = account.asSignedIn { photos.fetch(photoId, shelf, it, small) }

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
