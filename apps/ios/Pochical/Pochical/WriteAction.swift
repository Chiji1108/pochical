import OSLog
import SQLiteData
import SwiftUI
import UIKit

/// Writes the person's own edit to the device at once, where it waits in
/// the outbox for sync (spec/sync-protocol.md, Outbox), and says when that
/// fails rather than losing it; true when kept. Not tried again by itself:
/// the device's own write fails the same way until something there changes.
struct WriteAction {
  let failed: @MainActor () -> Void

  @MainActor @discardableResult
  func callAsFunction(_ edit: (Database) throws -> Void) -> Bool {
    @Dependency(\.defaultDatabase) var database
    return keeping { try database.write(edit) }
  }

  /// Keeps what goes with an edit outside the database (a photo of a line
  /// on the device's disk) the same way.
  @MainActor @discardableResult
  func keeping(_ keep: () throws -> Void) -> Bool {
    do {
      try keep()
      return true
    } catch {
      Logger.edits.error("Could not keep an edit: \(error)")
      ReviewPrompt.troubled = true
      failed()
      return false
    }
  }
}

extension EnvironmentValues {
  @Entry var write = WriteAction { NotKeptAlert.show() }
}

/// 保存できませんでした, over whatever shows when an edit was not kept: a
/// sheet stays under it, and one going, a page being left or an alert
/// closing is let finish first, as an alert presented from under a sheet
/// takes the sheet down, and one presented while another presentation
/// moves, or while the app is not on the screen, is never seen and holds
/// the screen.
@MainActor
enum NotKeptAlert {
  private static var shown = false
  private static var waiting: NSObjectProtocol?

  static func show() {
    guard !shown, waiting == nil else { return }
    guard let top = UIApplication.shared.topViewController else {
      waiting = NotificationCenter.default.addObserver(
        forName: UIScene.didActivateNotification, object: nil, queue: .main
      ) { _ in
        MainActor.assumeIsolated {
          if let waiting { NotificationCenter.default.removeObserver(waiting) }
          waiting = nil
          show()
        }
      }
      return
    }
    if let moving = top.transitionCoordinator ?? top.navigationControllers.lazy
      .compactMap(\.transitionCoordinator).first
    {
      moving.animate(alongsideTransition: nil) { _ in show() }
      return
    }
    let alert = UIAlertController(
      title: "保存できませんでした",
      message: "もう一度お試しください。続くときは、端末の空き容量を確かめてください。",
      preferredStyle: .alert)
    alert.addAction(UIAlertAction(title: "OK", style: .cancel) { _ in shown = false })
    top.present(alert, animated: true)
    shown = alert.presentingViewController != nil
  }
}

extension UIViewController {
  /// The navigation stacks within, a page of which may be on its way.
  fileprivate var navigationControllers: [UINavigationController] {
    let here = (self as? UINavigationController).map { [$0] } ?? []
    return here + children.flatMap(\.navigationControllers)
  }
}

extension Logger {
  /// The person's edits the device could not keep.
  static let edits = Logger(subsystem: "app.pochical", category: "edits")
}
