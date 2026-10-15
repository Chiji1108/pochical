import SwiftUI

/// A screen's action handed to its many days or lines as one object kept
/// in its state. A view holding a closure is never the same as the one
/// before, the closure being made anew each time the screen draws, so
/// SwiftUI made every day or line again; one holding this object is the
/// same while what it shows is, and SwiftUI leaves it as it was.
/// `handling` sets the action to the screen's latest each time it draws,
/// so it acts on the screen as it is when used.
@MainActor final class Handler<Input> {
  private var action: (Input) -> Void = { _ in }

  func handling(_ action: @escaping (Input) -> Void) -> Handler {
    self.action = action
    return self
  }

  func callAsFunction(_ input: Input) {
    action(input)
  }
}
