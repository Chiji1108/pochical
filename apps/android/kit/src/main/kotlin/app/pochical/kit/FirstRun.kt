package app.pochical.kit

import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first

/**
 * はじめの設定 (spec/shift-patterns.md, The first run), whether it is done for the user the database
 * holds: kept with the database, so letting go of the user (ログアウト, a deletion, はじめから使う,
 * spec/sync-protocol.md) asks it again in the step that erases their data, and the app ending
 * anywhere between asks it as a relaunch would. A switch to an account in use keeps it.
 */
class FirstRun(private val database: AppDatabase) {
  /** Whether it is done, or the patterns of an account signed in to came. */
  val done: Flow<Boolean> = database.sync().firstRunDone().distinctUntilChanged()

  /** Whether the database holds a pattern now, as an account signed in to brings its own. */
  suspend fun holdsPatterns(): Boolean = database.read { patternIds().isNotEmpty() }

  /**
   * Whether the database holds a pattern once [signedIn] has brought what it brings: switched to an
   * account in use, once [account]'s socket has caught up with it, or waits to try again offline.
   * はじめの設定's ログイン goes on to the questions when it brought none; patterns coming later end them.
   */
  suspend fun holdsPatternsAfter(signedIn: SignInResult, account: SyncAccount): Boolean {
    if (signedIn == SignInResult.Switched) {
      account.userSocket.first { it == SocketState.Current || it is SocketState.Waiting || it is SocketState.Stopped }
    }
    return holdsPatterns()
  }

  /** Done: the questions answered, or the patterns came. Not asked again for this user. */
  suspend fun finish() {
    database.write { upsert(state().copy(firstRunDone = true)) }
  }
}
