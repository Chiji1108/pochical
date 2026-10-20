import SwiftUI
import UIKit

extension View {
  /// Tells as the sheet this is in starts to go, by its ×, in code or by a
  /// finger swiping it down, with true, and with false when a swipe is
  /// taken back and the sheet stays. A sheet's binding hears of a swipe only
  /// once the sheet has gone.
  func onSheetLeaving(_ change: @escaping (_ leaving: Bool) -> Void) -> some View {
    background(SheetLeaving(change: change))
  }
}

/// The sheet's own transition, from a controller inside it: UIKit tells its
/// children as the sheet starts to go, and its transition coordinator
/// whether a swipe goes through.
private struct SheetLeaving: UIViewControllerRepresentable {
  let change: (Bool) -> Void

  func makeUIViewController(context: Context) -> Controller {
    Controller()
  }

  func updateUIViewController(_ controller: Controller, context: Context) {
    controller.change = change
  }

  final class Controller: UIViewController {
    var change: (Bool) -> Void = { _ in }

    override func loadView() {
      view = UIView()
      view.isUserInteractionEnabled = false
    }

    override func viewWillDisappear(_ animated: Bool) {
      super.viewWillDisappear(animated)
      // Only the sheet going, not a page pushed or another sheet over it.
      guard sequence(first: self, next: \.parent).contains(where: \.isBeingDismissed) else {
        return
      }
      change(true)
      transitionCoordinator?.notifyWhenInteractionChanges { [weak self] context in
        if context.isCancelled { self?.change(false) }
      }
    }
  }
}
