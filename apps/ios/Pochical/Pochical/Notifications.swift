import PochicalKit
import PochicalProto
import SQLiteData
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
/// a tap opening its chat, an answer written on it sent, and those of
/// lines read taken back.
@MainActor @Observable final class Notifications: NSObject,
  @MainActor UNUserNotificationCenterDelegate
{
  static let shared = Notifications()

  /// The calls the token goes through, once the app has made them.
  var groupCalls: GroupCalls? {
    didSet { sendToken() }
  }
  /// What an answer written on a notification is sent through, once the
  /// app has made it.
  var replies: Replies?
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
    let center = UNUserNotificationCenter.current()
    center.delegate = self
    // A chat line's notification is answered on it, without opening the
    // app, as Messages' is.
    let reply = UNTextInputNotificationAction(
      identifier: Self.replyAction, title: "返信", options: [],
      textInputButtonTitle: "送信", textInputPlaceholder: "メッセージ")
    center.setNotificationCategories([
      UNNotificationCategory(
        identifier: chatLineCategory, actions: [reply], intentIdentifiers: [], options: [])
    ])
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
    if let answer = response as? UNTextInputNotificationResponse {
      let request = response.notification.request
      guard let line = NotifiedLine(id: request.identifier, payload: request.content.userInfo)
      else { return }
      await reply(answer.userText, to: line)
      return
    }
    opening = chat
  }

  private static let replyAction = "REPLY"

  /// Sends an answer written on a line's notification, as the chat's
  /// composer would, the line and those before it read, and waits until it
  /// is sent while iOS gives the time (spec/chat.md, Notifications).
  private func reply(_ text: String, to line: NotifiedLine) async {
    let words = text.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !words.isEmpty, let replies else { return }
    var read = Pochical_V1_ChatRead()
    read.threadID = line.threadID
    read.lastReadSeq = UInt64(line.seq)
    var send = Pochical_V1_ChatSend()
    send.threadID = line.threadID
    send.text = words
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    // The app may be woken for it after letting go of the database's
    // locks; it lets go again once sent (Replies).
    NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
    let edits: [Pochical_V1_ChatEdit.OneOf_Kind] = [.read(read), .send(send)]
    let groupID = line.groupID
    try? await replies.database.write { db in
      for edit in edits {
        try Chats.edit(edit, in: groupID, now: now, db: db)
      }
    }
    await withdraw(in: line.groupID, line.threadID, readTo: line.seq)
    await replies.send(line.groupID)
  }

  /// Takes back the notifications shown of a chat's lines read up to
  /// `readTo`, all of the chat's for nil (spec/vectors/chat.json, withdrawn).
  func withdraw(in groupID: String, _ threadID: String, readTo: Int64?) async {
    let center = UNUserNotificationCenter.current()
    let shown = await Self.shownLines()
    let ids = withdrawn(shown, groupID: groupID, threadID: threadID, readTo: readTo)
    if !ids.isEmpty {
      center.removeDeliveredNotifications(withIdentifiers: ids)
    }
  }

  /// Takes back the notifications shown of lines `read` says are read,
  /// here or, as the counts it hears say, on another device.
  func withdrawRead(_ read: ReadState) async {
    let ids = readNotified(await Self.shownLines(), read)
    if !ids.isEmpty {
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
    }
  }

  /// A withdrawal the server sent in the background, for a read on
  /// another device.
  func take(_ payload: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
    guard let read = ChatWithdrawal(payload: payload) else { return .noData }
    await withdraw(in: read.groupID, read.threadID, readTo: read.readTo)
    return .newData
  }

  private static func shownLines() async -> [NotifiedLine] {
    await UNUserNotificationCenter.current().deliveredNotifications().compactMap {
      NotifiedLine(id: $0.request.identifier, payload: $0.request.content.userInfo)
    }
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

  func application(
    _ application: UIApplication, didReceiveRemoteNotification payload: [AnyHashable: Any]
  ) async -> UIBackgroundFetchResult {
    await Notifications.shared.take(payload)
  }
}

/// What an answer written on a notification goes through: the chat outbox
/// the app keeps, sent on the group's socket as a chat's screen sends it.
struct Replies {
  let account: Account
  let database: any DatabaseWriter
  let sockets: GroupSockets

  /// Sends what waits in the group's outbox: on the group's socket, which
  /// closes once it is sent, and, in the background, within the time iOS
  /// gives, the shared database letting go of its locks after.
  func send(_ groupID: String) async {
    let background = UIApplication.shared.applicationState == .background
    let time = BackgroundTime()
    time.begin {
      time.end()
      Task { await sockets.stop() }
    }
    let (_, hold) = await sockets.open(groupID, account: account, database: database)
    await sockets.close(hold, of: groupID)
    if background {
      await sockets.finishSending()
    }
    time.end()
  }
}
