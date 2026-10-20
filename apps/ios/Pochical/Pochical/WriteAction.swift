import OSLog
import SQLiteData
import SwiftUI

/// Writes the person's own edit to the device at once, where it waits in
/// the outbox for sync (spec/sync-protocol.md, Outbox), and says when that
/// fails rather than losing it; true when kept. Not tried again by itself:
/// the device's own write fails the same way until something there changes.
struct WriteAction {
  let failed: @MainActor () -> Void

  @MainActor @discardableResult
  func callAsFunction(_ edit: (Database) throws -> Void) -> Bool {
    @Dependency(\.defaultDatabase) var database
    do {
      try database.write(edit)
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
  @Entry var write = WriteAction {}
}

/// Gives the screens under it `write`, and its alert when a write fails.
struct KeepsEdits: ViewModifier {
  @State private var failed = false

  func body(content: Content) -> some View {
    content
      .environment(\.write, WriteAction { failed = true })
      .alert("保存できませんでした", isPresented: $failed) {
        Button("OK", role: .cancel) {}
      } message: {
        Text("端末の空き容量を確かめて、もう一度お試しください。")
      }
  }
}

extension Logger {
  /// The person's edits the device could not keep.
  static let edits = Logger(subsystem: "app.pochical", category: "edits")
}
