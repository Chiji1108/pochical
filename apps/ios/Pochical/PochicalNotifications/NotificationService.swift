import Intents
import PochicalDesign
import PochicalKit
import SQLiteData
import SwiftUI
import Synchronization
import UserNotifications

/// Puts a chat line's notification as a message from its writer
/// (spec/chat.md, Notifications): their face and name, and for the group's
/// chat the group's name and mark, as the system shows a conversation. What
/// it cannot read yet, before the app has the group, shows as it came.
final class NotificationService: UNNotificationServiceExtension {
  /// What to show should iOS end the extension first: as it came.
  private var cut: (() -> Void)?

  override func didReceive(
    _ request: UNNotificationRequest,
    withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void
  ) {
    // Not for the user signed in: the device went on as someone else after
    // its token was sent. Nothing of it is shown, neither who wrote nor
    // what: only that something came. Delivering no notification at all
    // takes the filtering entitlement Apple grants on request.
    guard isForSignedIn(request.content.userInfo, me: widgetMeID()) else {
      let blank = UNMutableNotificationContent()
      blank.body = "別のアカウントへの通知です"
      contentHandler(blank)
      return
    }
    nonisolated(unsafe) let show = contentHandler
    nonisolated(unsafe) let request = request
    let once = Once()
    cut = { once.run { show(request.content) } }
    Task { @MainActor in
      let content = await Self.message(from: request)
      once.run { show(content) }
    }
  }

  override func serviceExtensionTimeWillExpire() {
    cut?()
  }

  /// The notification as a message from its writer, or as it came.
  @MainActor private static func message(
    from request: UNNotificationRequest
  ) async -> UNNotificationContent {
    let content = request.content
    let payload = content.userInfo
    // The chat with Pochical's people stays a plain notification: only
    // they write there, so it has no writer of its own to show.
    guard let line = NotifiedLine(id: request.identifier, payload: payload),
      line.groupID != ChatPlace.supportID,
      let authorID = payload["authorId"] as? String,
      let from = from(line, authorID: authorID)
    else { return content }
    // The system shows a group's conversation with its writer's name
    // already, so its words go alone, as a one-to-one chat's.
    guard let worded = content.mutableCopy() as? UNMutableNotificationContent else {
      return content
    }
    if from.group != nil, let words = wordsAlone(content) {
      worded.body = words
    }
    let intent = intent(for: line, from: from, authorID: authorID, content: worded)
    let interaction = INInteraction(intent: intent, response: nil)
    interaction.direction = .incoming
    try? await interaction.donate()
    return (try? worded.updating(from: intent)) ?? worded
  }

  /// A group chat's line as the app words a one-to-one chat's, without who
  /// wrote it: `CHAT_GROUP_{…}` as `CHAT_{…}`, its arguments after the
  /// writer's name (spec/sync-protocol.md, Push).
  private static func wordsAlone(_ content: UNNotificationContent) -> String? {
    let group = "CHAT_GROUP_"
    guard let aps = content.userInfo["aps"] as? [String: Any],
      let alert = aps["alert"] as? [String: Any],
      let key = alert["loc-key"] as? String, key.hasPrefix(group),
      let args = alert["loc-args"] as? [String]
    else { return nil }
    let format = Bundle.main.localizedString(
      forKey: "CHAT_\(key.dropFirst(group.count))", value: nil, table: nil)
    return String(format: format, arguments: Array(args.dropFirst()))
  }

  /// Who the line is from, as the app keeps them in the App Group.
  private static func from(_ line: NotifiedLine, authorID: String) -> NotifiedFrom? {
    guard let database = try? widgetDatabase() else { return nil }
    return try? database.read { db in
      try notifiedFrom(
        groupID: line.groupID, threadID: line.threadID, authorID: authorID,
        me: widgetMeID(), in: db)
    }
  }

  @MainActor private static func intent(
    for line: NotifiedLine, from: NotifiedFrom, authorID: String,
    content: UNNotificationContent
  ) -> INSendMessageIntent {
    let writer = person(from.writer, id: authorID)
    let group = from.group
    // A group's conversation is one of more than two: the user and the
    // writer among them, as the system counts the people in it.
    let recipients = group.flatMap { _ in
      from.me.map { [person($0, id: "me", isMe: true), writer] }
    }
    let intent = INSendMessageIntent(
      recipients: recipients,
      outgoingMessageType: .outgoingMessageText,
      content: content.body,
      speakableGroupName: group.map { INSpeakableString(spokenPhrase: $0.name) },
      conversationIdentifier: "\(line.groupID)/\(line.threadID)",
      serviceName: nil,
      sender: writer,
      attachments: nil)
    if let group, let mark = picture(of: WidgetGroupMark(group: group, size: pictureSize)) {
      intent.setImage(mark, forParameterNamed: \.speakableGroupName)
    }
    return intent
  }

  @MainActor private static func person(
    _ shown: WidgetWith, id: String, isMe: Bool = false
  ) -> INPerson {
    INPerson(
      personHandle: INPersonHandle(value: id, type: .unknown),
      nameComponents: nil,
      displayName: shown.name,
      image: picture(of: WidgetFace(person: shown, size: pictureSize, me: isMe)),
      contactIdentifier: nil,
      customIdentifier: id,
      isMe: isMe)
  }

  /// The edge a face or mark is drawn at, in points, for the system to
  /// shrink: larger than any spot it shows one.
  private static let pictureSize: CGFloat = 60

  /// A face or mark as the widgets draw it, in the テーマ's light colors.
  @MainActor private static func picture(of view: some View) -> INImage? {
    let renderer = ImageRenderer(
      content: view.environment(\.themeColors, Theme.pochical.colors(.light)))
    renderer.scale = 3
    return renderer.uiImage?.pngData().map { INImage(imageData: $0) }
  }
}

/// Runs the first closure given it, whichever thread comes first.
private final class Once: Sendable {
  private let done = Mutex(false)

  func run(_ body: () -> Void) {
    let first = done.withLock { done in
      defer { done = true }
      return !done
    }
    if first { body() }
  }
}
