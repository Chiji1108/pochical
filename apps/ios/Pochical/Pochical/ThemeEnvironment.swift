import PochicalDesign
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

/// Puts the テーマ's colors in the environment for the screens under it;
/// a テーマ drawn dark whatever 外観 says turns the screens dark with it.
struct Themed: ViewModifier {
  let theme: Theme

  func body(content: Content) -> some View {
    content
      .modifier(ThemeColorsForScheme(theme: theme))
      .preferredColorScheme(theme.isAlwaysDark ? .dark : nil)
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
