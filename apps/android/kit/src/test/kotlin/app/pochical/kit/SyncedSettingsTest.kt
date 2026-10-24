package app.pochical.kit

import app.pochical.v1.Change
import app.pochical.v1.change
import app.pochical.v1.hlc
import app.pochical.v1.preferenceValue
import app.pochical.v1.themePreference
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withTimeout
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class SyncedSettingsTest {
  @get:Rule val folder = TemporaryFolder()

  private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
  private val database = testDatabase()
  private val settings by lazy {
    SyncedSettings(deviceSettingsStore(File(folder.root, "settings.json"), scope), database, OwnEdits(database), scope)
  }

  @After
  fun end() {
    scope.cancel()
    database.close()
  }

  /** The keys of the edits waiting to go, in the order they were made. */
  private suspend fun waiting(): List<String> = database.write { outbox() }.map { Change.parseFrom(it.change).preference.key }

  @Test
  fun aPreferenceChangedGoesAsAnEditAndTheDevicesOwnStaysHome() = runBlocking {
    settings.change { it.copy(themeId = "zen", appearance = Appearance.Dark) }
    settings.change { it.copy(picture = it.picture.copy(dark = true)) }
    // The second change is kept after the first one's edits are written.
    withTimeout(5_000) { settings.settings.first { it.picture.dark == true } }

    assertEquals(listOf("theme"), waiting())
    assertEquals("zen", settings.settings.first().themeId)
  }

  @Test
  fun aPreferenceFromAnotherDeviceIsTaken() = runBlocking {
    settings.settings.first()
    database.write {
      takeOwn(change {
        preference = preferenceValue {
          key = "theme"
          message = themePreference { id = "sakura" }.toByteString()
          hlc = hlc {
            physicalMs = 1
            deviceId = "ipad"
          }
        }
      })
    }

    val taken = withTimeout(5_000) { settings.settings.first { it.themeId == "sakura" } }
    assertEquals(Appearance.System, taken.appearance)
    assertEquals(emptyList<String>(), waiting())
  }
}
