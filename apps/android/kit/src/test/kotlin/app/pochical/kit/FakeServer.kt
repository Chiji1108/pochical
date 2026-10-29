package app.pochical.kit

import app.pochical.design.Chat
import app.pochical.design.SyncLimits
import app.pochical.design.SyncSocket
import app.pochical.v1.Change
import app.pochical.v1.ClientFrame
import app.pochical.v1.DayField
import app.pochical.v1.ServerError
import app.pochical.v1.ServerFrame
import app.pochical.v1.SignInProvider
import app.pochical.v1.DeleteAccountRequest
import app.pochical.v1.SetDisplayNameRequest
import app.pochical.v1.SetProfileRequest
import app.pochical.v1.setProfileResponse
import app.pochical.v1.setDisplayNameResponse
import app.pochical.v1.deleteAccountResponse
import app.pochical.v1.getMeResponse
import app.pochical.v1.peekAccountResponse
import app.pochical.v1.takeAccountResponse
import app.pochical.v1.ChatEdit
import app.pochical.v1.ChatLine
import app.pochical.v1.RefusedSend
import app.pochical.v1.acked
import app.pochical.v1.chatContent
import app.pochical.v1.chatLine
import app.pochical.v1.chatPage
import app.pochical.v1.chatPoll
import app.pochical.v1.chatTakenBack
import app.pochical.v1.chatWords
import app.pochical.v1.readMark
import app.pochical.v1.refusedSend
import app.pochical.v1.typing
import app.pochical.v1.change
import app.pochical.v1.changes
import app.pochical.v1.dayValue
import app.pochical.v1.hlc
import app.pochical.v1.pong
import app.pochical.v1.serverError
import app.pochical.v1.serverFrame
import app.pochical.v1.welcome
import app.pochical.v1.patternValue
import app.pochical.v1.pattern
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.CopyOnWriteArrayList
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger
import mockwebserver3.Dispatcher
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import mockwebserver3.RecordedRequest
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.Buffer
import okio.ByteString
import okio.ByteString.Companion.toByteString

/**
 * The server as far as the kit's sync sees it, on a local port: better-auth's anonymous sign-in, and
 * each user's User DO, which keeps each value's latest change at a cursor of its own, catches a
 * socket up from its Hello, answers Ping with Pong, applies each edit only when its clock is newer
 * and sends what changed to every socket of that user before the sender's Acked
 * (spec/sync-protocol.md). Besides the anonymous user it signs in, a provider's account may be
 * another user's ([inUse]), to switch to or take.
 */
class FakeServer : AutoCloseable {
  private val server = MockWebServer()
  val url
    get() = server.url("/")

  /** The token the sign-in hands out; sockets with another get 401. */
  @Volatile var token = "token-1"
  @Volatile var userId = "user-1"

  /** How many anonymous sign-ins it answered. */
  val signIns = AtomicInteger()

  /** How long the anonymous sign-in takes to answer, in milliseconds. */
  @Volatile var signInDelayMs = 0L

  /** What the anonymous sign-in answers in its body, null for the user as better-auth gives it. */
  @Volatile var signInBody: String? = null

  /** How long `GetMe` takes to answer, in milliseconds, read as each call comes in. */
  @Volatile var getMeDelayMs = 0L

  /** How many `GetMe` calls have come in. */
  val getMes = AtomicInteger()

  /**
   * The provider each user is linked to, as `GetMe` says it to them alone; none for one not in it, as
   * an anonymous user is.
   */
  val linked = ConcurrentHashMap<String, SignInProvider>()

  /** The provider the anonymous user it signs in now ([userId]) is linked to. */
  var provider: SignInProvider
    get() = linked[userId] ?: SignInProvider.SIGN_IN_PROVIDER_UNSPECIFIED
    set(value) {
      linked[userId] = value
    }

  /** What `/link-social` answers: 200 links, 409 is an account in use. */
  @Volatile var linkStatus = 200

  /** Each `/link-social` call, as its Authorization header and its body. */
  val links = CopyOnWriteArrayList<Pair<String?, String>>()

  /** The frames each socket sent, in order, one list a socket. */
  val sockets = CopyOnWriteArrayList<MutableList<ClientFrame>>()

  /** How many of the user's sockets it refused with 401, their session unknown. */
  val refusedSockets = AtomicInteger()

  /** How many `GetMe`s it refused with 401, their session unknown. */
  val refusedGetMes = AtomicInteger()

  /** The user the provider's account is linked to, as from another phone, with its session; null for none. */
  @Volatile var inUse: Pair<String, String>? = null

  /** What `PeekAccount` says the account in use holds. */
  @Volatile var held = Holdings()

  /** What `/sign-in/social` and `PeekAccount` answer: 200, or 403 for an account suspended. */
  @Volatile var socialStatus = 200

  /** How long `DeleteAccount` takes to answer, in milliseconds. */
  @Volatile var deleteDelayMs = 0L

  /** What `DeleteAccount` answers, as Connect's code, null for done. */
  @Volatile var deleteRefusal: String? = null

  /** What `/sign-out` answers: 200 ends the session, or answers for one it does not know, as better-auth does. */
  @Volatile var signOutStatus = 200

  /** Each UserService and better-auth call past the sign-in and GetMe, as its path and Authorization header. */
  val calls = CopyOnWriteArrayList<Pair<String, String?>>()

  /** Each `SetDisplayName` the server took, in the order it took them. */
  val displayNames = CopyOnWriteArrayList<SetDisplayNameRequest>()

  /** Each `SetProfile` the server took, in the order it took them. */
  val profiles = CopyOnWriteArrayList<SetProfileRequest>()

  /** The ids of the photos put in a user's own photos, in the order they came. */
  val ownPhotos = CopyOnWriteArrayList<String>()

  /** The ids of the photos put in groups' photos, in the order they came, a small version's ending in ?small. */
  val groupPhotos = CopyOnWriteArrayList<String>()

  /** The ids of the photos sent to the chat with Pochical's people, in the order they came. */
  val supportPhotos = CopyOnWriteArrayList<String>()

  /** What each line sent said of the app and the device (`ChatSend.device`), by its send's op_id. */
  val sentDevices = ConcurrentHashMap<String, String>()

  /** The paths the sockets of the chats' places were opened at. */
  val placeSockets = CopyOnWriteArrayList<String>()

  /** What a group's photo put answers: 204 keeps it. */
  @Volatile var photoStatus = 204

  /** How long a group's photo put waits before it answers, in milliseconds. */
  @Volatile var photoDelayMs = 0L

  /** How long `SetDisplayName` takes to answer, in milliseconds. */
  @Volatile var displayNameDelayMs = 0L

  /** The users `DeleteAccount` deleted, and the Apple code each was asked with. */
  val deleted = CopyOnWriteArrayList<Pair<String, DeleteAccountRequest>>()

  /** Whether a group refuses the chat sends it is sent, as not fitting. */
  @Volatile var refuseSends = false

  /** A group's frame of chat edits sending a line, held unanswered. */
  private data class HeldSend(val user: String, val groupId: String, val frame: ClientFrame, val socket: WebSocket)

  private var holdingSends = false
  private val heldSends = mutableListOf<HeldSend>()

  /**
   * Holds the groups' frames that send lines unanswered, as a server slow to take them, until
   * [releaseSends]: what a device shows while its lines wait, seen for as long as the test looks.
   */
  @Synchronized
  fun holdSends() {
    holdingSends = true
  }

  /** How many frames sending lines are held. */
  @Synchronized fun sendsHeld(): Int = heldSends.size

  /** Takes the frames held, in the order they came, and those coming after at once. */
  @Synchronized
  fun releaseSends() {
    holdingSends = false
    heldSends.forEach { takeGroup(it.user, it.groupId, it.frame, it.socket) }
    heldSends.clear()
  }

  /** Each group's log of chat changes, as its Group DO keeps them, the latest of each line or mark. */
  private val groupLogs = HashMap<String, LinkedHashMap<String, Change>>()
  private val groupCursors = HashMap<String, Long>()
  private val groupSockets = HashMap<String, CopyOnWriteArrayList<WebSocket>>()

  private val values = HashMap<String, LinkedHashMap<String, Change>>()
  private val cursors = HashMap<String, Long>()
  private val open = HashMap<String, CopyOnWriteArrayList<WebSocket>>()

  /** The user whose session [authorization] is, as `Bearer <token>`, or null. */
  private fun userOf(authorization: String?): String? =
    when (authorization) {
      "Bearer $token" -> userId
      inUse?.let { "Bearer ${it.first}" } -> inUse?.second
      else -> authorization?.removePrefix("Bearer ")?.let { earlier[it] }
    }

  /** Anonymous users signed in before the last, by their sessions, until deleted. */
  private val earlier = ConcurrentHashMap<String, String>()

  /** Whether the last anonymous user's session went to a device. */
  @Volatile private var handedOut = false

  /** Each anonymous sign-in makes a new user, as better-auth's does; the one before stays. */
  @Synchronized
  private fun anotherAnonymous() {
    val made = signIns.incrementAndGet()
    if (handedOut) {
      earlier[token] = userId
      token = "token-$made"
      userId = "user-$made"
    }
    handedOut = true
  }

  init {
    server.dispatcher =
      object : Dispatcher() {
        override fun dispatch(request: RecordedRequest): MockResponse =
          when (request.url.encodedPath) {
            "/api/auth/sign-in/anonymous" ->
              MockResponse.Builder()
                .also { anotherAnonymous() }
                .headersDelay(signInDelayMs, TimeUnit.MILLISECONDS)
                .addHeader("set-auth-token", token)
                .body(signInBody ?: """{"token":"$token","user":{"id":"$userId","isAnonymous":true}}""")
                .build()
            "/pochical.v1.UserService/GetMe" ->
              when (val user = userOf(request.headers["Authorization"])) {
                null -> refused("unauthenticated").also { refusedGetMes.incrementAndGet() }
                else ->
                  MockResponse.Builder()
                    .also { getMes.incrementAndGet() }
                    .headersDelay(getMeDelayMs, TimeUnit.MILLISECONDS)
                    .addHeader("Content-Type", "application/proto")
                    .body(Buffer().write(getMeResponse { userId = user; provider = linked[user] ?: SignInProvider.SIGN_IN_PROVIDER_UNSPECIFIED }.toByteArray()))
                    .build()
              }
            "/api/auth/sign-in/social" -> {
              calls += request.url.encodedPath to request.headers["Authorization"]
              val account = inUse
              when {
                socialStatus == 403 -> MockResponse.Builder().code(403).body("""{"code":"USER_SUSPENDED"}""").build()
                account == null -> MockResponse.Builder().code(401).body("{}").build()
                else ->
                  MockResponse.Builder()
                    .addHeader("set-auth-token", account.first)
                    .body("""{"token":"${account.first}","user":{"id":"${account.second}"}}""")
                    .build()
              }
            }
            "/pochical.v1.UserService/PeekAccount" -> {
              calls += request.url.encodedPath to request.headers["Authorization"]
              when {
                userOf(request.headers["Authorization"]) == null -> refused("unauthenticated")
                socialStatus == 403 -> refused("permission_denied")
                else ->
                  proto(
                    peekAccountResponse {
                      shiftDays = held.shiftDays
                      repeating = held.repeating
                      coworkers = held.coworkers
                      groups = held.groups
                    }
                  )
              }
            }
            "/pochical.v1.UserService/TakeAccount" -> {
              calls += request.url.encodedPath to request.headers["Authorization"]
              when (val user = userOf(request.headers["Authorization"])) {
                null -> refused("unauthenticated")
                else -> {
                  // The provider's account goes to the user who took it.
                  inUse?.second?.let { taken -> linked.remove(taken)?.let { linked[user] = it } }
                  inUse = null
                  proto(takeAccountResponse {})
                }
              }
            }
            "/pochical.v1.UserService/DeleteAccount" -> {
              val user = userOf(request.headers["Authorization"])
              val refusal = deleteRefusal
              calls += request.url.encodedPath to request.headers["Authorization"]
              Thread.sleep(deleteDelayMs)
              when {
                user == null -> refused("unauthenticated")
                refusal != null -> refused(refusal)
                else -> {
                  deleted += user to DeleteAccountRequest.parseFrom(request.body!!.toByteArray())
                  linked.remove(user)
                  when {
                    user == userId -> nextAnonymous()
                    user == inUse?.second -> inUse = null
                    else -> earlier.values.remove(user)
                  }
                  proto(deleteAccountResponse {})
                }
              }
            }
            "/api/auth/sign-out" -> {
              val user = userOf(request.headers["Authorization"])
              calls += request.url.encodedPath to request.headers["Authorization"]
              val status = signOutStatus
              when {
                status != 200 -> MockResponse.Builder().code(status).body("{}").build()
                else -> {
                  // The session is no one's from here; the user and what they keep stay.
                  if (user == userId) nextAnonymous() else if (user != null) earlier.values.remove(user)
                  MockResponse.Builder().body("""{"success":true}""").build()
                }
              }
            }
            "/pochical.v1.GroupService/SetDisplayName" -> {
              Thread.sleep(displayNameDelayMs)
              when (userOf(request.headers["Authorization"])) {
                null -> refused("unauthenticated")
                else -> {
                  displayNames += SetDisplayNameRequest.parseFrom(request.body!!.toByteArray())
                  proto(setDisplayNameResponse {})
                }
              }
            }
            "/pochical.v1.UserService/SetProfile" ->
              when (userOf(request.headers["Authorization"])) {
                null -> refused("unauthenticated")
                else -> {
                  profiles += SetProfileRequest.parseFrom(request.body!!.toByteArray())
                  proto(setProfileResponse {})
                }
              }
            "/api/auth/link-social" -> {
              val body = request.body!!.utf8()
              links += request.headers["Authorization"] to body
              val user = userOf(request.headers["Authorization"])
              if (linkStatus == 200 && user != null) {
                linked[user] = if ("\"apple\"" in body) SignInProvider.SIGN_IN_PROVIDER_APPLE else SignInProvider.SIGN_IN_PROVIDER_GOOGLE
              }
              MockResponse.Builder().code(linkStatus).body("{}").build()
            }
            "/v1/me/socket" ->
              when (val user = userOf(request.headers["Authorization"])) {
                null -> MockResponse.Builder().code(401).build().also { refusedSockets.incrementAndGet() }
                else -> MockResponse.Builder().webSocketUpgrade(Socket(user)).build()
              }
            "/v1/me/support/socket" ->
              // The user's chat with Pochical's people, kept as a group's chats are.
              when (val user = userOf(request.headers["Authorization"])) {
                null -> MockResponse.Builder().code(401).build()
                else -> MockResponse.Builder().webSocketUpgrade(GroupSocket(user, Chat.supportPlace)).build().also { placeSockets += request.url.encodedPath }
              }
            else ->
              if (request.url.encodedPath.matches(Regex("/v1/groups/[^/]+/socket"))) {
                when (val user = userOf(request.headers["Authorization"])) {
                  null -> MockResponse.Builder().code(401).build()
                  else -> MockResponse.Builder().webSocketUpgrade(GroupSocket(user, request.url.pathSegments[2])).build().also { placeSockets += request.url.encodedPath }
                }
              } else if (request.method == "PUT" && request.url.encodedPath.startsWith("/v1/me/photos/")) {
                ownPhotos += request.url.encodedPath.removePrefix("/v1/me/photos/")
                MockResponse.Builder().code(204).build()
              } else if (request.method == "PUT" && request.url.encodedPath.matches(Regex("/v1/support/photos/[^/]+"))) {
                supportPhotos += request.url.pathSegments[3]
                MockResponse.Builder().code(204).build()
              } else if (request.method == "PUT" && request.url.encodedPath.matches(Regex("/v1/groups/[^/]+/photos/[^/]+"))) {
                val small = request.url.queryParameter("size") == "small"
                groupPhotos += request.url.pathSegments[4] + if (small) "?small" else ""
                MockResponse.Builder().code(photoStatus).headersDelay(photoDelayMs, TimeUnit.MILLISECONDS).build()
              } else {
                MockResponse.Builder().code(404).build()
              }
          }
      }
    server.start()
  }

  /**
   * Notes on [dates] from another device of [user], each sent on a frame of its own to every socket
   * of theirs open, as that device's edits would come one by one.
   */
  @Synchronized
  fun noteElsewhere(dates: List<String>, user: String = userId) {
    for (date in dates) {
      val cursor = next(user)
      val taken = change {
        this.cursor = cursor
        day = dayValue {
          this.date = date
          field = DayField.DAY_FIELD_NOTE
          value = "ほかの端末から"
          hlc = hlc { physicalMs = System.currentTimeMillis(); deviceId = "other" }
        }
      }
      valuesOf(user)[taken.valueKey!!] = taken
      for (each in openOf(user)) each.send(serverFrame { changes = changes { changes += taken } })
    }
  }

  /** A pattern [id] [user] made on another device, sent to every socket of theirs open. */
  @Synchronized
  fun patternElsewhere(id: String, user: String = userId) {
    val taken = change {
      cursor = next(user)
      pattern = patternValue {
        this.id = id
        pattern = pattern { name = id }
        hlc = hlc { physicalMs = System.currentTimeMillis(); deviceId = "other" }
      }
    }
    valuesOf(user)[taken.valueKey!!] = taken
    for (each in openOf(user)) each.send(serverFrame { changes = changes { changes += taken } })
  }

  /** The value [user]'s DO holds for the day's field, as it would send it. */
  @Synchronized fun day(date: String, field: Int, user: String = userId): Change? = valuesOf(user)["day/$date/$field"]

  /** The group's lines of [thread] as it holds them, oldest first. */
  @Synchronized
  fun lines(groupId: String, thread: String = "group"): List<ChatLine> =
    logOf(groupId).values.filter { it.hasChatLine() && it.chatLine.threadId == thread }.map { it.chatLine }.sortedBy { it.seq }

  /** Lines of words by [author] taken by the group, each sent to every socket open on it, as another member's would come. */
  @Synchronized
  fun write(groupId: String, author: String, texts: List<String>, thread: String = "group") {
    for (text in texts) {
      val line = chatLine {
        threadId = thread
        seq = (lines(groupId, thread).lastOrNull()?.seq ?: 0) + 1
        authorId = author
        sentAtMs = System.currentTimeMillis()
        opId = "elsewhere-$seq"
        content = chatContent { words = chatWords { this.text = text } }
      }
      broadcast(groupId, keep(groupId, line))
    }
  }

  /** Someone writing in [thread], or no longer, as the group relays it to every socket open on it. */
  @Synchronized
  fun typing(groupId: String, author: String, thread: String = "group", on: Boolean = true) {
    for (each in groupSocketsOf(groupId)) each.send(serverFrame { typing = typing { threadId = thread; userId = author; this.on = on } })
  }

  private fun logOf(groupId: String) = groupLogs.getOrPut(groupId) { LinkedHashMap() }

  private fun groupSocketsOf(groupId: String) = groupSockets.getOrPut(groupId) { CopyOnWriteArrayList() }

  /** [line] kept at the group's next cursor, as the change it is now. */
  private fun keep(groupId: String, line: ChatLine): Change {
    val cursor = ((groupCursors[groupId] ?: 0L) + 1).also { groupCursors[groupId] = it }
    return change { this.cursor = cursor; chatLine = line }.also { logOf(groupId)["line/${line.threadId}/${line.seq}"] = it }
  }

  private fun broadcast(groupId: String, change: Change) {
    for (each in groupSocketsOf(groupId)) each.send(serverFrame { changes = changes { changes += change } })
  }

  /**
   * A frame on a group's socket, as its Group DO takes it: a catch-up after the Hello's cursor with
   * each chat's latest page of lines alone, pages of earlier lines, and the member's chat edits.
   */
  private fun takeGroup(user: String, groupId: String, frame: ClientFrame, socket: WebSocket) {
    val log = logOf(groupId)
    when (frame.kindCase) {
      ClientFrame.KindCase.HELLO -> {
        socket.send(serverFrame { welcome = welcome { cursor = groupCursors[groupId] ?: 0L; serverMs = System.currentTimeMillis() } })
        val latest = log.values.filter { it.hasChatLine() }.groupBy { it.chatLine.threadId }.mapValues { (_, lines) -> lines.maxOf { it.chatLine.seq } }
        val after =
          log.values
            .filter { it.cursor > frame.hello.cursor }
            .filter { !it.hasChatLine() || it.chatLine.seq > latest.getValue(it.chatLine.threadId) - Chat.pageSize }
            .sortedBy { it.cursor }
        if (after.isNotEmpty()) socket.send(serverFrame { changes = changes { changes += after } })
        groupSocketsOf(groupId) += socket
      }
      ClientFrame.KindCase.PING -> socket.send(serverFrame { pong = pong { nonce = frame.ping.nonce } })
      ClientFrame.KindCase.CHAT_PAGE_REQUEST -> {
        val request = frame.chatPageRequest
        val lines = lines(groupId, request.threadId).filter { request.beforeSeq == 0L || it.seq < request.beforeSeq }.takeLast(Chat.pageSize)
        socket.send(
          serverFrame {
            chatPage = chatPage {
              threadId = request.threadId
              beforeSeq = request.beforeSeq
              this.lines += lines
              atStart = lines.firstOrNull()?.seq?.let { it <= 1 } ?: true
            }
          }
        )
      }
      ClientFrame.KindCase.CHAT_EDITS -> {
        if (holdingSends && frame.chatEdits.editsList.any { it.kindCase == ChatEdit.KindCase.SEND }) {
          heldSends += HeldSend(user, groupId, frame, socket)
          return
        }
        val refused = mutableListOf<RefusedSend>()
        for (edit in frame.chatEdits.editsList) {
          when (edit.kindCase) {
            ChatEdit.KindCase.SEND -> {
              val send = edit.send
              if (lines(groupId, send.threadId).any { it.opId == edit.opId }) continue
              sentDevices[edit.opId] = send.device
              if (refuseSends) {
                refused += refusedSend { opId = edit.opId; reason = RefusedSend.Reason.REASON_DOES_NOT_FIT }
                continue
              }
              val line = chatLine {
                threadId = send.threadId
                seq = (lines(groupId, send.threadId).lastOrNull()?.seq ?: 0) + 1
                authorId = user
                sentAtMs = System.currentTimeMillis()
                opId = edit.opId
                content =
                  chatContent {
                    when {
                      send.content.hasPhotos() -> photos = send.content.photos
                      send.content.hasDays() -> days = send.content.days
                      send.content.hasPoll() -> poll = chatPoll { days += send.content.poll.daysList }
                      else -> words = chatWords { text = send.content.words.text }
                    }
                  }
              }
              broadcast(groupId, keep(groupId, line))
            }
            ChatEdit.KindCase.READ -> {
              val cursor = ((groupCursors[groupId] ?: 0L) + 1).also { groupCursors[groupId] = it }
              val mark = change {
                this.cursor = cursor
                readMark = readMark { userId = user; threadId = edit.read.threadId; lastReadSeq = edit.read.lastReadSeq }
              }
              log["mark/${edit.read.threadId}/$user"] = mark
              broadcast(groupId, mark)
            }
            ChatEdit.KindCase.RECALL -> {
              val line = lines(groupId, edit.recall.threadId).firstOrNull { it.opId == edit.recall.sendOpId } ?: continue
              broadcast(groupId, keep(groupId, line.toBuilder().setContent(chatContent { unsent = chatTakenBack {} }).build()))
            }
            ChatEdit.KindCase.UNSEND -> {
              val line = lines(groupId, edit.unsend.threadId).firstOrNull { it.seq == edit.unsend.seq && it.authorId == user } ?: continue
              broadcast(groupId, keep(groupId, line.toBuilder().setContent(chatContent { unsent = chatTakenBack {} }).build()))
            }
            else -> {}
          }
        }
        socket.send(serverFrame { acked = acked { opIds += frame.chatEdits.editsList.map { it.opId }; this.refused += refused } })
      }
      else -> {}
    }
  }

  private inner class GroupSocket(private val user: String, private val groupId: String) : WebSocketListener() {
    private val frames = mutableListOf<ClientFrame>().also { sockets += it }

    override fun onMessage(webSocket: WebSocket, text: String) {
      if (text == SyncSocket.keepaliveText) webSocket.send(SyncSocket.keepaliveReply)
    }

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
      val frame = ClientFrame.parseFrom(bytes.toByteArray())
      synchronized(frames) { frames += frame }
      synchronized(this@FakeServer) { takeGroup(user, groupId, frame, webSocket) }
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      synchronized(this@FakeServer) { groupSocketsOf(groupId) -= webSocket }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      synchronized(this@FakeServer) { groupSocketsOf(groupId) -= webSocket }
    }
  }

  /** The anonymous user deleted: its session is no one's, and the next anonymous sign-in is someone new. */
  private fun nextAnonymous() {
    val next = signIns.get() + 1
    token = "token-$next"
    userId = "user-$next"
    handedOut = false
  }

  private fun valuesOf(user: String) = values.getOrPut(user) { LinkedHashMap() }

  private fun openOf(user: String) = open.getOrPut(user) { CopyOnWriteArrayList() }

  private fun next(user: String): Long = ((cursors[user] ?: 0L) + 1).also { cursors[user] = it }

  private fun refused(code: String) =
    MockResponse.Builder()
      .code(if (code == "unauthenticated") 401 else if (code == "permission_denied") 403 else 400)
      .addHeader("Content-Type", "application/json")
      .body("""{"code":"$code"}""")
      .build()

  private fun proto(message: com.google.protobuf.MessageLite) =
    MockResponse.Builder().addHeader("Content-Type", "application/proto").body(Buffer().write(message.toByteArray())).build()

  private inner class Socket(private val user: String) : WebSocketListener() {
    private val frames = mutableListOf<ClientFrame>().also { sockets += it }

    override fun onMessage(webSocket: WebSocket, text: String) {
      if (text == SyncSocket.keepaliveText) webSocket.send(SyncSocket.keepaliveReply)
    }

    override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
      val frame = ClientFrame.parseFrom(bytes.toByteArray())
      synchronized(frames) { frames += frame }
      synchronized(this@FakeServer) { take(user, frame, webSocket) }
    }

    override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
      synchronized(this@FakeServer) { openOf(user) -= webSocket }
    }

    override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
      synchronized(this@FakeServer) { openOf(user) -= webSocket }
    }
  }

  private fun take(user: String, frame: ClientFrame, socket: WebSocket) {
    val values = valuesOf(user)
    when (frame.kindCase) {
      ClientFrame.KindCase.HELLO -> {
        socket.send(serverFrame { welcome = welcome { cursor = cursors[user] ?: 0L; serverMs = System.currentTimeMillis() } })
        val after = values.values.filter { it.cursor > frame.hello.cursor }.sortedBy { it.cursor }
        if (after.isNotEmpty()) socket.send(serverFrame { changes = changes { changes += after } })
        openOf(user) += socket
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
            val cursor = next(user)
            val taken = change { this.cursor = cursor; day = edit.value }
            values[key] = taken
            changed += taken
          }
        }
        if (changed.isNotEmpty()) for (each in openOf(user)) each.send(serverFrame { changes = changes { changes += changed } })
        socket.send(serverFrame { acked = acked { opIds += edits.map { it.opId } } })
      }
      else -> {}
    }
  }

  override fun close() = server.close()
}

private fun WebSocket.send(frame: ServerFrame) = send(frame.toByteArray().toByteString())
