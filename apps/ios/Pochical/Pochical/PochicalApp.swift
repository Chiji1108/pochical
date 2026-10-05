import PochicalKit
import SQLiteData
import SwiftUI

@main
struct PochicalApp: App {
  @Environment(\.scenePhase) private var scenePhase

  init() {
    prepareDependencies {
      // Without its database the app has nowhere to keep anything.
      $0.defaultDatabase = try! appDatabase()
    }
  }

  var body: some Scene {
    WindowGroup {
      ContentView()
    }
    // The shared database lets go of its locks before iOS suspends the
    // app (appDatabase).
    .onChange(of: scenePhase) { _, phase in
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
