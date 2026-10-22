package app.pochical

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import app.pochical.design.Theme
import app.pochical.design.ThemeColors

@Composable
fun PochicalTheme(content: @Composable () -> Unit) {
  val dark = isSystemInDarkTheme()
  val colors = Theme.Pochical.colors(dark)
  MaterialTheme(
    colorScheme = if (dark) darkColorScheme().from(colors) else lightColorScheme().from(colors),
    content = content,
  )
}

private fun ColorScheme.from(colors: ThemeColors): ColorScheme =
  copy(
    primary = colors.accentFill,
    onPrimary = colors.accentOnFill,
    primaryContainer = colors.accentContainer,
    background = colors.backgroundBase,
    onBackground = colors.textPrimary,
    surface = colors.backgroundBase,
    onSurface = colors.textPrimary,
    onSurfaceVariant = colors.textSecondary,
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
