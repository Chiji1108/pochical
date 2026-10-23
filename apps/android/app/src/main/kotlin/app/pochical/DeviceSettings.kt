package app.pochical

import androidx.datastore.core.CorruptionException
import androidx.datastore.core.DataStore
import androidx.datastore.core.DataStoreFactory
import androidx.datastore.core.Serializer
import androidx.datastore.core.handlers.ReplaceFileCorruptionHandler
import app.pochical.design.Theme
import java.io.File
import java.io.InputStream
import java.io.OutputStream
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
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
 * The device settings kept in `file`. A setting missing from what was kept
 * takes its default, and a file that cannot be read is the defaults, as on
 * iOS.
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

private object DeviceSettingsSerializer : Serializer<DeviceSettings> {
  private val json = Json { ignoreUnknownKeys = true }

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
