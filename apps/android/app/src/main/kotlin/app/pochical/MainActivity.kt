package app.pochical

import android.app.Activity
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.datastore.core.DataStore
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import dev.zacsweers.metro.AppScope
import dev.zacsweers.metro.ContributesIntoMap
import dev.zacsweers.metro.Inject
import dev.zacsweers.metro.binding
import dev.zacsweers.metrox.android.ActivityKey
import kotlinx.coroutines.launch

@ContributesIntoMap(AppScope::class, binding<Activity>())
@ActivityKey
@Inject
class MainActivity(private val deviceSettings: DataStore<DeviceSettings>) : ComponentActivity() {
  private var settings by mutableStateOf<DeviceSettings?>(null)

  override fun onCreate(savedInstanceState: Bundle?) {
    // The splash stays until the first frame can be drawn in the person's テーマ.
    installSplashScreen().setKeepOnScreenCondition { settings == null }
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.STARTED) { deviceSettings.settings.collect { settings = it } }
    }
    setContent {
      val device = settings ?: return@setContent
      val state =
        remember(device) {
          DeviceSettingsState(device) { change ->
            lifecycleScope.launch { deviceSettings.updateData(change) }
          }
        }
      CompositionLocalProvider(LocalDeviceSettings provides state) {
        PochicalTheme(device) { RootScreen(rememberRootNavigator()) }
      }
    }
  }
}
