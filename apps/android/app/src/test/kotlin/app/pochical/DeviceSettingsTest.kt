package app.pochical

import app.pochical.design.Theme
import java.io.File
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class DeviceSettingsTest {
  @get:Rule val folder = TemporaryFolder()

  private val file by lazy { File(folder.root, "device-settings.json") }

  /** Reads the settings as a store opened anew on the file does, as the app does when it starts again. */
  private suspend fun readAgain(): DeviceSettings {
    val scope = CoroutineScope(Dispatchers.IO)
    try {
      return deviceSettingsStore(file, scope).data.first()
    } finally {
      scope.cancel()
    }
  }

  @Test
  fun aDeviceNeverSetShowsPochicalAsThePhoneIs() = runTest {
    assertEquals(DeviceSettings(Theme.Pochical.id, Appearance.System), readAgain())
  }

  @Test
  fun whatIsSetIsKeptForTheNextStart() = runTest {
    val scope = CoroutineScope(Dispatchers.IO)
    deviceSettingsStore(file, scope).updateData {
      it.copy(themeId = Theme.Sakura.id, appearance = Appearance.Dark)
    }
    scope.cancel()

    val kept = readAgain()
    assertEquals(Theme.Sakura, kept.theme)
    assertEquals(Appearance.Dark, kept.appearance)
  }

  @Test
  fun aThemeThisAppDoesNotKnowIsPochicalAndKeptAsItCame() = runTest {
    file.writeText("""{"theme":"aurora","appearance":"light"}""")

    val kept = readAgain()
    assertEquals(Theme.Pochical, kept.theme)
    assertEquals("aurora", kept.themeId)
    assertEquals(Appearance.Light, kept.appearance)
  }

  @Test
  fun aSettingMissingTakesItsDefault() = runTest {
    file.writeText("""{"theme":"matcha"}""")

    assertEquals(DeviceSettings(Theme.Matcha.id, Appearance.System), readAgain())
  }

  @Test
  fun aFileThatCannotBeReadIsTheDefaults() = runTest {
    file.writeText("not json")

    assertEquals(DeviceSettings(), readAgain())
  }
}
