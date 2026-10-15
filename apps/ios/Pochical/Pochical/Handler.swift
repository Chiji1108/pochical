import SwiftUI

/// A screen's action handed to its many days or lines as one object kept
/// in its state. A view holding a closure is never the same as the one
/// before, the closure being made anew each time the screen draws, so
/// SwiftUI made every day or line again; one holding this object is the
/// same while what it shows is, and SwiftUI leaves it as it was. The
/// screen sets the action with `handles(_:by:)`.
@MainActor final class Handler<Input> {
  private var action: (Input) -> Void = { _ in }

  fileprivate func set(_ action: @escaping (Input) -> Void) {
    self.action = action
  }

  func callAsFunction(_ input: Input) {
    action(input)
  }
}

extension View {
  /// Has `handler` act by `action` while the view is on screen: set again
  /// each time the screen draws, so it acts on the screen as it is when
  /// used, and taken off when the screen leaves. The action holds the
  /// screen, whose state holds the handler: left on, the screen would
  /// never be let go.
  func handles<Input>(_ handler: Handler<Input>, by action: @escaping (Input) -> Void)
    -> some View
  {
    handler.set(action)
    return
      self
      .onAppear { handler.set(action) }
      .onDisappear { handler.set { _ in } }
  }
}
