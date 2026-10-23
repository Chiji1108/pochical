package app.pochical.kit

import android.util.Log
import com.connectrpc.Code
import com.connectrpc.ConnectException
import app.pochical.design.SyncSocket
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.random.Random
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
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

  /** Signed in as [userId], linked to [linked], null while anonymous. */
  data class SignedIn(val userId: String, val linked: LinkedAccount?) : AccountState

  /**
   * The server does not know the session (ログアウトされています): nothing syncs, nothing is
   * cleared, until the person chooses (spec/sync-protocol.md, Reconnecting).
   */
  data object SessionEnded : AccountState
}

/** The device has no session now: it is signing in, or the server ended it. */
class NotSignedIn : Exception()

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
  /**
   * Asks the OS for time in the background to send what the outbox holds (WorkManager on Android,
   * spec/sync-protocol.md, Sockets), the app perhaps ended before it is sent: what runs then calls
   * [sendOutbox].
   */
  private val sendInBackground: () -> Unit = {},
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
  /** A new session the store could not keep yet; only [signIn], one at a time, reads and writes it. */
  private var unkept: StoredSession? = null
  /** How many links the device has made; an answer to GetMe asked before the last is stale. */
  private var links = 0L
  /** How many [sendOutbox] calls wait: the user's socket stays open for them in the background. */
  private var sending = 0

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

  /**
   * Connects if need be, signing in too, and sends the outbox until the server has acknowledged it
   * all, in the foreground or not. True once nothing waits; false when nothing can go, the session
   * ended. Sharing the user's one socket with the foreground, it sends nothing twice.
   */
  suspend fun sendOutbox(): Boolean {
    commands.send(Command.Send(waiting = true))
    try {
      return merge(
          database.sync().lastWaiting().filter { it == null }.map { true },
          state.filter { it == AccountState.SessionEnded }.map { false },
        )
        .first()
    } finally {
      commands.trySend(Command.Send(waiting = false))
    }
  }

  /**
   * Links the provider's account to the signed-in user (spec/sync-protocol.md, Signing in), keeping
   * the session with the account it is now linked to. [NotSignedIn] before the device has a session,
   * or once the server says it does not know it; [LinkRefused] otherwise. Once asked, it runs to the
   * end whether or not its caller waits, so a link the server made is never left unkept here.
   */
  suspend fun link(account: ProviderToken): LinkResult {
    val credentials = stretch.value?.credentials ?: throw NotSignedIn()
    return scope
      .async {
        val result =
          try {
            linkSocial(http, server, credentials.token, account)
          } catch (e: LinkRefused) {
            when (e.status) {
              401 -> {
                commands.send(Command.SessionUnknown(credentials.generation))
                throw NotSignedIn()
              }
              // Linked already, as from another of the person's devices: said as the server says it.
              417 -> commands.send(Command.AskLinked(credentials.generation))
            }
            throw e
          }
        if (result == LinkResult.Linked) commands.send(Command.Linked(credentials.generation, account.account, asOf = null))
        result
      }
      .await()
  }

  /**
   * Asks the server which provider the user is linked to (`GetMe`), as a session restored or linked
   * elsewhere may not say, and keeps it with the session; an email this device read stays while the
   * provider does. Nothing changes when the server cannot be asked.
   */
  private suspend fun askLinked(credentials: Credentials, asOf: Long) {
    val provider =
      try {
        UserCalls(http, server, credentials.token).linkedProvider()
      } catch (e: ConnectException) {
        if (e.code == Code.UNAUTHENTICATED) commands.send(Command.SessionUnknown(credentials.generation))
        return
      }
    commands.send(Command.Linked(credentials.generation, provider?.let { LinkedAccount(it, email = null) }, asOf))
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
        } else {
          startSigningIn()
        }
      }
      Command.Background -> {
        foreground = false
        current?.groups?.values?.forEach { it.close() }
        if (database.sync().lastWaiting().first() != null) {
          sendInBackground()
          closingUser = scope.launch { sendOutbox() }
        } else if (sending == 0) {
          signingIn?.cancel()
          current?.user?.close()
        }
      }
      is Command.Send -> {
        sending += if (command.waiting) 1 else -1
        when {
          command.waiting && current != null -> current.user.start()
          command.waiting -> startSigningIn()
          sending == 0 && !foreground -> current?.user?.close()
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
        mutableState.value = AccountState.SignedIn(command.session.userId, command.session.linked)
        if (foreground || sending > 0) stretch.user.start()
        if (foreground) holds.keys.forEach { stretch.group(it).start() }
        if (command.kept) keepAgain()
        val asOf = links
        stretch.scope.launch { askLinked(stretch.credentials, asOf) }
      }
      is Command.SessionUnknown -> {
        if (current?.credentials?.generation != command.generation) return
        // Every socket closes and nothing more is taken in; what the device holds stays.
        generation.incrementAndGet()
        current.end()
        stretch.value = null
        try {
          sessions.read()?.let { sessions.write(it.copy(ended = true)) }
        } catch (e: StoreUnreachable) {
          // Not kept as ended, a relaunch tries the session again and hears the same.
          Log.i(TAG, "The ended session could not be noted: $e")
        }
        mutableState.value = AccountState.SessionEnded
      }
      is Command.AskLinked -> {
        if (current?.credentials?.generation != command.generation) return
        val asOf = links
        current.scope.launch { askLinked(current.credentials, asOf) }
      }
      is Command.Linked -> {
        if (current?.credentials?.generation != command.generation) return
        // A link made here wins over what the server said of the user before it.
        if (command.asOf == null) links += 1 else if (command.asOf != links) return
        val before = (state.value as? AccountState.SignedIn)?.linked
        val after =
          when {
            command.account == null -> null
            command.account.email == null && command.account.provider == before?.provider -> before
            else -> command.account
          }
        if (after == before) return
        try {
          val kept = sessions.read()
          if (kept != null) sessions.write(kept.copy(linked = after)) else Log.i(TAG, "No session kept to note the account with")
        } catch (e: StoreUnreachable) {
          // The server holds the link, and GetMe says it again at the next refresh.
          Log.i(TAG, "The linked account could not be kept: $e")
        }
        mutableState.value = AccountState.SignedIn(current.credentials.userId, after)
      }
      Command.NetworkLost -> current?.clients()?.forEach { it.networkLost() }
      Command.NetworkBack -> current?.clients()?.forEach { it.networkBack() }
    }
  }

  private fun startSigningIn() {
    val before = signingIn
    if (before?.isActive != true && state.value != AccountState.SessionEnded) {
      // One cancelled may still be keeping the user it made: this one starts from what it kept.
      signingIn = scope.launch {
        before?.join()
        signIn()
      }
    }
  }

  /** Keeps the session again, so it goes to the cloud backup once a screen lock lets Block Store encrypt it. */
  private suspend fun keepAgain() {
    try {
      sessions.read()?.let { sessions.write(it) }
    } catch (e: StoreUnreachable) {
      Log.i(TAG, "The kept session could not be kept again: $e")
    }
  }

  /**
   * The kept session, or a new anonymous one, tried again after a wait that doubles while the account
   * still needs it; then the database is claimed for its user. A database another user
   * left, whose session the device no longer has, is erased first, as nothing can send what it holds
   * any more (spec/sync-protocol.md, Sockets).
   */
  private suspend fun signIn() {
    val kept =
      try {
        sessions.read()
      } catch (e: StoreUnreachable) {
        Log.i(TAG, "The kept session cannot be reached, tried again in the foreground: $e")
        return
      }
    if (kept?.ended == true) {
      mutableState.value = AccountState.SessionEnded
      return
    }
    if (kept != null) Log.i(TAG, "Signed in as kept, ${kept.userId}")
    var tries = 0
    var session = kept
    while (session == null) {
      try {
        session = withContext(NonCancellable) { newSession() }
        Log.i(TAG, "Signed in anonymously as ${session.userId}")
      } catch (e: StoreUnreachable) {
        Log.i(TAG, "The new session could not be kept, tried again in the foreground: $e")
        return
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
    commands.send(Command.SignedIn(session, kept = kept != null))
  }

  /**
   * A new anonymous session, kept: the device makes one anonymous user at most. Run uncancelled, as
   * going to the background cancels signing in, so a user the server made is kept before anything
   * stops; one the store could not keep is held for the next try rather than made again.
   */
  private suspend fun newSession(): StoredSession {
    val session = unkept ?: signInAnonymously(http, server)
    unkept = session
    sessions.write(session)
    unkept = null
    return session
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

    /** A [sendOutbox] began waiting, or stopped. */
    data class Send(val waiting: Boolean) : Command

    data class Hold(val groupId: String) : Command

    data class Release(val groupId: String) : Command

    /** Signed in as [session], [kept] from before rather than made now. */
    data class SignedIn(val session: StoredSession, val kept: Boolean) : Command

    data class SessionUnknown(val generation: Long) : Command

    /**
     * The stretch [generation]'s user is linked to [account], null while anonymous; one without an
     * email names the provider alone, as the server does. [asOf] is how many links the device had
     * made when GetMe was asked, null for a link made here.
     */
    data class Linked(val generation: Long, val account: LinkedAccount?, val asOf: Long?) : Command

    /** Ask the server which provider the stretch [generation]'s user is linked to. */
    data class AskLinked(val generation: Long) : Command

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
