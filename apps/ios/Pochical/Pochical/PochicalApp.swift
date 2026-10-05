import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import UIKit

@main
struct PochicalApp: App {
  @Environment(\.scenePhase) private var scenePhase
  /// The user's socket, open while the app is in the foreground. It signs
  /// in on its first try, anonymously at first (spec/sync-protocol.md,
  /// Signing in); offline, the calendar works and it tries again.
  private let sync: SyncClient
  @State private var settings = Settings()

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
      RootView()
        .modifier(Themed(theme: .pochical))
        .environment(settings)
    }
    // The socket is open only in the foreground (spec/sync-protocol.md,
    // Sockets), and the shared database lets go of its locks before iOS
    // suspends the app (appDatabase), once what waits is sent, including
    // when it was launched in the background.
    .onChange(of: scenePhase, initial: true) { _, phase in
      switch phase {
      case .background:
        // Edits still waiting get a little time to go first (Sockets).
        let time = BackgroundTime()
        time.begin {
          time.end()
          Task { await sync.stop() }
        }
        Task {
          await sync.finishSending()
          time.end()
        }
      case .active:
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
        Task { await sync.start() }
      default:
        break
      }
    }
  }
}

/// The time iOS gives the app in the background to send what waits. As it
/// ends, the shared database lets go of its locks, unless the app came
/// back meanwhile.
@MainActor private final class BackgroundTime {
  private var id = UIBackgroundTaskIdentifier.invalid
  private var ended = false

  func begin(expired: @escaping @MainActor () -> Void) {
    id = UIApplication.shared.beginBackgroundTask(withName: "送信", expirationHandler: expired)
  }

  /// Once, whether iOS gave any time or not.
  func end() {
    guard !ended else { return }
    ended = true
    if UIApplication.shared.applicationState == .background {
      NotificationCenter.default.post(name: Database.suspendNotification, object: nil)
    }
    if id != .invalid {
      UIApplication.shared.endBackgroundTask(id)
    }
  }
}
