import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI

@main
struct PochicalApp: App {
  @Environment(\.scenePhase) private var scenePhase
  /// The user's socket, open while the app is in the foreground. It signs
  /// in on its first try, anonymously at first (spec/sync-protocol.md,
  /// Signing in); offline, the calendar works and it tries again.
  private let sync: SyncClient

  init() {
    prepareDependencies {
      // Without its database the app has nowhere to keep anything.
      $0.defaultDatabase = try! appDatabase()
      #if DEBUG
        try! SampleDays.putIfAsked(in: $0.defaultDatabase)
      #endif
    }
    @Dependency(\.defaultDatabase) var database
    sync = SyncClient(account: Account(), database: database)
  }

  var body: some Scene {
    WindowGroup {
      CalendarScreen()
        .modifier(Themed(theme: .pochical))
    }
    // The socket is open only in the foreground (spec/sync-protocol.md,
    // Sockets), and the shared database lets go of its locks before iOS
    // suspends the app (appDatabase), including when it was launched in
    // the background.
    .onChange(of: scenePhase, initial: true) { _, phase in
      switch phase {
      case .background:
        Task { await sync.stop() }
        NotificationCenter.default.post(name: Database.suspendNotification, object: nil)
      case .active:
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
        Task { await sync.start() }
      default:
        break
      }
    }
  }
}
