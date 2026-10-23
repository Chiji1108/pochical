package app.pochical

import android.app.Application
import androidx.datastore.core.DataStore
import androidx.datastore.dataStoreFile
import app.pochical.kit.PochicalKit
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.DependencyGraph
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.SingleIn
import dev.zacsweers.metro.createGraphFactory
import dev.zacsweers.metrox.android.MetroAppComponentProviders
import dev.zacsweers.metrox.android.MetroApplication

/** What the app holds once for as long as it runs, the activities it makes among them. */
@DependencyGraph(AppScope::class)
interface AppGraph : MetroAppComponentProviders {
  @Provides
  @SingleIn(AppScope::class)
  fun deviceSettings(application: Application): DataStore<DeviceSettings> =
    deviceSettingsStore(application.dataStoreFile("device-settings.json"))

  /** The database, the edits and the account that syncs them. */
  @Provides
  @SingleIn(AppScope::class)
  fun pochicalKit(application: Application): PochicalKit = PochicalKit(application)

  val kit: PochicalKit

  @DependencyGraph.Factory
  fun interface Factory {
    fun create(@Provides application: Application): AppGraph
  }
}

class PochicalApplication : Application(), MetroApplication {
  private val graph by lazy { createGraphFactory<AppGraph.Factory>().create(this) }

  override val appComponentProviders: MetroAppComponentProviders
    get() = graph

  override fun onCreate() {
    super.onCreate()
    graph.kit.followProcess()
  }
}
