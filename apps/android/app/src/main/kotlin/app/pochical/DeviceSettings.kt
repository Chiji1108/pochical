package app.pochical

import androidx.compose.runtime.Stable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.Serializer
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import app.pochical.design.Theme
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.catch
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.SerializationException
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.decodeFromStream
import kotlinx.serialization.json.encodeToStream

/**
 * What the person set for their own screen, kept on the device, as iOS's
 * DeviceSettings: the テーマ and 外観 so far, the rest coming with the
 * screens that set it. The テーマ is kept with the account too once the
 * app syncs (spec/sync-protocol.md, Preferences); 外観 stays with the device.
 */
@Serializable
data class DeviceSettings(
  /** The テーマ's id, as /design's preset, kept as it came so one this app does not know survives. */
  @SerialName("theme") val themeId: String = Theme.Pochical.id,
  val appearance: Appearance = Appearance.System,
  val look: Look = Look(),
) {
  /** The テーマ in use; one no longer known is the app's own. */
  val theme: Theme
    get() = Theme.entries.find { it.id == themeId } ?: Theme.Pochical
}

/** 外観 (/design's Appearance): following the phone, or always light or dark. A テーマ drawn dark wins over it. */
@Serializable
enum class Appearance {
  @SerialName("system") System,
  @SerialName("light") Light,
  @SerialName("dark") Dark,
}

/**
 * The marks' look (/design's スタイル), kept with the account as iOS's Look
 * is: the shape, an icon's fill, and whether each shift keeps its own color
 * (色分け) or all take the テーマ's (ワントーン). How days off show in each
 * shape comes with the style page (POC-208).
 */
@Serializable
data class Look(
  val style: MarkStyle = MarkStyle.Icon,
  /** Filled (塗り) or outlined (線); icons alone have the choice. */
  val fill: Boolean = true,
  val colored: Boolean = true,
)

/** How a pattern's mark is drawn: its icon, its emoji or its letter on a tile. */
@Serializable
enum class MarkStyle {
  @SerialName("icon") Icon,
  @SerialName("emoji") Emoji,
  @SerialName("badge") Badge,
}

/** The device settings as the screens read them, and the way to change them, as iOS's Settings. */
@Stable
class DeviceSettingsState(
  val device: DeviceSettings,
  val change: ((DeviceSettings) -> DeviceSettings) -> Unit,
)

/** The device settings for the screens under the app's root. */
val LocalDeviceSettings =
  staticCompositionLocalOf<DeviceSettingsState> { error("No device settings above this screen") }

/**
 * The device settings kept in `file`. A setting missing from what was kept,
 * or one this app cannot read, takes its default, and a file that cannot be
 * read at all is the defaults, as on iOS.
 */
fun deviceSettingsStore(
  file: File,
  scope: CoroutineScope = CoroutineScope(Dispatchers.IO + SupervisorJob()),
): DataStore<DeviceSettings> =
  DataStoreFactory.create(
    serializer = DeviceSettingsSerializer,
    corruptionHandler = ReplaceFileCorruptionHandler { DeviceSettings() },
    scope = scope,
    produceFile = { file },
  )

/** The settings as kept, the defaults while the disk cannot be read, as DataStore's data says to. */
val DataStore<DeviceSettings>.settings: Flow<DeviceSettings>
  get() = data.catch { if (it is IOException) emit(DeviceSettings()) else throw it }

private object DeviceSettingsSerializer : Serializer<DeviceSettings> {
  private val json = Json {
    ignoreUnknownKeys = true
    coerceInputValues = true
    encodeDefaults = true
  }

  override val defaultValue = DeviceSettings()

  override suspend fun readFrom(input: InputStream): DeviceSettings =
    try {
      json.decodeFromStream(input)
    } catch (e: SerializationException) {
      throw CorruptionException("The device settings are not JSON this app reads", e)
    }

  override suspend fun writeTo(t: DeviceSettings, output: OutputStream) {
    json.encodeToStream(t, output)
  }
}
