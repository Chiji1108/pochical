package app.pochical.kit

import app.pochical.design.SyncLimits
import app.pochical.design.SyncSocket
import app.pochical.v1.Change
import app.pochical.v1.ClientFrame
import app.pochical.v1.ServerError
import app.pochical.v1.ServerFrame
import app.pochical.v1.acked
import app.pochical.v1.change
import app.pochical.v1.changes
import app.pochical.v1.pong
import app.pochical.v1.serverError
import app.pochical.v1.serverFrame
import app.pochical.v1.welcome
import java.util.concurrent.CopyOnWriteArrayList
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import okio.ByteString.Companion.toByteString

/**
 * The server as far as the kit's sync sees it, on a local port: better-auth's anonymous sign-in and
 * one user's User DO, which keeps each value's latest change at a cursor of its own, catches a
 * socket up from its Hello, answers Ping with Pong, applies each edit only when its clock is newer
 * and sends what changed to every socket before the sender's Acked (spec/sync-protocol.md).
 */
class FakeServer : AutoCloseable {
  private val server = MockWebServer()
  val url
    get() = server.url("/")

  /** The token the sign-in hands out; sockets with another get 401. */
  var token = "token-1"
  val userId = "user-1"

  /** The frames each socket sent, in order, one list a socket. */
  val sockets = CopyOnWriteArrayList<MutableList<ClientFrame>>()

  private val values = LinkedHashMap<String, Change>()
  private var cursor = 0L
  private val open = CopyOnWriteArrayList<WebSocket>()

  init {
    server.dispatcher =
      object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse =
          when (request.url.encodedPath) {
            "/api/auth/sign-in/anonymous" ->
              MockResponse.Builder()
                .addHeader("set-auth-token", token)
                .body("""{"token":"$token","user":{"id":"$userId","isAnonymous":true}}""")
                .build()
            "/v1/me/socket" ->
              if (request.headers["Authorization"] != "Bearer $token") MockResponse.Builder().code(401).build()
              else MockResponse.Builder().webSocketUpgrade(Socket()).build()
            else -> MockResponse.Builder().code(404).build()
          }
      }
    server.start()
  }

  /** The value the DO holds for the day's field, as it would send it. */
  @Synchronized fun day(date: String, field: Int): Change? = values["day/$date/$field"]

  private inner class Socket : WebSocketListener() {
    private val frames = mutableListOf<ClientFrame>().also { sockets += it }

    override fun onMessage(webSocket: WebSocket, text: String) {
      if (text == SyncSocket.keepaliveText) webSocket.send(SyncSocket.keepaliveReply)
    }

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
      val frame = ClientFrame.parseFrom(bytes.toByteArray())
      synchronized(frames) { frames += frame }
      synchronized(this@FakeServer) { take(frame, webSocket) }
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      open -= webSocket
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      open -= webSocket
    }
  }

  private fun take(frame: ClientFrame, socket: WebSocket) {
    when (frame.kindCase) {
      ClientFrame.KindCase.HELLO -> {
        socket.send(serverFrame { welcome = welcome { cursor = this@FakeServer.cursor; serverMs = System.currentTimeMillis() } })
        val after = values.values.filter { it.cursor > frame.hello.cursor }.sortedBy { it.cursor }
        if (after.isNotEmpty()) socket.send(serverFrame { changes = changes { changes += after } })
        open += socket
      }
      ClientFrame.KindCase.PING -> socket.send(serverFrame { pong = pong { nonce = frame.ping.nonce } })
      ClientFrame.KindCase.DAY_EDITS -> {
        val edits = frame.dayEdits.editsList
        if (edits.any { it.value.hlc.physicalMs > System.currentTimeMillis() + SyncLimits.clockAheadMs }) {
          socket.send(serverFrame { error = serverError { code = ServerError.Code.CODE_CLOCK_AHEAD } })
          socket.close(1008, "clock ahead")
          return
        }
        val changed = mutableListOf<Change>()
        for (edit in edits) {
          val key = change { day = edit.value }.valueKey!!
          val stored = values[key]
          if (stored == null || Clock.of(stored.day.hlc) < Clock.of(edit.value.hlc)) {
            cursor += 1
            val taken = change { cursor = this@FakeServer.cursor; day = edit.value }
            values[key] = taken
            changed += taken
          }
        }
        if (changed.isNotEmpty()) for (each in open) each.send(serverFrame { changes = changes { changes += changed } })
        socket.send(serverFrame { acked = acked { opIds += edits.map { it.opId } } })
      }
      else -> {}
    }
  }

  override fun close() = server.close()
}

private fun WebSocket.send(frame: ServerFrame) = send(frame.toByteArray().toByteString())
