package app.pochical

import android.app.Activity
import android.app.Application
import android.app.Service
import android.content.BroadcastReceiver
import android.content.ContentProvider
import dev.zacsweers.metrox.android.MetroAppComponentProviders
import dev.zacsweers.metrox.android.MetroApplication
import kotlin.reflect.KClass

/**
 * The application Robolectric runs every test in (robolectric.properties): one without the app's
 * graph, so no test starts the kit's database on disk, its sync with the server, the reminders'
 * alarms or the notifications. A test builds what it checks itself, over a database in memory.
 */
class TestApplication : Application(), MetroApplication {
  override val appComponentProviders =
    object : MetroAppComponentProviders {
      override val activityProviders = emptyMap<KClass<out Activity>, () -> Activity>()
      override val providerProviders = emptyMap<KClass<out ContentProvider>, () -> ContentProvider>()
      override val receiverProviders = emptyMap<KClass<out BroadcastReceiver>, () -> BroadcastReceiver>()
      override val serviceProviders = emptyMap<KClass<out Service>, () -> Service>()
    }
}
