package app.pochical.kit

import android.content.Context
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.io.File
import okhttp3.HttpUrl.Companion.toHttpUrl
import okhttp3.OkHttpClient

/**
 * What the app holds of the kit for as long as it runs: the database the screens read, the edits
 * they make, and the account that syncs them with the server (BuildConfig.SERVER).
 */
class PochicalKit(context: Context) {
  /** The app, which holds the one kit for what runs without its screens, as [SendOutboxWorker]. */
  interface Holder {
    val pochicalKit: PochicalKit
  }

  private val server = BuildConfig.SERVER.toHttpUrl()
  private val http = OkHttpClient()

  val database: AppDatabase = AppDatabase.open(context)
  val edits = OwnEdits(database)

  private val photos = Photos(http, server, File(context.cacheDir, "held-photos"))

  /** The member's own chat photos on the device, as sent and until they are up. */
  val photoFiles = ChatPhotoFiles(context.cacheDir, context.filesDir)

  /** How far each of the member's chat photos has gone up, and × to stop its line. */
  val photoUploads = PhotoUploads()
  private val linePhotos = LinePhotos(photos, photoFiles, photoUploads)

  /** The chats' lines as the screens show them, and the member's edits of them. */
  val chats = Chats(database, linePhotos)
  val account =
    SyncAccount(
      database = database,
      sessions = SessionStore(BlockStoreBytes(context)),
      server = server,
      http = http,
      scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
      network = DefaultNetworkWatch(context),
      linePhotos = linePhotos,
      sendInBackground = { SendOutboxWorker.enqueue(context) },
    )

  /** GroupService, the profile and the photos, as the user the device is signed in as. */
  val groups = GroupCalls(account, http, server, photos, CoroutineScope(SupervisorJob() + Dispatchers.Default))

  init {
    // What was fetched as a user goes with them, as the rest of their data does.
    CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
      account.state.map { (it as? AccountState.SignedIn)?.userId }.distinctUntilChanged().collect { photos.forget() }
    }
  }

  /** Sign in with Apple through Apple's web page, which Android has in place of iOS's own. */
  val appleSignIn = AppleWebSignIn(server, http)

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
