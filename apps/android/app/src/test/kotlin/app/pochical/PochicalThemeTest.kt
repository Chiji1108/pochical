package app.pochical

import app.pochical.design.Theme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PochicalThemeTest {
  @Test
  fun appearanceFollowsThePhoneOrHoldsOne() {
    assertTrue(isDark(DeviceSettings(appearance = Appearance.System), systemDark = true))
    assertFalse(isDark(DeviceSettings(appearance = Appearance.System), systemDark = false))
    assertFalse(isDark(DeviceSettings(appearance = Appearance.Light), systemDark = true))
    assertTrue(isDark(DeviceSettings(appearance = Appearance.Dark), systemDark = false))
  }

  @Test
  fun aThemeDrawnDarkIsDarkWhateverAppearanceSays() {
    assertTrue(isDark(DeviceSettings(Theme.Kissa.id, Appearance.Light), systemDark = false))
  }

  @Test
  fun theSchemeIsDrawnInThePickedThemesColors() {
    val sakura = Theme.Sakura.colors(dark = false)
    val scheme = colorScheme(DeviceSettings(Theme.Sakura.id), dark = false)
    assertEquals(sakura.accentFill, scheme.primary)
    assertEquals(sakura.accentDefault, scheme.secondary)
    assertEquals(sakura.accentContainer, scheme.secondaryContainer)
    assertEquals(sakura.backgroundBase, scheme.surface)
    assertEquals(sakura.textPrimary, scheme.onSurface)
  }

  @Test
  fun darkTakesTheThemesDarkColors() {
    val scheme = colorScheme(DeviceSettings(Theme.Matcha.id), dark = true)
    assertEquals(Theme.Matcha.colors(dark = true).backgroundBase, scheme.background)
  }
}
