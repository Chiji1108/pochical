package app.pochical

import android.app.Application
import androidx.datastore.dataStoreFile
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import app.pochical.calendar.OwnDays
import app.pochical.calendar.SyncedDays
import app.pochical.kit.PochicalKit
import app.pochical.kit.SyncedSettings
import app.pochical.kit.deviceSettingsStore
import app.pochical.notifications.Push
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.DependencyGraph
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.SingleIn
import dev.zacsweers.metro.createGraphFactory
import dev.zacsweers.metrox.android.MetroAppComponentProviders
import dev.zacsweers.metrox.android.MetroApplication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

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

  val kit: PochicalKit

  val push: Push

  @DependencyGraph.Factory
  fun interface Factory {
    fun create(@Provides application: Application): AppGraph
  }
}

class PochicalApplication : Application(), MetroApplication, PochicalKit.Holder, Push.Holder {
  private val graph by lazy { createGraphFactory<AppGraph.Factory>().create(this) }

  override val appComponentProviders: MetroAppComponentProviders
    get() = graph

  override val pochicalKit: PochicalKit
    get() = graph.kit

  override val push: Push
    get() = graph.push

  override fun onCreate() {
    super.onCreate()
    graph.kit.followProcess()
    graph.push.start()
    ProcessLifecycleOwner.get()
      .lifecycle
      .addObserver(
        object : DefaultLifecycleObserver {
          override fun onStart(owner: LifecycleOwner) = graph.push.foreground()
        }
      )
  }
}
