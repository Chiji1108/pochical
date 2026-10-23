package app.pochical

import android.app.Activity
import android.os.Bundle
import android.view.View
import android.view.ViewTreeObserver
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
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
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.STARTED) { deviceSettings.data.collect { settings = it } }
    }
    keepSplashUntilSettingsAreRead()
    setContent {
      settings?.let { settings ->
        PochicalTheme(settings) {
          RootScreen(rememberRootNavigator(), deviceSettings)
        }
      }
    }
  }

  // The splash stays until the first frame can be drawn in the person's
  // テーマ, rather than a frame in another first.
  private fun keepSplashUntilSettingsAreRead() {
    val content = findViewById<View>(android.R.id.content)
    content.viewTreeObserver.addOnPreDrawListener(
      object : ViewTreeObserver.OnPreDrawListener {
        override fun onPreDraw(): Boolean {
          if (settings == null) return false
          content.viewTreeObserver.removeOnPreDrawListener(this)
          return true
        }
      }
    )
  }
}
