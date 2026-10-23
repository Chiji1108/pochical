package app.pochical.kit

import android.util.Log
import app.pochical.design.SyncSocket
import app.pochical.v1.ClientFrame
import app.pochical.v1.ServerError
import app.pochical.v1.ServerFrame
import app.pochical.v1.clientFrame
import app.pochical.v1.hello
import app.pochical.v1.ping
import kotlin.random.Random
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.async
import kotlinx.coroutines.cancelChildren
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
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

  /** A group's: its members and their shared values. */
  data class Group(val id: String) : Peer
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
 * read it sends from and each write it takes into.
 */
class SyncClient internal constructor(
  private val database: AppDatabase,
  val peer: Peer,
  private val server: HttpUrl,
  private val http: OkHttpClient,
  private val credentials: Credentials,
  scope: CoroutineScope,
  private val now: () -> Long = System::currentTimeMillis,
  private val random: Random = Random.Default,
  /** Told once the server does not know the session: the account alone decides what comes of it. */
  private val signedOut: () -> Unit = {},
) {
  private val mutableState = MutableStateFlow<SocketState>(SocketState.Closed)
  val state: StateFlow<SocketState> = mutableState.asStateFlow()

  /**
   * What the OS last said of the network, taken by the socket's loop: what it ends is the socket
   * open as it is taken. Only the last word counts, so a client long closed holds one at most.
   */
  private val network = Channel<SocketEvent>(Channel.CONFLATED)

  /** When the server last answered the keepalive. */
  @Volatile private var lastReplyMs = 0L

  /** The server refused the edits' clocks: they take new ones once the next Welcome corrects the time. */
  private var restampAfterWelcome = false

  private var catchUpNonce = 0

  init {
    scope.launch { run() }
  }

  /** Asked to be open: tries at once, the count started again; an open socket stays. */
  fun start() = on(SocketEvent.Start)

  fun close() = on(SocketEvent.Close)

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
    val cursor =
      try {
        read { if (peer is Peer.Group) cursorOf(peer.id) else state().cursor }
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
      mutableState.first { it == SocketState.Closed }
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
        write { if (peer is Peer.Group) take(changes, peer.id) else take(changes) }
        log("Took ${changes.size} changes")
      }
      ServerFrame.KindCase.RESET -> write { if (peer is Peer.Group) resetGroup(peer.id) else reset() }
      ServerFrame.KindCase.ACKED -> {
        if (peer == Peer.User) write { acknowledge(frame.acked.opIdsList) }
        log("${frame.acked.opIdsCount} edits acknowledged")
      }
      ServerFrame.KindCase.PONG -> if (frame.pong.nonce == catchUpNonce) on(SocketEvent.CaughtUp)
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
      }
    return server.resolve(path)!!
  }

  private suspend fun <T> write(block: suspend SyncDao.() -> T): T = database.write {
    ownedBy(credentials)
    block()
  }

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
    const val PROTOCOL_VERSION = 1

    private const val TAG = "PochicalSync"
  }
}

/** Throws unless the database is the user's [credentials] are of and the account has not changed since. */
internal suspend fun SyncDao.ownedBy(credentials: Credentials) {
  if (!credentials.isCurrent || state().owner != credentials.userId) throw NotTheOwner()
}

private fun WebSocket.send(frame: ClientFrame) = send(frame.toByteArray().toByteString())
