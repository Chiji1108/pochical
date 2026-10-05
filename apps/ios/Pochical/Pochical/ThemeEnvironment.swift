import PochicalDesign
import PochicalKit
import SwiftUI

extension EnvironmentValues {
  /// The colors of the テーマ in use, in light or dark as the screen is.
  @Entry var themeColors: ThemeColors = Theme.pochical.colors(.light)
}

extension ThemeColors {
  /// A pattern's color slot as this テーマ draws it.
  func mark(_ slot: Int) -> MarkColor {
    marks[min(max(slot, 0), marks.count - 1)]
  }
}

/// Puts the テーマ's colors in the environment for the screens under it,
/// in light or dark as 外観 says, or dark whatever it says for a テーマ
/// drawn so.
struct Themed: ViewModifier {
  let theme: Theme
  var appearance = Appearance.system

  func body(content: Content) -> some View {
    content
      .modifier(ThemeColorsForScheme(theme: theme))
      .preferredColorScheme(scheme)
  }

  private var scheme: ColorScheme? {
    if theme.isAlwaysDark {
      return .dark
    }
    switch appearance {
    case .system: return nil
    case .light: return .light
    case .dark: return .dark
    }
  }
}

/// The テーマ's colors in the light or dark the screen is drawn in.
private struct ThemeColorsForScheme: ViewModifier {
  @Environment(\.colorScheme) private var colorScheme
  let theme: Theme

  func body(content: Content) -> some View {
    content.environment(\.themeColors, theme.colors(theme.isAlwaysDark ? .dark : colorScheme))
  }
}
