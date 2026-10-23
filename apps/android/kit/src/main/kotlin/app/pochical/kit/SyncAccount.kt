package app.pochical.kit

import android.util.Log
import app.pochical.design.SyncSocket
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.random.Random
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.HttpUrl
import okhttp3.OkHttpClient

/** Who the device is (spec/sync-protocol.md, Signing in; Reconnecting). */
sealed interface AccountState {
  /** Signing in: a first launch, or offline before its first sign-in reached the server. */
  data object SigningIn : AccountState

  data class SignedIn(val userId: String) : AccountState

  /**
   * The server does not know the session (ログアウトされています): nothing syncs, nothing is
   * cleared, until the person chooses (sign-in proper, POC-204, offers the choices).
   */
  data object SessionEnded : AccountState
}

/**
 * The one owner on the device of who it is and of every socket (iOS: AccountSession): it signs in
 * anonymously on the first launch, keeps the session, claims the database for its user, and opens
 * the user's socket while the app is in the foreground and each group's while something holds it.
 * Commands go through one queue, in the order they were given.
 */
@OptIn(ExperimentalCoroutinesApi::class)
class SyncAccount(
  private val database: AppDatabase,
  private val sessions: SessionStore,
  private val server: HttpUrl,
  private val http: OkHttpClient,
  private val scope: CoroutineScope,
  network: NetworkWatch? = null,
  private val now: () -> Long = System::currentTimeMillis,
  private val random: Random = Random.Default,
) {
  private val mutableState = MutableStateFlow<AccountState>(AccountState.SigningIn)
  val state: StateFlow<AccountState> = mutableState.asStateFlow()

  private val stretch = MutableStateFlow<Stretch?>(null)

  /** The user's own socket, for the screens to say 接続中… while it is not current. */
  val userSocket: Flow<SocketState> = stretch.flatMapLatest { it?.user?.state ?: flowOf(SocketState.Closed) }

  private val generation = AtomicLong(0)
  private val commands = Channel<Command>(Channel.UNLIMITED)

  // Only the queue's coroutine reads and writes these.
  private var foreground = false
  private val holds = mutableMapOf<String, Int>()
  private var signingIn: Job? = null
  private var closingUser: Job? = null

  init {
    scope.launch { for (command in commands) handle(command) }
    network?.watch(lost = { commands.trySend(Command.NetworkLost) }, back = { commands.trySend(Command.NetworkBack) })
  }

  /** The app came to the foreground: signs in if it is not, and opens the sockets. */
  fun foreground() {
    commands.trySend(Command.Foreground)
  }

  /**
   * The app went to the background: the groups' sockets close, and the user's once its outbox is
   * sent and acknowledged, so an edit made just before reaches the user's other devices.
   */
  fun background() {
    commands.trySend(Command.Background)
  }

  /** Keeps the group's socket open, while the app is in the foreground, until [GroupHold.release]. */
  fun hold(groupId: String): GroupHold {
    commands.trySend(Command.Hold(groupId))
    val released = AtomicBoolean(false)
    return GroupHold { if (released.compareAndSet(false, true)) commands.trySend(Command.Release(groupId)) }
  }

  private suspend fun handle(command: Command) {
    val current = stretch.value
    when (command) {
      Command.Foreground -> {
        foreground = true
        closingUser?.cancel()
        if (current != null) {
          current.user.start()
          holds.keys.forEach { current.group(it).start() }
        } else if (signingIn?.isActive != true && state.value != AccountState.SessionEnded) {
          signingIn = scope.launch { signIn() }
        }
      }
      Command.Background -> {
        foreground = false
        signingIn?.cancel()
        if (current != null) {
          current.groups.values.forEach { it.close() }
          closingUser = current.scope.launch {
            database.sync().lastWaiting().first { it == null }
            current.user.close()
          }
        }
      }
      is Command.Hold -> {
        holds[command.groupId] = (holds[command.groupId] ?: 0) + 1
        if (foreground) current?.group(command.groupId)?.start()
      }
      is Command.Release -> {
        val left = (holds[command.groupId] ?: return) - 1
        if (left > 0) {
          holds[command.groupId] = left
        } else {
          holds.remove(command.groupId)
          current?.groups?.get(command.groupId)?.close()
        }
      }
      is Command.SignedIn -> {
        val stretch = Stretch(Credentials(generation.incrementAndGet(), command.session.token, command.session.userId, generation::get))
        this.stretch.value = stretch
        mutableState.value = AccountState.SignedIn(command.session.userId)
        if (foreground) {
          stretch.user.start()
          holds.keys.forEach { stretch.group(it).start() }
        }
      }
      is Command.SessionUnknown -> {
        if (current?.credentials?.generation != command.generation) return
        // Every socket closes and nothing more is taken in; what the device holds stays.
        generation.incrementAndGet()
        current.end()
        stretch.value = null
        withContext(Dispatchers.IO) { sessions.read()?.let { sessions.write(it.copy(ended = true)) } }
        mutableState.value = AccountState.SessionEnded
      }
      Command.NetworkLost -> current?.clients()?.forEach { it.networkLost() }
      Command.NetworkBack -> current?.clients()?.forEach { it.networkBack() }
    }
  }

  /**
   * The kept session, or a new anonymous one, tried again after a wait that doubles while the app
   * stays in the foreground; then the database is claimed for its user. A database another user
   * left, whose session the device no longer has, is erased first, as nothing can send what it holds
   * any more (spec/sync-protocol.md, Sockets).
   */
  private suspend fun signIn() {
    val kept = withContext(Dispatchers.IO) { sessions.read() }
    if (kept?.ended == true) {
      mutableState.value = AccountState.SessionEnded
      return
    }
    var tries = 0
    var session = kept
    while (session == null) {
      try {
        session = signInAnonymously(http, server).also { withContext(Dispatchers.IO) { sessions.write(it) } }
        Log.i(TAG, "Signed in anonymously as ${session.userId}")
      } catch (e: IOException) {
        tries += 1
        Log.i(TAG, "Signing in failed: $e")
        delay(random.nextLong(reconnectWaitMost(tries, SyncSocket.reconnectFirstMs, SyncSocket.reconnectMostMs) + 1L))
      }
    }
    val userId = session.userId
    database.write {
      if (!claim(userId)) {
        eraseUserData()
        claim(userId)
      }
    }
    commands.send(Command.SignedIn(session))
  }

  /** One stretch of the account: whom it connects as, and the sockets it opened as them. */
  private inner class Stretch(val credentials: Credentials) {
    val scope = CoroutineScope(this@SyncAccount.scope.coroutineContext + SupervisorJob(this@SyncAccount.scope.coroutineContext[Job]))
    val user = client(Peer.User)
    val groups = mutableMapOf<String, SyncClient>()

    fun group(groupId: String) = groups.getOrPut(groupId) { client(Peer.Group(groupId)) }

    fun clients() = listOf(user) + groups.values

    fun end() = scope.cancel()

    private fun client(peer: Peer) =
      SyncClient(database, peer, server, http, credentials, scope, now, random) {
        commands.trySend(Command.SessionUnknown(credentials.generation))
      }
  }

  private sealed interface Command {
    data object Foreground : Command

    data object Background : Command

    data class Hold(val groupId: String) : Command

    data class Release(val groupId: String) : Command

    data class SignedIn(val session: StoredSession) : Command

    data class SessionUnknown(val generation: Long) : Command

    data object NetworkLost : Command

    data object NetworkBack : Command
  }

  private companion object {
    const val TAG = "PochicalAccount"
  }
}

/** A hold on a group's socket, let go of once. */
fun interface GroupHold {
  fun release()
}
