package app.pochical

import androidx.compose.runtime.Stable
import androidx.compose.runtime.staticCompositionLocalOf
import app.pochical.kit.DeviceSettings

/** The device settings as the screens read them, and the way to change them, as iOS's Settings. */
@Stable
class DeviceSettingsState(
  val device: DeviceSettings,
  val change: ((DeviceSettings) -> DeviceSettings) -> Unit,
)

/** The device settings for the screens under the app's root. */
val LocalDeviceSettings =
  staticCompositionLocalOf<DeviceSettingsState> { error("No device settings above this screen") }
