package app.pochical

import android.app.Application
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.DependencyGraph
import dev.zacsweers.metro.createGraph
import dev.zacsweers.metrox.android.MetroAppComponentProviders
import dev.zacsweers.metrox.android.MetroApplication

/** What the app holds once for as long as it runs, the activities it makes among them. */
@DependencyGraph(AppScope::class)
interface AppGraph : MetroAppComponentProviders

class PochicalApplication : Application(), MetroApplication {
  private val graph by lazy { createGraph<AppGraph>() }

  override val appComponentProviders: MetroAppComponentProviders
    get() = graph
}
