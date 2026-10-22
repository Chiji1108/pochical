import PochicalKit
import SwiftUI

extension View {
  /// A day's sheet, up while `day` is set. Another day set while it is up
  /// takes its place in the same sheet, at the height it was at, as the
  /// Calendar apps' does: a sheet presented for an item would go down and
  /// come up again for each day. Up through `first` the screen behind
  /// stays live, for the next day to be tapped.
  func daySheet<Sheet: View>(
    _ day: Day?, first: PresentationDetent, onClose: @escaping () -> Void,
    onDismiss: (() -> Void)? = nil, @ViewBuilder content: @escaping (Day) -> Sheet
  ) -> some View {
    modifier(
      DaySheetPresentation(
        day: day, first: first, onClose: onClose, onDismiss: onDismiss, sheet: content))
  }
}

private struct DaySheetPresentation<Sheet: View>: ViewModifier {
  let day: Day?
  let first: PresentationDetent
  let onClose: () -> Void
  let onDismiss: (() -> Void)?
  @ViewBuilder let sheet: (Day) -> Sheet
  /// The day last shown, kept as the sheet goes down once `day` is gone,
  /// so it goes with its day on it, as a sheet presented for an item does.
  @State private var shown: Day?

  func body(content: Content) -> some View {
    content
      .onChange(of: day, initial: true) {
        if let day { shown = day }
      }
      .sheet(isPresented: Binding { day != nil } set: { if !$0 { onClose() } }, onDismiss: onDismiss) {
        if let day = day ?? shown {
          sheet(day)
            .presentationDetents([first, .large])
            .presentationBackgroundInteraction(.enabled(upThrough: first))
        }
      }
  }
}
