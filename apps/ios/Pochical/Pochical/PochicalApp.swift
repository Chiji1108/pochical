import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import UIKit

@main
struct PochicalApp: App {
  @UIApplicationDelegateAdaptor private var delegate: AppDelegate
  @Environment(\.scenePhase) private var scenePhase
  /// The user's socket, open while the app is in the foreground. It signs
  /// in on its first try, anonymously at first (spec/sync-protocol.md,
  /// Signing in); offline, the calendar works and it tries again.
  private let sync: SyncClient
  /// The signed-in user, whom groups' calls and sockets go as too.
  private let account: Account
  /// The calls that make and join groups, as the same user.
  private let groupCalls: GroupCalls
  /// The groups' sockets, closed once their chat outbox is sent.
  private let groupSockets: GroupSockets
  /// The socket of the place open on screen, which RootView moves.
  private let openPlace: OpenPlaceSocket
  @State private var settings = Settings()
  private let database: any DatabaseWriter

  init() {
    ChatPhotoLoading.followErasing()
    prepareDependencies {
      // Without its database the app has nowhere to keep anything.
      $0.defaultDatabase = try! appDatabase()
      #if DEBUG
        try! SampleDays.putIfAsked(in: $0.defaultDatabase)
      #endif
    }
    @Dependency(\.defaultDatabase) var database
    self.database = database
    account = Account()
    sync = SyncClient(account: account, database: database)
    groupCalls = GroupCalls(account: account)
    groupSockets = GroupSockets(account: account, database: database)
    openPlace = OpenPlaceSocket(sockets: groupSockets)
    Notifications.shared.groupCalls = groupCalls
    Notifications.shared.replies = Replies(
      database: database, sockets: groupSockets, userSocket: sync)
    KeyboardTop.shared.watch()
  }

  var body: some Scene {
    WindowGroup {
      AppRoot()
        .modifier(Themed(theme: settings.device.theme, appearance: settings.device.appearance))
        .environment(settings)
        .environment(\.groupCalls, groupCalls)
        .environment(\.account, account)
        .environment(\.userSocket, sync)
        .environment(\.groupSockets, groupSockets)
        .environment(openPlace)
        // The person's preferences, kept with the account from launch.
        .task { settings.sync(with: database) }
    }
    // The socket is open only in the foreground (spec/sync-protocol.md,
    // Sockets), and the shared database lets go of its locks before iOS
    // suspends the app (appDatabase), once what waits is sent, including
    // when it was launched in the background.
    .onChange(of: scenePhase, initial: true) { _, phase in
      switch phase {
      case .background:
        // Edits still waiting get a little time to go first, the groups'
        // chat lines too (Sockets).
        let time = BackgroundTime()
        time.begin {
          time.end()
          Task { await sync.stop() }
          Task { await groupSockets.stop() }
        }
        Task {
          await sync.finishSending()
          await groupSockets.finishSending()
          time.end()
        }
      case .active:
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
        // Another day of use, for when to ask for a review.
        ReviewPrompt.opened()
        // Notifications may have been allowed or refused in the system's
        // settings meanwhile.
        Task { await Notifications.shared.readPermission() }
        Task { await sync.start() }
        // A user left behind by a switch whose deleting failed.
        Task { await groupCalls.deleteLeftBehind() }
      default:
        break
      }
    }
  }
}

/// The time iOS gives the app in the background to send what waits. As
/// the last such time ends, the shared database lets go of its locks,
/// unless the app came back meanwhile: an answer sent from a notification
/// may still be sending as the app's own going to the background ends.
@MainActor final class BackgroundTime {
  /// Those begun and not yet ended.
  private static var running = 0
  private var id = UIBackgroundTaskIdentifier.invalid
  private var ended = true

  func begin(expired: @escaping @MainActor () -> Void) {
    ended = false
    Self.running += 1
    id = UIApplication.shared.beginBackgroundTask(withName: "送信", expirationHandler: expired)
  }

  /// Once, whether iOS gave any time or not.
  func end() {
    guard !ended else { return }
    ended = true
    Self.running -= 1
    if Self.running == 0, UIApplication.shared.applicationState == .background {
      NotificationCenter.default.post(name: Database.suspendNotification, object: nil)
    }
    if id != .invalid {
      UIApplication.shared.endBackgroundTask(id)
    }
  }
}
