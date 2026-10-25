package app.pochical

import android.app.Application
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
import app.pochical.kit.ownCalendar
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
      deviceSettingsStore(application.dataStoreFile("device-settings.json")),
      kit.database,
      kit.edits,
      CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

  @Provides
  @SingleIn(AppScope::class)
  fun ownDays(kit: PochicalKit): OwnDays =
    SyncedDays(kit.database, kit.edits, CoroutineScope(SupervisorJob() + Dispatchers.Default))

  /** The database, the edits and the account that syncs them. */
  @Provides
  @SingleIn(AppScope::class)
  fun pochicalKit(application: Application): PochicalKit = PochicalKit(application)

  /** The notifications from the server. */
  @Provides
  @SingleIn(AppScope::class)
  fun push(application: Application, kit: PochicalKit): Push =
    Push(application, kit, CoroutineScope(SupervisorJob() + Dispatchers.Default))

  /** The reminders' alarms, read from the days, the device settings and the permission. */
  @Provides
  @SingleIn(AppScope::class)
  fun reminderAlarms(application: Application, kit: PochicalKit, settings: SyncedSettings, push: Push): ReminderAlarms =
    ReminderAlarms(
      application,
      kit.database.values().ownCalendar(),
      settings.settings.map { it.reminders }.distinctUntilChanged(),
      push.allowed,
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
  val widgetSources by lazy { WidgetSources(graph.kit.database, graph.settings) }

  override val push: Push
    get() = graph.push

  override val reminderAlarms: ReminderAlarms
    get() = graph.reminderAlarms

  override fun onCreate() {
    super.onCreate()
    // Listening before anything syncs, so a photo let go of is never missed (`followForgotten`).
    CoroutineScope(SupervisorJob() + Dispatchers.Default).launch(start = CoroutineStart.UNDISPATCHED) {
      followForgotten(graph.kit.photoFiles) { SingletonImageLoader.get(this@PochicalApplication) }
    }
    graph.kit.followProcess()
    followForWidgets(this, graph.kit.database, graph.settings)
    graph.push.start()
    graph.reminderAlarms.start()
    ProcessLifecycleOwner.get()
      .lifecycle
      .addObserver(
        object : DefaultLifecycleObserver {
          override fun onStart(owner: LifecycleOwner) {
            graph.push.foreground()
            graph.reminderAlarms.readExact()
          }
        }
      )
  }

  /** The one image loader every picture the app shows comes through (`chatImageLoader`). */
  override fun newImageLoader(context: PlatformContext): ImageLoader = chatImageLoader(context, graph.kit.groups, graph.kit.photoFiles)
}
