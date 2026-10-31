import AppIntents
import GoogleSignIn
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import UIKit

@main
struct PochicalApp: App {
  @UIApplicationDelegateAdaptor private var delegate: AppDelegate
  @Environment(\.scenePhase) private var scenePhase
  /// Who the device is, and every socket and call that goes as them. It
  /// signs in as the app first comes to the front, anonymously at first
  /// (spec/sync-protocol.md, Signing in); offline, the calendar works and
  /// it tries again.
  private let session: AccountSession
  /// The calls that make and join groups, as the same user.
  private let groupCalls: GroupCalls
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
    session = AccountSession(database: database)
    groupCalls = GroupCalls(current: session.current)
    openPlace = OpenPlaceSocket(session: session)
    // The notifications shown and the badge were the user before's.
    session.onErase = { await Notifications.shared.forgetAccount() }
    Notifications.shared.groupCalls = groupCalls
    Notifications.shared.replies = Replies(database: database, session: session)
    // The controls and the shortcuts open their places as a widget's link
    // does.
    AppDependencyManager.shared.add(dependency: LinkOpener { openPlaceLink($0) })
  }

  var body: some Scene {
    WindowGroup {
      AppRoot()
        .modifier(
          AppEnvironment(
            settings: settings, groupCalls: groupCalls, session: session, openPlace: openPlace))
        // The person's preferences, kept with the account from launch.
        .task { settings.sync(with: database) }
        // Google Sign-In's answer, should it come back by the app's URL
        // scheme (its reversed iOS client id) rather than to its web session.
        .onOpenURL { _ = GIDSignIn.sharedInstance.handle($0) }
        // Someone else from now, or signed in at last: the widgets show
        // them, and the push token goes under their session.
        .onChange(of: session.userID) {
          reloadWidgets()
          Notifications.shared.sendToken()
        }
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
          Task { await session.stopSending() }
        }
        Task {
          await session.wentToBack()
          time.end()
        }
      case .active:
        NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
        // Another day of use, for when to ask for a review.
        ReviewPrompt.opened()
        // Notifications may have been allowed or refused in the system's
        // settings meanwhile, and a token not taken goes again.
        Task { await Notifications.shared.register() }
        session.cameToFront()
      default:
        break
      }
    }
  }
}

/// What every screen of the app is given: put at the window's root, and
/// again on what UIKit hosts with an environment of its own (RootView).
struct AppEnvironment: ViewModifier {
  let settings: Settings
  let groupCalls: GroupCalls
  let session: AccountSession
  let openPlace: OpenPlaceSocket

  func body(content: Content) -> some View {
    content
      .modifier(Themed(theme: settings.device.theme, appearance: settings.device.appearance))
      .environment(settings)
      .environment(\.groupCalls, groupCalls)
      .environment(session)
      .environment(\.groupSockets, session.places)
      .environment(openPlace)
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
