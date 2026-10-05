import SwiftUI

extension View {
  /// A sheet as tall as what it holds, for one that asks a little: iOS
  /// gives iPhone sheets no detent that fits their content, so it is
  /// measured and set as a `.height` detent, as Daniel Saidi's
  /// `.sizeToFit` does. The content draws its own bar: a NavigationStack
  /// lays it out at odd sizes first, which moves the detent while the
  /// sheet slides up and spoils the slide.
  func fittedSheet() -> some View {
    modifier(FittedSheet())
  }
}

private struct FittedSheet: ViewModifier {
  @State private var height: CGFloat = 0

  func body(content: Content) -> some View {
    content
      .fixedSize(horizontal: false, vertical: true)
      .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
      .frame(maxHeight: .infinity, alignment: .top)
      .presentationDetents([.height(height)])
  }
}
