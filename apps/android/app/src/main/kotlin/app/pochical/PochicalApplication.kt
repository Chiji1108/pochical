package app.pochical

import android.app.Application
import androidx.datastore.core.DataStore
import androidx.datastore.dataStoreFile
import app.pochical.calendar.OwnDays
import app.pochical.calendar.SampleDays
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.DependencyGraph
import dev.zacsweers.metro.Provides
import dev.zacsweers.metro.SingleIn
import dev.zacsweers.metro.createGraphFactory
import dev.zacsweers.metrox.android.MetroAppComponentProviders
import dev.zacsweers.metrox.android.MetroApplication
import java.time.LocalDate

/** What the app holds once for as long as it runs, the activities it makes among them. */
@DependencyGraph(AppScope::class)
interface AppGraph : MetroAppComponentProviders {
  @Provides
  @SingleIn(AppScope::class)
  fun deviceSettings(application: Application): DataStore<DeviceSettings> =
    deviceSettingsStore(application.dataStoreFile("device-settings.json"))

  @Provides @SingleIn(AppScope::class) fun ownDays(): OwnDays = SampleDays(LocalDate.now())

  @DependencyGraph.Factory
  fun interface Factory {
    fun create(@Provides application: Application): AppGraph
  }
}

class PochicalApplication : Application(), MetroApplication {
  private val graph by lazy { createGraphFactory<AppGraph.Factory>().create(this) }

  override val appComponentProviders: MetroAppComponentProviders
    get() = graph
}
