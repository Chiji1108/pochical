import PochicalDesign
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
  /// A chat a tapped notification asks to open, the chat with Pochical's
  /// people among them.
  var opening: OpenedChat?
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
    let chat = Self.chat(of: notification)
    return chat != nil && chat == openChat ? [] : [.banner, .list, .sound]
  }

  func userNotificationCenter(
    _ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse
  ) async {
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
    let words = sentWords(text)
    guard !words.isEmpty, let replies else { return }
    var read = Pochical_V1_ChatRead()
    read.threadID = line.threadID
    read.lastReadSeq = UInt64(line.seq)
    var send = Pochical_V1_ChatSend()
    send.threadID = line.threadID
    send.text = words
    let now = Int64(Date.now.timeIntervalSince1970 * 1000)
    // The app may be woken for it after letting go of the database's
    // locks, or be letting go of them as it is: it holds them until sent,
    // or until the time iOS gives runs out.
    let time = BackgroundTime()
    var sending: Task<Void, Never>?
    time.begin {
      sending?.cancel()
      time.end()
      Task { await replies.sockets.stop() }
    }
    NotificationCenter.default.post(name: Database.resumeNotification, object: nil)
    let edits: [Pochical_V1_ChatEdit.OneOf_Kind] = [
      .read(read), AppDevice.stamped(.send(send), in: line.groupID),
    ]
    let groupID = line.groupID
    try? await replies.database.write { db in
      for edit in edits {
        try Chats.edit(edit, in: groupID, now: now, db: db)
      }
    }
    await withdraw(in: line.groupID, line.threadID, readTo: line.seq)
    let sent = Task { await replies.send(line.groupID) }
    sending = sent
    await sent.value
    time.end()
  }

  /// Takes back the notifications shown of a chat's lines read up to
  /// `readTo`, all of the chat's for nil (spec/vectors/chat.json, withdrawn).
  func withdraw(in groupID: String, _ threadID: String, readTo: Int64?) async {
    await takeBack { withdrawn($0, groupID: groupID, threadID: threadID, readTo: readTo) }
  }

  /// Takes back the notifications shown of lines read, as `read` says, and
  /// of chats `before` did not yet know had nothing unread left. A chat
  /// with nothing unread is known only as the counts come: the first known
  /// may be from before lines notified since, while a read mark of the
  /// user's own always holds.
  func withdrawRead(_ read: ReadState, before: ReadState?) async {
    var known = read
    known.cleared = before.map { read.cleared.subtracting($0.cleared) } ?? []
    await takeBack { readNotified($0, known) }
  }

  /// Removes the notifications shown that `ids` picks out of them.
  private func takeBack(_ ids: ([NotifiedLine]) -> [String]) async {
    let shown = await UNUserNotificationCenter.current().deliveredNotifications().compactMap {
      NotifiedLine(id: $0.request.identifier, payload: $0.request.content.userInfo)
    }
    let gone = ids(shown)
    if !gone.isEmpty {
      UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: gone)
    }
  }

  /// A withdrawal the server sent in the background, for a read on
  /// another device.
  func take(_ payload: [AnyHashable: Any]) async -> UIBackgroundFetchResult {
    guard let read = ChatWithdrawal(payload: payload) else { return .noData }
    await withdraw(in: read.groupID, read.threadID, readTo: read.readTo)
    return .newData
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
  let database: any DatabaseWriter
  let sockets: GroupSockets
  /// The user's socket, for the counts after the read.
  let userSocket: SyncClient

  /// Sends what waits in the group's outbox on the group's socket, held
  /// open until it is sent or the task is cancelled (the time iOS gives
  /// runs out), then let go of; in the background, closed once sent, as
  /// the app's going to the background closes the others.
  func send(_ groupID: String) async {
    let hold = await sockets.open(groupID)
    await Chats.untilSent(of: groupID, in: database)
    await sockets.close(hold, of: groupID)
    guard UIApplication.shared.applicationState == .background else { return }
    await sockets.finishSending()
    // Not once the time iOS gives has run out, the database let go of.
    guard !Task.isCancelled else { return }
    await badgeAfterRead()
  }

  /// The app icon's badge as the read leaves it: the user's socket, closed
  /// in the background, brings the counts the read changed, as the app
  /// in front shows them (RootView).
  private func badgeAfterRead() async {
    await userSocket.start()
    await userSocket.catchUp(within: .seconds(Self.catchUpMost))
    // Come to the front meanwhile, the socket stays open as the app's is.
    if UIApplication.shared.applicationState == .background {
      await userSocket.finishSending()
    }
    guard let me = widgetMeID(),
      let counts = try? await database.read({ db in try Chats.unreadByGroup(me: me, db: db) })
    else { return }
    try? await UNUserNotificationCenter.current().setBadgeCount(counts.values.reduce(0, +))
  }

  /// How long the counts may take to come, in seconds, before the badge
  /// is set from those the device has.
  private static let catchUpMost = 5
}
