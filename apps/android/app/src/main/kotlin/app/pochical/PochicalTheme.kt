package app.pochical

import android.graphics.Color
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.LocalActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import app.pochical.design.ThemeColors

/**
 * The screens under it in the person's テーマ, light or dark as 外観 says,
 * or dark whatever it says for a テーマ drawn so; the system bars' icons
 * follow, as they cannot read the app's own light or dark.
 */
@Composable
fun PochicalTheme(settings: DeviceSettings, content: @Composable () -> Unit) {
  val dark = isDark(settings, systemDark = isSystemInDarkTheme())
  val activity = LocalActivity.current as? ComponentActivity
  DisposableEffect(activity, dark) {
    val bars = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { dark }
    activity?.enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
    onDispose {}
  }
  MaterialTheme(colorScheme = colorScheme(settings, dark), content = content)
}

/** Whether the screens are drawn dark, given the phone's own light or dark. */
fun isDark(settings: DeviceSettings, systemDark: Boolean): Boolean =
  settings.theme.isAlwaysDark ||
    when (settings.appearance) {
      Appearance.System -> systemDark
      Appearance.Light -> false
      Appearance.Dark -> true
    }

/**
 * Material's roles in the テーマ's colors, those with a token of the same
 * meaning: the accent's for primary and secondary (secondary is what
 * Material picks things out in, as the tab bar's chosen tab), the grounds',
 * the words', the lines' and danger's. Tertiary and the error container have
 * none, and keep Material's.
 */
fun colorScheme(settings: DeviceSettings, dark: Boolean): ColorScheme {
  val colors = settings.theme.colors(dark)
  return (if (dark) darkColorScheme() else lightColorScheme()).from(colors)
}

private fun ColorScheme.from(colors: ThemeColors): ColorScheme =
  copy(
    primary = colors.accentFill,
    onPrimary = colors.accentOnFill,
    primaryContainer = colors.accentContainer,
    onPrimaryContainer = colors.accentDefault,
    secondary = colors.accentDefault,
    onSecondary = colors.accentOnFill,
    secondaryContainer = colors.accentContainer,
    onSecondaryContainer = colors.accentDefault,
    surfaceTint = colors.accentFill,
    background = colors.backgroundBase,
    onBackground = colors.textPrimary,
    surface = colors.backgroundBase,
    onSurface = colors.textPrimary,
    onSurfaceVariant = colors.textSecondary,
    surfaceContainerLowest = colors.backgroundBase,
    surfaceContainerLow = colors.backgroundElevated,
    surfaceContainer = colors.backgroundCard,
    surfaceContainerHigh = colors.backgroundElevated,
    inverseSurface = colors.inverseBackground,
    inverseOnSurface = colors.inverseText,
    error = colors.dangerFill,
    onError = colors.dangerOnFill,
    outline = colors.borderStrong,
    outlineVariant = colors.borderDefault,
    scrim = colors.scrim,
  )
