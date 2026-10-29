package app.pochical.kit

import android.content.Context
import android.os.Build
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.shareIn
import kotlinx.coroutines.launch
import java.io.File
import okhttp3.HttpUrl.Companion.toHttpUrl

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

  /**
   * The client, made as the first call goes rather than as the kit is: the app makes the kit on the
   * main thread as it starts, which neither TLS being set up nor the disk should hold up. The photos'
   * folders below are found as late, the first time a photo is kept or read.
   */
  private val http = lazy { pochicalHttp() }

  val database: AppDatabase = AppDatabase.open(context)
  val edits = OwnEdits(database)

  /**
   * The person's own calendar, one reading for all that follow it (the screens, the reminders'
   * alarms, the widgets), again whenever sync or an edit changes it. Once none follows it, what was
   * read is forgotten, so the next to ask reads the database as it is then.
   */
  val ownCalendar: SharedFlow<OwnCalendar> =
    database
      .values()
      .ownCalendar()
      .shareIn(
        CoroutineScope(SupervisorJob() + Dispatchers.Default),
        SharingStarted.WhileSubscribed(replayExpirationMillis = 0),
        replay = 1,
      )

  /** はじめの設定, asked while it is not done for the user the database holds. */
  val firstRun = FirstRun(database)

  private val photos = Photos(http, server, lazy { File(context.cacheDir, "held-photos") })

  /** The member's own chat photos on the device, as sent and until they are up. */
  val photoFiles = ChatPhotoFiles(lazy { context.cacheDir }, lazy { context.filesDir })

  /** How far each of the member's chat photos has gone up, and × to stop its line. */
  val photoUploads = PhotoUploads()
  private val linePhotos = LinePhotos(photos, photoFiles, photoUploads)

  /** The app's version and the device (`appDevice`), read once a line first needs them. */
  val device: String by lazy { appDevice(context) }

  /** The chats' lines as the screens show them, and the member's edits of them. */
  val chats = Chats(database, linePhotos, deviceWords = { device })
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

  /** The chats' notifications as their switches show them, the user's changes laid over what the device heard. */
  val chatNotifications =
    ChatNotificationSwitches(
      combine(database.values().chatMutes(), database.values().chatNotificationSettings(), ChatNotificationState::of),
      account.state.map { (it as? AccountState.SignedIn)?.userId },
      groups::setChatMuted,
      groups::setMentionsWhenMuted,
      CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

  init {
    // What was fetched as a user goes with them, as the rest of their data does.
    CoroutineScope(SupervisorJob() + Dispatchers.Default).launch {
      account.state.map { (it as? AccountState.SignedIn)?.userId }.distinctUntilChanged().collect { photos.forget() }
    }
    // The marks' shape goes to the account for the user's groups (spec/sync-protocol.md, Profile).
    CoroutineScope(SupervisorJob() + Dispatchers.Default)
      .syncMarkLook(
        database.values().preferences().map { rows -> accountLook(rows.associate { it.key to it.value }) },
        database.values().profile(),
        account.userSocket,
        groups::setMarkLook,
      )
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

/**
 * The app's version and the device, as they reach Pochical's people with each line of the chat with
 * them, and as its head says so: ポチカル 1.0・Pixel 10a・Android 17.
 */
fun appDevice(context: Context): String = "ポチカル ${appVersion(context)}・${Build.MODEL}・Android ${Build.VERSION.RELEASE}"

/** The app's version, as Google Play shows it: 1.0. */
fun appVersion(context: Context): String = context.packageManager.getPackageInfo(context.packageName, 0).versionName.orEmpty()
