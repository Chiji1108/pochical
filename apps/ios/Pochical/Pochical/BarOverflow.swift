import SwiftUI

extension View {
  /// The page's less used actions, in the system's overflow menu of its
  /// bar: the ⋯ that also takes the bar's items as they run out of room,
  /// as on iPhone Duo's bar down the side, so everything the bar does not
  /// show is in one place (HIG, Designing for iPhone Duo: Use the system
  /// overflow menu). iOS 26 has no such menu to add to, so there the page
  /// has a ⋯ of its own, named `title`.
  func barOverflow<Content: View>(_ title: String, @ViewBuilder content: () -> Content)
    -> some View
  {
    modifier(BarOverflow(title: title, content: content()))
  }
}

private struct BarOverflow<Actions: View>: ViewModifier {
  let title: String
  let content: Actions

  func body(content page: Content) -> some View {
    if #available(iOS 27.0, *) {
      page.toolbarOverflowMenu { content }
    } else {
      page.toolbar {
        ToolbarItem(placement: .primaryAction) {
          Menu(title, systemImage: "ellipsis") { content }
        }
      }
    }
  }
}
