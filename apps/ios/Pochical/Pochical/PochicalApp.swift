import OSLog
import PochicalDesign
import PochicalKit
import PochicalProto
import SQLiteData
import SwiftUI

@main
struct PochicalApp: App {
  @Environment(\.scenePhase) private var scenePhase
  private let account = Account()

  init() {
    prepareDependencies {
      // Without its database the app has nowhere to keep anything.
      $0.defaultDatabase = try! appDatabase()
      #if DEBUG
        try! SampleDays.putIfAsked(in: $0.defaultDatabase)
      #endif
    }
  }

  var body: some Scene {
    WindowGroup {
      CalendarScreen()
        .modifier(Themed(theme: .pochical))
        // Every user is signed in from the first launch, anonymously at
        // first (spec/sync-protocol.md, Signing in); offline, the next
        // launch tries again, and the calendar works meanwhile.
        .task {
          do {
            let me = try await account.me()
            Logger.account.info("Signed in as \(me.userID, privacy: .private)")
          } catch {
            Logger.account.error("Could not sign in: \(error)")
          }
        }
    }
    // The shared database lets go of its locks before iOS suspends the
    // app (appDatabase), including when it was launched in the background.
    .onChange(of: scenePhase, initial: true) { _, phase in
      switch phase {
      case .background:
        NotificationCenter.default.post(name: Database.suspendNotification, object: nil)
      case .active:
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
      default:
        break
      }
    }
  }
}

extension Logger {
  static let account = Logger(subsystem: "app.pochical", category: "account")
}
