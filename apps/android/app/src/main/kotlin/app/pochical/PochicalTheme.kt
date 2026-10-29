package app.pochical

import android.app.UiModeManager
import android.graphics.Color
import android.os.Build
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.LocalActivity
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.text.TextStyle
import app.pochical.design.MarkColor
import app.pochical.design.PochicalTextStyles
import app.pochical.design.Theme
import app.pochical.design.ThemeColors
import app.pochical.kit.Appearance
import app.pochical.kit.DeviceSettings

/**
 * The screens under it in the person's テーマ, light or dark as 外観 says,
 * or dark whatever it says for a テーマ drawn so. The system is told too,
 * where it can be (Android 12 on), so the splash, the window and the
 * system's own sheets agree; the system bars' icons follow on every version.
 */
@Composable
fun PochicalTheme(settings: DeviceSettings, content: @Composable () -> Unit) {
  val dark = isDark(settings, systemDark = isSystemInDarkTheme())
  val activity = LocalActivity.current as? ComponentActivity
  val nightMode = nightMode(settings)
  LaunchedEffect(activity, nightMode) {
    if (activity != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      activity.getSystemService(UiModeManager::class.java).setApplicationNightMode(nightMode)
    }
  }
  LaunchedEffect(activity, dark) {
    val bars = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT) { dark }
    activity?.enableEdgeToEdge(statusBarStyle = bars, navigationBarStyle = bars)
  }
  CompositionLocalProvider(LocalThemeColors provides settings.theme.colors(dark)) {
    MaterialTheme(colorScheme = colorScheme(settings, dark), typography = Phrases, content = content)
  }
}

/**
 * Material's type scale, its Japanese breaking between phrases rather than in the middle of a word,
 * as the app's own text styles and the site's do (PochicalTextStyles), so a title, a button or a
 * note wraps where a reader would.
 */
private val Phrases: Typography =
  Typography().run {
    val phrases = PochicalTextStyles.body.lineBreak
    fun TextStyle.inPhrases() = copy(lineBreak = phrases)
    Typography(
      displayLarge = displayLarge.inPhrases(),
      displayMedium = displayMedium.inPhrases(),
      displaySmall = displaySmall.inPhrases(),
      headlineLarge = headlineLarge.inPhrases(),
      headlineMedium = headlineMedium.inPhrases(),
      headlineSmall = headlineSmall.inPhrases(),
      titleLarge = titleLarge.inPhrases(),
      titleMedium = titleMedium.inPhrases(),
      titleSmall = titleSmall.inPhrases(),
      bodyLarge = bodyLarge.inPhrases(),
      bodyMedium = bodyMedium.inPhrases(),
      bodySmall = bodySmall.inPhrases(),
      labelLarge = labelLarge.inPhrases(),
      labelMedium = labelMedium.inPhrases(),
      labelSmall = labelSmall.inPhrases(),
    )
  }

/**
 * The colors of the テーマ in use, in light or dark as the screens are, for
 * what Material has no role for: the marks', a day off's tint, a holiday's.
 */
val LocalThemeColors = staticCompositionLocalOf { Theme.Pochical.colors(dark = false) }

/** A pattern's color slot as this テーマ draws it; one past the palette is its last. */
fun ThemeColors.mark(slot: Int): MarkColor = marks[slot.coerceIn(0, marks.lastIndex)]

/** Whether the screens are drawn dark, given the phone's own light or dark. */
fun isDark(settings: DeviceSettings, systemDark: Boolean): Boolean =
  settings.theme.isAlwaysDark ||
    when (settings.appearance) {
      Appearance.System -> systemDark
      Appearance.Light -> false
      Appearance.Dark -> true
    }

/** The app's night mode as UiModeManager takes it. */
private fun nightMode(settings: DeviceSettings): Int =
  when {
    settings.theme.isAlwaysDark -> UiModeManager.MODE_NIGHT_YES
    settings.appearance == Appearance.Light -> UiModeManager.MODE_NIGHT_NO
    settings.appearance == Appearance.Dark -> UiModeManager.MODE_NIGHT_YES
    else -> UiModeManager.MODE_NIGHT_AUTO
  }

/**
 * Material's roles in the テーマ's colors, those with a token of the same
 * meaning: the accent's for primary and secondary (secondary is what
 * Material picks things out in, as the tab bar's chosen tab), the grounds'
 * from the base up, the words', the lines' and danger's. Tertiary, the error
 * container and what goes on secondary have none, and keep Material's.
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
    surfaceContainer = colors.backgroundElevated,
    surfaceContainerHigh = colors.backgroundCard,
    surfaceContainerHighest = colors.backgroundCard,
    inverseSurface = colors.inverseBackground,
    inverseOnSurface = colors.inverseText,
    error = colors.dangerFill,
    onError = colors.dangerOnFill,
    outline = colors.borderStrong,
    outlineVariant = colors.borderDefault,
    scrim = colors.scrim,
  )
