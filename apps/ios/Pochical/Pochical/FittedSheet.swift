import SwiftUI

extension View {
  /// A sheet as tall as what it holds, for one that asks a little. iOS gives
  /// iPhone sheets no detent that fits their content, so it is measured and
  /// set as a `.height` detent, as Daniel Saidi's `.sizeToFit` does, with
  /// two more steps: it is measured out of sight before it comes up, as a
  /// height that moves on the way up (from nothing, at first) moves the
  /// sheet's width too and spoils its slide; and the content draws its own
  /// bar, as a NavigationStack lays it out at odd sizes first. While it is
  /// up, it follows what it holds.
  func fittedSheet<Sheet: View>(
    isPresented: Binding<Bool>, @ViewBuilder content: @escaping () -> Sheet
  ) -> some View {
    modifier(FittedSheet(isPresented: isPresented, sheet: content))
  }
}

private struct FittedSheet<Sheet: View>: ViewModifier {
  @Binding var isPresented: Bool
  let sheet: () -> Sheet
  /// Measured before the sheet comes up; none until then.
  @State private var measured: CGFloat?
  /// The detent's height, kept as the sheet goes down.
  @State private var height: CGFloat = 0

  func body(content: Content) -> some View {
    content
      .background {
        if isPresented, measured == nil {
          sheet()
            .fixedSize(horizontal: false, vertical: true)
            .hidden()
            .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { size in
              height = size
              measured = size
            }
        }
      }
      .sheet(
        isPresented: Binding(
          get: { isPresented && measured != nil },
          set: { if !$0 { isPresented = false } })
      ) {
        sheet()
          .fixedSize(horizontal: false, vertical: true)
          .onGeometryChange(for: CGFloat.self) { $0.size.height } action: { height = $0 }
          .frame(maxHeight: .infinity, alignment: .top)
          .presentationDetents([.height(height)])
      }
      .onChange(of: isPresented) { _, presented in
        if !presented { measured = nil }
      }
  }
}
