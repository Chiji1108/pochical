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
    sheet(isPresented: Binding { day != nil } set: { if !$0 { onClose() } }, onDismiss: onDismiss) {
      if let day {
        content(day)
          .presentationDetents([first, .large])
          .presentationBackgroundInteraction(.enabled(upThrough: first))
      }
    }
  }
}
