package app.pochical.kit

import android.util.Log
import app.pochical.design.Chat
import app.pochical.design.SyncSocket
import app.pochical.v1.ChatEdit
import app.pochical.v1.ChatSendContent
import app.pochical.v1.ClientFrame
import app.pochical.v1.ServerError
import app.pochical.v1.ServerFrame
import app.pochical.v1.Typing
import app.pochical.v1.chatEdits
import app.pochical.v1.chatPageRequest
import app.pochical.v1.chatPhotosRequest
import app.pochical.v1.clientFrame
import app.pochical.v1.hello
import app.pochical.v1.ping
import app.pochical.v1.typing as typingFrame
import kotlin.random.Random
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.selects.select
import okhttp3.HttpUrl
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString

/** Whose DO a socket reaches (spec/sync-protocol.md, Sockets). */
sealed interface Peer {
  /** The user's own: their values, their groups. */
  data object User : Peer

  /** A group's: its members, their shared values and its chats. */
  data class Group(val id: String) : Peer

  /** The user's chat with Pochical's people, kept as a group's chats are (spec/chat.md, Where a chat is kept). */
  data object Support : Peer

  /** The chats' place the socket reaches, by the id the device keeps its chats by; null for the user's own. */
  val placeId: String?
    get() =
      when (this) {
        User -> null
        is Group -> id
        Support -> Chat.supportPlace
      }

  companion object {
    /** The socket of the chats' place the device keeps by [placeId]: a group's, or the chat with Pochical's people's. */
    fun place(placeId: String): Peer = if (placeId == Chat.supportPlace) Support else Group(placeId)
  }
}

/**
 * Whom a stretch of the account connects as, from the moment it is signed in until the account
 * next changes: only [SyncAccount] makes them, and what a stretch brings back once it has ended is
 * dropped.
 */
class Credentials internal constructor(
  val generation: Long,
  val token: String,
  val userId: String,
  private val current: () -> Long,
) {
  val isCurrent: Boolean
    get() = current() == generation
}

/** The database is not the user's the socket was started as, or the account changed since. */
internal class NotTheOwner : Exception()

/**
 * A socket to one of the server's DOs (spec/sync-protocol.md, Sockets). It says Hello with the
 * device's cursor, corrects the device's time by Welcome (the user's), takes the catch-up and every
 * change after it into the database, and sends the outbox's edits as they come, which the server's
 * Acked then ends (Outbox). It keeps the socket alive and reconnects as [SocketState] rules, and
 * sends and takes only while the database is its user's, checked in the same transaction as each
 * read it sends from and each write it takes into. A group's also sends its chat outbox, takes the
 * pages of earlier lines it asks for, and passes on others' typing (spec/sync-protocol.md, Chat;
 * Typing).
 */
class SyncClient internal constructor(
  private val database: AppDatabase,
  val peer: Peer,
  private val server: HttpUrl,
  private val http: OkHttpClient,
  private val credentials: Credentials,
  /** What uploads a line's photos before it goes. */
  private val linePhotos: LinePhotos,
  scope: CoroutineScope,
  private val now: () -> Long = System::currentTimeMillis,
  private val random: Random = Random.Default,
  /** Told of each group the user left, once the device has let go of it. */
  private val left: suspend (groupId: String) -> Unit = {},
  /** Told once the server does not know the session: the account alone decides what comes of it. */
  private val signedOut: () -> Unit = {},
) : ChatSocket {
  /** The chats' place it reaches, null for the user's own DO. */
  private val place = peer.placeId

  private val mutableState = MutableStateFlow<SocketState>(SocketState.Closed)
  override val state: StateFlow<SocketState> = mutableState.asStateFlow()

  private val mutableTyping = MutableSharedFlow<Typing>(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)
  override val typing: SharedFlow<Typing> = mutableTyping.asSharedFlow()

  private val mutablePhotoPages = MutableSharedFlow<ChatPhotosPage>(extraBufferCapacity = 16, onBufferOverflow = BufferOverflow.DROP_OLDEST)
  override val photoPages: SharedFlow<ChatPhotosPage> = mutablePhotoPages.asSharedFlow()

  /** The socket past its Welcome, null while there is none: what is asked now goes on it. */
  @Volatile private var welcomed: WebSocket? = null

  /**
   * What the OS last said of the network, taken by the socket's loop: what it ends is the socket
   * open as it is taken. Only the last word counts, so a client long closed holds one at most.
   */
  private val network = Channel<SocketEvent>(Channel.CONFLATED)

  /**
   * How many times it was closed. A socket ends on a close even when it is started again before
   * the socket's loop sees [state] closed, which a state flow, keeping only its latest value, may
   * never show it.
   */
  private val closes = MutableStateFlow(0L)

  /** When the server last answered the keepalive. */
  @Volatile private var lastReplyMs = 0L

  /** The server refused the edits' clocks: they take new ones once the next Welcome corrects the time. */
  private var restampAfterWelcome = false

  private var catchUpNonce = 0

  /**
   * The groups held before a Reset of the user's socket, with their faces then, until its catch-up
   * has come: kept over the sockets in between, as the catch-up starts again on each.
   */
  private var heldBeforeReset: Map<String, List<String>>? = null

  init {
    scope.launch { run() }
  }

  /** Asked to be open: tries at once, the count started again; an open socket stays. */
  fun start() = on(SocketEvent.Start)

  fun close() {
    on(SocketEvent.Close)
    closes.update { it + 1 }
  }

  /** The network went: the socket closes at once and tries again as [SocketState] says. */
  fun networkLost() {
    network.trySend(SocketEvent.Dropped)
  }

  /** Another network became the default: an open socket closes at once, and it tries over that one. */
  fun networkChanged() {
    network.trySend(SocketEvent.NetworkChanged)
  }

  private fun on(event: SocketEvent) = mutableState.update { it.on(event) }

  private suspend fun run() {
    while (true) {
      when (val state = mutableState.value) {
        SocketState.Closed,
        is SocketState.Stopped -> mutableState.first { it is SocketState.Opening || it is SocketState.Waiting }
        is SocketState.Waiting -> coroutineScope {
          val most = reconnectWaitMost(state.tries, SyncSocket.reconnectFirstMs, SyncSocket.reconnectMostMs)
          val waited = async { delay(random.nextLong(most + 1L)) }
          val changed = async { mutableState.first { it != state } }
          // The network going while it waits changes nothing: the wait drawn goes on.
          do {
            select {
              waited.onAwait { on(SocketEvent.WaitOver) }
              changed.onAwait {}
              network.onReceive { on(it) }
            }
          } while (mutableState.value == state)
          coroutineContext.cancelChildren()
        }
        is SocketState.Opening -> {
          // Null when the app closed it: the state is already what the app made it.
          val ended = connect() ?: continue
          if (ended is SocketEvent.Refused) log("Stopped: ${ended.why}") else log("Socket ended: $ended")
          on(ended)
          if (ended == SocketEvent.ClockAhead) restampAfterWelcome = true
          if (ended == SocketEvent.Refused(Stop.SignedOut)) signedOut()
        }
        is SocketState.CatchingUp,
        SocketState.Current -> on(SocketEvent.Dropped)
      }
    }
  }

  /** What one socket brings, until it ends; the event that ended it, null when the app closed it. */
  private suspend fun connect(): SocketEvent? = coroutineScope {
    val closedBefore = closes.value
    val cursor =
      try {
        read { if (place != null) cursorOf(place) else state().cursor }
      } catch (_: NotTheOwner) {
        return@coroutineScope SocketEvent.Refused(Stop.NotTheOwner)
      }
    // What the OS said before this socket opens is not of the network it goes over.
    while (network.tryReceive().isSuccess) continue
    val messages = Channel<SocketMessage>(Channel.UNLIMITED)
    val request =
      Request.Builder().url(socketUrl()).header("Authorization", "Bearer ${credentials.token}").build()
    val socket = http.newWebSocket(request, Listener(messages))
    val sentMs = now()
    socket.send(clientFrame { hello = hello { protocolVersion = PROTOCOL_VERSION; this.cursor = cursor } })
    lastReplyMs = sentMs
    val closing = launch {
      combine(mutableState, closes) { state, closed -> state == SocketState.Closed || closed != closedBefore }.first { it }
      messages.send(SocketMessage.Closing)
    }
    val keepalive = launch { keepAlive(socket) }
    try {
      var ended: SocketEvent?
      do {
        val message =
          // The network before frames still queued: the next socket's catch-up brings them again.
          select {
            network.onReceive { SocketMessage.Ended(it) }
            messages.onReceive { it }
          }
        ended =
          when (message) {
            is SocketMessage.Text -> {
              if (message.text == SyncSocket.keepaliveReply) lastReplyMs = now()
              null
            }
            is SocketMessage.Binary -> take(ServerFrame.parseFrom(message.bytes.toByteArray()), socket, sentMs, messages)
            is SocketMessage.Closed ->
              if (message.code == SyncSocket.notMemberCloseCode) SocketEvent.Refused(Stop.NotMember) else SocketEvent.Dropped
            is SocketMessage.Failed ->
              when (message.status) {
                401 -> SocketEvent.Refused(Stop.SignedOut)
                403 -> SocketEvent.Refused(Stop.NotMember)
                else -> SocketEvent.Dropped
              }
            is SocketMessage.Ended -> message.event
            SocketMessage.Closing -> return@coroutineScope null
          }
      } while (ended == null)
      ended
    } catch (_: NotTheOwner) {
      SocketEvent.Refused(Stop.NotTheOwner)
    } catch (e: CancellationException) {
      throw e
    } catch (e: Exception) {
      // A frame the app cannot read or a write that failed: the next socket takes it all again.
      log("Socket failed: $e")
      SocketEvent.Dropped
    } finally {
      welcomed = null
      closing.cancel()
      keepalive.cancel()
      socket.cancel()
      coroutineContext.cancelChildren()
    }
  }

  /** Takes one frame; the event that ends the socket, or null while it goes on. */
  private suspend fun CoroutineScope.take(
    frame: ServerFrame,
    socket: WebSocket,
    sentMs: Long,
    messages: Channel<SocketMessage>,
  ): SocketEvent? {
    when (frame.kindCase) {
      ServerFrame.KindCase.WELCOME -> {
        // Before the Ping's send, whose wait would skew the clock's offset.
        val receivedMs = now()
        on(SocketEvent.Welcomed)
        catchUpNonce += 1
        socket.send(clientFrame { ping = ping { nonce = catchUpNonce } })
        log("Welcome at cursor ${frame.welcome.cursor}")
        welcomed = socket
        if (place != null) {
          launch {
            try {
              sendChatOutbox(socket, place)
            } catch (_: NotTheOwner) {
              messages.send(SocketMessage.Ended(SocketEvent.Refused(Stop.NotTheOwner)))
            } catch (_: SessionRefused) {
              // A photo's upload found the session unknown, as the socket's own 401 would.
              messages.send(SocketMessage.Ended(SocketEvent.Refused(Stop.SignedOut)))
            } catch (e: CancellationException) {
              throw e
            } catch (e: Exception) {
              // A write that failed, as a frame's would: the next socket sends them all again.
              log("Sending the chat outbox failed: $e")
              messages.send(SocketMessage.Ended(SocketEvent.Dropped))
            }
          }
        }
        if (peer == Peer.User) {
          write { welcome(sentMs, receivedMs, frame.welcome.serverMs) }
          if (restampAfterWelcome) {
            write { restamp(now()) }
            restampAfterWelcome = false
          }
          launch {
            try {
              sendOutbox(socket)
            } catch (_: NotTheOwner) {
              messages.send(SocketMessage.Ended(SocketEvent.Refused(Stop.NotTheOwner)))
            }
          }
        }
      }
      ServerFrame.KindCase.CHANGES -> {
        val changes = frame.changes.changesList
        if (place != null) {
          // The photos of a line taken back go from the device as it does.
          var letGo = emptyList<String>()
          takeInto(place) {
            letGo = photosLetGo(changes, place)
            take(changes, place)
          }
          linePhotos.files.forget(place, letGo)
          // A line of the member's the group took stops waiting, as its Acked would say.
          linePhotos.uploads.forget(changes.filter { it.hasChatLine() && it.chatLine.opId.isNotEmpty() }.map { it.chatLine.opId })
        } else {
          // A group left goes from the device with its lines' photos (spec/chat.md, Photos).
          var leaving = emptyMap<String, List<String>>()
          write {
            leaving = placesLeft(changes)
            take(changes)
            // Not one joined again later in the same changes.
            leaving = leaving.filterKeys { !isListed(it) }
          }
          // One a Reset's catch-up says was left goes now, with its mark's photo from before the Reset.
          heldBeforeReset?.let { held ->
            leaving = leaving.mapValues { (groupId, photos) -> (photos + held[groupId].orEmpty()).distinct() }
            heldBeforeReset = held - leaving.keys
          }
          letGo(leaving)
        }
        log("Took ${changes.size} changes")
      }
      ServerFrame.KindCase.RESET ->
        if (place != null) {
          // The lines come again, those taken back while away only as taken back: the photos held go with the lines.
          var letGo = emptyList<String>()
          takeInto(place) {
            letGo = photosHeld(place)
            resetGroup(place)
          }
          linePhotos.files.forget(place, letGo)
        } else {
          // Those held before an earlier Reset whose catch-up has not come yet are still to be found.
          val before = heldBeforeReset.orEmpty()
          val held = write { facesHeld().also { reset() } }
          heldBeforeReset = (before.keys + held.keys).associateWith { (before[it].orEmpty() + held[it].orEmpty()).distinct() }
        }
      ServerFrame.KindCase.ACKED -> {
        val acked = frame.acked
        if (place != null) {
          takeInto(place) { acknowledgeChat(acked.opIdsList, acked.refusedList.map { it.opId }) }
          // Done with, their photos' rings go with them.
          linePhotos.uploads.forget(acked.opIdsList)
        } else {
          write { acknowledge(acked.opIdsList) }
        }
        for (refused in acked.refusedList) log("A send was refused: ${refused.opId} ${refused.reason}")
        log("${acked.opIdsCount} edits acknowledged")
      }
      ServerFrame.KindCase.CHAT_PAGE -> if (place != null) takeInto(place) { take(frame.chatPage, place) }
      ServerFrame.KindCase.TYPING -> mutableTyping.tryEmit(frame.typing)
      ServerFrame.KindCase.CHAT_PHOTOS -> mutablePhotoPages.tryEmit(ChatPhotosPage.of(frame.chatPhotos))
      ServerFrame.KindCase.PONG ->
        if (frame.pong.nonce == catchUpNonce) {
          // A group a Reset's catch-up did not mention at all (the User DO restored from an older
          // copy that does not know it) comes again in no change: it goes as a group left does.
          heldBeforeReset?.let { held ->
            val gone = write { placesGone(held) }
            heldBeforeReset = null
            letGo(gone)
          }
          on(SocketEvent.CaughtUp)
        }
      ServerFrame.KindCase.ERROR ->
        return when (frame.error.code) {
          ServerError.Code.CODE_PROTOCOL_TOO_OLD -> SocketEvent.Refused(Stop.ProtocolTooOld)
          ServerError.Code.CODE_CLOCK_AHEAD -> SocketEvent.ClockAhead
          else -> {
            log("The server refused: ${frame.error.code} ${frame.error.message}")
            SocketEvent.Dropped
          }
        }
      else -> {}
    }
    return null
  }

  /** The groups left, with the photos the device held of them: their files go, and the app is told. */
  private suspend fun letGo(places: Map<String, List<String>>) {
    for ((groupId, photos) in places) {
      linePhotos.files.forgetPlace(groupId, photos)
      left(groupId)
    }
  }

  /**
   * Sends the outbox's edits in order, all of them on a new socket and then each as it is written;
   * an edit is sent again only on the next socket, until its Acked takes it out.
   */
  private suspend fun sendOutbox(socket: WebSocket) {
    var sent = 0L
    database.sync().lastWaiting().collect { last ->
      if (last == null || last <= sent) return@collect
      val (frames, through) = read { frames(after = sent) }
      for (frame in frames) socket.send(frame)
      sent = through
    }
  }

  /**
   * Sends the group's chat outbox as [sendOutbox] sends the user's, but for the lines that waited
   * too long, as after a long time offline, which wait for the member instead (spec/chat.md, Lines
   * on their way). Each edit is marked as gone out as it goes, so one taken back after is taken
   * back from the group too.
   */
  private suspend fun sendChatOutbox(socket: WebSocket, groupId: String) {
    var sent = 0L
    database.sync().lastChatWaiting(groupId).collect { last ->
      if (last == null || last <= sent) return@collect
      val (frames, through) = read { chatFrames(groupId, after = sent, now()) }
      for (frame in frames) {
        // A line of photos goes only once they are up, so the edits after it wait their turn.
        val uploaded = frame.chatEdits.editsList.filter { edit -> photosUp(edit, groupId) }
        val going = write { goOut(uploaded, now()) }
        if (going.isNotEmpty()) socket.send(clientFrame { chatEdits = chatEdits { edits += going } })
      }
      sent = through
    }
  }

  /**
   * Whether the [edit] goes now: any but a line of photos, and one of photos once they are all up
   * (spec/chat.md, Photos). One with a photo that cannot go is marked not sent, for the member to
   * send again or delete, and the edits after it go on; one the member stopped or took back while its
   * photos went up, or waited to, is left as they left it.
   */
  private suspend fun photosUp(edit: ChatEdit, groupId: String): Boolean {
    if (edit.kindCase != ChatEdit.KindCase.SEND || edit.send.content.kindCase != ChatSendContent.KindCase.PHOTOS) return true
    for (photoId in read { photosToUpload(edit.opId, now()) }) {
      if (!upload(photoId, edit.opId, groupId)) return false
    }
    // Stopped as the last bytes went: left as the member left it. Past here × does nothing, so the
    // line is sent as it shows.
    return write { sendOnceUp(edit.opId, now()) }
  }

  /**
   * Uploads one of a waiting line's photos, trying again after a wait that doubles, `PHOTO_TRIES`
   * times in all, and keeps it as up; true once up with the line still going. A photo that cannot go
   * (gone from the device, refused, or failing every try) marks the line not sent.
   */
  private suspend fun upload(photoId: String, opId: String, groupId: String): Boolean {
    var waitMs = PHOTO_RETRY_FIRST_MS
    repeat(PHOTO_TRIES) { tried ->
      if (!read { stillGoing(opId, now()) }) return false
      val began = now()
      try {
        linePhotos.upload(groupId, photoId, opId, credentials)
      } catch (_: PhotoStopped) {
        return false
      } catch (e: PhotoCannotGo) {
        log("A photo cannot go: $e")
        write { failChatEdits(listOf(opId)) }
        return false
      } catch (e: PhotoFailure) {
        log("A photo's upload failed: $e")
        if (tried == PHOTO_TRIES - 1) {
          write { failChatEdits(listOf(opId)) }
          return false
        }
        delay(waitMs)
        waitMs *= 2
        return@repeat
      }
      // Kept outside the upload's tries: the photo is up, and a write that fails here (the device
      // gone on as someone else) is no failed upload.
      write { photoUp(opId, photoId, began) }
      return read { stillGoing(opId, now()) }
    }
    return false
  }

  override fun requestPhotos(threadId: String, seq: Long, after: Boolean): Boolean =
    welcomed?.send(clientFrame { chatPhotosRequest = chatPhotosRequest { this.threadId = threadId; this.seq = seq; this.after = after } }) ?: false

  override fun requestPage(threadId: String, beforeSeq: Long): Boolean =
    welcomed?.send(clientFrame { chatPageRequest = chatPageRequest { this.threadId = threadId; this.beforeSeq = beforeSeq } }) ?: false

  override fun sendTyping(threadId: String, on: Boolean) {
    welcomed?.send(clientFrame { typing = typingFrame { this.threadId = threadId; this.on = on } })
  }

  /** Sends the keepalive text every so often, and takes the socket for dead when no answer comes in time. */
  private suspend fun keepAlive(socket: WebSocket) {
    while (true) {
      delay(SyncSocket.keepaliveEveryMs.toLong())
      val askedMs = now()
      socket.send(SyncSocket.keepaliveText)
      delay(SyncSocket.keepaliveWithinMs.toLong())
      if (lastReplyMs < askedMs) {
        socket.cancel()
        return
      }
    }
  }

  private fun socketUrl(): HttpUrl {
    val path =
      when (peer) {
        Peer.User -> "/v1/me/socket"
        is Peer.Group -> "/v1/groups/${peer.id}/socket"
        // The Worker sets the user's chat with Pochical's people up as it is first reached.
        Peer.Support -> "/v1/me/support/socket"
      }
    return server.resolve(path)!!
  }

  private suspend fun <T> write(block: suspend SyncDao.() -> T): T = database.write {
    ownedBy(credentials)
    block()
  }

  /** Takes what the group's socket brought, only while the user is in the group (`intoGroup`). */
  private suspend fun takeInto(groupId: String, block: suspend SyncDao.() -> Unit) = write { intoGroup(groupId, block) }

  private suspend fun <T> read(block: suspend SyncDao.() -> T): T = database.read {
    ownedBy(credentials)
    block()
  }

  private fun log(message: String) {
    Log.i(TAG, "$peer: $message")
  }

  private sealed interface SocketMessage {
    data class Text(val text: String) : SocketMessage

    class Binary(val bytes: ByteString) : SocketMessage

    data class Closed(val code: Int) : SocketMessage

    /** The socket failed: [status] is the upgrade's answer when the server refused it. */
    data class Failed(val status: Int?) : SocketMessage

    data class Ended(val event: SocketEvent) : SocketMessage

    /** The app closed it. */
    data object Closing : SocketMessage
  }

  private class Listener(private val messages: Channel<SocketMessage>) : WebSocketListener() {
    override fun onMessage(webSocket: WebSocket, text: String) {
      messages.trySend(SocketMessage.Text(text))
    }

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
      messages.trySend(SocketMessage.Binary(bytes))
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      messages.trySend(SocketMessage.Closed(code))
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      messages.trySend(SocketMessage.Failed(response?.code))
    }
  }

  companion object {
    /** The socket protocol this build speaks (apps/server/src/protocol.ts). */
    const val PROTOCOL_VERSION = 2

    private const val TAG = "PochicalSync"

    /** How many times a photo is tried before its line is not sent (spec/chat.md, Photos). */
    private const val PHOTO_TRIES = 5

    /** The wait before a photo is tried again the first time, doubling each time after. */
    private const val PHOTO_RETRY_FIRST_MS = 1_000L
  }
}

/** Throws unless the database is the user's [credentials] are of and the account has not changed since. */
internal suspend fun SyncDao.ownedBy(credentials: Credentials) {
  if (!credentials.isCurrent || state().owner != credentials.userId) throw NotTheOwner()
}

private fun WebSocket.send(frame: ClientFrame): Boolean = send(frame.toByteArray().toByteString())

/** What a chat's screen asks of its group's socket (spec/sync-protocol.md, Chat; Typing). */
interface ChatSocket {
  /** Where the socket is, for the chat's title to say 接続中… or 更新中… while it is not current. */
  val state: StateFlow<SocketState>

  /** Others writing in the group's chats, or no longer, as it comes; never kept. */
  val typing: SharedFlow<Typing>

  /**
   * Asks the group for a page of a chat's lines before [beforeSeq] (the latest with 0) when the
   * socket is open; the page comes into the database. False when it could not be asked, to ask
   * again once it is open.
   */
  fun requestPage(threadId: String, beforeSeq: Long): Boolean

  /**
   * Asks the group for a page of a chat's photos alone, before the line [seq] or [after] it (0 for
   * the latest, or after, from the first), when the socket is open; the page comes to [photoPages].
   * False when it could not be asked.
   */
  fun requestPhotos(threadId: String, seq: Long, after: Boolean): Boolean

  /** The pages of a chat's photos as they come, never kept (spec/sync-protocol.md, Chat). */
  val photoPages: SharedFlow<ChatPhotosPage>

  /** Says the member is writing in a chat, or stopped, when the socket is open; nothing waits, as typing is only now. */
  fun sendTyping(threadId: String, on: Boolean)
}
