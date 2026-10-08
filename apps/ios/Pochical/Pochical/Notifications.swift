import PochicalKit
import SwiftUI
import UIKit
import UserNotifications

/// A chat a notification opens.
nonisolated struct OpenedChat: Hashable, Sendable {
  let groupID: String
  let threadID: String
}

/// The chat notifications (spec/chat.md, Notifications): the device's push
/// token kept by the server, a notification shown unless its chat is open,
/// and a tap opening its chat.
@MainActor @Observable final class Notifications: NSObject,
  @MainActor UNUserNotificationCenterDelegate
{
  static let shared = Notifications()

  /// The calls the token goes through, once the app has made them.
  var groupCalls: GroupCalls? {
    didSet { sendToken() }
  }
  /// The chat on screen, whose notifications are not shown.
  var openChat: OpenedChat?
  /// A chat a tapped notification asks to open.
  var opening: OpenedChat?
  /// A tapped answer from Pochical's people asks to open their chat.
  var openingSupport = false
  /// The chat with Pochical's people is on screen, its answers not shown.
  var supportOpen = false
  /// Whether the person has let Pochical notify, as the system last said.
  private(set) var permission = Permission.notAsked
  private var token: Data?

  /// Whether notifications may be shown (/design's PermissionCard).
  enum Permission {
    /// Not asked yet: the system's question can still be put.
    case notAsked
    /// Refused, in the system's settings now.
    case denied
    case allowed
  }

  /// Registers for notifications when they are allowed, each launch.
  func start() {
    UNUserNotificationCenter.current().delegate = self
    Task {
      await readPermission()
      if permission == .allowed {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  /// Reads the permission again: it may have changed in the system's
  /// settings while the app was away.
  func readPermission() async {
    let settings = await UNUserNotificationCenter.current().notificationSettings()
    permission =
      switch settings.authorizationStatus {
      case .notDetermined: .notAsked
      case .denied: .denied
      default: .allowed
      }
  }

  /// Asks the system once, the first time a notification is wanted: when
  /// the person first writes in a chat, or turns a chat's on.
  func askOnce() {
    Task {
      await readPermission()
      guard permission == .notAsked else { return }
      let center = UNUserNotificationCenter.current()
      let allowed = (try? await center.requestAuthorization(options: [.alert, .badge, .sound]))
      await readPermission()
      if allowed == true {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  func took(_ token: Data) {
    self.token = token
    sendToken()
  }

  private func sendToken() {
    guard let token, let groupCalls else { return }
    Task { try? await groupCalls.registerPushToken(token) }
  }

  // MARK: UNUserNotificationCenterDelegate

  // On the main actor: iOS's completion handlers behind these async
  // methods must be called there, or a tap that launches the app ends it.

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, willPresent notification: UNNotification
  ) async -> UNNotificationPresentationOptions {
    if Self.isSupport(notification) {
      return supportOpen ? [] : [.banner, .list, .sound]
    }
    let chat = Self.chat(of: notification)
    return chat != nil && chat == openChat ? [] : [.banner, .list, .sound]
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
  ) async {
    if Self.isSupport(response.notification) {
      openingSupport = true
      return
    }
    guard let chat = Self.chat(of: response.notification) else { return }
    opening = chat
  }

  /// An answer from Pochical's people: no group, their chat's thread.
  private nonisolated static func isSupport(_ notification: UNNotification) -> Bool {
    let info = notification.request.content.userInfo
    return (info["groupId"] as? String)?.isEmpty == true && info["threadId"] as? String == "support"
  }

  private nonisolated static func chat(of notification: UNNotification) -> OpenedChat? {
    let info = notification.request.content.userInfo
    guard let groupID = info["groupId"] as? String, !groupID.isEmpty,
      let threadID = info["threadId"] as? String
    else { return nil }
    return OpenedChat(groupID: groupID, threadID: threadID)
  }
}

/// The app's delegate, for what only UIKit hears: the device's push token.
final class AppDelegate: NSObject, UIApplicationDelegate {
  func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
  ) -> Bool {
    Notifications.shared.start()
    return true
  }

  func application(
    _ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data
  ) {
    Notifications.shared.took(token)
  }
}
