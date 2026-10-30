package app.pochical

import android.app.Application
import android.content.Context
import android.os.StrictMode
import androidx.datastore.dataStoreFile
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import app.pochical.calendar.OwnDays
import app.pochical.calendar.SyncedDays
import app.pochical.chat.chatImageLoader
import app.pochical.chat.followForgotten
import app.pochical.kit.PochicalKit
import coil3.ImageLoader
import coil3.PlatformContext
import coil3.SingletonImageLoader
import app.pochical.kit.SyncedSettings
import app.pochical.kit.deviceSettingsStore
import app.pochical.widgets.WidgetSources
import app.pochical.widgets.followForWidgets
import app.pochical.notifications.NotificationPermission
import app.pochical.notifications.Push
import app.pochical.reminders.ReminderAlarms
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.DependencyGraph
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.SingleIn
import dev.zacsweers.metro.createGraphFactory
import dev.zacsweers.metrox.android.MetroAppComponentProviders
import dev.zacsweers.metrox.android.MetroApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.map

/** What the app holds once for as long as it runs, the activities it makes among them. */
@DependencyGraph(AppScope::class)
interface AppGraph : MetroAppComponentProviders {
  /** The device settings, the preferences among them kept with the account. */
  @Provides
  @SingleIn(AppScope::class)
  fun settings(application: Application, kit: PochicalKit): SyncedSettings =
    SyncedSettings(
      deviceSettingsStore({ application.dataStoreFile("device-settings.json") }),
      kit.database,
      kit.edits,
      CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

  @Provides
  @SingleIn(AppScope::class)
  fun ownDays(kit: PochicalKit): OwnDays =
    SyncedDays(kit.database, kit.edits, kit.ownCalendar, CoroutineScope(SupervisorJob() + Dispatchers.Default))

  /** The database, the edits and the account that syncs them. */
  @Provides
  @SingleIn(AppScope::class)
  fun pochicalKit(application: Application): PochicalKit = PochicalKit(application)

  /** Appleで続ける, its page kept open through the activities made while it is. */
  @Provides
  @SingleIn(AppScope::class)
  fun appleSignIn(kit: PochicalKit): AppleSignIn = AppleSignIn(kit.appleSignIn)

  /** Appleで続ける and Googleで続ける under way, kept through the activities made while they run. */
  @Provides
  @SingleIn(AppScope::class)
  fun signIns(kit: PochicalKit, apple: AppleSignIn): SignIns =
    SignIns(kit.account, kit.firstRun, apple, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))

  /** アカウントを削除 under way, kept through the activities made while Apple is asked for its code. */
  @Provides
  @SingleIn(AppScope::class)
  fun accountDeletion(kit: PochicalKit, apple: AppleSignIn): AccountDeletion =
    AccountDeletion(kit.account::deleteAccount, apple::authorizationCode, kit.account.state, CoroutineScope(SupervisorJob() + Dispatchers.Main.immediate))

  /** The notifications from the server. */
  @Provides
  @SingleIn(AppScope::class)
  fun push(application: Application, kit: PochicalKit, permission: NotificationPermission, settings: SyncedSettings): Push =
    Push(application, kit, permission, settings.settings, CoroutineScope(SupervisorJob() + Dispatchers.Default))

  /** Whether the system lets the app show notifications. */
  @Provides
  @SingleIn(AppScope::class)
  fun notificationPermission(application: Application): NotificationPermission = NotificationPermission(application)

  /** The reminders' alarms, read from the days, the device settings and the permission. */
  @Provides
  @SingleIn(AppScope::class)
  fun reminderAlarms(
    application: Application,
    kit: PochicalKit,
    settings: SyncedSettings,
    permission: NotificationPermission,
  ): ReminderAlarms =
    ReminderAlarms(
      application,
      kit.ownCalendar,
      settings.settings.map { it.reminders }.distinctUntilChanged(),
      permission.allowed,
      CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

  val kit: PochicalKit

  /** The settings, as the widgets read them too. */
  val settings: SyncedSettings

  val push: Push

  val reminderAlarms: ReminderAlarms

  @DependencyGraph.Factory
  fun interface Factory {
    fun create(@Provides application: Application): AppGraph
  }
}

class PochicalApplication : Application(), MetroApplication, PochicalKit.Holder, Push.Holder, ReminderAlarms.Holder, SingletonImageLoader.Factory {
  private val graph by lazy { createGraphFactory<AppGraph.Factory>().create(this) }

  override val appComponentProviders: MetroAppComponentProviders
    get() = graph

  override val pochicalKit: PochicalKit
    get() = graph.kit

  /** What the widgets draw from: the kit's database and the settings. */
  val widgetSources by lazy { WidgetSources(graph.kit.database, graph.kit.ownCalendar, graph.settings) }

  override val push: Push
    get() = graph.push

  override val reminderAlarms: ReminderAlarms
    get() = graph.reminderAlarms

  override fun attachBaseContext(base: Context) {
    // A debug build reports the main thread's disk and network work, and what is left unclosed or
    // leaked, into the log under StrictMode: set before the content providers start and the app's
    // own onCreate, so the whole start is checked. Network on the main thread already stops any build.
    if (BuildConfig.DEBUG) {
      StrictMode.setThreadPolicy(StrictMode.ThreadPolicy.Builder().detectAll().penaltyLog().build())
      StrictMode.setVmPolicy(StrictMode.VmPolicy.Builder().detectAll().penaltyLog().build())
    }
    super.attachBaseContext(base)
  }

  override fun onCreate() {
    super.onCreate()
    // Listening before anything syncs, so a photo let go of is never missed (`followForgotten`).
    CoroutineScope(SupervisorJob() + Dispatchers.Default).launch(start = CoroutineStart.UNDISPATCHED) {
      followForgotten(graph.kit.photoFiles) { SingletonImageLoader.get(this@PochicalApplication) }
    }
    // Push listens before anything syncs too, so a group left is never missed (`SyncAccount.left`).
    graph.push.start()
    graph.kit.followProcess()
    followForWidgets(this, graph.kit.database, graph.settings)
    graph.reminderAlarms.start()
    ProcessLifecycleOwner.get()
      .lifecycle
      .addObserver(
        object : DefaultLifecycleObserver {
          override fun onStart(owner: LifecycleOwner) {
            graph.push.foreground()
            graph.reminderAlarms.readExact()
            ReviewPrompt.opened(this@PochicalApplication)
          }
        }
      )
  }

  /** The one image loader every picture the app shows comes through (`chatImageLoader`). */
  override fun newImageLoader(context: PlatformContext): ImageLoader = chatImageLoader(context, graph.kit.groups, graph.kit.photoFiles)
}
