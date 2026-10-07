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
  private var token: Data?

  /// Registers for notifications when they are allowed, each launch.
  func start() {
    UNUserNotificationCenter.current().delegate = self
    Task {
      let settings = await UNUserNotificationCenter.current().notificationSettings()
      if settings.authorizationStatus == .authorized {
        UIApplication.shared.registerForRemoteNotifications()
      }
    }
  }

  /// Asks the system once, the first time a notification is wanted: when
  /// the person first writes in a chat.
  func askOnce() {
    Task {
      let center = UNUserNotificationCenter.current()
      guard await center.notificationSettings().authorizationStatus == .notDetermined else {
        return
      }
      if (try? await center.requestAuthorization(options: [.alert, .badge, .sound])) == true {
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
    let chat = Self.chat(of: notification)
    return chat != nil && chat == openChat ? [] : [.banner, .list, .sound]
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
  ) async {
    guard let chat = Self.chat(of: response.notification) else { return }
    opening = chat
  }

  private nonisolated static func chat(of notification: UNNotification) -> OpenedChat? {
    let info = notification.request.content.userInfo
    guard let groupID = info["groupId"] as? String, let threadID = info["threadId"] as? String
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
