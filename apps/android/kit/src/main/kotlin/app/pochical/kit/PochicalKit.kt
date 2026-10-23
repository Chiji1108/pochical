package app.pochical.kit

import android.content.Context
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient

/**
 * What the app holds of the kit for as long as it runs: the database the screens read, the edits
 * they make, and the account that syncs them with the server (BuildConfig.SERVER).
 */
class PochicalKit(context: Context) {
  val database: AppDatabase = AppDatabase.open(context)
  val edits = OwnEdits(database)
  val account =
    SyncAccount(
      database = database,
      // Kept out of backups: a session restored elsewhere could not be read there anyway.
      sessions = SessionStore(File(context.noBackupFilesDir, "session"), KeystoreSeal()),
      server = BuildConfig.SERVER.toHttpUrl(),
      http = OkHttpClient(),
      scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
      network = DefaultNetworkWatch(context),
    )

  /**
   * Syncs while the app is in the foreground (spec/sync-protocol.md, Sockets): the sockets open as
   * it comes to the front and close as it leaves. Called once, on the main thread.
   */
  fun followProcess() {
    ProcessLifecycleOwner.get()
      .lifecycle
      .addObserver(
        object : DefaultLifecycleObserver {
          override fun onStart(owner: LifecycleOwner) = account.foreground()

          override fun onStop(owner: LifecycleOwner) = account.background()
        }
      )
  }
}
