package app.pochical.kit

import android.util.Log
import com.connectrpc.Code
import com.connectrpc.ConnectException
import app.pochical.design.SyncSocket
import java.io.IOException
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong
import kotlin.coroutines.cancellation.CancellationException
import kotlin.random.Random
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.filterNotNull
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.merge
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.HttpUrl
import okhttp3.OkHttpClient

/**
 * Who the device is (spec/sync-protocol.md, Signing in; Switching to an account in use; Deleting an
 * account; Reconnecting).
 */
sealed interface AccountState {
  /** Signing in: a first launch, offline before its first sign-in reached the server, or after a deletion. */
  data object SigningIn : AccountState

  /** Signed in as [userId], linked to [linked], null while anonymous. */
  data class SignedIn(val userId: String, val linked: LinkedAccount?) : AccountState

  /**
   * Switching to an account in use or deleting the account, until the server answers: signed in as
   * [before] meanwhile, its sockets open, and nothing else changes who the device is. A 401 heard
   * meanwhile ([heardUnknown]) waits for the answer to settle it.
   */
  data class Changing(val before: SignedIn, internal val heardUnknown: Boolean = false) : AccountState

  /**
   * The device lets go of its user ([why]): it erases what it held and forgets its session, showing
   * none of it, [failed] once a try failed, tried again until done; then it signs in as a new
   * anonymous user, as a new install does.
   */
  data class Erasing(val why: Why, val failed: Boolean = false) : AccountState {
    enum class Why {
      /** The person let the session go: はじめから使う, after the server ended it. */
      SignedOut,

      /** The account is deleted on the server. */
      Deleted,
    }
  }

  /**
   * The server does not know the session (ログアウトされています): nothing syncs, nothing is
   * cleared, until the person chooses, [SyncAccount.tryAgain] or [SyncAccount.startAfresh]
   * (spec/sync-protocol.md, Reconnecting).
   */
  data object SessionEnded : AccountState
}

/** The account the device is signed in as, or is while it changes; null while anonymous or not signed in. */
val AccountState.linked: LinkedAccount?
  get() =
    when (this) {
      is AccountState.SignedIn -> linked
      is AccountState.Changing -> before.linked
      else -> null
    }

/** The device has no session now: it is signing in, or the server ended it. */
class NotSignedIn : Exception()

/**
 * The one owner on the device of who it is and of every socket (iOS: AccountSession): it signs in
 * anonymously on the first launch, keeps the session, claims the database for its user, and opens
 * the user's socket while the app is in the foreground and each group's while something holds it.
 * Commands go through one queue, in the order they were given, and [state] changes only there: a
 * switch or a deletion begins there and its server's answer settles it there, each for the stretch it
 * was asked in, so an answer for a stretch already over changes nothing.
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

  private val mutableDeleted = MutableStateFlow(0)

  /**
   * How many deletions of the account the device has finished erasing after, since it started: the
   * screens start over and say アカウントを削除しました once for each, however briefly they saw it
   * [AccountState.Erasing].
   */
  val deleted: StateFlow<Int> = mutableDeleted.asStateFlow()

  /** Signed in or changing, the stretch whose sockets are open; null otherwise. */
  private val stretch = MutableStateFlow<Stretch?>(null)

  /** The user's own socket, for the screens to say 接続中… while it is not current. */
  val userSocket: Flow<SocketState> = stretch.flatMapLatest { it?.user?.state ?: flowOf(SocketState.Closed) }

  private val generation = AtomicLong(0)
  private val commands = Channel<Command>(Channel.UNLIMITED)
  /** [eraseAgain]'s, cutting short the wait before erasing is tried again. */
  private val eraseNow = Channel<Unit>(Channel.CONFLATED)

  // Only the queue's coroutine reads and writes these.
  private var foreground = false
  private val holds = mutableMapOf<String, Int>()
  private var signingIn: Job? = null
  private var closingUser: Job? = null
  private var deletingLeftBehind: Job? = null
  /** A new session the store could not keep yet; only [signIn], one at a time, reads and writes it. */
  private var unkept: StoredSession? = null
  /** How many links the device has made; an answer to GetMe asked before the last is stale. */
  private var links = 0L
  /** How many [sendOutbox] calls wait: the user's socket stays open for them in the background. */
  private var sending = 0

  init {
    scope.launch { for (command in commands) handle(command) }
    network?.watch(lost = { commands.trySend(Command.NetworkLost) }, changed = { commands.trySend(Command.NetworkChanged) })
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
   * Signs in with the provider's account (spec/sync-protocol.md, Signing in): linked to this user,
   * keeping what the device holds; or, when it is another user's already, one side kept, without
   * asking when either holds nothing (this device's data let go first), else [SignInResult.Choose]
   * for the person to. [NotSignedIn] before the device has a session, or once the server says it
   * does not know it; [AccountSuspended] for an account Pochical's people suspended; [LinkRefused]
   * or another error otherwise, nothing changed.
   */
  suspend fun signIn(account: ProviderToken): SignInResult {
    val credentials = signedIn() ?: throw NotSignedIn()
    if (link(credentials, account) == LinkResult.Linked) return SignInResult.Linked
    val inUse = coroutineScope {
      val here = async { database.write { holdings() } }
      val held = calls(credentials) { peekAccount(account) }
      InUse(account, held, here.await())
    }
    return when {
      inUse.device.isEmpty -> useAccount(inUse).let { SignInResult.Switched }
      inUse.account.isEmpty -> keepDevice(inUse).let { SignInResult.Linked }
      else -> SignInResult.Choose(inUse)
    }
  }

  /**
   * アカウントのデータを使う: the device signs in to the account's user and lets go of what it held,
   * catching up from the account; the user it was is deleted, tried again each time the app comes to
   * the front should that fail. One that fails before the new session is kept leaves the device as
   * it was. [AccountChanged] when the device is not signed in as it was asked.
   */
  suspend fun useAccount(choice: InUse) {
    val credentials = signedIn() ?: throw NotSignedIn()
    // better-auth signs in by the provider's token alone, so no answer of it says the session is unknown.
    change(credentials, ended = ::NotSignedIn, refused = ::AccountChanged, unknown = { false }) { before ->
      Outcome.Switched(signInSocial(http, server, before.token, choice.token).copy(linked = choice.token.account))
    }
  }

  /**
   * この端末のデータを使う (`UserService.TakeAccount`): the account's user deleted, everything of it
   * with it, and the provider's account linked to this user instead. [AccountChanged] when the
   * device is not signed in as it was asked; [NotSignedIn] once the server says it does not know the
   * session.
   */
  suspend fun keepDevice(choice: InUse) {
    val credentials = signedIn() ?: throw NotSignedIn()
    change(
      credentials,
      ended = ::NotSignedIn,
      refused = ::AccountChanged,
      unknown = { it is ConnectException && it.code == Code.UNAUTHENTICATED },
    ) { before ->
      UserCalls(http, server, before.token).takeAccount(choice.token)
      Outcome.Took(choice.token.account)
    }
  }

  /**
   * アカウントを削除 (spec/sync-protocol.md, Deleting an account): a user the server says now is
   * linked to Apple has Apple asked once more for a fresh authorization code ([appleCode], null when
   * the person cancels), as Apple's tokens are revoked with it, and any other user nothing, as
   * nothing of Google's is revoked. Once the server has deleted the account, the device erases what
   * it held and forgets its session ([AccountState.Erasing]), counts it in [deleted], and signs in as
   * someone new. False when the person cancelled; [DeletionFailure] when nothing, or only part, was
   * deleted.
   */
  suspend fun deleteAccount(appleCode: suspend () -> String?): Boolean {
    val asking = signedIn() ?: throw DeletionFailure(whyNotSignedIn())
    val provider =
      try {
        UserCalls(http, server, asking.token).linkedProvider()
      } catch (e: ConnectException) {
        val reason = reasonOf(e)
        if (reason == DeletionFailure.Reason.SessionEnded) commands.send(Command.SessionUnknown(asking.generation))
        throw DeletionFailure(reason, e)
      }
    if (!asking.isCurrent) throw DeletionFailure(whyNotSignedIn())
    val code =
      if (provider == LinkedAccount.Provider.Apple) {
        try {
          appleCode() ?: return false
        } catch (e: CancellationException) {
          throw e
        } catch (e: Exception) {
          throw DeletionFailure(DeletionFailure.Reason.AppleUnconfirmed, e)
        }
      } else {
        ""
      }
    change(
      asking,
      ended = { DeletionFailure(DeletionFailure.Reason.SessionEnded) },
      refused = { DeletionFailure(whyNotSignedIn()) },
      unknown = { it is DeletionFailure && it.reason == DeletionFailure.Reason.SessionEnded },
    ) { before ->
      try {
        UserCalls(http, server, before.token).deleteAccount(code)
      } catch (e: DeletionFailure) {
        throw e
      } catch (e: Exception) {
        throw DeletionFailure(DeletionFailure.Reason.ServerFailed, e)
      }
      Outcome.Deleted(before.userId)
    }
    return true
  }

  /** 再試行: erasing is tried again now rather than after the wait. */
  fun eraseAgain() {
    eraseNow.trySend(Unit)
  }

  /**
   * もう一度つなぐ, while the session is ended: the server asked about the same session again
   * (`GetMe`), as a server set right since knows it again, and signed in as it once the server
   * answers, if the person has not chosen meanwhile. Unknown or out of reach, it stays ended, so the
   * app is never shown for a session that ends again at once.
   */
  suspend fun tryAgain() {
    if (state.value != AccountState.SessionEnded) return
    val kept =
      try {
        sessions.read()
      } catch (e: StoreUnreachable) {
        // The token is in the store alone, so nothing is tried until the person asks again.
        Log.i(TAG, "The ended session could not be read: $e")
        return
      } ?: return
    try {
      UserCalls(http, server, kept.token).linkedProvider()
    } catch (e: ConnectException) {
      Log.i(TAG, "The ended session was not known again: $e")
      return
    }
    val taken = CompletableDeferred<Unit>()
    commands.send(Command.TryAgain(kept.token, taken))
    taken.await()
  }

  /**
   * はじめから使う, while the session is ended, asked first by the screens: what the device holds
   * erased and its session forgotten ([AccountState.Erasing.Why.SignedOut]), then a new anonymous
   * user, as a new install's.
   */
  fun startAfresh() {
    commands.trySend(Command.StartAfresh)
  }

  /**
   * Runs [call] as the user the device is signed in as: one asked while it signs in, or while a change
   * of account waits on the server, waits for it, for a while at most, rather than going as no one
   * (spec/sync-protocol.md, Sockets). [NotSignedIn] when the device is not signed in by then, or when
   * the server says it does not know the session ([SessionRefused]), which ends it as a socket's 401
   * does.
   */
  suspend fun <T> asSignedIn(call: suspend (Credentials) -> T): T {
    val credentials =
      withTimeoutOrNull(SIGN_IN_WAIT_MS) {
        state
          .map { now ->
            when (now) {
              is AccountState.SignedIn -> signedIn()
              AccountState.SigningIn,
              is AccountState.Changing -> null
              else -> throw NotSignedIn()
            }
          }
          .filterNotNull()
          .first()
      } ?: throw NotSignedIn()
    try {
      return call(credentials)
    } catch (e: SessionRefused) {
      commands.send(Command.SessionUnknown(credentials.generation))
      throw NotSignedIn()
    }
  }

  /** The credentials of the stretch signed in now, null when the device is not signed in or is changing. */
  private fun signedIn(): Credentials? = if (state.value is AccountState.SignedIn) stretch.value?.credentials else null

  /** Why a deletion cannot go as the device is now: not signed in as the account it was asked for. */
  private fun whyNotSignedIn(): DeletionFailure.Reason =
    when (state.value) {
      AccountState.SigningIn -> DeletionFailure.Reason.NotSignedIn
      AccountState.SessionEnded -> DeletionFailure.Reason.SessionEnded
      else -> DeletionFailure.Reason.AccountChanged
    }

  /**
   * Links the provider's account to the user of [credentials], keeping the session with the account
   * it is now linked to. Once asked, it runs to the end whether or not its caller waits, so a link
   * the server made is never left unkept here.
   */
  private suspend fun link(credentials: Credentials, account: ProviderToken): LinkResult =
    scope
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

  /** UserService as the user of [credentials]: a 401 ends the session, as a socket's does, and is [NotSignedIn]. */
  private suspend fun <T> calls(credentials: Credentials, call: suspend UserCalls.() -> T): T =
    try {
      UserCalls(http, server, credentials.token).call()
    } catch (e: ConnectException) {
      if (e.code != Code.UNAUTHENTICATED) throw e
      commands.send(Command.SessionUnknown(credentials.generation))
      throw NotSignedIn()
    }

  /**
   * Changes who the device is, or whom it is linked to, one change at a time, from the stretch
   * [before] it was asked in: refused ([refused]) once the device is not signed in as it any more,
   * so the user after it is never changed. Until the server has done its part ([onServer]) the
   * device goes on as it was, and a 401 meanwhile is only noted. The answer settles it in the queue:
   * done, the change goes on, as it is the likeliest reason for that 401; failed, the device is back
   * as it was, or its session ended ([ended]) should the server not know it ([unknown], or a 401
   * heard meanwhile). The account owns it from the moment it is asked, so a caller that stops
   * waiting never leaves a change begun and unsettled.
   */
  private suspend fun change(
    before: Credentials,
    ended: () -> Throwable,
    refused: () -> Throwable,
    unknown: (Throwable) -> Boolean,
    onServer: suspend (Credentials) -> Outcome,
  ) =
    scope
      .async {
        val began = CompletableDeferred<Boolean>()
        commands.send(Command.Begin(before.generation, began))
        if (!began.await()) throw refused()
        val outcome =
          try {
            onServer(before)
          } catch (e: Exception) {
            Outcome.Failed(e, unknown = unknown(e), ended = ended())
          }
        val settled = CompletableDeferred<Unit>()
        commands.send(Command.Settle(before.generation, outcome, settled))
        try {
          settled.await()
        } catch (_: AccountChanged) {
          throw refused()
        }
      }
      .await()

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
          if (state.value is AccountState.SignedIn) deleteLeftBehind(current)
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
        if (state.value != AccountState.SigningIn) return
        val stretch = Stretch(Credentials(generation.incrementAndGet(), command.session.token, command.session.userId, generation::get))
        this.stretch.value = stretch
        mutableState.value = AccountState.SignedIn(command.session.userId, command.session.linked)
        if (foreground || sending > 0) stretch.user.start()
        if (foreground) holds.keys.forEach { stretch.group(it).start() }
        if (command.kept) keepAgain()
        val asOf = links
        stretch.scope.launch { askLinked(stretch.credentials, asOf) }
        deleteLeftBehind(stretch)
      }
      is Command.SessionUnknown -> {
        if (current?.credentials?.generation != command.generation) return
        when (val now = state.value) {
          // Settled by the change's answer, which may well be its cause.
          is AccountState.Changing -> mutableState.value = now.copy(heardUnknown = true)
          else -> endUnknown(current)
        }
      }
      is Command.Begin -> {
        val now = state.value
        val begins = now is AccountState.SignedIn && current?.credentials?.generation == command.generation
        if (begins) mutableState.value = AccountState.Changing(now as AccountState.SignedIn)
        command.began.complete(begins)
      }
      is Command.Settle -> settle(current, command)
      is Command.EraseFailed -> {
        (state.value as? AccountState.Erasing)?.let { mutableState.value = it.copy(failed = true) }
      }
      is Command.Erasing -> if (state.value == AccountState.SigningIn) beginErasing(command.userId, command.why)
      is Command.Erased -> {
        if (command.why == AccountState.Erasing.Why.Deleted) mutableDeleted.value += 1
        mutableState.value = AccountState.SigningIn
        if (foreground || sending > 0) startSigningIn()
      }
      is Command.TryAgain -> {
        try {
          if (state.value != AccountState.SessionEnded) return
          try {
            // Only the session the server knew: one let go of or replaced meanwhile stays as it is.
            val kept = sessions.read()?.takeIf { it.token == command.token } ?: return
            sessions.write(kept.copy(ended = false))
          } catch (e: StoreUnreachable) {
            Log.i(TAG, "The ended session could not be tried again: $e")
            return
          }
          mutableState.value = AccountState.SigningIn
          if (foreground || sending > 0) startSigningIn()
        } finally {
          command.taken.complete(Unit)
        }
      }
      Command.StartAfresh -> {
        if (state.value != AccountState.SessionEnded) return
        val kept =
          try {
            // Kept as ended before anything is erased, so an app ended meanwhile goes on erasing as
            // letting the session go, not as a deletion.
            sessions.read()?.also { if (!it.ended) sessions.write(it.copy(ended = true)) }
          } catch (e: StoreUnreachable) {
            Log.i(TAG, "The ended session could not be let go of: $e")
            return
          }
        if (kept != null) {
          beginErasing(kept.userId, AccountState.Erasing.Why.SignedOut)
        } else {
          mutableState.value = AccountState.SigningIn
          if (foreground || sending > 0) startSigningIn()
        }
      }
      is Command.LeftBehindGone -> {
        try {
          sessions.deleted(command.token)
        } catch (e: StoreUnreachable) {
          // Deleted already: the next try hears the server no longer knows it, and forgets it then.
          Log.i(TAG, "The session left behind could not be forgotten: $e")
        }
      }
      is Command.AskLinked -> {
        if (state.value !is AccountState.SignedIn || current?.credentials?.generation != command.generation) return
        val asOf = links
        current.scope.launch { askLinked(current.credentials, asOf) }
      }
      is Command.Linked -> {
        val now = state.value
        // Heard while a change is asked, it is the user's as they are kept should the change fail.
        val before = (now as? AccountState.Changing)?.before ?: now as? AccountState.SignedIn ?: return
        if (current?.credentials?.generation != command.generation) return
        // A link made here wins over what the server said of the user before it.
        if (command.asOf == null) links += 1 else if (command.asOf != links) return
        val after =
          when {
            command.account == null -> null
            command.account.email == null && command.account.provider == before.linked?.provider -> before.linked
            else -> command.account
          }
        if (after == before.linked) return
        keepLinked(after)
        val linked = AccountState.SignedIn(current.credentials.userId, after)
        mutableState.value = if (now is AccountState.Changing) now.copy(before = linked) else linked
      }
      Command.NetworkLost -> current?.clients()?.forEach { it.networkLost() }
      Command.NetworkChanged -> current?.clients()?.forEach { it.networkChanged() }
    }
  }

  /** Keeps [account] with the session the device has. */
  private suspend fun keepLinked(account: LinkedAccount?) {
    try {
      val kept = sessions.read()
      if (kept != null) sessions.write(kept.copy(linked = account)) else Log.i(TAG, "No session kept to note the account with")
    } catch (e: StoreUnreachable) {
      // The server holds the link, and GetMe says it again at the next refresh.
      Log.i(TAG, "The linked account could not be kept: $e")
    }
  }

  /** Letting go of [userId] ([why]): nothing of theirs shows, and the device erases it ([erase]). */
  private fun beginErasing(userId: String, why: AccountState.Erasing.Why) {
    mutableState.value = AccountState.Erasing(why)
    scope.launch { erase(userId, why) }
  }

  /** The server's answer to the change [command] began, for the stretch it was asked in alone. */
  private suspend fun settle(current: Stretch?, command: Command.Settle) {
    val changing = state.value as? AccountState.Changing
    if (changing == null || current?.credentials?.generation != command.generation) {
      command.settled.completeExceptionally(AccountChanged())
      return
    }
    when (val outcome = command.outcome) {
      is Outcome.Failed ->
        if (changing.heardUnknown || outcome.unknown) {
          endUnknown(current)
          command.settled.completeExceptionally(outcome.ended)
        } else {
          mutableState.value = changing.before
          command.settled.completeExceptionally(outcome.cause)
        }
      is Outcome.Switched -> {
        // One write switches: a relaunch from here on is the account's user, whose sign-in erases
        // what the user before held as it claims the database, and deletes the user left behind.
        try {
          sessions.switchTo(outcome.to, leaving = current.credentials.token)
        } catch (e: StoreUnreachable) {
          mutableState.value = changing.before
          command.settled.completeExceptionally(e)
          return
        }
        endStretch(current)
        mutableState.value = AccountState.SigningIn
        startSigningIn()
        command.settled.complete(Unit)
      }
      is Outcome.Took -> {
        // A link made here wins over what the server said of the user before it.
        links += 1
        keepLinked(outcome.account)
        mutableState.value = AccountState.SignedIn(current.credentials.userId, outcome.account)
        command.settled.complete(Unit)
      }
      is Outcome.Deleted -> {
        endStretch(current)
        beginErasing(outcome.userId, AccountState.Erasing.Why.Deleted)
        command.settled.complete(Unit)
      }
    }
  }

  /**
   * The session of [current], which the server does not know, ended until the person chooses: every
   * socket closes and nothing more is taken in; what the device holds stays.
   */
  private suspend fun endUnknown(current: Stretch) {
    endStretch(current)
    try {
      sessions.read()?.let { sessions.write(it.copy(ended = true)) }
    } catch (e: StoreUnreachable) {
      // Not kept as ended, a relaunch tries the session again and hears the same.
      Log.i(TAG, "The ended session could not be noted: $e")
    }
    mutableState.value = AccountState.SessionEnded
  }

  /** The stretch over: what it handed out is not current from here, and its sockets close. */
  private fun endStretch(current: Stretch) {
    generation.incrementAndGet()
    current.end()
    stretch.value = null
  }

  /**
   * Letting go of [userId]: what the database holds of them erased, noting whose it was, then their
   * session forgotten, tried again after a wait that doubles until both are. An app ended between
   * the two finds the session it kept is of the user erased, and goes on erasing as it starts
   * (`signIn`), never signing in as them again.
   */
  private suspend fun erase(userId: String, why: AccountState.Erasing.Why) {
    var wait = ERASE_FIRST_WAIT_MS
    while (true) {
      try {
        database.write {
          eraseUserData()
          upsert(state().copy(erased = userId))
        }
        sessions.forgetSession()
        break
      } catch (e: CancellationException) {
        throw e
      } catch (e: Exception) {
        Log.i(TAG, "Erasing the device failed: $e")
        commands.send(Command.EraseFailed)
        withTimeoutOrNull(wait) { eraseNow.receive() }
        wait = minOf(wait * 2, ERASE_LONGEST_WAIT_MS)
      }
    }
    commands.send(Command.Erased(why))
  }

  /**
   * Deletes the anonymous users switches left behind (spec/sync-protocol.md, Switching to an account
   * in use), one try at a time: each forgotten once the server deletes it or no longer knows its
   * session.
   */
  private suspend fun deleteLeftBehind(current: Stretch) {
    if (deletingLeftBehind?.isActive == true) return
    val left =
      try {
        sessions.leftBehind()
      } catch (_: StoreUnreachable) {
        return
      }
    if (left.isEmpty()) return
    deletingLeftBehind = scope.launch {
      for (token in left) {
        if (token != current.credentials.token) {
          try {
            UserCalls(http, server, token).deleteAccount(appleCode = "")
          } catch (e: DeletionFailure) {
            if (e.reason != DeletionFailure.Reason.SessionEnded) {
              Log.i(TAG, "A user left behind was not deleted yet: $e")
              continue
            }
          }
        }
        commands.send(Command.LeftBehindGone(token))
      }
    }
  }

  private fun startSigningIn() {
    val before = signingIn
    if (before?.isActive != true && state.value == AccountState.SigningIn) {
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
    if (kept != null && database.write { state().erased } == kept.userId) {
      // Only a session let go of is kept as ended while it is erased; a deleted account's is not.
      val why = if (kept.ended) AccountState.Erasing.Why.SignedOut else AccountState.Erasing.Why.Deleted
      commands.send(Command.Erasing(kept.userId, why))
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

  /** How the server's part of a change ended. */
  private sealed interface Outcome {
    /** Signed in [to] the account's user, the user before left behind. */
    class Switched(val to: StoredSession) : Outcome

    /** The provider's [account] taken for this user, the user it was linked to deleted. */
    class Took(val account: LinkedAccount) : Outcome

    /** [userId]'s account and everything of it deleted. */
    class Deleted(val userId: String) : Outcome

    /**
     * Nothing changed on the server: [cause], or [ended] should the session have ended, as when the
     * server said it does not know it ([unknown]).
     */
    class Failed(val cause: Throwable, val unknown: Boolean, val ended: Throwable) : Outcome
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

    /** A change asked in the stretch [generation]: [began] says whether it may go. */
    class Begin(val generation: Long, val began: CompletableDeferred<Boolean>) : Command

    /** The server's answer to the change begun in the stretch [generation], [settled] once the device is done with it. */
    class Settle(val generation: Long, val outcome: Outcome, val settled: CompletableDeferred<Unit>) : Command

    /** The session kept is of [userId], whose erasing ([why]) was cut off: erasing goes on. */
    data class Erasing(val userId: String, val why: AccountState.Erasing.Why) : Command

    /** A try at erasing failed; another follows. */
    data object EraseFailed : Command

    /** Everything of the user let go of ([why]) is gone from the device. */
    data class Erased(val why: AccountState.Erasing.Why) : Command

    /** もう一度つなぐ, the server having answered for the session [token]; [taken] once handled. */
    class TryAgain(val token: String, val taken: CompletableDeferred<Unit>) : Command

    /** はじめから使う. */
    data object StartAfresh : Command

    /** The server deleted the user a switch left behind, or does not know its session [token]. */
    data class LeftBehindGone(val token: String) : Command

    /**
     * The stretch [generation]'s user is linked to [account], null while anonymous; one without an
     * email names the provider alone, as the server does. [asOf] is how many links the device had
     * made when GetMe was asked, null for a link made here.
     */
    data class Linked(val generation: Long, val account: LinkedAccount?, val asOf: Long?) : Command

    /** Ask the server which provider the stretch [generation]'s user is linked to. */
    data class AskLinked(val generation: Long) : Command

    data object NetworkLost : Command

    data object NetworkChanged : Command
  }

  private companion object {
    const val TAG = "PochicalAccount"
    const val ERASE_FIRST_WAIT_MS = 1_000L
    const val ERASE_LONGEST_WAIT_MS = 30_000L
    /** How long a call waits for the device to be signed in, as iOS's CurrentAccount.signInWait. */
    const val SIGN_IN_WAIT_MS = 15_000L
  }
}

/** A hold on a group's socket, let go of once. */
fun interface GroupHold {
  fun release()
}
