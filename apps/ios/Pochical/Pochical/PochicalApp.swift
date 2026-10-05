import PochicalDesign
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
      #if DEBUG
        try! SampleDays.putIfAsked(in: $0.defaultDatabase)
      #endif
    }
  }

  var body: some Scene {
    WindowGroup {
      CalendarScreen()
        .modifier(Themed(theme: .pochical))
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
